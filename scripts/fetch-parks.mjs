// Every caravan park and campground in Australia, once.
//
// Asking Overpass per map frame was fine for browsing a district and useless
// for the actual question, which is "where can I stay on this lap". So the
// whole country is pulled once, trimmed to the six fields a pin needs, and
// served from our own file. Overpass gets one run of this a month instead of a
// request every time somebody drags a map.
//
// Chunked by band rather than asked for in one go. A single national query for
// this tag set is minutes of work for a donated server and usually ends in a
// timeout with nothing to show; eight bands each finish in seconds and a band
// that fails can be retried on its own.

import { writeFileSync } from 'node:fs';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
const UA = 'thelapmap.com.au (trip planner; one-off data build)';

// Australia, with room for Tasmania and the Torres Strait.
const bandsOf = (height) => {
  const out = [];
  for (let lat = -44; lat < -9; lat += height) out.push([lat, Math.min(lat + height, -9)]);
  return out;
};

// One pass per tag, and the band height is per tag for a reason.
//
// Asking for all four at once put drinking water in the same query as the
// parks, and drinking water is by far the biggest of them: every bubbler in
// every suburban playground carries the tag. That query was too heavy for a
// five degree band and every mirror timed out, which took the parks down with
// it even though the parks had been fine on their own for three runs.
//
// Separated, a bad pass costs only its own tag. Water gets narrower bands
// because it is the heavy one; the rest keep the five degree bands that have
// worked all along.
const PASSES = [
  { tag: 'nwr["tourism"="caravan_site"]', height: 5, need: true },
  { tag: 'nwr["tourism"="camp_site"]', height: 5, need: true },
  { tag: 'nwr["amenity"="sanitary_dump_station"]', height: 5, need: true },
  // Not required. If Overpass will not give it up, a map without every tap on
  // it is still a map; a map with no campsites is not.
  { tag: 'node["amenity"="drinking_water"]', height: 2, need: false },
  // Every servo in the country, whether or not it reports a price.
  //
  // Needed for one thing above all: working out where the long stretches with
  // no fuel are. Doing that from the price feeds alone would be worse than not
  // doing it, because those cover Queensland, New South Wales and Western
  // Australia only. A run across South Australia would come back as one
  // enormous gap with no fuel in it, which is false, and false in the direction
  // that leaves somebody on the side of the Stuart Highway.
  { tag: 'nwr["amenity"="fuel"]', height: 3, need: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function band([south, north], what, attempt = 0) {
  // Dump points and water started out as a per tap lookup, which meant they
  // only existed where somebody had already tapped, and so appeared not to
  // exist at all. They belong in the national set with the parks: on a lap the
  // question "where do I empty the toilet between here and Normanton" is asked
  // exactly as often as "where do I sleep", and it has a worse answer when you
  // get it wrong.
  const query = `[out:json][timeout:180];(
    ${what}(${south},112,${north},154.2);
  );out center;`;

  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(190000),
      });
      if (!res.ok) { await sleep(2000); continue; }
      const body = await res.json();
      const got = body.elements ?? [];
      // An empty band is a failure, not a finding.
      //
      // Overpass answers 200 with no elements when it gives up part way, and
      // there is no strip of this country five degrees tall with nowhere to
      // camp in it. Taken at face value this silently drops everything between
      // Rockhampton and Townsville and the file still looks fine. So an empty
      // answer moves to the next mirror instead of being believed.
      if (got.length === 0) { await sleep(2000); continue; }
      return got;
    } catch { await sleep(2000); }
  }
  if (attempt < 4) { await sleep(6000); return band([south, north], what, attempt + 1); }
  throw new Error(`band ${south}..${north} failed on every mirror`);
}

const seen = new Set();
const parks = [];
let skipped = 0;

for (const pass of PASSES) {
 const label = pass.tag.replace(/^n\w+\[|"|\]$/g, '').replace('=', ' ');
 let got = 0;
 try {
  for (const b of bandsOf(pass.height)) {
   const elements = await band(b, pass.tag);
   got += elements.length;
  for (const el of elements) {
    const id = `${el.type}${el.id}`;
    if (seen.has(id)) continue;          // bands share edges
    seen.add(id);
    const t = el.tags ?? {};

    // Day-use areas wearing a camping tag.
    //
    // OSM lets a thing carry several tags at once, and a picnic ground or a
    // kids' playground that somebody once slept at can end up with
    // tourism=camp_site on top of leisure=park. Showing those as places to stay
    // is how a traveller drives an hour to a swing set.
    //
    // The test is not "does it look like a park by its name". Half of rural
    // Victoria camps in recreation reserves and they are named exactly that, so
    // a name filter would throw away real sites. The test is whether anything
    // on the feature actually says you can camp: a pitch count, a fee, tents or
    // caravans allowed, or the dedicated camp_site tag. If it is dual-tagged as
    // day-use leisure and says nothing about camping, it goes.
    const dayUse = /^(park|playground|garden|pitch|sports_centre|nature_reserve|picnic_table)$/.test(t.leisure ?? '');
    const saysCamping = Boolean(
      t['camp_site'] || t.tents || t.caravans || t.motorhome || t.capacity
      || t.fee || t.backcountry || t['permanent_camping'] || t.power_supply
      || t.toilets || t.shower || t.drinking_water,
    );
    if (!t.amenity && t.tourism !== 'caravan_site' && dayUse && !saysCamping) { skipped += 1; continue; }
    const lat = Number(el.lat ?? el.center?.lat);
    const lng = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // 1 caravan park, 0 campground, 2 dump point, 3 drinking water, 4 servo.
    const kind = t.amenity === 'sanitary_dump_station' ? 2
      : t.amenity === 'drinking_water' ? 3
      : t.amenity === 'fuel' ? 4
      : t.tourism === 'caravan_site' ? 1 : 0;

    parks.push({
      // Trimmed hard and stored as an array, not an object: at this many rows
      // the repeated key names are most of the file.
      // Most dump points and taps are unnamed, and "Dump point" is a better
      // label on a pin than an empty string anyway.
      n: t.name || t.brand || t.operator || ['Campground', 'Caravan park', 'Dump point', 'Drinking water', 'Servo'][kind],
      k: kind,
      // Five decimal places is about a metre, which is far better than the
      // underlying data and half the bytes of what Overpass hands back.
      a: Number(lat.toFixed(5)),
      o: Number(lng.toFixed(5)),
      f: t.fee === 'no' ? 0 : t.fee === 'yes' ? 1 : null,
      p: t.phone || t['contact:phone'] || null,
      w: t.power_supply === 'yes' ? 1 : 0,
    });
  }
   await sleep(1200);   // be a good citizen between bands
  }
  console.log(`  ${label}: ${got} found, ${parks.length} kept so far`);
 } catch (err) {
  if (pass.need) throw err;
  // Loud, and on its own line, so a run that quietly lost the taps cannot be
  // mistaken for a run that found none.
  console.log(`  ${label}: FAILED, carrying on without it (${err.message})`);
 }
}

parks.sort((x, y) => x.a - y.a);
writeFileSync('data/parks.json', JSON.stringify({ built: new Date().toISOString(), parks }));
const count = (k) => parks.filter((p) => p.k === k).length;
const caravan = count(1);
console.log(`\n  ${parks.length} sites: ${caravan} caravan parks, ${parks.length - caravan} campgrounds`);
