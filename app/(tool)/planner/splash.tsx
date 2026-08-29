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
// A ute towing a van, which is the only picture this tool ever needed. It does
// not move across the screen: the road moves under it and the wheels turn, so
// it stays where you are looking instead of driving off the edge and leaving an
// empty box for the rest of the wait.
//
// Drawn rather than an image file. It is about two kilobytes of markup that
// scales to any screen, it is the same two accent colours the rest of the tool
// uses, and there is no request to wait for, which would be a strange thing for
// a loading screen to be waiting on.

function Rig() {
  return (
    <svg className="lapsplash-rig" viewBox="0 0 260 92" role="img"
         aria-label="A ute towing a caravan">
      {/* Mirrored here rather than in CSS, so the ute leads and the van
          follows. It was drawn the other way round, which had the van in front
          being pushed along.

          An SVG transform rather than a CSS one because .lapsplash-rig already
          animates transform for the rise, with fill both, so a CSS scaleX on
          the same element is simply overwritten by the animation's final frame
          and nothing happens. This cannot be overridden by an animation that
          does not know about it.

          Flipping the drawing also turns the wheels the right way: a clockwise
          spin through a mirror renders anticlockwise, which is what a wheel
          does going the other way. */}
      <g transform="translate(260,0) scale(-1,1)">
      {/* The road. Dashes rather than a line, because it is the dashes moving
          that says the rig is travelling rather than parked. */}
      <g className="lapsplash-road">
        <line x1="-60" y1="80" x2="320" y2="80" />
      </g>

      <g className="lapsplash-rig-body">
        {/* The van, behind. Body, window, door, and the A frame reaching
            forward to the towball. */}
        <g className="lapsplash-van">
          <path d="M14 62V33a4 4 0 0 1 4-4h74a4 4 0 0 1 4 4v29" />
          <path d="M14 62h82" />
          <rect x="26" y="37" width="30" height="17" rx="2.5" />
          <path d="M74 37v17" />
          <path d="M96 55l18 5" />
        </g>

        {/* The ute, in front. Tray, cab, bonnet. */}
        <g className="lapsplash-ute">
          <path d="M118 62V45h26l12-14h20a5 5 0 0 1 5 5v26" />
          <path d="M118 62h63" />
          <path d="M150 45h22v-11h-12z" />
          <path d="M181 62h14a5 5 0 0 0 5-5v-6l-11-6h-8" />
        </g>

        {/* Wheels. The spoke is what makes the turn visible: a plain circle
            rotating looks like a circle sitting still. */}
        {[
          [40, 66], [76, 66], [136, 66], [188, 66],
        ].map(([cx, cy], i) => (
          <g key={i} className="lapsplash-wheel" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <circle cx={cx} cy={cy} r="9" />
            {/* Two spokes, not one. A single line through a circle reads as a
                no-entry sign when it happens to be still, which is exactly how
                it looks in the first frame and on a reduced-motion screen. */}
            <path d={`M${cx} ${cy - 5.5}v11M${cx - 5.5} ${cy}h11`} />
          </g>
        ))}
      </g>
      </g>
    </svg>
  );
}

export default function Splash({ going }: { going: boolean }) {
  return (
    <div className={going ? 'lapsplash going' : 'lapsplash'} aria-hidden={going}>
      <div className="lapsplash-mark">
        The Lap Map
        <i />
      </div>
      <Rig />
      {/* The budgeter is the product; the map is how it answers. And no claim
          about servos, because diesel coverage is state by state (WA, QLD and
          NSW so far) and "every servo in the country" was simply not true. The
          camps line is true: the whole country, out of OpenStreetMap. */}
      <p>What the lap really costs, with every park and camp in the country</p>
    </div>
  );
}
