"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote } from "lucide-react";
import { useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/lib/format";
import type { Invoice, PaymentMethod } from "@/types";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "ach", label: "ACH" },
  { value: "card", label: "Card" },
  { value: "stripe", label: "Stripe" },
  { value: "check", label: "Check" },
  { value: "paypal", label: "PayPal" },
];

const schema = z.object({
  // Kept as a string so the field can be empty while typing; the refinement is
  // what actually guards the value.
  amount: z
    .string()
    .min(1, "Enter the amount received.")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, {
      message: "Enter a positive amount.",
    }),
  method: z.string().min(1, "Choose how the payment arrived."),
  received_on: z.string().min(1, "Choose the date it was received."),
  reference: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function RecordPaymentDialog({
  invoice,
  today,
  trigger,
}: {
  invoice: Invoice;
  /** Passed in so the default date matches the demo ledger, not the wall clock. */
  today: string;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const balance = invoice.balance_cents;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: (balance / 100).toFixed(2),
      method: "bank_transfer",
      received_on: today,
      reference: "",
    },
  });

  const amountCents = Math.round(Number(form.watch("amount") || 0) * 100);
  const remaining = Math.max(0, balance - amountCents);

  function onSubmit(values: Values) {
    const cents = Math.round(Number(values.amount) * 100);
    setOpen(false);
    form.reset();
    toast.success("Payment recorded", {
      description: `${money(cents)} received from ${invoice.customer_name}.${
        balance - cents > 0
          ? ` ${money(balance - cents)} still outstanding on ${invoice.number}.`
          : ""
      }`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" variant="outline">
              <Banknote className="size-3.5" />
              Record payment
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {invoice.number} · {invoice.customer_name} · {money(balance)}{" "}
            outstanding
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-3"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount received</Label>
            <Input
              id="amount"
              inputMode="decimal"
              className="tnum"
              aria-invalid={!!form.formState.errors.amount}
              aria-describedby={
                form.formState.errors.amount ? "amount-error" : "amount-hint"
              }
              {...form.register("amount")}
            />
            {form.formState.errors.amount ? (
              <p id="amount-error" className="text-danger text-caption">
                {form.formState.errors.amount.message}
              </p>
            ) : (
              <p id="amount-hint" className="text-muted-foreground text-caption">
                {remaining > 0
                  ? `${money(remaining)} would remain outstanding — the invoice stays open as partially paid.`
                  : "Settles the invoice in full."}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <Select
                value={form.watch("method")}
                onValueChange={(v) => form.setValue("method", String(v))}
              >
                <SelectTrigger id="method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="received_on">Received on</Label>
              <Input
                id="received_on"
                type="date"
                {...form.register("received_on")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              placeholder="TXN-482913"
              {...form.register("reference")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
