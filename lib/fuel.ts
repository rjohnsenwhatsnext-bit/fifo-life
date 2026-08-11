// Real diesel prices, from the fuel price reporting scheme.
//
// Every state now mandates that servos report their board price, and the same
// feed carries all of them. That matters more on a lap than anywhere else: the
// difference between the cheap side of a town and the roadhouse forty minutes
// on is thirty or forty cents a litre, and towing a van you are burning close
// to twenty litres per hundred. Over a year that is a month of camp fees.
//
// So the planner stops asking you to guess a diesel price and tells you what it
// is where you are standing.
//
// The token only ever lives on the server. It is per subscriber and rate
// limited, so shipping it to a browser would be handing out our quota.

const BASE = 'https://fppdirectapi-prod.fuelpricesqld.com.au';
const COUNTRY = 21; // Australia. The feed is national despite the hostname.

// What a diesel ute or truck actually puts in, best first. Premium diesel is
// listed because some roadhouses sell nothing else, and a price you cannot buy
// is worse than no price.
const DIESEL: Record<number, string> = {
  3: 'Diesel',
  1000: 'Diesel',
  6: 'Diesel',
  14: 'Premium diesel',
};

type Site = { S: number; N: string; A: string; P: string; Lat: number; Lng: number };
type Price = { SiteId: number; FuelId: number; Price: number; TransactionDateUtc: string };

export type Pump = {
  name: string;
  address: string;
  fuel: string;
  /** Dollars a litre. The feed reports tenths of a cent. */
  price: number;
  directKm: number;
  updated: string;
  lat: number;
  lng: number;
};

// The state a point is in, roughly. Boxes overlap on purpose: a stop near a
// border should look at both sides, because that is exactly where the price
// gap is worth driving for.
const STATES: { id: number; name: string; box: [number, number, number, number] }[] = [
  { id: 1, name: 'QLD', box: [-29.5, -9.0, 137.8, 154.2] },
  { id: 2, name: 'NSW', box: [-37.8, -27.9, 140.7, 154.2] },
  { id: 3, name: 'VIC', box: [-39.4, -33.7, 140.7, 150.3] },
  { id: 4, name: 'SA', box: [-38.4, -25.7, 128.7, 141.3] },
  { id: 5, name: 'WA', box: [-35.4, -13.4, 112.7, 129.3] },
  { id: 6, name: 'ACT', box: [-36.1, -35.0, 148.6, 149.5] },
  { id: 7, name: 'TAS', box: [-43.9, -39.0, 143.5, 148.8] },
  { id: 8, name: 'NT', box: [-26.3, -10.7, 128.7, 138.3] },
];

function statesFor(lat: number, lng: number) {
  const hits = STATES.filter((s) => lat >= s.box[0] && lat <= s.box[1] && lng >= s.box[2] && lng <= s.box[3]);
  // Off the boxes entirely means somebody tapped the ocean. Rather than guess,
  // ask nobody: an empty list is handled upstream as "no prices near there".
  return hits;
}

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
};


// ── Western Australia ───────────────────────────────────────────────────────
//
// FuelWatch, and it is free. No subscription, no token, no application form:
// WA runs a different scheme to the eastern states, where a servo must publish
// tomorrow's price by 2pm today and is then held to it for the whole day. That
// makes the data unusually trustworthy — it is not "what someone reported at
// some point", it is the price, fixed, by law, until midnight.
//
// The feed is RSS, one region at a time, so the whole state is the metro call
// plus a long tail of country towns. Fetched only when somebody actually taps
// in WA, and cached like everything else, so a lap of Queensland never touches
// a Western Australian government server.

const FUELWATCH = "https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS";
const FUELWATCH_DIESEL = 4;

// Region 0 is every metro suburb in one response. The rest are country towns,
// numbered with gaps, so the range is walked and the empties ignored.
const WA_REGIONS = Array.from({ length: 70 }, (_, i) => i + 1);

// Pulling one field out of an RSS item.
//
// [^] rather than the usual [\s\S], and deliberately: inside a template
// literal a single backslash is eaten by the string before the regex ever
// sees it, so [\s\S] quietly becomes [sS] and matches nothing but the
// letter s. [^] means the same thing, needs no escape, and cannot rot.
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}>([^]*?)</${name}>`));
  return m ? m[1].trim() : "";
};

async function fuelWatch(query: string): Promise<Pump[]> {
  const res = await fetch(`${FUELWATCH}?Product=${FUELWATCH_DIESEL}&${query}`, {
    // Named, because it is somebody else's server and a nameless scraper is
    // the first thing anyone blocks.
    // Points at the tool's own home. It named fifolife.au/planner, which now
    // redirects, and a contact address that bounces is worse than none.
    headers: { "User-Agent": "BigLapPlanner/1.0 (+https://thelapmap.com.au)" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const pumps: Pump[] = [];
  for (const block of xml.split("<item>").slice(1)) {
    const price = Number(tag(block, "price"));
    const lat = Number(tag(block, "latitude"));
    const lng = Number(tag(block, "longitude"));
    // Cents on the sign, dollars everywhere in this codebase.
    if (!(price > 50 && price < 500) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const suburb = tag(block, "location");
    pumps.push({
      name: tag(block, "trading-name") || tag(block, "brand") || "Servo",
      address: [tag(block, "address"), suburb].filter(Boolean).join(", "),
      fuel: "Diesel",
      price: price / 100,
      directKm: 0,
      // A WA price is set for the day rather than reported at a moment, so the
      // date is the honest timestamp for it.
      updated: `${tag(block, "date")}T00:00:00Z`,
      lat, lng,
    });
  }
  return pumps;
}

async function westernAustralia(): Promise<Map<number, Pump>> {
  const queries = ["Region=0", ...WA_REGIONS.map((r) => `Region=${r}`)];
  const batches: Pump[][] = [];
  // Six at a time. Enough to be quick, gentle enough not to look like an attack
  // on a government server that is giving this away for nothing.
  for (let i = 0; i < queries.length; i += 6) {
    batches.push(...await Promise.all(
      queries.slice(i, i + 6).map((q) => fuelWatch(q).catch(() => [] as Pump[])),
    ));
  }

  // Metro and regional overlap at the edges, and a site appearing twice would
  // draw two pins on the same driveway. Keyed on where it is.
  const byPlace = new Map<number, Pump>();
  let n = 0;
  for (const batch of batches) {
    for (const pump of batch) {
      const key = Math.round(pump.lat * 1e4) * 1e8 + Math.round(pump.lng * 1e4);
      if (!byPlace.has(key)) byPlace.set(key, pump);
      n++;
    }
  }
  void n;
  return byPlace;
}


// ── New South Wales ─────────────────────────────────────────────────────────
//
// FuelCheck, run by the NSW government and free to use — the only cost is a
// signup. It is a different shape again to the other two: OAuth rather than a
// static token, and stations and prices arrive as separate lists to be joined
// on a station code.
//
// The token lasts twelve hours, so it is held and reused. Asking for a new one
// on every lookup would be a pointless round trip and a good way to get rate
// limited on somebody else's free service.

const NSW_OAUTH = "https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials";
const NSW_PRICES = "https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/fuel/prices";

// DL is diesel, PDL is premium diesel. Both go in a diesel tank; the cheaper of
// the two wins per site, same rule as Queensland.
const NSW_DIESEL: Record<string, string> = { DL: "Diesel", PDL: "Premium diesel" };

type NswToken = { token: string; until: number };
let nswToken: NswToken | null = null;

async function nswAccessToken(key: string, secret: string): Promise<string | null> {
  if (nswToken && Date.now() < nswToken.until) return nswToken.token;
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(NSW_OAUTH, {
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body?.access_token) return null;
  // Retired five minutes early, so a request never goes out holding a token
  // that expires while it is in flight.
  nswToken = {
    token: body.access_token,
    until: Date.now() + (Number(body.expires_in ?? 43199) - 300) * 1000,
  };
  return nswToken.token;
}

/**
 * The wall clock NSW reports in, turned into a real instant.
 *
 * FuelCheck timestamps are Sydney local with no offset on them, so read as-is
 * they are ten or eleven hours out — and which of the two depends on daylight
 * saving, which NSW has and Queensland does not. Rather than hard code either,
 * the offset is asked for at that moment and taken off.
 */
function sydneyToIso(stamp: string): string {
  const m = stamp.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, d, mo, y, h, mi, sec] = m;
  const asIfUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
  // The same instant, printed twice: once as UTC and once as Sydney. The gap
  // between them is the offset that applied on that date.
  const probe = new Date(asIfUtc);
  const sydney = new Date(probe.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asIfUtc - (sydney.getTime() - utc.getTime())).toISOString();
}

async function newSouthWales(): Promise<Pump[]> {
  const key = process.env.NSW_FUEL_KEY;
  const secret = process.env.NSW_FUEL_SECRET;
  if (!key || !secret) return [];

  const token = await nswAccessToken(key, secret);
  if (!token) return [];

  const res = await fetch(NSW_PRICES, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
      "Content-Type": "application/json; charset=utf-8",
      requesttimestamp: new Date().toLocaleString("en-AU", { hour12: true }).replace(",", ""),
      transactionid: crypto.randomUUID(),
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = await res.json();

  type Station = { code: string | number; name: string; address: string; location?: { latitude: number; longitude: number } };
  const sites = new Map<string, Station>();
  for (const st of (body?.stations ?? []) as Station[]) sites.set(String(st.code), st);

  // Cheapest diesel per site. The codes arrive as a string on one list and a
  // number on the other, which is why both sides are stringified before they
  // are compared — matching them raw silently finds nothing.
  const best = new Map<string, Pump>();
  for (const row of (body?.prices ?? []) as { stationcode: string | number; fueltype: string; price: number; lastupdated: string }[]) {
    const label = NSW_DIESEL[row.fueltype];
    if (!label) continue;
    const site = sites.get(String(row.stationcode));
    if (!site?.location) continue;
    const price = Number(row.price) / 100;
    if (!(price > 0.5 && price < 5)) continue;
    const prior = best.get(String(row.stationcode));
    if (prior && prior.price <= price) continue;
    best.set(String(row.stationcode), {
      name: site.name,
      address: site.address,
      fuel: label,
      price,
      directKm: 0,
      updated: sydneyToIso(row.lastupdated),
      lat: site.location.latitude,
      lng: site.location.longitude,
    });
  }
  return [...best.values()];
}

// A state's worth of sites and prices is about a megabyte, and boards do not
// move minute to minute. Half an hour is fresh enough to trust and slow enough
// to stay well inside the subscriber limits.
const TTL = 30 * 60_000;
type StateData = { at: number; sites: Map<number, Site>; prices: Price[] };
const cache = new Map<number, StateData>();

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `FPDAPI SubscriberToken=${token}`, 'Content-Type': 'application/json' },
    // Next would otherwise cache this at the fetch layer as well, and two
    // caches with different clocks is how you end up serving last week's price.
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fuel feed ${res.status}`);
  return res.json();
}

async function stateData(id: number, token: string): Promise<StateData> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit;

  const q = `countryId=${COUNTRY}&geoRegionLevel=3&geoRegionId=${id}`;
  const [siteRes, priceRes] = await Promise.all([
    get(`/Subscriber/GetFullSiteDetails?${q}`, token),
    get(`/Price/GetSitesPrices?${q}`, token),
  ]);

  const sites = new Map<number, Site>();
  for (const s of (siteRes?.S ?? []) as Site[]) sites.set(s.S, s);
  const fresh: StateData = { at: Date.now(), sites, prices: (priceRes?.SitePrices ?? []) as Price[] };
  cache.set(id, fresh);
  return fresh;
}


/**
 * Every reporting servo in a state, whichever scheme that state runs.
 *
 * Queensland and the eastern states are the subscription feed; Western
 * Australia is FuelWatch and free. The rest answer with nothing until a
 * subscription for them exists, and the caller reports that honestly rather
 * than implying the state has no servos in it.
 */
// Whichever scheme a state runs, the answer is cached the same way.
const stateCache = new Map<number, { at: number; pumps: Pump[] }>();

async function statePumps(id: number, token: string | undefined): Promise<Pump[]> {
  if (id === 2) {
    const hit = stateCache.get(id);
    if (hit && Date.now() - hit.at < TTL) return hit.pumps;
    const pumps = await newSouthWales();
    if (pumps.length) stateCache.set(id, { at: Date.now(), pumps });
    return pumps;
  }
  if (id === 5) {
    const hit = stateCache.get(id);
    if (hit && Date.now() - hit.at < TTL) return hit.pumps;
    const pumps = [...(await westernAustralia()).values()];
    stateCache.set(id, { at: Date.now(), pumps });
    return pumps;
  }

  if (!token) return [];
  const set = await stateData(id, token);
  // One pump per site: a servo reporting both Diesel and Premium Diesel is one
  // servo, at the cheaper of the two.
  const best = new Map<number, Pump>();
  for (const row of set.prices) {
    const label = DIESEL[row.FuelId];
    if (!label) continue;
    const site = set.sites.get(row.SiteId);
    if (!site) continue;
    const price = row.Price / 1000;
    // A board price of zero or something silly means the site has stopped
    // reporting rather than found a bargain.
    if (!(price > 0.5 && price < 5)) continue;
    const prior = best.get(row.SiteId);
    if (prior && prior.price <= price) continue;
    best.set(row.SiteId, {
      name: site.N, address: site.A, fuel: label, price,
      directKm: 0, updated: row.TransactionDateUtc, lat: site.Lat, lng: site.Lng,
    });
  }
  return [...best.values()];
}

/**
 * The diesel on sale within `radius` km of a point, cheapest first.
 *
 * `covered` is the states the subscription actually returns data for. Today
 * that is Queensland only — the feed is national in shape but the token is
 * bought per scheme, and the others come back empty. Nothing here is hard
 * coded to Queensland: the day the subscription is widened, those states start
 * answering and this starts reporting them, with no change to the code.
 */
export async function dieselNear(lat: number, lng: number, radius: number): Promise<{
  pumps: Pump[]; looked: string[]; covered: string[];
}> {
  const token = process.env.FUEL_API_TOKEN;
  const looking = statesFor(lat, lng);

  const sets = await Promise.all(
    looking.map((s) => statePumps(s.id, token).catch(() => [] as Pump[])),
  );
  const covered = looking.filter((_, i) => sets[i].length > 0).map((s) => s.name);

  const near: Pump[] = [];
  for (const set of sets) {
    for (const pump of set) {
      const away = km(lat, lng, pump.lat, pump.lng);
      if (away > radius) continue;
      near.push({ ...pump, directKm: away });
    }
  }

  return {
    pumps: near.sort((a, b) => a.price - b.price || a.directKm - b.directKm),
    looked: looking.map((s) => s.name),
    covered,
  };
}

/**
 * Every reporting servo inside a box, or along a road.
 *
 * The per tap version was the wrong shape for the way people use the map. You
 * should not have to guess where a servo might be and tap there to find out
 * whether one exists: that is the question the map is supposed to answer. The
 * state feeds are already fetched and cached whole, so serving them by area
 * costs nothing more than the filtering.
 */
export async function dieselIn(
  box: { south: number; west: number; north: number; east: number },
  line?: [number, number][],
  within = 25,
): Promise<{ pumps: Pump[]; covered: string[] }> {
  const token = process.env.FUEL_API_TOKEN;

  // Which schemes could possibly have anything in this box. Checked at both
  // corners so a box straddling the border asks both states.
  const looking = STATES.filter((s) =>
    !(box.north < s.box[0] || box.south > s.box[1] || box.east < s.box[2] || box.west > s.box[3]));

  const sets = await Promise.all(
    looking.map((s) => statePumps(s.id, token).catch(() => [] as Pump[])),
  );
  const covered = looking.filter((_, i) => sets[i].length > 0).map((s) => s.name);

  const out: Pump[] = [];
  for (const set of sets) {
    for (const pump of set) {
      if (line && line.length > 1) {
        // On the road, not merely in the rectangle around it.
        let best = Infinity;
        for (let j = 1; j < line.length; j += 1) {
          const d = kmToSegment(pump.lat, pump.lng, line[j - 1][0], line[j - 1][1], line[j][0], line[j][1]);
          if (d < best) best = d;
          if (best <= within) break;
        }
        if (best > within) continue;
        out.push({ ...pump, directKm: Math.round(best * 10) / 10 });
        continue;
      }
      if (pump.lat < box.south || pump.lat > box.north) continue;
      if (pump.lng < box.west || pump.lng > box.east) continue;
      out.push(pump);
    }
  }

  return { pumps: out, covered };
}

/** Distance from a point to a segment, in kilometres. Flat earth, and at these
 *  distances the error is metres. */
function kmToSegment(lat: number, lng: number,
                     aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, r = Math.PI / 180;
  const cos = Math.cos(((aLat + bLat) / 2) * r);
  const px = lng * r * cos * R, py = lat * r * R;
  const ax = aLng * r * cos * R, ay = aLat * r * R;
  const bx = bLng * r * cos * R, by = bLat * r * R;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
