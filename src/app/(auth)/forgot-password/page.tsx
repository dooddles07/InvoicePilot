import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: { absolute: "Reset password — InvoicePilot" },
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-h1 font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-muted-foreground text-small">
          Enter the address you signed up with and we will send a reset link.
        </p>
      </div>

      <AuthForm mode="reset" />

      <p className="text-muted-foreground text-caption">
        {/* Deliberately identical whether or not the account exists — a
            different message here tells an attacker which addresses are real. */}
        We send the same confirmation whether or not an account exists for that
        address.
      </p>

      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"
      >
        <ArrowLeft className="size-3" />
        Back to sign in
      </Link>
    </div>
  );
}
