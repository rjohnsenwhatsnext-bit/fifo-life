"use client";

import { useEffect, useRef, useState } from "react";

// Every operating mine in Australia.
//
// On the street map since 17 Aug 2026. See the note by the tile layer below for
// why, and for the argument it was traded against.
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

      // The street map, by decision on 17 Aug 2026.
      //
      // The imagery moved to the Frontline Talent Group directory, which is the
      // business the mine data belongs to, and the two properties are not meant
      // to show the same thing. This one keeps the sites and the filters.
      //
      // Worth knowing if this is ever revisited: the note that used to sit here
      // argued for satellite on the grounds that a road map of the Pilbara is a
      // beige rectangle with three lines on it, while imagery shows the pit, the
      // camp and how far the airstrip is from both. That reasoning has not
      // stopped being true, it was traded for keeping the better map on the
      // business site.
      // Satellite, because the page above says satellite. It was traded for a
      // road map at some point and the copy was never changed, so the page
      // promised the pit, the camp and the airstrip and served a beige
      // rectangle with three lines on it.
      //
      // Note the tile order: Esri serves {z}/{y}/{x}, not the {z}/{x}/{y} that
      // almost every other provider uses. Getting that the wrong way round
      // returns tiles from somewhere else on earth rather than an error.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 18,
          attribution:
            "Imagery &copy; Esri &middot; " +
            "Mine data: Frontline Talent Group",
        },
      ).addTo(map.current);

      for (const key of Object.keys(STATUS)) {
        layers.current[key] = L.layerGroup().addTo(map.current);
      }

      // Leaflet's default tooltip is a white box on a pale map, which is a
      // label you have to hunt for. This one is dark with a light edge so it
      // reads wherever it lands.
      const style = document.createElement("style");
      style.textContent =
        ".mine-tip{background:#111827ee;border:1px solid #ffffff33;color:#f3f4f6;" +
        "font:13px/1.4 system-ui,-apple-system,sans-serif;padding:7px 10px;border-radius:7px;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.5)}" +
        ".mine-tip:before{border-top-color:#111827ee}";
      document.head.appendChild(style);

      // Live counts first, the committed file second. The job numbers move
      // every night, so the endpoint is the one telling the truth; the static
      // file stays as the thing that keeps a map on the screen if Supabase is
      // having a moment, which is why it was a file in the first place.
      const mines: Mine[] = await fetch("/api/mines")
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .catch(() => fetch("/mines.json").then(r => r.json()))
        .catch(() => []);
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
              border: "1px solid rgba(0,0,0,.14)",
              background: showing[key] ? "rgba(0,0,0,.05)" : "transparent",
              color: showing[key] ? "#111827" : "#9ca3af", fontSize: 13, fontWeight: 600,
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

      <p style={{ color: "#6b7280", fontSize: 13, marginTop: 10 }}>
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
