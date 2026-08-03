import type { MetadataRoute } from "next";

// Points at the sitemap, which is the whole job. Without this line a crawler
// that arrives has to guess that a sitemap exists; with it, the first file it
// reads tells it where everything is.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://fifolife.au/sitemap.xml",
    host: "https://fifolife.au",
  };
}
