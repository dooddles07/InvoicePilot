import type { Metadata } from "next";

import { DemoEntry } from "@/components/demo/demo-entry";

// The login inside enterDemo() waits on a sleeping Render instance. Vercel's
// hobby ceiling is 60 seconds, and the default is well under the measured
// 21.8-second cold start.
export const maxDuration = 60;

export const metadata: Metadata = {
  title: { absolute: "Opening the demo — InvoicePilot" },
  // Nothing here is content; it is a door.
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoEntry />;
}
