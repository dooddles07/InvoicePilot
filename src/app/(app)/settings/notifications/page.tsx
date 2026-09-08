import type { Metadata } from "next";

import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { SettingsCard } from "@/components/settings/settings-card";
import { notificationPreferences } from "@/lib/data";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsSettingsPage() {
  return (
    <SettingsCard
      title="Notifications"
      description="What InvoicePilot tells you about, and where."
    >
      <NotificationPreferences preferences={notificationPreferences} />
    </SettingsCard>
  );
}
