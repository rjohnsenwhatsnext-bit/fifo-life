'use client';

// The wait before the map.
//
// Leaflet is a chunk to download, the tiles come from somebody else's server,
// and ten thousand sites get filtered for the frame. None of that is slow
// exactly, but it arrives in pieces, and watching a page assemble itself out of
// grey rectangles reads as broken even when it takes a second and a half.
//
// So it is covered. One screen with the name on it, held until the tiles have
// actually painted, then faded out. The work takes exactly as long as it did;
// it just stops being something you have to watch.
//
// The pulse is deliberately slow. A fast spinner says "something is wrong and
// it is trying"; an unhurried one says "this is coming".

export default function Splash({ going }: { going: boolean }) {
  return (
    <div className={going ? 'lapsplash going' : 'lapsplash'} aria-hidden={going}>
      <div className="lapsplash-mark">
        The Lap Map
        <i />
      </div>
      <div className="lapsplash-dots"><span /><span /><span /></div>
      {/* The budgeter is the product; the map is how it answers. And no claim
          about servos, because diesel coverage is state by state (WA, QLD and
          NSW so far) and "every servo in the country" was simply not true. The
          camps line is true: the whole country, out of OpenStreetMap. */}
      <p>What the lap really costs, with every park and camp in the country</p>
    </div>
  );
}
