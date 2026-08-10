"use client";

import { useEffect, useRef, useState } from "react";

// Every operating mine in Australia, on satellite.
//
// Satellite rather than a street map on purpose. A road map of the Pilbara is
// a beige rectangle with three lines on it, and it tells a FIFO worker nothing.
// Imagery shows the pit, the ROM pad, the camp and how far the airstrip is from
// all of it, which is the thing somebody deciding whether to take a job at a
// site they have never seen actually wants to look at.
//
// Loaded only when this page is open. Leaflet touches window on import, and a
// map built on every page load is a map most of which nobody looks at.

type Mine = {
  n: string;   // name
  s: string;   // state
  la: number;
  lo: number;
  st: "operating" | "development" | "care_maintenance";
  c: string;   // commodities
  j?: number;  // live job listings, absent when there are none
  u: string;   // link to the directory entry
};

const STATUS = {
  operating: { colour: "#22c55e", label: "Operating" },
  development: { colour: "#f59e0b", label: "Under development" },
  care_maintenance: { colour: "#38bdf8", label: "Care and maintenance" },
} as const;

export default function MinesMap() {
  const host = useRef<HTMLDivElement | null>(null);
  const built = useRef(false);
  const [count, setCount] = useState(0);
  const [showing, setShowing] = useState<Record<string, boolean>>({
    operating: true, development: true, care_maintenance: true,
  });
  const layers = useRef<Record<string, L.LayerGroup>>({});
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !host.current || built.current) return;
      built.current = true;

      map.current = L.map(host.current, { scrollWheelZoom: false, worldCopyJump: false })
        .setView([-25.5, 133.5], 4);

      // Esri's imagery. Free to use with the attribution below, and the only
      // satellite layer that covers inland Australia at a useful resolution
      // without a paid key.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 17,
          attribution:
            "Imagery &copy; Esri, Maxar, Earthstar Geographics &middot; " +
            "Mine data: Frontline Talent Group",
        },
      ).addTo(map.current);

      // Place names on top of the imagery, because satellite alone gives you no
      // idea whether you are looking at Moranbah or Mount Isa.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 17, opacity: 0.85 },
      ).addTo(map.current);

      for (const key of Object.keys(STATUS)) {
        layers.current[key] = L.layerGroup().addTo(map.current);
      }

      // Leaflet's default tooltip is a white box, which vanishes against
      // imagery. This one is dark with a light edge so it reads over any
      // terrain, desert or spoil or water.
      const style = document.createElement("style");
      style.textContent =
        ".mine-tip{background:#111827ee;border:1px solid #ffffff33;color:#f3f4f6;" +
        "font:13px/1.4 system-ui,-apple-system,sans-serif;padding:7px 10px;border-radius:7px;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.5)}" +
        ".mine-tip:before{border-top-color:#111827ee}";
      document.head.appendChild(style);

      const mines: Mine[] = await fetch("/mines.json").then(r => r.json()).catch(() => []);
      if (cancelled) return;
      setCount(mines.length);

      for (const m of mines) {
        const tone = STATUS[m.st] ?? STATUS.operating;
        const work = m.j
          ? `${m.j} ${m.j === 1 ? "opportunity" : "opportunities"}`
          : "";

        L.circleMarker([m.la, m.lo], {
          // A site with work on it is worth noticing before you have clicked
          // anything, so it sits slightly larger with a ring around it.
          radius: m.j ? 6.5 : 5,
          weight: m.j ? 2 : 1.5,
          color: m.j ? "#ffd166" : "#ffffff",
          fillColor: tone.colour,
          fillOpacity: 0.95,
        })
          // On hover: the name and roughly how much work is going. Deliberately
          // vague, because a number that says 8 and turns out to be 3 by the
          // time somebody looks is worse than no number, and the count moves
          // every night as the job finder runs.
          .bindTooltip(
            `<b>${escape(m.n)}</b>` +
            `<span style="color:#9ca3af"> ${escape(m.s)}</span>` +
            (work ? `<br><span style="color:#22c55e;font-weight:700">${work}</span>` : ""),
            { direction: "top", offset: [0, -6], opacity: 1, className: "mine-tip" },
          )
          .bindPopup(
            `<b>${escape(m.n)}</b><br>` +
            `${escape(m.s)} &middot; ${tone.label}<br>` +
            `<span style="color:#6b7280">${escape(m.c)}</span><br>` +
            (work
              ? `<span style="color:#16a34a;font-weight:700">${work} listed here</span><br>`
              : "") +
            `<a href="${m.u}" target="_blank" rel="noopener" ` +
            `style="color:#e8721c;font-weight:700">Site details${m.j ? ", jobs" : ""} and reviews</a>`,
          )
          .addTo(layers.current[m.st] ?? layers.current.operating);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Turning a status off removes the whole layer rather than hiding 539
  // markers one at a time, which is the difference between instant and a
  // stutter on a phone.
  function toggle(key: string) {
    const next = { ...showing, [key]: !showing[key] };
    setShowing(next);
    const layer = layers.current[key];
    if (!layer || !map.current) return;
    if (next[key]) layer.addTo(map.current);
    else layer.remove();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(key => (
          <button key={key} onClick={() => toggle(key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "8px 13px", borderRadius: 999, cursor: "pointer",
              border: "1px solid rgba(255,255,255,.16)",
              background: showing[key] ? "rgba(255,255,255,.09)" : "transparent",
              color: showing[key] ? "#e8e8e8" : "#8a8a8a", fontSize: 13, fontWeight: 600,
            }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: STATUS[key].colour, opacity: showing[key] ? 1 : 0.4,
            }} />
            {STATUS[key].label}
          </button>
        ))}
      </div>

      <div ref={host}
        style={{ height: "clamp(380px, 68vh, 760px)", width: "100%", borderRadius: 6,
          overflow: "hidden", background: "#0d0d0d" }} />

      <p style={{ color: "#8a8a8a", fontSize: 13, marginTop: 10 }}>
        {count ? `${count} mines and projects across Australia. ` : ""}
        Tap a site for what it produces and who runs it.
      </p>
    </div>
  );
}

function escape(s: string) {
  return String(s ?? "").replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}
