"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  CornerDownLeft,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/reveal";
import { money, percent } from "@/lib/format";
import type { AIAnswer } from "@/types";
import { cn } from "@/lib/utils";

const DIRECTION_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

/**
 * Ask InvoicePilot.
 *
 * Not a chat clone: the answer is a structured card — headline, the numbers
 * behind it, the accounts driving it, and one recommended action that always
 * routes through a confirmation. A wall of prose would be less useful and
 * harder to check.
 */
export function AskInvoicePilot({
  suggestions,
  answers,
}: {
  suggestions: readonly string[];
  /** Answers precomputed on the server, keyed by question. */
  answers: Record<string, AIAnswer>;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AIAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const ask = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setThinking(true);
    setAnswer(null);
    // A short delay is honest here: the real thing queries the ledger, and a
    // result that appears instantly reads as canned.
    window.setTimeout(() => {
      setAnswer(answers[matchKey(trimmed, Object.keys(answers))] ?? null);
      setThinking(false);
    }, 550);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="bg-card shadow-e1 rounded-xl border p-3"
      >
        <label htmlFor="ask" className="sr-only">
          Ask InvoicePilot a question about your receivables
        </label>
        <div className="flex items-center gap-2">
          <Sparkles className="text-brand size-4 shrink-0" aria-hidden />
          <Input
            id="ask"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your receivables…"
            className="h-9 border-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="sm" disabled={!question.trim()}>
            Ask
            <CornerDownLeft className="size-3.5" />
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => ask(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {thinking ? (
        <div
          role="status"
          aria-live="polite"
          className="bg-card shadow-e1 space-y-3 rounded-xl border p-4"
        >
          <span className="sr-only">Reading your ledger…</span>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <div className="grid grid-cols-3 gap-3 pt-1">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      ) : null}

      {answer && !thinking ? (
        <Reveal>
          <article
            aria-live="polite"
            className="border-brand/25 shadow-e1 overflow-hidden rounded-xl border"
          >
            <header className="from-brand-muted/70 bg-gradient-to-b to-transparent p-4">
              <p className="text-muted-foreground text-caption">
                {answer.question}
              </p>
              <h2 className="mt-1 text-h2 font-semibold tracking-tight">
                {answer.headline}
              </h2>
              <p className="text-muted-foreground mt-2 text-small">
                {answer.detail}
              </p>
            </header>

            <dl className="bg-card grid grid-cols-1 gap-px border-y sm:grid-cols-3">
              {answer.metrics.map((metric) => {
                const Icon = metric.direction
                  ? DIRECTION_ICON[metric.direction]
                  : null;
                return (
                  <div key={metric.label} className="px-4 py-3">
                    <dt className="text-muted-foreground text-caption">
                      {metric.label}
                    </dt>
                    <dd className="figure flex items-center gap-1.5 text-h3 font-semibold">
                      {metric.value}
                      {Icon ? (
                        <Icon
                          aria-hidden
                          className={cn(
                            "size-3.5",
                            metric.direction === "up"
                              ? "text-danger"
                              : metric.direction === "down"
                                ? "text-success"
                                : "text-muted-foreground",
                          )}
                        />
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <div className="bg-card p-4">
              <h3 className="text-muted-foreground text-caption font-medium">
                Main contributors
              </h3>
              <ol className="mt-2 space-y-2">
                {answer.contributors.map((c, i) => (
                  <li key={c.label} className="flex items-center gap-3">
                    <span className="text-muted-foreground tnum w-4 shrink-0 text-caption">
                      {i + 1}
                    </span>
                    <Link
                      href={c.href}
                      className="min-w-0 flex-1 truncate text-small font-medium hover:underline"
                    >
                      {c.label}
                    </Link>
                    <span className="bg-muted hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
                      <span
                        className="bg-brand block h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(c.share, 3))}%` }}
                      />
                    </span>
                    <span className="tnum text-muted-foreground w-12 shrink-0 text-right text-caption">
                      {percent(c.share, 0)}
                    </span>
                    <span className="figure w-24 shrink-0 text-right text-small font-semibold">
                      {money(c.value_cents)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <footer className="bg-card flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-muted-foreground text-caption">
                Recommended: {answer.recommended_action}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/collections" />}
                  nativeButton={false}
                >
                  Open collections
                  <ArrowUpRight className="size-3.5" />
                </Button>
                <Button size="sm" onClick={() => setConfirming(true)}>
                  Take action
                </Button>
              </div>
            </footer>
          </article>
        </Reveal>
      ) : null}

      {/* AI recommendation -> human confirmation -> action. The dialog is the
          middle step, and it is not skippable. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm this action</DialogTitle>
            <DialogDescription>
              InvoicePilot recommends: {answer?.recommended_action}.
            </DialogDescription>
          </DialogHeader>
          <p className="text-small">
            This will queue the action against{" "}
            {answer?.contributors.length ?? 0} accounts. You can review each
            message before it sends, and nothing goes out to a customer until you
            do.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirming(false);
                toast.success("Queued for review", {
                  description: `${answer?.recommended_action}. Open Collections to review each message before it sends.`,
                });
              }}
            >
              Queue for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Picks the closest precomputed answer by shared words. */
function matchKey(question: string, keys: string[]): string {
  const words = new Set(question.toLowerCase().split(/\W+/).filter(Boolean));
  let best = keys[0]!;
  let bestScore = -1;
  for (const key of keys) {
    const score = key
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => words.has(w)).length;
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}
