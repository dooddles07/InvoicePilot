"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/format";

const lineSchema = z.object({
  description: z.string().min(1, "Describe what this line is for."),
  quantity: z
    .string()
    .refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
  unit_price: z
    .string()
    .refine((v) => Number(v) > 0, "Unit price must be greater than zero."),
});

const schema = z.object({
  customer_id: z.string().min(1, "Choose a customer."),
  issue_date: z.string().min(1, "Choose an issue date."),
  due_date: z.string().min(1, "Choose a due date."),
  po_number: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(lineSchema).min(1, "An invoice needs at least one line."),
});

type Values = z.infer<typeof schema>;

type CustomerOption = { id: string; name: string; terms: number };

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function NewInvoiceForm({
  customers,
  today,
}: {
  customers: CustomerOption[];
  today: string;
}) {
  const router = useRouter();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      issue_date: today,
      due_date: addDays(today, 30),
      po_number: "",
      notes: "",
      items: [{ description: "", quantity: "1", unit_price: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const items = form.watch("items");
  const totalCents = items.reduce(
    (sum, item) =>
      sum + Math.round(Number(item.quantity || 0) * Number(item.unit_price || 0) * 100),
    0,
  );

  const customerId = form.watch("customer_id");
  const selected = customers.find((c) => c.id === customerId);

  // Terms are the customer's, not a global default — that is the whole point
  // of storing them per account.
  const chooseCustomer = (id: string) => {
    form.setValue("customer_id", id);
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      form.setValue("due_date", addDays(form.getValues("issue_date"), customer.terms));
    }
  };

  function onSubmit(values: Values) {
    toast.success("Invoice created", {
      description: `${money(totalCents)} to ${
        customers.find((c) => c.id === values.customer_id)?.name ?? "customer"
      }, due ${values.due_date}.`,
    });
    router.push("/invoices");
  }

  const err = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="bg-card shadow-e1 space-y-4 rounded-xl border p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customer">Customer</Label>
          <Select value={customerId} onValueChange={(v) => chooseCustomer(String(v))}>
            <SelectTrigger id="customer" className="w-full">
              <SelectValue>{selected?.name ?? "Choose a customer"}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err.customer_id ? (
            <p className="text-danger text-caption">{err.customer_id.message}</p>
          ) : selected ? (
            <p className="text-muted-foreground text-caption">
              Agreed terms: {selected.terms} days.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="issue_date">Issue date</Label>
          <Input id="issue_date" type="date" {...form.register("issue_date")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="due_date">Due date</Label>
          <Input id="due_date" type="date" {...form.register("due_date")} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="po_number">PO number (optional)</Label>
          <Input id="po_number" placeholder="PO-48213" {...form.register("po_number")} />
        </div>
      </div>

      <Separator />

      <fieldset className="space-y-3">
        <legend className="text-h3 font-semibold tracking-tight">Line items</legend>

        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-12 items-start gap-2">
            <div className="col-span-12 space-y-1.5 sm:col-span-6">
              <Label htmlFor={`items.${index}.description`} className="sr-only">
                Description
              </Label>
              <Input
                id={`items.${index}.description`}
                placeholder="Description"
                {...form.register(`items.${index}.description`)}
              />
              {err.items?.[index]?.description ? (
                <p className="text-danger text-caption">
                  {err.items[index]?.description?.message}
                </p>
              ) : null}
            </div>

            <div className="col-span-4 space-y-1.5 sm:col-span-2">
              <Label htmlFor={`items.${index}.quantity`} className="sr-only">
                Quantity
              </Label>
              <Input
                id={`items.${index}.quantity`}
                inputMode="numeric"
                placeholder="Qty"
                className="tnum"
                {...form.register(`items.${index}.quantity`)}
              />
            </div>

            <div className="col-span-6 space-y-1.5 sm:col-span-3">
              <Label htmlFor={`items.${index}.unit_price`} className="sr-only">
                Unit price
              </Label>
              <Input
                id={`items.${index}.unit_price`}
                inputMode="decimal"
                placeholder="Unit price"
                className="tnum"
                {...form.register(`items.${index}.unit_price`)}
              />
            </div>

            <div className="col-span-2 flex justify-end sm:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove line ${index + 1}`}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ description: "", quantity: "1", unit_price: "" })}
        >
          <Plus className="size-3.5" />
          Add line
        </Button>
      </fieldset>

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes on the invoice (optional)</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Payment instructions, project reference, anything the customer should see."
          {...form.register("notes")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-muted-foreground text-small">
          Invoice total{" "}
          <span className="figure text-foreground text-h3 font-semibold">
            {money(totalCents)}
          </span>
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/invoices")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              toast("Saved as draft", {
                description: "It will not be sent until you issue it.",
              })
            }
          >
            Save draft
          </Button>
          <Button type="submit" size="sm">
            Create and send
          </Button>
        </div>
      </div>
    </form>
  );
}
