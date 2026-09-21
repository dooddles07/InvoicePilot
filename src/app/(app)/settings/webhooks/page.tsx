import type { Metadata } from "next";

import { WebhooksCard } from "@/components/settings/webhooks-card";
import { handleReadError } from "@/lib/api/client";
import { getWebhooks } from "@/lib/api/webhooks";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const { data: endpoints } = await getWebhooks().catch(handleReadError);
  return <WebhooksCard endpoints={endpoints} />;
}
