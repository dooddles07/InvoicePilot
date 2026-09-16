"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { LogoMark } from "@/components/invoicepilot/logo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { enterDemo } from "@/lib/actions/demo";

/** Measured cold start of the Render free instance, rounded up. */
const EXPECTED_SECONDS = 25;

export function DemoEntry() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setElapsed(0);
    const result = await enterDemo();
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setError(result.message);
  }, [router]);

  useEffect(() => {
    // Strict Mode invokes effects twice in development; a second login attempt
    // would rotate the tokens the first one just set.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  useEffect(() => {
    if (error) return;
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [error]);

  const pct = Math.min(95, (elapsed / EXPECTED_SECONDS) * 100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="bg-card shadow-e1 rounded-xl border p-6">
        <LogoMark className="size-8" />

        {error ? (
          <>
            <h1 className="mt-4 text-h2 font-semibold tracking-tight text-balance">
              The demo did not open
            </h1>
            <p className="text-muted-foreground mt-2 flex items-start gap-2 text-small">
              <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void run();
                }}
              >
                Try again
              </Button>
              <LinkButton size="sm" variant="outline" href="/signup">
                Create a workspace
              </LinkButton>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-h2 font-semibold tracking-tight text-balance">
              Opening the demo workspace
            </h1>
            <p className="text-muted-foreground mt-2 text-small">
              The API sleeps after fifteen minutes idle on its free tier, so the
              first request of the day wakes it. About {EXPECTED_SECONDS} seconds.
            </p>
            <Progress value={pct} className="mt-5" aria-label="Waking the demo server" />
            <p className="text-muted-foreground tnum mt-2 text-caption">
              {elapsed}s elapsed
            </p>
          </>
        )}
      </div>

      <p className="text-muted-foreground mt-4 text-center text-caption">
        The demo workspace is shared with every visitor and resets daily at
        04:00 UTC.
      </p>
    </main>
  );
}
