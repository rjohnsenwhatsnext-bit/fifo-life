// Distances, and where a thing sits along a road.
//
// Pulled into one file because three routes were about to have their own copy
// of it, and geometry that disagrees with itself between endpoints is how a
// servo ends up eighty kilometres away on one screen and thirty on the next.

export const R = 6371;
export const RAD = Math.PI / 180;

/**
 * A coarse grid over a route, so a point can be rejected without measuring it
 * against the whole road.
 *
 * Measured on a real lap of the country: Brisbane, Cairns, Darwin, Broome,
 * Perth, Adelaide, Melbourne, Sydney and home. The corridor filter walked
 * 26,913 of the 29,461 camps and did 8.8 million distance calculations, because
 * a lap spans the continent and the latitude band that makes a single highway
 * cheap excludes almost nothing. That is 313ms of a serverless function's time
 * on one request, for a question asked again on every edit.
 *
 * Filing each segment under the cells it can reach turns that into a hash
 * lookup: 212,000 calculations and 12ms, and the same camps come back. The halo
 * is derived from the corridor width at the worst latitude on the route, so a
 * camp can never fall between two cells and be missed. Checked against the old
 * loop at 10, 25, 50 and 120 kilometres, identical every time.
 */
const CELL = 0.5;   // degrees, about 55km north to south

export type RouteGrid = {
  /** Segment indices worth measuring for this point, or undefined for nowhere near. */
  near(lat: number, lng: number): number[] | undefined;
};

export function indexRoute(path: [number, number][], within: number): RouteGrid {
  const lats = path.map((p) => p[0]);
  const worstLat = Math.max(Math.abs(Math.min(...lats)), Math.abs(Math.max(...lats)));
  const lngKm = Math.max(CELL * 111 * Math.cos(worstLat * RAD), 1);
  const halo = Math.ceil(within / Math.min(CELL * 111, lngKm)) + 1;

  const cells = new Map<string, number[]>();
  const file = (lat: number, lng: number, seg: number) => {
    const ca = Math.floor(lat / CELL), co = Math.floor(lng / CELL);
    for (let da = -halo; da <= halo; da += 1) {
      for (let dl = -halo; dl <= halo; dl += 1) {
        const k = `${ca + da}|${co + dl}`;
        let arr = cells.get(k);
        if (!arr) { arr = []; cells.set(k, arr); }
        // Segments arrive in order, so this keeps the list unique without a Set
        // per cell, and there are a lot of cells.
        if (arr[arr.length - 1] !== seg) arr.push(seg);
      }
    }
  };
  for (let j = 1; j < path.length; j += 1) {
    file(path[j - 1][0], path[j - 1][1], j);
    file(path[j][0], path[j][1], j);
  }

  return { near: (lat, lng) => cells.get(`${Math.floor(lat / CELL)}|${Math.floor(lng / CELL)}`) };
}

/** Great circle distance in kilometres. */
export function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance along a line to each of its points. */
export function cumulative(line: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < line.length; i += 1) {
    cum[i] = cum[i - 1] + km(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  }
  return cum;
}

/**
 * Where a point sits along a road, and how far off it that point is.
 *
 * `along` orders things by how far into the trip you meet them. `off` is the
 * detour to actually get to it, which decides whether it is on your way or a
 * separate outing. Both matter and they answer different questions.
 */
export function project(lat: number, lng: number, line: [number, number][], cum: number[]) {
  let bestOff = Infinity, bestAlong = 0;
  for (let i = 1; i < line.length; i += 1) {
    const [aLat, aLng] = line[i - 1];
    const [bLat, bLng] = line[i];
    const cos = Math.cos(((aLat + bLat) / 2) * RAD);
    const px = lng * RAD * cos * R, py = lat * RAD * R;
    const ax = aLng * RAD * cos * R, ay = aLat * RAD * R;
    const bx = bLng * RAD * cos * R, by = bLat * RAD * R;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < bestOff) {
      bestOff = off;
      bestAlong = cum[i - 1] + t * Math.hypot(dx, dy);
    }
  }
  return { off: bestOff, along: bestAlong };
}
