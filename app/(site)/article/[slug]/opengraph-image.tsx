import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = { badge: "FIFO", name: "Life", color: "#1a56db", tagline: "The lifestyle, sorted." };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let title = "Life advice for Australian FIFO workers";
  let category = "";
  try {
    const { data } = await supabase().from("articles").select("title,category").eq("site", "fifo").eq("slug", slug).single();
    if (data) { title = data.title; category = data.category ?? ""; }
  } catch {}

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", background: "#f7f9ff", padding: 64,
        borderBottom: `24px solid ${BRAND.color}`, fontFamily: "sans-serif",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {category ? (
            <div style={{
              display: "flex", alignSelf: "flex-start", background: BRAND.color, color: "#fff",
              fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
              padding: "8px 22px", borderRadius: 6, marginBottom: 36,
            }}>{category}</div>
          ) : null}
          <div style={{
            display: "flex", fontSize: title.length > 60 ? 58 : 72, fontWeight: 800,
            color: "#111827", lineHeight: 1.15, maxWidth: 1040,
          }}>{title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            display: "flex", background: BRAND.color, color: "#fff", fontWeight: 900,
            fontSize: 34, padding: "10px 22px", borderRadius: 8,
          }}>{BRAND.badge}</div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#111827" }}>{BRAND.name}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#6b7280", marginLeft: 14 }}>{BRAND.tagline}</div>
        </div>
      </div>
    ),
    size
  );
}
