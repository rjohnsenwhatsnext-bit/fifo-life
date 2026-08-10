'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Leg } from '@/lib/planner';

// The route on a map.
//
// Leaflet against OpenStreetMap tiles: free, properly attributed, and the same
// map underneath as the distances and the camp lookups, so what you see is what
// was costed.
//
// Loaded only when the Route tab is open. Leaflet touches window on import, and
// a map that is built on every page load is a map most of which nobody looks at.

type Place = { kind: string; name: string; what?: string; directKm: number; fee?: string; lat: number; lon: number };
type Found = { at?: string; things?: Place[]; camps?: Place[]; water?: Place[]; dump?: Place[]; fuel?: Place[] };

type Shared = { id: string; kind: string; name: string; lat: number; lng: number; nightly: number | null; what: string | null; directKm: number };
type Pump = { name: string; address: string; fuel: string; price: number; directKm: number; updated: string; lat: number; lng: number };
type Fuel = { pumps?: Pump[]; map?: Pump[]; total?: number; cheapest?: Pump | null; average?: number | null };

// Board prices are quoted in cents on every sign in the country, so that is
// what goes on the pin. Dollars a litre belongs in the budget, not on a map.
const cents = (dollars: number) => (dollars * 100).toFixed(1);

// When did that servo last report. A price from Tuesday is worth knowing about
// as a price from Tuesday, not as today's.
function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return 'recently';
  if (mins < 90) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// One wording for a servo, wherever it is shown.
function tip(pump: Pump) {
  return `<b>${pump.name}</b><br>$${pump.price.toFixed(3)} a litre · ${pump.fuel}`
    + `<br>${pump.address}<br>reported ${ago(pump.updated)}`;
}

export type LayerKey = 'camps' | 'fuel' | 'water' | 'dump' | 'things' | 'shared' | 'caravan';

// What each toggle is called. Plain words: "Dump points", not an icon somebody
// has to learn.
// Caravan parks and campgrounds are two different decisions, so they are two
// different switches. Somebody towing a van who wants power and a laundry does
// not want seven thousand bush campsites on the screen, and somebody looking
// for a free spot by a river does not want the commercial parks. Under one
// switch called "Parks" they also read as the public parks in Things to do,
// which is a third thing again.
const KEYS: LayerKey[] = ['caravan', 'camps', 'fuel', 'water', 'dump', 'things', 'shared'];

// The colour each kind wears on the map, repeated in the filter list so the
// list and the pins are obviously the same thing.
const SWATCH: Record<LayerKey, string> = {
  caravan: '#fb923c', camps: '#4ade80', fuel: '#3ee6b2', water: '#38bdf8',
  dump: '#a78bfa', things: '#facc15', shared: '#ffffff',
};

const CHIP: Record<LayerKey, string> = {
  caravan: 'Caravan parks', camps: 'Campgrounds', fuel: 'Fuel', water: 'Water',
  dump: 'Dump points', things: 'Things to do', shared: 'Travellers',
};

type Shot = { thumb: string; full: string; by: string; licence: string; title: string };

type Park = {
  id: string; name: string; kind: 'caravan' | 'camp' | 'dump' | 'water';
  lat: number; lng: number; fee: string | null; phone: string | null;
  site: string | null; power: boolean; thin?: boolean;
};

export default function RouteMap({ legs, around, shared, fuel, picking, onPick, onTown, show, onCount, flyTo, onToggle, onSearch, dark, onDark, onReady, onlyRoute, corridor, onPumps, onSheet }: {
  legs: Leg[];
  around: Record<string, Found>;
  /** What travellers have added, by the point they were looked up against. */
  shared?: Record<string, Shared[]>;
  /** Diesel board prices, by the point they were looked up against. */
  fuel?: Record<string, Fuel>;
  // When a leg is being pointed out on the map rather than typed. First click
  // is where you leave from, second is where you are going.
  picking?: { legId: string; end: 'from' | 'to' } | null;
  onPick?: (point: [number, number]) => void;
  // Tap a stop, or anywhere else, to ask what there is to do there.
  onTown?: (at: [number, number], name?: string) => void;
  /** Which kinds are drawn. Absent means all of them. */
  show?: Record<LayerKey, boolean>;
  /** How many of each kind are inside the current view, after every pan. */
  onCount?: (counts: Record<LayerKey, number> & { total: number; corridorTotal: number }) => void;
  /** Somewhere to put the map, from the search box above it. */
  flyTo?: { lat: number; lng: number; at: number } | null;
  /** Turn a kind on or off. Absent hides the row of toggles. */
  onToggle?: (key: LayerKey) => void;
  /** Look a town up. Absent hides the search box. */
  onSearch?: (query: string) => void;
  /** Light or dark, which lived on a toolbar that full screen took away. */
  dark?: boolean;
  onDark?: () => void;
  /** Called once the tiles have painted, so the splash knows when to go. */
  onReady?: () => void;
  /** Show only what is near the road, rather than everything in the frame. */
  onlyRoute?: boolean;
  /** How far off the road counts as on the way, in kilometres. */
  corridor?: number;
  /** The servos found for the current view, handed up so the budget can use them. */
  onPumps?: (pumps: Pump[]) => void;
  /** Whether a sheet is covering the map, so what is outside it can stand aside. */
  onSheet?: (open: boolean) => void;
}) {
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // A single canvas for every servo dot. One element for a thousand markers,
  // which is the whole reason none of them have to be left out.
  const canvas = useRef<L.Canvas | null>(null);
  // Price labels live apart from everything else because they are redrawn on
  // every pan and zoom, and nothing else should be.
  const priceLayer = useRef<L.LayerGroup | null>(null);
  const pumpsRef = useRef<{ pumps: Pump[]; shade: (p: number) => string; low: number } | null>(null);
  // Everything currently on the map, by kind, so "56 sites in map area" can be
  // answered on every pan without walking the Leaflet layers.
  const plotted = useRef<Record<LayerKey, [number, number][]>>({
    camps: [], fuel: [], water: [], dump: [], things: [], shared: [], caravan: [],
  });
  // Parks come from the frame rather than from a leg, so they live in their own
  // layer and are replaced on every pan instead of being redrawn with the rest.
  const parkLayer = useRef<L.LayerGroup | null>(null);
  // Servos and attractions get their own groups. They change on every pan; the
  // route, the stops and the traveller pins do not, and rebuilding all of it
  // every time the map moved was the whole of the lag.
  const pumpLayer = useRef<L.LayerGroup | null>(null);
  const thingLayer = useRef<L.LayerGroup | null>(null);
  const parkAbort = useRef<AbortController | null>(null);
  const parkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thingAbort = useRef<AbortController | null>(null);
  const thingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The shape of the route the map was last framed to, and whether the person
  // looking at it has since moved it themselves. See the note by fitBounds.
  const framedTo = useRef<string>('');
  const touched = useRef(false);
  const framing = useRef(false);
  const report = useRef(onCount);
  report.current = onCount;
  const ready = useRef(onReady);
  ready.current = onReady;
  // The splash comes off when the map is actually ready, not when a timer says
  // so. Ready means two things have happened: the tiles have painted, and the
  // first load of sites has been drawn. Tiles alone was the wrong signal, it
  // lifted the cover just in time for somebody to watch the markers land.
  const painted = useRef({ tiles: false, sites: false });
  const tell = useCallback(() => {
    if (painted.current.tiles && painted.current.sites) ready.current?.();
  }, []);
  const showRef = useRef(show);
  showRef.current = show;
  // The road itself, and how far off it somebody would turn. Both in refs
  // because the loader is bound once.
  const routeRef = useRef<[number, number][] | null>(null);
  const corridorRef = useRef(25);
  const [zoomedOut, setZoomedOut] = useState(false);
  // Servos for whatever is on screen. Kept in state rather than a ref because
  // the drawing runs off it and has to redraw when it changes.
  const [viewPumps, setViewPumps] = useState<Pump[]>([]);
  // Attractions for the road, fetched once per route rather than per pan.
  const [routeThings, setRouteThings] = useState<{ id: string; name: string; what: string | null; lat: number; lng: number; fee: string | null }[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(false);
  const [picked, setPicked] = useState<Park | null>(null);
  useEffect(() => { onSheet?.(filters || !!picked); }, [filters, picked, onSheet]);
  const [shots, setShots] = useState<{ photos: Shot[]; exact: boolean } | null>(null);
  const [shooting, setShooting] = useState(false);
  const [ours, setOurs] = useState<{ id: string; url: string; by: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const shotInput = useRef<HTMLInputElement | null>(null);
  const [finding, setFinding] = useState(false);

  // Put a price on the servos you can actually see.
  //
  // Zoomed out that would be a wall of overlapping labels, so it waits until
  // the map is close enough for them to be readable and then only labels what
  // is on screen. The dots underneath never go away, so nothing is hidden — the
  // labels are detail that arrives when there is room for it.
  const drawPrices = useCallback(() => {
    const m = map.current, group = priceLayer.current, held = pumpsRef.current;
    if (!m || !group) return;
    group.clearLayers();
    if (!held) return;

    const LL = leafletRef.current;
    if (!LL) return;
    const zoom = m.getZoom();
    if (zoom < 9) return;

    const bounds = m.getBounds();
    const visible = held.pumps.filter((p) => bounds.contains([p.lat, p.lng] as [number, number]));
    // Past this many on screen the labels are touching each other and the dots
    // read better on their own. Zooming in one more step thins it naturally.
    if (visible.length > 90) return;

    [...visible].sort((a, b) => b.price - a.price).forEach((pump) => {
      const best = pump.price === held.low;
      const icon = LL.divIcon({
        className: '',
        html: `<div class="pricepin${best ? ' best' : ''}" style="--pin:${held.shade(pump.price)}"><span>${cents(pump.price)}</span></div>`,
        iconSize: [58, 30], iconAnchor: [29, 34],
      });
      LL.marker([pump.lat, pump.lng], { icon, zIndexOffset: best ? 800 : 500, interactive: false })
        .addTo(group);
    });
  }, []);

  // What is inside the frame right now.
  //
  // WikiCamps puts a count under the map and it is the single most useful thing
  // on the screen: it turns panning from "am I missing something" into a number
  // that goes up. Counted from a plain list of coordinates rather than by
  // asking Leaflet, because this runs on every pan.
  // Set whenever a corridor answer comes back thinned, zero otherwise.
  const corridorTotal = useRef(0);

  const countInView = useCallback(() => {
    const m = map.current;
    if (!m || !report.current) return;
    const box = m.getBounds();
    const out = {
      camps: 0, fuel: 0, water: 0, dump: 0, things: 0, shared: 0, caravan: 0, total: 0,
      // How many are really in the corridor when the answer had to be thinned.
      // A lap finds thirteen thousand and gets fourteen hundred, and a screen
      // that shows the fourteen hundred without saying so is telling somebody
      // there is less out there than there is.
      corridorTotal: corridorTotal.current,
    };
    (Object.keys(plotted.current) as LayerKey[]).forEach((key) => {
      const n = plotted.current[key].filter((c) => box.contains(c)).length;
      out[key] = n;
      out.total += n;
    });
    report.current(out);
  }, []);

  // Parks for whatever is on screen.
  //
  // Fired on pan rather than on a lookup, which is the behaviour that makes a
  // map browsable: you move it and things appear. Three things keep that from
  // being abusive to a donated server. It waits until the panning stops. It
  // cancels the request still in flight when you move again. And it does
  // nothing at all zoomed out past the point where the pins would be a solid
  // mass anyway, which the server also refuses on its own.
  const loadParks = useCallback(() => {
    const m = map.current;
    const group = parkLayer.current;
    const L = leafletRef.current;
    if (!m || !group || !L) return;

    if (parkTimer.current) clearTimeout(parkTimer.current);

    const want = showRef.current;
    if (want && !want.caravan && !want.camps && !want.dump && !want.water) {
      group.clearLayers();
      plotted.current.caravan = [];
      plotted.current.camps = [];
      plotted.current.dump = [];
      plotted.current.water = [];
      countInView();
      return;
    }


    // Zoomed out past this there is no useful answer, only a lot of data.
    // Half of Queensland at once was slow to fetch, slow to draw and unreadable
    // when it arrived. The route corridor below is the exception: it is allowed
    // at any zoom, because a corridor is small however far out you are looking.
    const onRoute = routeRef.current && routeRef.current.length > 1;
    if (!onRoute && m.getZoom() < 9) {
      group.clearLayers();
      plotted.current.caravan = [];
      plotted.current.camps = [];
      setZoomedOut(true);
      countInView();
      painted.current.sites = true;
      tell();
      return;
    }
    setZoomedOut(false);

    parkTimer.current = setTimeout(async () => {
      const box = m.getBounds();
      const bbox = [box.getSouth(), box.getWest(), box.getNorth(), box.getEast()]
        .map((n) => n.toFixed(4)).join(',');

      parkAbort.current?.abort();
      const ctl = new AbortController();
      parkAbort.current = ctl;

      try {
        // Two questions, and the route one is the better question whenever it
        // can be asked. A box around a run to Cape York holds most of
        // Queensland and almost none of it is on the way.
        const path = routeRef.current;

        // Servos for the same area, at the same time. They used to arrive only
        // for a leg somebody had already typed in, which meant the map showed
        // no fuel at all until a route existed. On a lap the servo is the thing
        // you look for first.
        const fuelBody = path && path.length > 1
          ? { line: path, within: corridorRef.current }
          : { bbox };
        const wantFuel = !showRef.current || showRef.current.fuel;
        const fuelRes = wantFuel
          ? fetch('/api/fuel', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(fuelBody),
              signal: ctl.signal,
            }).then((r) => r.json()).catch(() => ({ pumps: [] }))
          : Promise.resolve({ pumps: [] });

        const res = path && path.length > 1
          ? await fetch('/api/parks', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ line: path, within: corridorRef.current }),
              signal: ctl.signal,
            })
          : await fetch(`/api/parks?bbox=${bbox}`, { signal: ctl.signal });
        const body = await res.json().catch(() => ({}));
        corridorTotal.current = body?.thinned ? Number(body.total) || 0 : 0;
        const parks: Park[] = Array.isArray(body?.parks) ? body.parks : [];
        const board = await fuelRes;
        const found: Pump[] = Array.isArray(board?.pumps) ? board.pumps : [];
        setViewPumps(found);
        onPumps?.(found);

        group.clearLayers();
        // Both kinds are drawn from this one fetch, so both lists are cleared.
        plotted.current.caravan = [];
        plotted.current.camps = [];
        plotted.current.dump = [];
        plotted.current.water = [];

        // Ten thousand teardrops would bring a phone to its knees, so past a
        // certain distance every site is a dot on the shared canvas layer, one
        // element for the lot. Zoom in and they become the pin with the roof or
        // the tent on it. Same sites either way; only the detail changes.
        // Teardrops are real DOM elements and a few hundred of them is what a
        // phone chokes on. Canvas dots cost nothing at any number, so the pins
        // only get their shape when there are few enough to be worth drawing
        // properly. Zooming one more step thins it and they appear.
        const close = m.getZoom() >= 10 && parks.length <= 220;

        // Colour, mark, and which switch each kind answers to, in one table so
        // the pins and the filter list can never disagree about what is what.
        // A caravan park and a bush campground are different decisions, and a
        // dump point is a different question again.
        const KIND = {
          caravan: { colour: '#fb923c', glyph: '⌂', layer: 'caravan' as LayerKey },
          camp:    { colour: '#4ade80', glyph: '⛺', layer: 'camps' as LayerKey },
          dump:    { colour: '#a78bfa', glyph: '♻', layer: 'dump' as LayerKey },
          water:   { colour: '#38bdf8', glyph: '⛲', layer: 'water' as LayerKey },
        } as const;

        parks.forEach((park) => {
          const spec = KIND[park.kind] ?? KIND.camp;
          if (want && !want[spec.layer]) return;
          // Drinking water is eleven thousand of the twenty two, and most of it
          // is a bubbler in a suburban playground. Useful when you are standing
          // in the town looking for it, noise at any distance, so it only
          // appears once you are properly zoomed in.
          if (park.kind === 'water' && m.getZoom() < 11) return;
          const colour = spec.colour;
          const bits = [
            park.fee === 'free' ? 'free' : park.fee === 'paid' ? 'paid' : null,
            park.power ? 'powered sites' : null,
            park.phone,
          ].filter(Boolean);
          const label = `<b>${park.name}</b>`
            + (bits.length ? `<br>${bits.join(' · ')}` : '')
            + '<br><i>from OpenStreetMap, availability not known</i>';

          L.marker([park.lat, park.lng], {
            icon: L.divIcon({
              className: '',
              html: `<span class="teardrop" style="--pin:${colour}"><i>${spec.glyph}</i></span>`,
              iconSize: [26, 33], iconAnchor: [13, 33],
            }),
          }).bindTooltip(label, { direction: 'top' })
            .on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(e); setPicked(park); })
            .addTo(group);

          plotted.current[spec.layer].push([park.lat, park.lng]);
        });

        countInView();
        painted.current.sites = true;
        tell();
      } catch {
        // Aborted, or every mirror busy. Either way the map is as ready as it
        // is going to get, and a cover that never lifts is worse than a map
        // with nothing on it yet.
        painted.current.sites = true;
        tell();
      }
    }, 400);
  }, [countInView]);

  /**
   * Shrink a photo before it leaves the phone.
   *
   * A camera file is four megabytes and this is shown at about four hundred
   * pixels. Sending the original wastes the traveller's data, which out here is
   * often the expensive kind, and the orientation flag has to be honoured or
   * half the photos arrive on their side.
   */
  async function shrink(file: File): Promise<string> {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read that photo.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function addPhoto(file?: File) {
    if (!file || !picked) return;
    setSending(true); setSent(null);
    try {
      const image = await shrink(file);
      const res = await fetch('/api/places/photo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: picked.lat, lng: picked.lng, name: picked.name, image }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setSent(body?.error ?? 'Could not add that photo.'); return; }
      // Straight onto the screen for the person who took it, even though it is
      // not public yet. Their photo, their phone, no reason to make them wait.
      if (body.url) setOurs((list) => [{ id: 'pending', url: body.url, by: 'you' }, ...list]);
      setSent('Thanks. It goes up once it has been looked at.');
    } catch {
      setSent('Could not read that photo.');
    } finally { setSending(false); }
  }

  // Photos for whatever was just tapped.
  //
  // Fetched on open rather than with the pins: ten thousand sites on screen is
  // ten thousand requests nobody asked for, and the only one that matters is
  // the one somebody is looking at.
  useEffect(() => {
    if (!picked) { setShots(null); return; }
    let live = true;
    setShooting(true);
    setShots(null);
    // Both at once. Travellers' own photos are of the site; Commons photos are
    // of the area and are what fills the gap until there are enough of the
    // first kind. They are shown apart and labelled, because the difference
    // matters to somebody deciding whether to drive there.
    Promise.all([
      fetch(`/api/places/photo?lat=${picked.lat}&lng=${picked.lng}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/photos?lat=${picked.lat}&lng=${picked.lng}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([mine, commons]) => {
      if (!live) return;
      setOurs(mine?.photos ?? []);
      setShots({ photos: commons?.photos ?? [], exact: !!commons?.exact });
    }).finally(() => { if (live) setShooting(false); });
    return () => { live = false; };
  }, [picked]);

  // Things to do, for what is on screen.
  //
  // Zoomed in only, and debounced, because unlike the other layers this is a
  // live query against somebody else's server rather than a file of ours.
  const loadThings = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (thingTimer.current) clearTimeout(thingTimer.current);
    if (!showRef.current || !showRef.current.things || m.getZoom() < 10) {
      setRouteThings([]);
      return;
    }
    thingTimer.current = setTimeout(() => {
      const b = m.getBounds();
      const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
        .map((n) => n.toFixed(3)).join(',');
      thingAbort.current?.abort();
      const ctl = new AbortController();
      thingAbort.current = ctl;
      fetch(`/api/things?bbox=${bbox}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((body) => setRouteThings(Array.isArray(body?.things) ? body.things : []))
        .catch(() => { /* aborted, or busy: the rest of the map is unaffected */ });
      // Attractions come last and are the least urgent of the three: they are a
      // live query to somebody else's server, and going out with the sites and
      // the fuel meant three requests competing on a phone connection at the
      // exact moment the map was trying to draw.
    }, 900);
  }, []);

  // Somewhere else, from the search box.
  useEffect(() => {
    if (!flyTo || !map.current) return;
    map.current.flyTo([flyTo.lat, flyTo.lng], Math.max(map.current.getZoom(), 11), { duration: 0.8 });
  }, [flyTo]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !host.current) return;

      if (!map.current) {
        // One finger moves the map.
        //
        // It used to take two, so that a finger dragged down the page would
        // scroll past the map rather than panning it. That protects the page
        // scroll and costs everybody a gesture they have to be told about,
        // which is the wrong way round for the main thing on the page. The
        // page still scrolls from the bar above the map and everything below
        // it.
        // Leaflet's own attribution box is off, and the credit is drawn in the
        // count strip instead.
        //
        // The control is a Leaflet control, which means it sits at the top of
        // Leaflet's own stack and answers to nothing in this app. On the map
        // tab it collided with the buttons and the count strip, and opening a
        // camp put it straight over the description and the photos, because the
        // sheet is ours and the box was not. Moving it only moved the argument.
        //
        // In the strip it is inside a component that already knows when a sheet
        // is open and already fades for it, so it can never cover anything
        // again, and it is on screen whenever the map is. The tile policy asks
        // for the credit to be visible, not for it to be in Leaflet's box.
        map.current = L.map(host.current, {
          scrollWheelZoom: false,
          attributionControl: false,
        }).setView([-22.5, 145], 5);
        canvas.current = L.canvas({ padding: 0.3 });

        // No attribution here: it is rendered in the count strip, see above.
        // Required by the tile usage policy either way, and fair enough, the
        // map is drawn by people who did it for nothing.
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 17,
        });
        // Fired when every tile in the first view has painted, which is the
        // real moment the map exists. Once only: later pans are not a load.
        tiles.once('load', () => { painted.current.tiles = true; tell(); });
        tiles.addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        priceLayer.current = L.layerGroup().addTo(map.current);
        parkLayer.current = L.layerGroup().addTo(map.current);
        pumpLayer.current = L.layerGroup().addTo(map.current);
        thingLayer.current = L.layerGroup().addTo(map.current);
        // Labels follow the view, so they are recalculated when the view
        // changes rather than when a prop does.
        map.current.on('moveend zoomend', () => { drawPrices(); countInView(); loadParks(); loadThings(); });
        // Taking hold of the map counts as taking it over. fitBounds also
        // drags and zooms, so it raises a flag first and these ignore anything
        // that happens while it is up, otherwise the framing would mark itself
        // as a person and never frame again.
        ['dragstart', 'zoomstart'].forEach((ev) =>
          map.current!.on(ev, () => { if (!framing.current) touched.current = true; }));
        map.current.on('moveend', () => { framing.current = false; });
      }
      leafletRef.current = L;

      // One click handler, two jobs. While a leg is being pointed out the map
      // is setting its ends; the rest of the time a tap asks what is around
      // wherever you put your finger.
      map.current.off('click');
      map.current.on('click', (event: L.LeafletMouseEvent) => {
        const point: [number, number] = [event.latlng.lat, event.latlng.lng];
        if (picking && onPick) { onPick(point); return; }
        onTown?.(point);
      });
      host.current.style.cursor = picking ? 'crosshair' : '';

      const group = layer.current!;
      group.clearLayers();

      // Small enough not to hide the road underneath, and a shape per kind so a
      // dump point is not mistaken for a camp at a glance.
      const dot = (colour: string, size = 9) => L.divIcon({
        className: '',
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${colour};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });

      // A teardrop with a mark in it, rather than a coloured dot.
      //
      // A dot needs a legend; a shape does not. At a glance a tap tells you
      // water and a caravan tells you a camp, and once the pin carries its own
      // meaning the key underneath stops being the thing you have to read
      // first. Colour still does the sorting, the glyph does the naming.
      const pin = (colour: string, glyph: string, big = false) => L.divIcon({
        className: '',
        html: `<span class="teardrop${big ? ' big' : ''}" style="--pin:${colour}"><i>${glyph}</i></span>`,
        iconSize: big ? [30, 38] : [26, 33],
        iconAnchor: big ? [15, 38] : [13, 33],
      });

      // Simple marks, not an icon font: they have to survive being 12 pixels
      // tall on a phone in the sun.
      const GLYPH: Record<string, string> = {
        camps: '⛺',    // tent
        water: 'Ὣ0',
        dump: '♻',
        things: '★',
        shared: '⚑',
      };

      const bounds: [number, number][] = [];

      legs.forEach((leg, index) => {
        if (leg.line && leg.line.length > 1) {
          L.polyline(leg.line, { color: '#3ee6b2', weight: 3.5, opacity: 0.9 }).addTo(group);
          leg.line.forEach((point) => bounds.push(point));
        }
        if (leg.fromAt) {
          const marker = L.marker(leg.fromAt, { icon: dot('#f8fafc', 12) })
            .bindTooltip(leg.from || 'Start', { direction: 'top' }).addTo(group);
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (!picking) onTown?.(leg.fromAt!, leg.from);
          });
          bounds.push(leg.fromAt);
        }
        if (leg.toAt) {
          const marker = L.marker(leg.toAt, { icon: dot('#3ee6b2', 15) })
            .bindTooltip(`${index + 1}. ${leg.to || 'Stop'}${leg.nights ? ` · ${leg.nights} nights` : ''}. Tap for what is there.`,
              { direction: 'top' })
            .addTo(group);
          marker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (!picking) onTown?.(leg.toAt!, leg.to);
          });
          bounds.push(leg.toAt);
        }
      });

      // Only what has actually been looked up. Everything at once would be a
      // map of Australia covered in dots. Servos are not in here: they get
      // price pins of their own below, and a dot beside a price is one marker
      // for the same thing twice.
      plotted.current = { ...plotted.current, fuel: [], water: [], dump: [], things: [], shared: [] };
      const on = (key: LayerKey) => !show || show[key];

      Object.values(around || {}).forEach((found) => {
        // Camps are not in this list any more. They used to be looked up per
        // tap from the same OSM tags the national layer now carries, so every
        // campground was drawn twice and the two fought over the count. The
        // national set is a superset of what a tap could find, so the tap stops
        // asking for them.
        // Only things to do are looked up per tap now. Water and dump points
        // joined the camps in the national set, for the same reason: a layer
        // that only exists where somebody has already tapped looks broken.
        ([['things', '#facc15']] as const).forEach(([key, colour]) => {
          if (!on(key)) return;
          (found?.[key] || []).forEach((place) => {
            if (typeof place.lat !== 'number') return;
            const label = key === 'things'
              ? `${place.name}${place.what ? ` · ${place.what}` : ''} · ${place.directKm}km`
              : `${place.name}${place.fee && place.fee !== 'unknown' ? ` · ${place.fee}` : ''} · ${place.directKm}km`;
            L.marker([place.lat, place.lon], { icon: pin(colour, GLYPH[key]) })
              .bindTooltip(label, { direction: 'top' })
              .addTo(group);
            plotted.current[key].push([place.lat, place.lon]);
          });
        });
      });

      // Travellers' own, drawn bigger and in white so they stand out against
      // the map's dots. The whole point is that somebody has been there.
      if (on('shared')) Object.values(shared || {}).forEach((rows) => {
        (rows || []).forEach((place) => {
          if (typeof place.lat !== 'number') return;
          const detail = place.kind === 'camp'
            ? (place.nightly != null ? `$${place.nightly} a night` : 'camp')
            : (place.what || 'worth a stop');
          L.marker([place.lat, place.lng], { icon: pin('#ffffff', GLYPH.shared, true) })
            .bindTooltip(`${place.name} · ${detail} · added by a traveller`, { direction: 'top' })
            .addTo(group);
          plotted.current.shared.push([place.lat, place.lng]);
        });
      });

      // Frame the route once, then leave the map alone.
      //
      // This used to run every time the effect did, which was fine while the
      // effect only ran when a leg changed. Adding the in-view counter made the
      // parent re-render on every pan, so the effect re-ran, so the map snapped
      // back to the whole route the instant anybody tried to zoom into it. You
      // could not look at anything.
      //
      // Two conditions now. The route has to have actually changed shape, and
      // the person must not have taken hold of the map themselves. Once they
      // have, it is theirs until the route changes again.
      // Changing the route is a fresh instruction and gets a fresh frame, even
      // if the map was moved by hand earlier: somebody who just added a leg
      // wants to see it. Panning and zooming within an unchanged route is left
      // entirely alone, which is what was broken.
      const shape = bounds.map((b) => `${b[0].toFixed(4)},${b[1].toFixed(4)}`).join('|');
      if (bounds.length && shape !== framedTo.current) {
        framedTo.current = shape;
        touched.current = false;
        framing.current = true;
        map.current.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 11 });
      }
      // Drawn inside a tab that was hidden a moment ago, so it has to be told
      // the box it is in has a size now.
      setTimeout(() => { map.current?.invalidateSize(); countInView(); loadParks(); loadThings(); }, 80);
    })();

    return () => { cancelled = true; };
  }, [legs, around, shared, picking, onPick, onTown, show, countInView, loadParks, loadThings]);


  // Servos, on their own layer.
  //
  // Split out of the main draw because they change every time the map moves and
  // everything else does not. Rebuilding the route, the stops and the traveller
  // pins on every pan to put a new set of fuel dots down was most of the reason
  // this felt heavy.
  useEffect(() => {
    const L = leafletRef.current, group = pumpLayer.current;
    if (!L || !group) return;
    group.clearLayers();
    plotted.current.fuel = [];

    if (show && !show.fuel) { pumpsRef.current = null; priceLayer.current?.clearLayers(); countInView(); return; }

    // What is on screen, plus anything a leg lookup already found. The area
    // fetch is the main source; the leg ones are kept because they carry the
    // numbers the Money tab was costed from, and dropping them would change a
    // budget somebody had already seen.
    const legPumps = Object.values(fuel || {}).flatMap((set) => set?.pumps ?? []);
    const seen = new Set<string>();
    const allPumps = [...viewPumps, ...legPumps].filter((pump) => {
      const key = `${pump.lat.toFixed(4)},${pump.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!allPumps.length) { pumpsRef.current = null; priceLayer.current?.clearLayers(); countInView(); return; }

    const low = Math.min(...allPumps.map((x) => x.price));
    const high = Math.max(...allPumps.map((x) => x.price));
    const span = Math.max(high - low, 0.0001);
    const shade = (price: number) => `hsl(${Math.round(152 - ((price - low) / span) * 152)} 72% 46%)`;

    // Every one of them, on one canvas. A thousand dots on a canvas layer cost
    // about what one does, which is the whole reason none of them have to be
    // left out: on a trip the question is where the servos are, not only where
    // the cheap ones are.
    allPumps.forEach((pump) => {
      L.circleMarker([pump.lat, pump.lng], {
        renderer: canvas.current!,
        radius: pump.price === low ? 6 : 4.5,
        color: '#0b1220', weight: 1.25,
        fillColor: shade(pump.price), fillOpacity: 1,
      }).bindTooltip(tip(pump), { direction: 'top', className: 'pump-tip' }).addTo(group);
      plotted.current.fuel.push([pump.lat, pump.lng]);
    });

    pumpsRef.current = { pumps: allPumps, shade, low };
    drawPrices();
    countInView();
  }, [viewPumps, fuel, show, drawPrices, countInView]);

  // Attractions, likewise on their own layer.
  useEffect(() => {
    const L = leafletRef.current, group = thingLayer.current;
    if (!L || !group) return;
    group.clearLayers();
    plotted.current.things = [];
    if (show && !show.things) { countInView(); return; }

    routeThings.forEach((thing) => {
      L.marker([thing.lat, thing.lng], {
        icon: L.divIcon({
          className: '',
          html: `<span class="teardrop" style="--pin:#facc15"><i>★</i></span>`,
          iconSize: [26, 33], iconAnchor: [13, 33],
        }),
      })
        .bindTooltip(`${thing.name}${thing.what ? ` · ${thing.what.replace(/_/g, ' ')}` : ''}${thing.fee === 'free' ? ' · free' : ''}`,
                     { direction: 'top' })
        .addTo(group);
      plotted.current.things.push([thing.lat, thing.lng]);
    });
    countInView();
  }, [routeThings, show, countInView]);

  const drawn = legs.some((leg) => leg.line && leg.line.length > 1);

  // Every leg's line, end to end, when the route is being followed.
  //
  // Thinned here rather than at the other end. A lap of the country is about
  // twenty thousand points, which is 0.71MB of JSON uploaded from a phone on
  // the Barkly, and every endpoint it is sent to immediately throws away
  // ninety eight percent of it: the corridor only needs four hundred points
  // because it is measuring against a band twenty five kilometres wide. Sending
  // the whole thing so the server can discard it is the phone paying for our
  // convenience.
  //
  // Coordinates go to five decimals, which is a metre. Past that is noise on a
  // corridor this wide and it is a third of the characters.
  const road = useMemo(() => {
    if (!onlyRoute) return null;
    const path = legs.flatMap((leg) => leg.line ?? []);
    if (path.length <= 1) return null;
    const step = Math.max(1, Math.floor(path.length / 400));
    return path
      .filter((_, i) => i % step === 0 || i === path.length - 1)
      .map(([a, o]) => [Number(a.toFixed(5)), Number(o.toFixed(5))]) as [number, number][];
  }, [legs, onlyRoute]);
  routeRef.current = road;
  corridorRef.current = corridor ?? 25;

  useEffect(() => { loadParks(); loadThings(); }, [road, corridor, loadParks, loadThings]);

  // How many kinds are switched off, which is the only thing the button has to
  // say: a dot when the map is not showing everything.
  const offCount = show ? KEYS.filter((k) => !show[k]).length : 0;

  // Where I am, without a plugin.
  //
  // The browser's own geolocation, asked for on a tap rather than on load. A
  // map that demands your location before you have asked it anything is a map
  // people say no to once and then have to go into settings to undo.
  const locate = () => {
    if (!navigator.geolocation || !map.current) return;
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFinding(false);
        map.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 11, { duration: 0.8 });
      },
      () => setFinding(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="map-wrap">
      <div ref={host} className="map" />

      {/* Everything below floats over the map. The map is the page, which is
          the whole point of the layout: chrome around it eats the height that
          makes it worth looking at on a phone. */}
      {onSearch && (
        <div className="map-top">
          <form className="map-search" onSubmit={(e) => { e.preventDefault(); onSearch(query); }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Search a town" aria-label="Search a town"
                   enterKeyHint="search" />
            <button type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
            </button>
          </form>

          {/* One button, not a row of chips. The chips were readable but they
              took a strip off the top of the map on every screen, including the
              screens where nobody was filtering anything. A filter is something
              you set once and forget, so it costs one button and the dot tells
              you when something is switched off. */}
          {show && onToggle && (
            <button type="button" className={`map-filter${offCount ? ' set' : ''}`}
                    onClick={() => setFilters(true)} aria-label="Filters">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                   strokeWidth="2.1" strokeLinecap="round">
                <path d="M4 7h16M7 12h10M10 17h4" />
              </svg>
              {offCount > 0 && <i className="dot" />}
            </button>
          )}
        </div>
      )}

      {show && onToggle && filters && (
        <div className="map-sheet-scrim" onClick={() => setFilters(false)}>
          <div className="map-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-head">
              <b>What to show</b>
              <button type="button" onClick={() => setFilters(false)}>Done</button>
            </div>
            {KEYS.map((key) => (
              <button key={key} type="button" className="sheet-row" onClick={() => onToggle(key)}>
                <span className="sheet-swatch" style={{ background: SWATCH[key] }} />
                <span className="sheet-name">{CHIP[key]}</span>
                <span className={show[key] ? 'sheet-switch on' : 'sheet-switch'}><i /></span>
              </button>
            ))}
            <p className="sheet-note">
              Parks and camps come from OpenStreetMap. It knows where they are, not whether
              they have a site free.
            </p>
          </div>
        </div>
      )}

      <div className="map-fabs">
        {onDark && (
          <button type="button" className="fab" onClick={onDark}
                  aria-label={dark ? 'Light' : 'Dark'}>
            {dark ? (
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </button>
        )}
        <button type="button" className="fab" onClick={locate} aria-label="Where I am">
          {finding ? <span className="fab-wait" /> : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M21 3L3 10.5l7.5 3L13.5 21z" />
            </svg>
          )}
        </button>
      </div>

      {picked && (
        <div className="map-sheet-scrim" onClick={() => setPicked(null)}>
          <div className="map-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-head">
              <b>{picked.name}</b>
              <button type="button" onClick={() => setPicked(null)}>Close</button>
            </div>

            <p className="site-facts">
              {picked.kind === 'caravan' ? 'Caravan park' : 'Campground'}
              {picked.fee === 'free' ? ' · free' : picked.fee === 'paid' ? ' · paid' : ''}
              {picked.power ? ' · powered sites' : ''}
            </p>

            {picked.thin && (
              <p className="site-thin">
                All the map has for this one is a name and a spot. No fee, power or phone
                recorded, so it could be anything from a proper free camp to a picnic ground
                somebody once slept at. Worth a look on the way past rather than a detour.
              </p>
            )}

            {picked.phone && (
              <a className="site-call" href={`tel:${picked.phone.replace(/[^+0-9]/g, '')}`}>
                Ring {picked.phone}
              </a>
            )}

            {shooting && <div className="site-shots loading"><span /><span /><span /></div>}

            {/* Travellers' own first. These are of the site; the Commons ones
                below are of the area. */}
            {ours.length > 0 && (
              <>
                <div className="site-shots">
                  {ours.map((shot) => (
                    <span key={shot.id + shot.url} className="shot">
                      <img src={shot.url} alt="" loading="lazy" />
                      <em>{shot.by === 'you' ? 'Yours, waiting to be checked' : `Added by ${shot.by}`}</em>
                    </span>
                  ))}
                </div>
                <p className="sheet-note">Taken by travellers who stayed here.</p>
              </>
            )}

            <div className="site-add">
              <button type="button" disabled={sending}
                      onClick={() => shotInput.current?.click()}>
                {sending ? 'Sending' : ours.length ? 'Add another photo' : 'Add a photo of this place'}
              </button>
              {sent && <span className="site-sent">{sent}</span>}
              <input ref={shotInput} type="file" accept="image/*" hidden
                     onChange={(e) => { addPhoto(e.target.files?.[0] ?? undefined); e.target.value = ''; }} />
            </div>

            {shots && shots.photos.length > 0 && (
              <>
                <div className="site-shots">
                  {shots.photos.map((shot) => (
                    <a key={shot.thumb} href={shot.full} target="_blank" rel="noreferrer"
                       className="shot" title={shot.title}>
                      {/* Plain img on purpose: these are other people's files on
                          somebody else's server, and running them through an
                          optimiser would be caching copies of them. */}
                      <img src={shot.thumb} alt={shot.title} loading="lazy" />
                      <em>{shot.by}{shot.licence ? ` · ${shot.licence}` : ''}</em>
                    </a>
                  ))}
                </div>
                <p className="sheet-note">
                  {shots.exact
                    ? 'Photos from Wikimedia Commons, taken near this spot.'
                    : 'Photos from Wikimedia Commons, from the area rather than this exact site.'}
                </p>
              </>
            )}

            {shots && shots.photos.length === 0 && !shooting && (
              <p className="sheet-note">No photos of this one yet.</p>
            )}

            <p className="sheet-note">
              Whether it has a site free is not something this knows. Ring ahead in school holidays.
            </p>
          </div>
        </div>
      )}

      {zoomedOut && !picking && (
        <div className="map-hint">Zoom in to see parks and camps</div>
      )}

      {picking && <p className="picking">Tap the map to set where this leg {picking.end === 'from' ? 'starts' : 'finishes'}.</p>}
      {!drawn && !picking && !onSearch && (
        <p className="sub">Tap anywhere on the map to see what there is to do there. Add a leg below and the road appears.</p>
      )}

      <div className="map-key">
        <span><i style={{ background: '#3ee6b2' }} /> Stops</span>
        <span><i style={{ background: '#facc15' }} /> Things to do</span>
        <span><i style={{ background: '#f5a524' }} /> Camps</span>
        <span><i style={{ background: '#38bdf8' }} /> Water</span>
        <span><i style={{ background: '#a78bfa' }} /> Dump points</span>
        <span><i style={{ background: '#ffffff' }} /> Added by travellers</span>
        <span className="key-price"><i className="key-pin" /> Every servo reporting a diesel price. Green is cheap, red is dear. Zoom in for the price on each one.</span>
      </div>
    </div>
  );
}
