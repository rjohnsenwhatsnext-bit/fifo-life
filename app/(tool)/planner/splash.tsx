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
// THE RIG
// -------
// Ryan's illustration, in public/rig.png. There was an SVG one drawn here
// first: it was accurate, it looked hand drawn, and it took three goes to even
// point the right way. A real drawing beat it in one.
//
// Stored already cropped and already recoloured to light lines on
// transparency. The original is black on white, and the splash is a dark navy
// gradient, so untreated it would sit on the screen in a white box. Doing it in
// the file rather than with a CSS filter means no work at paint time on the one
// screen whose entire job is to appear immediately.
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
      {/* Ryan's drawing, not a generated one. Cropped to the artwork and
          recoloured to light lines on transparency, because the splash is a
          dark navy gradient and the original is black on white, which would
          have sat on it in a white box. */}
      <img className="lapsplash-rig" src="/rig.png" alt="A ute towing a caravan"
           width={900} height={251} />
      <div className="lapsplash-dots"><span /><span /><span /></div>
      {/* The budgeter is the product; the map is how it answers. And no claim
          about servos, because diesel coverage is state by state (WA, QLD and
          NSW so far) and "every servo in the country" was simply not true. The
          camps line is true: the whole country, out of OpenStreetMap. */}
      <p>What the lap really costs, with every park and camp in the country</p>
    </div>
  );
}
