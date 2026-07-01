import { createClient } from "@supabase/supabase-js";

export function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  reading_time: number;
  featured: boolean;
  published: boolean;
  published_at: string;
  created_at: string;
  site: string;
};
