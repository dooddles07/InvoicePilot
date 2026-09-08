"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/invoicepilot/logo";
import { LinkButton } from "@/components/invoicepilot/link-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#automation", label: "Automation" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="shrink-0" aria-label="InvoicePilot home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-2.5 py-1.5 text-small transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <LinkButton
            size="sm"
            variant="ghost"
            href="/login"
            className="hidden sm:inline-flex"
          >
            Sign in
          </LinkButton>
          {/* The primary CTA lives in the nav as well as after the metrics —
              a visitor who is already convinced should not have to scroll. */}
          <LinkButton size="sm" href="/signup">
            Start free
          </LinkButton>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav aria-label="Main" className="border-t md:hidden">
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted flex min-h-[44px] items-center rounded-lg px-2 text-small"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="hover:bg-muted flex min-h-[44px] items-center rounded-lg px-2 text-small"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Overview" },
      { href: "/#automation", label: "Automation" },
      { href: "/#ai", label: "AI assistant" },
      { href: "/#integrations", label: "Integrations" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Start free" },
      { href: "/dashboard", label: "Live demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/faq", label: "Terms" },
      { href: "/faq", label: "Privacy" },
      { href: "/faq", label: "Security" },
      { href: "/faq", label: "Data processing" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-small">
            Accounts receivable that chases itself, so your team can spend the
            week on work that is not a reminder email.
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <h2 className="text-small font-semibold">{group.title}</h2>
            <ul className="mt-2 space-y-1.5">
              {group.links.map((link) => (
                <li key={`${group.title}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-small transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-caption sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} InvoicePilot. All rights reserved.</p>
          <p>
            Figures shown throughout this site are from a demo workspace, not a
            real customer.
          </p>
        </div>
      </div>
    </footer>
  );
}
