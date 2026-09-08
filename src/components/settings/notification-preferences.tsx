"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import type { NotificationPreference } from "@/types";

export function NotificationPreferences({
  preferences,
}: {
  preferences: NotificationPreference[];
}) {
  const [prefs, setPrefs] = useState(preferences);

  const toggle = (id: string, channel: "email" | "in_app", value: boolean) => {
    setPrefs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [channel]: value } : p)),
    );
    // Saved immediately — a settings screen with an unsaved-changes trap is a
    // worse experience than an autosave you can undo by toggling back.
    const pref = prefs.find((p) => p.id === id);
    toast.success("Preference saved", {
      description: `${pref?.label}: ${channel === "email" ? "email" : "in-app"} ${
        value ? "on" : "off"
      }.`,
    });
  };

  return (
    <table className="w-full">
      <caption className="sr-only">
        Notification preferences by event and channel
      </caption>
      <thead>
        <tr className="text-muted-foreground text-caption">
          <th scope="col" className="pb-2 text-left font-medium">
            Event
          </th>
          <th scope="col" className="w-20 pb-2 text-center font-medium">
            Email
          </th>
          <th scope="col" className="w-20 pb-2 text-center font-medium">
            In app
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {prefs.map((pref) => (
          <tr key={pref.id}>
            <th scope="row" className="py-3 pr-3 text-left font-normal">
              <span className="block text-small font-medium">{pref.label}</span>
              <span className="text-muted-foreground block text-caption">
                {pref.description}
              </span>
            </th>
            <td className="py-3 text-center">
              <Switch
                checked={pref.email}
                onCheckedChange={(v) => toggle(pref.id, "email", v === true)}
                aria-label={`Email notifications for ${pref.label}`}
              />
            </td>
            <td className="py-3 text-center">
              <Switch
                checked={pref.in_app}
                onCheckedChange={(v) => toggle(pref.id, "in_app", v === true)}
                aria-label={`In-app notifications for ${pref.label}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
