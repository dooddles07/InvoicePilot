"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  PartyPopper,
  Plug,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Logo } from "@/components/invoicepilot/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const BUSINESS_TYPES = [
  "Agency",
  "Contractor",
  "Consultant",
  "Ecommerce",
  "Distributor",
  "Professional services",
  "Other",
];

const ACCOUNTING = [
  { id: "quickbooks", name: "QuickBooks", detail: "Two-way sync of customers, invoices and payments" },
  { id: "xero", name: "Xero", detail: "Import your ledger and keep balances in step" },
  { id: "csv", name: "Upload a CSV", detail: "One-off import — you can connect properly later" },
  { id: "skip", name: "Skip for now", detail: "Explore with the demo workspace first" },
];

const REMINDER_PRESETS = [
  {
    id: "gentle",
    name: "Gentle",
    detail: "One reminder 3 days after the due date, one at day 14.",
  },
  {
    id: "standard",
    name: "Standard",
    detail: "Day 1, day 7 and an escalation at day 30. What most teams pick.",
    recommended: true,
  },
  {
    id: "firm",
    name: "Firm",
    detail: "Day 1, day 5, day 14 and a phone-call task at day 21.",
  },
];

const STEPS = [
  "Welcome",
  "Business type",
  "Connect accounting",
  "Import invoices",
  "Reminders",
  "Ready",
] as const;

export function OnboardingFlow() {
  const router = useRouter();
  const m = useMotion();

  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [accounting, setAccounting] = useState<string | null>(null);
  const [preset, setPreset] = useState("standard");
  const [weekends, setWeekends] = useState(false);
  const [terms, setTerms] = useState("30");

  const last = STEPS.length - 1;
  // The welcome and completion screens are not decisions, so they never block.
  const canContinue =
    step === 1 ? businessType !== null : step === 2 ? accounting !== null : true;

  return (
    <div className="mx-auto flex min-h-svh max-w-xl flex-col px-4 py-8">
      <header className="space-y-3">
        <Logo />
        <div className="space-y-1.5">
          <Progress
            value={(step / last) * 100}
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          />
          <p className="text-muted-foreground text-caption">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={m.fadeUp}
            className="space-y-5"
          >
            {step === 0 ? (
              <Welcome />
            ) : step === 1 ? (
              <Choice
                title="What kind of business do you run?"
                subtitle="It sets your starting templates and default terms. You can change everything later."
                options={BUSINESS_TYPES.map((t) => ({ id: t, name: t }))}
                selected={businessType}
                onSelect={setBusinessType}
                columns
              />
            ) : step === 2 ? (
              <Choice
                title="Connect your accounting software"
                subtitle="This is what fills your dashboard with real invoices instead of examples."
                icon={Plug}
                options={ACCOUNTING}
                selected={accounting}
                onSelect={setAccounting}
              />
            ) : step === 3 ? (
              <ImportStep terms={terms} onTerms={setTerms} skipped={accounting === "skip"} />
            ) : step === 4 ? (
              <ReminderStep
                preset={preset}
                onPreset={setPreset}
                weekends={weekends}
                onWeekends={setWeekends}
              />
            ) : (
              <Ready businessType={businessType} preset={preset} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {step > 0 && step < last ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setStep(last)}
            >
              Skip setup
            </Button>
          ) : null}

          {step < last ? (
            <Button
              size="sm"
              disabled={!canContinue}
              onClick={() => setStep((s) => Math.min(last, s + 1))}
            >
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => router.push("/dashboard")}>
              Open my dashboard
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Welcome() {
  return (
    <div className="space-y-4">
      <h1 className="text-h1 font-semibold tracking-tight text-balance sm:text-display">
        Welcome to InvoicePilot
      </h1>
      <p className="text-muted-foreground text-body">
        Five short questions and your collections run themselves. Nothing here
        sends a message to a customer — you switch that on yourself at the end.
      </p>
      <ul className="space-y-2">
        {[
          "Tell us what kind of business you run",
          "Connect your accounting software",
          "Import your open invoices",
          "Pick how firmly you want to chase",
        ].map((item) => (
          <li key={item} className="flex gap-2 text-small">
            <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-caption">
        Takes about two minutes.
      </p>
    </div>
  );
}

function Choice({
  title,
  subtitle,
  options,
  selected,
  onSelect,
  columns,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  options: { id: string; name: string; detail?: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  columns?: boolean;
  icon?: typeof Plug;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="space-y-1.5">
        <span className="block text-h1 font-semibold tracking-tight">{title}</span>
        <span className="text-muted-foreground block text-small">{subtitle}</span>
      </legend>

      <div className={cn("grid gap-2", columns && "sm:grid-cols-2")}>
        {options.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.id)}
              className={cn(
                "focus-visible:ring-ring flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                active
                  ? "border-brand bg-brand-muted/50 ring-brand/20 ring-2"
                  : "hover:bg-muted/50",
              )}
            >
              {Icon ? (
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block text-small font-medium">{option.name}</span>
                {option.detail ? (
                  <span className="text-muted-foreground block text-caption">
                    {option.detail}
                  </span>
                ) : null}
              </span>
              {active ? (
                <Check className="text-brand size-4 shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ImportStep({
  terms,
  onTerms,
  skipped,
}: {
  terms: string;
  onTerms: (v: string) => void;
  skipped: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-h1 font-semibold tracking-tight">
          Import your open invoices
        </h1>
        <p className="text-muted-foreground text-small">
          {skipped
            ? "You skipped the connection, so we will populate your workspace with the demo ledger. Connect properly whenever you are ready."
            : "We found your open invoices. Everything already settled stays out of your collections queue."}
        </p>
      </div>

      <div className="bg-card shadow-e1 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <span className="bg-success-muted text-success flex size-9 items-center justify-center rounded-lg">
            <FileSpreadsheet className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-small font-medium">
              {skipped ? "Demo ledger ready" : "59 open invoices found"}
            </p>
            <p className="text-muted-foreground text-caption">
              {skipped
                ? "460 invoices across 40 customers"
                : "$111,120 outstanding · 25 already overdue"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="default-terms">Default payment terms</Label>
        <Input
          id="default-terms"
          type="number"
          value={terms}
          onChange={(e) => onTerms(e.target.value)}
          className="tnum max-w-32"
        />
        <p className="text-muted-foreground text-caption">
          Days from issue to due date. Customers with their own agreed terms keep
          them — this only applies where we do not know.
        </p>
      </div>
    </div>
  );
}

function ReminderStep({
  preset,
  onPreset,
  weekends,
  onWeekends,
}: {
  preset: string;
  onPreset: (v: string) => void;
  weekends: boolean;
  onWeekends: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="text-h1 font-semibold tracking-tight">
          How firmly should we chase?
        </h1>
        <p className="text-muted-foreground text-small">
          This creates your first automation. It stays switched off until you
          activate it.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Reminder intensity</legend>
        {REMINDER_PRESETS.map((option) => {
          const active = preset === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPreset(option.id)}
              className={cn(
                "focus-visible:ring-ring flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                active
                  ? "border-brand bg-brand-muted/50 ring-brand/20 ring-2"
                  : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-small font-medium">{option.name}</span>
                  {option.recommended ? (
                    <span className="bg-brand text-brand-foreground rounded-full px-2 py-0.5 text-caption font-medium">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground block text-caption">
                  {option.detail}
                </span>
              </span>
              {active ? (
                <Check className="text-brand mt-0.5 size-4 shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </fieldset>

      <div className="flex items-start gap-3 rounded-xl border p-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="weekends" className="text-small font-medium">
            Send at weekends
          </Label>
          <p className="text-muted-foreground text-caption">
            Off by default. A Saturday reminder rarely gets read and often gets
            resented.
          </p>
        </div>
        <Switch
          id="weekends"
          checked={weekends}
          onCheckedChange={(v) => onWeekends(v === true)}
        />
      </div>
    </div>
  );
}

function Ready({
  businessType,
  preset,
}: {
  businessType: string | null;
  preset: string;
}) {
  return (
    <div className="space-y-4">
      <span className="bg-success-muted text-success flex size-12 items-center justify-center rounded-full">
        <PartyPopper className="size-6" aria-hidden />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-h1 font-semibold tracking-tight sm:text-display">
          You&rsquo;re ready
        </h1>
        <p className="text-muted-foreground text-body">
          Your workspace is set up{businessType ? ` for a ${businessType.toLowerCase()}` : ""}{" "}
          with a {preset} reminder sequence waiting to be switched on.
        </p>
      </div>

      <ul className="space-y-2">
        {[
          "Your dashboard shows what is outstanding and what is overdue",
          "Needs Attention ranks who to contact today",
          "Your first automation is drafted and paused",
        ].map((item) => (
          <li key={item} className="flex gap-2 text-small">
            <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
