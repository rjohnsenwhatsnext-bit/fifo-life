import { headers } from "next/headers";

// The install manifest, told apart by which door it came through.
//
// A manifest is only valid for the scope it declares. Served from
// thelapmap.com.au the app sits at the root; served from fifolife.au it sits
// under /planner. One static file cannot be true for both, and a browser will
// simply refuse to install an app whose scope does not contain the page you are
// standing on — silently, with nothing shown to the person trying.
//
// Written as a route rather than Next's manifest convention, which only works
// in the root of app/. Putting it there would have handed the whole magazine a
// manifest calling itself Big Lap.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host") ?? "";
  const atRoot = host.includes("thelapmap.com.au");

  const manifest = {
    name: "Big Lap Trip Planner",
    short_name: "Big Lap",
    description:
      "How long your money lasts on the road: legs, real distances, diesel prices and what there is to do in every town you stop in.",
    start_url: atRoot ? "/?home=1" : "/planner?home=1",
    scope: atRoot ? "/" : "/planner",
    display: "standalone",
    orientation: "any",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["travel", "navigation", "finance"],
    icons: [
      { src: "/planner-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/planner-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/planner-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Differs by host, so a shared cache must not serve one domain's copy to
      // the other.
      Vary: "Host",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
