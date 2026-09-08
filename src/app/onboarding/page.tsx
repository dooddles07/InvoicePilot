import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = {
  title: { absolute: "Set up your workspace — InvoicePilot" },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
