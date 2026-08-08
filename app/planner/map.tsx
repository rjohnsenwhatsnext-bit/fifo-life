'use client';
import { useEffect, useRef } from 'react';
import type { Leg } from '../../lib/planner';

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

export default function RouteMap({ legs, around, picking, onPick, onTown }: {
  legs: Leg[];
  around: Record<string, Found>;
  // When a leg is being pointed out on the map rather than typed. First click
  // is where you leave from, second is where you are going.
  picking?: { legId: string; end: 'from' | 'to' } | null;
  onPick?: (point: [number, number]) => void;
  // Tap a stop, or anywhere else, to ask what there is to do there.
  onTown?: (at: [number, number], name?: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !host.current) return;

      if (!map.current) {
        map.current = L.map(host.current, { scrollWheelZoom: false }).setView([-22.5, 145], 5);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 17,
          // Required by the tile usage policy, and fair enough: the map is
          // drawn by people who did it for nothing.
          attribution: '© OpenStreetMap contributors',
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }

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
      // map of Australia covered in dots.
      Object.values(around || {}).forEach((found) => {
        ([['things', '#facc15'], ['camps', '#f5a524'], ['water', '#38bdf8'], ['dump', '#a78bfa'], ['fuel', '#f87171']] as const).forEach(([key, colour]) => {
          (found?.[key] || []).forEach((place) => {
            if (typeof place.lat !== 'number') return;
            const label = key === 'things'
              ? `${place.name}${place.what ? ` · ${place.what}` : ''} · ${place.directKm}km`
              : `${place.name}${place.fee && place.fee !== 'unknown' ? ` · ${place.fee}` : ''} · ${place.directKm}km`;
            L.marker([place.lat, place.lon], { icon: dot(colour, key === 'things' ? 9 : 7) })
              .bindTooltip(label, { direction: 'top' })
              .addTo(group);
          });
        });
      });

      if (bounds.length) {
        map.current.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 11 });
      }
      // Drawn inside a tab that was hidden a moment ago, so it has to be told
      // the box it is in has a size now.
      setTimeout(() => map.current?.invalidateSize(), 80);
    })();

    return () => { cancelled = true; };
  }, [legs, around, picking, onPick, onTown]);

  const drawn = legs.some((leg) => leg.line && leg.line.length > 1);

  return (
    <div className="map-wrap">
      <div ref={host} className="map" />
      {picking && <p className="picking">Tap the map to set where this leg {picking.end === 'from' ? 'starts' : 'finishes'}.</p>}
      {!drawn && !picking && <p className="sub">Tap anywhere on the map to see what there is to do there. Add a leg below and the road appears.</p>}
      <div className="map-key">
        <span><i style={{ background: '#3ee6b2' }} /> Stops</span>
        <span><i style={{ background: '#facc15' }} /> Things to do</span>
        <span><i style={{ background: '#f5a524' }} /> Camps</span>
        <span><i style={{ background: '#38bdf8' }} /> Water</span>
        <span><i style={{ background: '#a78bfa' }} /> Dump points</span>
        <span><i style={{ background: '#f87171' }} /> Fuel</span>
      </div>
    </div>
  );
}
