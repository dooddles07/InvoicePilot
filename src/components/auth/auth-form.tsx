"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const email = z.string().min(1, "Enter your work email.").email("That does not look like an email address.");

const SCHEMAS = {
  login: z.object({
    email,
    password: z.string().min(1, "Enter your password."),
  }),
  signup: z.object({
    full_name: z.string().min(2, "Enter your name."),
    email,
    // Length is the only rule that reliably predicts strength; a composition
    // rule mostly teaches people to write Password1!.
    password: z.string().min(10, "Use at least 10 characters."),
  }),
  reset: z.object({ email }),
} as const;

type Mode = keyof typeof SCHEMAS;

const COPY: Record<
  Mode,
  { submit: string; pending: string; success: string; detail: string }
> = {
  login: {
    submit: "Sign in",
    pending: "Signing in…",
    success: "Welcome back",
    detail: "Opening your workspace.",
  },
  signup: {
    submit: "Create my workspace",
    pending: "Creating…",
    success: "Workspace created",
    detail: "Next: connect your ledger and import your open invoices.",
  },
  reset: {
    submit: "Email me a reset link",
    pending: "Sending…",
    success: "Check your inbox",
    detail: "If that address has an account, a reset link is on its way.",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const form = useForm({
    resolver: zodResolver(SCHEMAS[mode]),
    defaultValues:
      mode === "signup"
        ? { full_name: "", email: "", password: "" }
        : mode === "login"
          ? { email: "", password: "" }
          : { email: "" },
  });

  const copy = COPY[mode];
  const errors = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;

  function onSubmit() {
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      toast.success(copy.success, { description: copy.detail });
      if (mode === "signup") router.push("/onboarding");
      if (mode === "login") router.push("/dashboard");
    }, 600);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3">
      {mode === "signup" ? (
        <Field
          id="full_name"
          label="Your name"
          autoComplete="name"
          error={errors.full_name?.message}
          register={form.register("full_name")}
        />
      ) : null}

      <Field
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        register={form.register("email")}
      />

      {mode !== "reset" ? (
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          hint={mode === "signup" ? "At least 10 characters." : undefined}
          error={errors.password?.message}
          register={form.register("password")}
        />
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>

      {mode !== "reset" ? (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-caption">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              toast("Single sign-on", {
                description:
                  "SSO is available on the Scale plan and during evaluation.",
              })
            }
          >
            Continue with SSO
          </Button>
        </>
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  register,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  register: ReturnType<ReturnType<typeof useForm>["register"]>;
} & React.ComponentProps<typeof Input>) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...props}
        {...register}
      />
      {/* The error sits with the field, not in a summary at the top — a list of
          errors above the fold makes you hunt for which input it meant. */}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-caption">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-caption">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
