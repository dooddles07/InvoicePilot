"use client";

import { Download, Ellipsis, FileText, Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { RecordPaymentDialog } from "@/components/invoicepilot/record-payment-dialog";
import { SendReminderDialog } from "@/components/invoicepilot/send-reminder-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Invoice } from "@/types";

/**
 * The action row on an invoice. Every destructive or outward-facing action
 * goes through a dialog — nothing here fires straight from a click.
 */
export function InvoiceActions({
  invoice,
  contactName,
  today,
}: {
  invoice: Invoice;
  contactName: string;
  today: string;
}) {
  const settled = invoice.status === "paid";
  const tone =
    invoice.days_overdue > 45 ? "final" : invoice.days_overdue > 10 ? "firm" : "friendly";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!settled ? (
        <>
          <SendReminderDialog
            invoice={invoice}
            contactName={contactName}
            recommendedTone={tone}
          />
          <RecordPaymentDialog invoice={invoice} today={today} />
        </>
      ) : null}

      <Button variant="outline" size="sm">
        <Pencil className="size-3.5" />
        Edit
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          toast("Preparing PDF", {
            description: `${invoice.number} will download shortly.`,
          })
        }
      >
        <Download className="size-3.5" />
        Download PDF
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon-sm" aria-label="More actions">
              <Ellipsis className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() =>
              toast("Duplicate created", {
                description: `A draft copy of ${invoice.number} is ready to edit.`,
              })
            }
          >
            <FileText className="size-4" />
            Duplicate invoice
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              toast("Marked as disputed", {
                description: "Reminders are paused until the dispute is resolved.",
              })
            }
          >
            <XCircle className="size-4" />
            Mark as disputed
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger"
            onClick={() =>
              toast.warning("Void this invoice?", {
                description:
                  "Voiding removes it from your receivables. This cannot be undone.",
                action: {
                  label: "Void",
                  onClick: () =>
                    toast.success(`${invoice.number} voided`, {
                      description: "It no longer counts toward outstanding.",
                    }),
                },
              })
            }
          >
            <Trash2 className="size-4" />
            Void invoice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
