// The places travellers know that the map does not.
//
// OpenStreetMap is good at infrastructure and blind to word of mouth. The
// gravel pull-off past the bridge, the showground that takes vans for a gold
// coin, the swimming hole nobody signposts — none of it is mapped, and all of
// it is why the trip is worth doing. WikiCamps knows some of it and will not
// share.
//
// So this list is shared. One person adds a camp and everybody planning through
// that town sees it from then on. The rows live on the server (see
// app/api/places/route.ts); this file is only the shape and the wording.

export type SharedPlace = {
  id: string;
  kind: 'camp' | 'thing';
  name: string;
  lat: number;
  lng: number;
  /** Camps: what it costs a night, when whoever added it said. */
  nightly: number | null;
  /** Activities: what it is, in their words. "Swimming hole", "free museum". */
  what: string | null;
  note: string | null;
  /** A first name if they gave one. There are no accounts here. */
  added_by: string | null;
  created_at: string;
  /** Straight line from whatever point is open, filled in by the server. */
  directKm: number;
};

/** Who added it, phrased for a list rather than a database. */
export function credit(place: SharedPlace) {
  const who = (place.added_by ?? '').trim();
  return who ? `added by ${who}` : 'added by a traveller';
}
