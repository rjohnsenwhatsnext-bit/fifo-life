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
// A PICTURE IS COMING HERE
// --------------------------
// There was a ute and van drawn in SVG at this spot. It was accurate and it
// looked hand drawn, so it is gone and a real illustration is going in instead.
// Drop the file in public/ and put it here; the dots below are the placeholder
// until then, and they are what was here before the drawing.
//
// Drawn rather than an image file. It is about two kilobytes of markup that
// scales to any screen, it is the same two accent colours the rest of the tool
// uses, and there is no request to wait for, which would be a strange thing for
// a loading screen to be waiting on.

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
