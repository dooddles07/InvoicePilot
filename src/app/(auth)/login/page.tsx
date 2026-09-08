import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: { absolute: "Sign in — InvoicePilot" },
};

export default function LoginPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-h1 font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-small">
          Sign in to pick up your collections queue.
        </p>
      </div>

      <AuthForm mode="login" />

      <div className="text-muted-foreground space-y-1 text-caption">
        <p>
          <Link href="/forgot-password" className="text-brand hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p>
          New here?{" "}
          <Link href="/signup" className="text-brand hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
