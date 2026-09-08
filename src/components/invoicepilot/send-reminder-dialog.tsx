"use client";

import { Mail, Sparkles } from "lucide-react";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/lib/format";
import type { Invoice } from "@/types";

type Tone = "friendly" | "firm" | "final";

const TONE_LABEL: Record<Tone, string> = {
  friendly: "Friendly nudge",
  firm: "Firm follow-up",
  final: "Final notice",
};

function draft(invoice: Invoice, tone: Tone, contact: string): string {
  const amount = money(invoice.balance_cents);
  const late = invoice.days_overdue;

  if (tone === "friendly") {
    return `Hi ${contact},\n\nJust a quick note that invoice ${invoice.number} for ${amount} became due ${late} day${late === 1 ? "" : "s"} ago. If it is already scheduled, please ignore this — otherwise a payment link is attached.\n\nHappy to re-send anything you need.\n\nAlex Mercer\nMeridian Studio`;
  }
  if (tone === "firm") {
    return `Hi ${contact},\n\nInvoice ${invoice.number} for ${amount} is now ${late} days past its due date and remains unpaid. Could you confirm a payment date, or let me know if something is holding it up?\n\nIf the invoice needs to be re-issued to a different contact or PO, tell me and I will sort it today.\n\nAlex Mercer\nMeridian Studio`;
  }
  return `Hi ${contact},\n\nDespite previous reminders, invoice ${invoice.number} for ${amount} remains unpaid ${late} days after its due date.\n\nPlease arrange payment within five working days, or contact me to agree a payment plan. We would rather find a workable arrangement than escalate this further.\n\nAlex Mercer\nMeridian Studio`;
}

/**
 * The confirmation step in `AI recommendation -> human confirmation -> action`.
 * The message is drafted for the user, but nothing leaves the building until
 * they have read it and pressed send.
 */
export function SendReminderDialog({
  invoice,
  contactName,
  recommendedTone = "friendly",
  trigger,
  label = "Send reminder",
}: {
  invoice: Invoice;
  contactName: string;
  recommendedTone?: Tone;
  trigger?: ReactElement;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<Tone>(recommendedTone);
  const [body, setBody] = useState(() =>
    draft(invoice, recommendedTone, contactName),
  );

  const changeTone = (next: Tone) => {
    setTone(next);
    setBody(draft(invoice, next, contactName));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Mail className="size-3.5" />
              {label}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a payment reminder</DialogTitle>
          <DialogDescription>
            To {contactName} about {invoice.number} · {money(invoice.balance_cents)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border-brand/25 bg-brand-muted/50 flex gap-2 rounded-lg border p-2.5">
            <Sparkles className="text-brand mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p className="text-caption">
              InvoicePilot suggests a{" "}
              <span className="font-medium">
                {TONE_LABEL[recommendedTone].toLowerCase()}
              </span>{" "}
              for this account. Edit anything below before it goes out.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone</Label>
            <Select value={tone} onValueChange={(v) => changeTone(v as Tone)}>
              <SelectTrigger id="tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TONE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              value={body}
              rows={11}
              onChange={(e) => setBody(e.target.value)}
              className="text-small leading-relaxed"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              toast.success("Reminder sent", {
                description: `${TONE_LABEL[tone]} sent to ${contactName} about ${invoice.number}.`,
              });
            }}
          >
            <Mail className="size-3.5" />
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
