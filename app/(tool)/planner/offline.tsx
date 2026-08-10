'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Leg } from '@/lib/planner';

// Saving the road ahead, before you leave the reception.
//
// The service worker keeps whatever you have already looked at. That covers the
// accidental case and none of the deliberate one: nobody pans the whole
// Nullarbor at four zoom levels before setting off. So this does it for them.
//
// It works out every map tile the route passes through, plus the site and fuel
// data for the corridor, and hands the lot to the service worker to fetch
// slowly in the background. Done in a caravan park with wifi the night before,
// the road works with no signal at all.

/** Tile numbers for a point, at a zoom. The standard slippy map maths. */
function tileFor(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * Every tile within a corridor of the road, at the zooms worth having.
 *
 * Six to eleven: six shows you where you are in the state, eleven is close
 * enough to find a campsite entrance. Twelve and up quadruples the count for
 * detail nobody needs while driving, and would be most of a gigabyte.
 */
function tilesForRoute(line: [number, number][], pad = 1) {
  const urls = new Set<string>();
  for (let z = 6; z <= 11; z += 1) {
    for (let i = 0; i < line.length; i += 1) {
      const { x, y } = tileFor(line[i][0], line[i][1], z);
      // A ring around each point, so the corridor has width rather than being
      // a single tile wide line that falls apart the moment you pan.
      const reach = z >= 10 ? pad : pad + 1;
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (let dy = -reach; dy <= reach; dy += 1) {
          urls.add(`https://tile.openstreetmap.org/${z}/${x + dx}/${y + dy}.png`);
        }
      }
    }
  }
  return [...urls];
}

/** The boxes the map will ask for along the way, so their answers are kept too. */
function dataForRoute(line: [number, number][]) {
  const urls = new Set<string>();
  const step = Math.max(1, Math.floor(line.length / 24));
  for (let i = 0; i < line.length; i += step) {
    const [lat, lng] = line[i];
    const box = [lat - 0.35, lng - 0.35, lat + 0.35, lng + 0.35].map((n) => n.toFixed(3)).join(',');
    urls.add(`/api/parks?bbox=${box}`);
    urls.add(`/api/things?bbox=${box}`);
  }
  return [...urls];
}

export default function Offline({ legs }: { legs: Leg[] }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ done: number; failed: number; total: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js')
      .then(() => setReady(true))
      .catch(() => setReady(false));

    const onMessage = (e: MessageEvent) => {
      const m = e.data || {};
      if (m.type === 'save-progress') setDone({ done: m.done, failed: m.failed, total: m.total });
      if (m.type === 'save-done') {
        setDone({ done: m.done, failed: m.failed, total: m.total });
        setBusy(false);
        setSaved(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    const mark = () => setOnline(navigator.onLine);
    mark();
    window.addEventListener('online', mark);
    window.addEventListener('offline', mark);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('online', mark);
      window.removeEventListener('offline', mark);
    };
  }, []);

  const road = legs.flatMap((l) => l.line ?? []) as [number, number][];

  // Thinned before the tile maths: consecutive route points are metres apart
  // and land in the same tile, so the full line is thousands of duplicate
  // lookups for the same square.
  const thinned = road.filter((_, i) => i % Math.max(1, Math.floor(road.length / 300)) === 0);

  const save = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return;
    const urls = [...tilesForRoute(thinned), ...dataForRoute(thinned)];
    setBusy(true);
    setSaved(false);
    setDone({ done: 0, failed: 0, total: urls.length });
    reg.active.postMessage({ type: 'save-route', urls });
  }, [thinned]);

  if (!ready || road.length < 2) {
    return !online ? <p className="offline-note">No signal. You are looking at what was saved.</p> : null;
  }

  const tiles = tilesForRoute(thinned).length;
  // Roughly 12KB a tile for these. Said out loud, because somebody on a
  // metered connection deserves to know before it starts.
  const mb = Math.round((tiles * 12) / 1024);

  return (
    <div className="offline">
      <div className="offline-head">
        <strong>Take it with you</strong>
        {!online && <span className="offline-flag">no signal</span>}
      </div>
      <p>
        Saves the map and every site along this road onto the phone, so it all still
        works where there is no reception. Do it on wifi before you go.
      </p>
      {busy && done ? (
        <div className="offline-bar">
          <i style={{ width: `${Math.round((done.done / Math.max(done.total, 1)) * 100)}%` }} />
          <span>{done.done} of {done.total}</span>
        </div>
      ) : saved && done ? (
        <p className="offline-done">
          Saved. {done.done} of {done.total} pieces kept
          {done.failed ? `, ${done.failed} could not be fetched` : ''}.
        </p>
      ) : (
        <button onClick={save} disabled={!online}>
          Save this road for offline, about {mb} MB
        </button>
      )}
    </div>
  );
}
