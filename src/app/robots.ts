import type { MetadataRoute } from "next";

import { SITE } from "@/lib/marketing";

/**
 * Search and AI-answer crawlers are welcome. Blocking them would mean the
 * assistants buyers increasingly ask "what is the best AR tool and what does it
 * cost?" cannot cite us at all. Bulk training-corpus scraping is a different
 * trade, and that one returns nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /settings is a workspace's own configuration; /demo is a door rather
        // than a page, and /api answers nothing a crawler can use.
        disallow: ["/settings/", "/demo", "/api/"],
      },
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "anthropic-ai",
          "Google-Extended",
        ],
        allow: "/",
      },
      { userAgent: "CCBot", disallow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
