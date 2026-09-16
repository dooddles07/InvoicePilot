"use client";

import { useEffect } from "react";

/** Renders nothing. Fires one request so the API is awake by the time a
 *  visitor finishes reading the page. */
export function WarmDemo() {
  useEffect(() => {
    void fetch("/api/warm", { cache: "no-store" }).catch(() => {});
  }, []);

  return null;
}
