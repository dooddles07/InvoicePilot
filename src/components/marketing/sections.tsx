import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  Quote,
  Repeat,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { LinkButton } from "@/components/invoicepilot/link-button";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { Reveal } from "@/components/motion/reveal";
import {
  LOGOS,
  PROOF_STATS,
  SITE,
  TESTIMONIALS,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2 lg:items-center lg:gap-10 lg:py-20">
        <Reveal className="space-y-5">
          <span className="border-brand/25 bg-brand-muted text-brand inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium">
            <Sparkles className="size-3" aria-hidden />
            AI collection insights, now on every plan
          </span>

          <h1 className="text-h1 font-semibold tracking-tight text-balance sm:text-display">
            Get paid faster. Without chasing invoices.
          </h1>

          <p className="text-muted-foreground max-w-lg text-body sm:text-[15px]">
            {SITE.description}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <LinkButton size="lg" href="/signup">
              Start free
              <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton size="lg" variant="outline" href="/signup?demo=1">
              Book a demo
            </LinkButton>
          </div>

          <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="text-success size-3.5" aria-hidden />
              14-day trial
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="text-success size-3.5" aria-hidden />
              No card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="text-success size-3.5" aria-hidden />
              Live the same morning
            </span>
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Social proof                                                        */
/* ------------------------------------------------------------------ */

export function SocialProof() {
  return (
    <section className="border-b" aria-labelledby="proof-heading">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h2
          id="proof-heading"
          className="text-muted-foreground text-center text-caption font-medium tracking-wider uppercase"
        >
          Built for businesses that invoice on terms
        </h2>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {LOGOS.map((logo) => (
            <li
              key={logo}
              className="text-muted-foreground/70 text-small font-semibold tracking-tight"
            >
              {logo}
            </li>
          ))}
        </ul>

        <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {PROOF_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dd className="figure text-h1 font-semibold">{stat.value}</dd>
              <dt className="text-muted-foreground mt-0.5 text-caption">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>

        <p className="text-muted-foreground mt-4 text-center text-caption">
          Figures from the InvoicePilot demo workspace, measured over 30 days.
        </p>

        {/* CTA after the metrics: the moment a visitor is most convinced is
            the moment they should not have to go looking for the button. */}
        <div className="mt-6 flex justify-center">
          <LinkButton size="sm" href="/signup">
            Start free
            <ArrowRight className="size-3.5" />
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Problem                                                             */
/* ------------------------------------------------------------------ */

const PROBLEMS = [
  {
    icon: AlarmClock,
    title: "You find out an invoice is late by accident",
    body: "Nothing tells you a payment slipped. You notice when the bank balance looks wrong, which is usually three weeks after the due date.",
  },
  {
    icon: Repeat,
    title: "Chasing is manual, so it stops when you get busy",
    body: "The follow-up that recovers the money is the one nobody has time to send. Collections quietly becomes whatever is left after the real work.",
  },
  {
    icon: Ban,
    title: "You chase the wrong invoices first",
    body: "The biggest balance is not the most recoverable one. Working the list by size means calling about money that has already gone while the winnable ones age.",
  },
];

export function Problem() {
  return (
    <section className="border-b" aria-labelledby="problem-heading">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <Reveal className="max-w-2xl">
          <h2
            id="problem-heading"
            className="text-h1 font-semibold tracking-tight text-balance"
          >
            Late payment is rarely a collections problem. It is an attention
            problem.
          </h2>
          <p className="text-muted-foreground mt-3 text-body">
            Every business that invoices on terms runs the same broken loop.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((problem, i) => (
            <Reveal key={problem.title} delay={0.04 * i}>
              <article className="bg-card shadow-e1 h-full rounded-xl border p-5">
                <span className="bg-danger-muted text-danger flex size-9 items-center justify-center rounded-lg">
                  <problem.icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-3 text-h3 font-semibold tracking-tight">
                  {problem.title}
                </h3>
                <p className="text-muted-foreground mt-1.5 text-small">
                  {problem.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Product overview                                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    icon: ClipboardList,
    title: "Connect your ledger",
    body: "Sync QuickBooks or Xero and your open invoices appear, already aged and grouped by customer. Nothing to import by hand.",
  },
  {
    icon: Workflow,
    title: "Switch on a sequence",
    body: "Pick a reminder template, adjust the delay, activate it. From then on the follow-up happens whether or not anyone remembers.",
  },
  {
    icon: BarChart3,
    title: "Work the short list",
    body: "Each morning you get the accounts worth a person's time, ranked by what you are actually likely to recover today.",
  },
];

export function ProductOverview() {
  return (
    <section id="product" className="border-b scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <Reveal className="max-w-2xl">
          <h2 className="text-h1 font-semibold tracking-tight text-balance">
            Three steps, then it runs without you
          </h2>
          <p className="text-muted-foreground mt-3 text-body">
            Most teams are live the same morning. There is no migration project
            and no implementation fee.
          </p>
        </Reveal>

        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={0.04 * i}>
              <li className="bg-card shadow-e1 h-full rounded-xl border p-5">
                <div className="flex items-center gap-2.5">
                  <span className="bg-brand text-brand-foreground flex size-6 items-center justify-center rounded-full text-caption font-semibold">
                    {i + 1}
                  </span>
                  <step.icon className="text-brand size-4" aria-hidden />
                </div>
                <h3 className="mt-3 text-h3 font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="text-muted-foreground mt-1.5 text-small">
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Feature sections                                                    */
/* ------------------------------------------------------------------ */

function FeatureSection({
  id,
  eyebrow,
  icon: Icon,
  title,
  body,
  points,
  href,
  cta,
  visual,
  flip,
}: {
  id: string;
  eyebrow: string;
  icon: typeof Bot;
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="border-b scroll-mt-16" aria-labelledby={`${id}-heading`}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-2 lg:items-center">
        <Reveal className={cn("space-y-4", flip && "lg:order-2")}>
          <span className="text-brand flex items-center gap-1.5 text-caption font-medium tracking-wider uppercase">
            <Icon className="size-3.5" aria-hidden />
            {eyebrow}
          </span>
          <h2
            id={`${id}-heading`}
            className="text-h1 font-semibold tracking-tight text-balance"
          >
            {title}
          </h2>
          <p className="text-muted-foreground text-body">{body}</p>
          <ul className="space-y-2">
            {points.map((point) => (
              <li key={point} className="flex gap-2 text-small">
                <CheckCircle2
                  className="text-success mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <LinkButton size="sm" variant="outline" href={href}>
            {cta}
            <ArrowRight className="size-3.5" />
          </LinkButton>
        </Reveal>

        <Reveal delay={0.06} className={cn(flip && "lg:order-1")}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

export function AiSection() {
  return (
    <FeatureSection
      id="ai"
      eyebrow="AI collection assistant"
      icon={Bot}
      title="It tells you who to call, and why"
      body="InvoicePilot ranks your overdue book by expected recovery — balance weighted by risk and decayed by age — so a stale write-off never outranks an invoice a phone call would save."
      points={[
        "A ranked short list each morning, one row per customer",
        "Plain-language reasons: on-time rate, days beyond terms, what changed",
        "Reminders drafted in the right tone for the account",
        "Ask questions of your ledger and get numbers back, not prose",
      ]}
      href="/ai"
      cta="See the assistant"
      visual={
        <div className="bg-card shadow-e2 space-y-3 rounded-xl border p-4">
          <p className="text-muted-foreground text-caption">
            Ask InvoicePilot
          </p>
          <p className="text-h3 font-semibold tracking-tight">
            &ldquo;Why did our overdue balance increase?&rdquo;
          </p>
          <div className="border-brand/25 bg-brand-muted/50 space-y-2 rounded-lg border p-3">
            <p className="text-small">
              Your overdue balance increased by 39% this month, to{" "}
              <span className="figure font-semibold">$40,540</span>.
            </p>
            <ol className="space-y-1">
              {[
                ["Summit Construction", "$3,600", "9%"],
                ["Vertex Logistics", "$3,230", "8%"],
                ["Delmar Aviation", "$2,660", "7%"],
              ].map(([name, amount, share]) => (
                <li key={name} className="flex items-baseline gap-2 text-caption">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="text-muted-foreground">{share}</span>
                  <span className="figure font-semibold">{amount}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-muted-foreground text-caption">
            Nothing is sent to a customer without your confirmation.
          </p>
        </div>
      }
    />
  );
}

export function AutomationSection() {
  return (
    <FeatureSection
      id="automation"
      eyebrow="Automated reminders"
      icon={Workflow}
      title="The follow-up that happens whether or not anyone remembers"
      body="Build a sequence once — trigger, delay, condition, message — and it runs on every invoice that matches. Guardrails stop it from becoming the thing customers complain about."
      points={[
        "Five templates to start from, editable to the word",
        "Quiet hours, business days, and a cap on messages per customer",
        "Disputed invoices pause their sequence automatically",
        "Escalations above your threshold wait for a human",
      ]}
      href="/automations"
      cta="See the builder"
      flip
      visual={
        <div className="bg-card shadow-e2 space-y-2 rounded-xl border p-4">
          {[
            ["Trigger", "Invoice becomes overdue", "bg-brand-muted text-brand"],
            ["Delay", "Wait 1 day", "bg-muted text-muted-foreground"],
            ["Email", "Send friendly reminder", "bg-success-muted text-success"],
            ["Condition", "Still unpaid?", "bg-warning-muted text-warning"],
            ["Email", "Send second reminder", "bg-success-muted text-success"],
          ].map(([kind, label, tone], i, all) => (
            <div key={label}>
              <div className="flex items-center gap-2.5 rounded-lg border p-2.5">
                <span
                  aria-hidden
                  className={cn("size-7 shrink-0 rounded-lg", tone)}
                />
                <span className="min-w-0">
                  <span className="text-muted-foreground block text-caption">
                    {kind}
                  </span>
                  <span className="block truncate text-small font-medium">
                    {label}
                  </span>
                </span>
              </div>
              {i < all.length - 1 ? (
                <span
                  aria-hidden
                  className="bg-muted-foreground/35 mx-auto block h-3 w-0.5"
                />
              ) : null}
            </div>
          ))}
        </div>
      }
    />
  );
}

export function CashFlowSection() {
  return (
    <FeatureSection
      id="cashflow"
      eyebrow="Cash-flow intelligence"
      icon={BarChart3}
      title="Know what is coming in, and what has stopped moving"
      body="Aging, collection rate and days-to-payment computed from your ledger rather than typed into a spreadsheet — so the number on the dashboard is the number in the report."
      points={[
        "Aging split five ways, from current to 90+ days",
        "Expected against collected, over seven days to twelve months",
        "Per-customer payment behaviour, early and late shown differently",
        "Export any report as CSV or PDF, or schedule it",
      ]}
      href="/reports"
      cta="See the reports"
      visual={
        <div className="bg-card shadow-e2 space-y-3 rounded-xl border p-4">
          <p className="text-muted-foreground text-caption">Invoice aging</p>
          <ul className="space-y-2">
            {[
              ["Current", 63, "$70.6K", "bg-aging-current"],
              ["1–30 days", 12, "$13.3K", "bg-aging-1"],
              ["31–60 days", 6, "$7.1K", "bg-aging-2"],
              ["61–90 days", 4, "$4.5K", "bg-aging-3"],
              ["90+ days", 14, "$15.6K", "bg-aging-4"],
            ].map(([label, share, amount, tone]) => (
              <li key={String(label)} className="space-y-1">
                <div className="flex items-baseline justify-between text-caption">
                  <span>{label}</span>
                  <span className="figure font-medium">{amount}</span>
                </div>
                <span className="bg-muted block h-1.5 overflow-hidden rounded-full">
                  <span
                    className={cn("block h-full rounded-full", tone)}
                    style={{ width: `${share}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

const INTEGRATION_GROUPS = [
  { label: "Accounting", items: ["QuickBooks", "Xero"] },
  { label: "Payments", items: ["Stripe", "PayPal"] },
  { label: "Communication", items: ["Gmail", "Outlook", "Twilio"] },
  { label: "Ecommerce", items: ["Shopify", "WooCommerce"] },
  { label: "Automation", items: ["Zapier", "Webhooks"] },
];

export function Integrations() {
  return (
    <section id="integrations" className="border-b scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <Reveal className="max-w-2xl">
          <h2 className="text-h1 font-semibold tracking-tight text-balance">
            It plugs into the stack you already run
          </h2>
          <p className="text-muted-foreground mt-3 text-body">
            Two-way sync with your ledger, reminders from your own address, and
            payments reconciled without a manual match.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {INTEGRATION_GROUPS.map((group, i) => (
            <Reveal key={group.label} delay={0.03 * i}>
              <div className="bg-card shadow-e1 h-full rounded-xl border p-4">
                <h3 className="text-muted-foreground text-caption font-medium tracking-wider uppercase">
                  {group.label}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item} className="text-small font-medium">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="text-muted-foreground mt-4 text-caption">
            Anything else connects through the REST API or signed webhooks.{" "}
            <Link href="/integrations" className="text-brand hover:underline">
              See all integrations
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Testimonials                                                        */
/* ------------------------------------------------------------------ */

export function Testimonials() {
  return (
    <section className="border-b" aria-labelledby="testimonials-heading">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <h2
            id="testimonials-heading"
            className="text-h1 font-semibold tracking-tight text-balance"
          >
            What changes in the first month
          </h2>
        </Reveal>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial, i) => (
            <Reveal key={testimonial.name} delay={0.04 * i}>
              <figure className="bg-card shadow-e1 flex h-full flex-col rounded-xl border p-5">
                <Quote className="text-brand/40 size-5" aria-hidden />
                <blockquote className="mt-2 flex-1 text-small">
                  {testimonial.quote}
                </blockquote>
                <figcaption className="text-muted-foreground mt-4 text-caption">
                  <span className="text-foreground block font-medium">
                    {testimonial.name}
                  </span>
                  {testimonial.role}, {testimonial.company}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.12}>
          <p className="text-muted-foreground mt-4 text-caption">
            Quotes are from the fictional companies in the InvoicePilot demo
            workspace, written to illustrate the product rather than to report a
            real customer result.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA                                                           */
/* ------------------------------------------------------------------ */

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="border-brand/25 from-brand-muted/70 shadow-e1 rounded-2xl border bg-gradient-to-b to-transparent p-8 text-center">
          <h2
            id="final-cta-heading"
            className="text-h1 font-semibold tracking-tight text-balance sm:text-display"
          >
            Stop being the reason your invoices get paid
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-body">
            Connect your ledger this morning, switch on one reminder sequence,
            and let the follow-up happen without you.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <LinkButton size="lg" href="/signup">
              Start free
              <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton size="lg" variant="outline" href="/pricing">
              See pricing
            </LinkButton>
          </div>

          <p className="text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-caption">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="text-success size-3.5" aria-hidden />
              60-day money-back guarantee
            </span>
            <span>14-day trial · no card required</span>
          </p>
        </div>
      </div>
    </section>
  );
}
