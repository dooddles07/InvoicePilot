import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: { absolute: "Start free — InvoicePilot" },
  description:
    "Create an InvoicePilot workspace. 14-day free trial, no card required, unlimited team members on every plan.",
};

const REASSURANCE = [
  "14-day trial, no card required",
  "Unlimited team members on every plan",
  "Live the same morning — no migration project",
];

export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-h1 font-semibold tracking-tight">
          Start collecting on autopilot
        </h1>
        <p className="text-muted-foreground text-small">
          Create your workspace. You can connect your ledger after you look
          around.
        </p>
      </div>

      <AuthForm mode="signup" />

      <ul className="space-y-1.5">
        {REASSURANCE.map((item) => (
          <li key={item} className="text-muted-foreground flex gap-2 text-caption">
            <CheckCircle2 className="text-success mt-0.5 size-3.5 shrink-0" aria-hidden />
            {item}
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-caption">
        Already have a workspace?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
