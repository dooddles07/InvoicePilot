import type { MetadataRoute } from "next";

import { SITE } from "@/lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Marketing pages only. The application is behind a workspace and there is
  // nothing for a crawler to do inside someone's ledger.
  return [
    { url: SITE.url, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE.url}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE.url}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE.url}/signup`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${SITE.url}/login`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
