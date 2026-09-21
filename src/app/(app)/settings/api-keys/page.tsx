import type { Metadata } from "next";

import { ApiKeysCard } from "@/components/settings/api-keys-card";
import { getApiKeys } from "@/lib/api/apiKeys";
import { handleReadError } from "@/lib/api/client";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const { data: apiKeys } = await getApiKeys().catch(handleReadError);
  return <ApiKeysCard apiKeys={apiKeys} />;
}
