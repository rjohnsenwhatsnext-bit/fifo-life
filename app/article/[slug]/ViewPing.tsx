"use client";
import { useEffect } from "react";

// counts one view per article page load, via the increment_article_views RPC
export default function ViewPing({ site, slug }: { site: string; slug: string }) {
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/increment_article_views`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      body: JSON.stringify({ p_site: site, p_slug: slug }),
    }).catch(() => {});
  }, [site, slug]);
  return null;
}
