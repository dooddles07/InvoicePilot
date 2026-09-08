"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { Banknote, Download } from "lucide-react";
import { toast } from "sonner";

import {
  HEAD_LABEL,
  SortHeader,
  TablePagination,
  TableSearch,
} from "@/components/data-table/parts";
import { TABLE_FEATURES, type TableFeatures } from "@/components/data-table/features";
import { CustomerCell } from "@/components/invoicepilot/customer-cell";
import { EmptyState } from "@/components/invoicepilot/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, money } from "@/lib/format";
import type { Payment, PaymentMethod } from "@/types";
import { cn } from "@/lib/utils";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  ach: "ACH",
  card: "Card",
  stripe: "Stripe",
  check: "Check",
  paypal: "PayPal",
};

const METHOD_OPTIONS = [
  { value: "all", label: "All methods" },
  ...(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => ({
    value: m,
    label: METHOD_LABEL[m],
  })),
];

const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

export function PaymentsTable({ payments }: { payments: Payment[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "received_at", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<TableFeatures, Payment>[]>(
    () => [
      {
        accessorKey: "customer_name",
        filterFn: (row, _id, value: string) => {
          const q = value.toLowerCase();
          return (
            row.original.customer_name.toLowerCase().includes(q) ||
            row.original.invoice_number.toLowerCase().includes(q) ||
            row.original.reference.toLowerCase().includes(q)
          );
        },
        header: ({ column }) => (
          <SortHeader
            label="Customer"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <CustomerCell
            id={row.original.customer_id}
            name={row.original.customer_name}
          />
        ),
      },
      {
        accessorKey: "invoice_number",
        enableSorting: false,
        header: () => <span className={HEAD_LABEL}>Invoice</span>,
        cell: ({ row }) => (
          <Link
            href={`/invoices/${row.original.invoice_id}`}
            className="font-mono text-caption font-medium hover:underline"
          >
            {row.original.invoice_number}
          </Link>
        ),
      },
      {
        accessorKey: "method",
        enableSorting: false,
        filterFn: (row, _id, value: string) => row.original.method === value,
        header: () => <span className={HEAD_LABEL}>Method</span>,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-small">
            {METHOD_LABEL[row.original.method]}
          </span>
        ),
      },
      {
        accessorKey: "reference",
        enableSorting: false,
        header: () => <span className={HEAD_LABEL}>Reference</span>,
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-caption">
            {row.original.reference}
          </span>
        ),
      },
      {
        accessorKey: "received_at",
        sortFn: "datetime",
        header: ({ column }) => (
          <SortHeader
            label="Received"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tnum text-small">
            {formatDate(row.original.received_at)}
          </span>
        ),
      },
      {
        accessorKey: "amount_cents",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="Amount"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="figure text-success block text-right text-small font-semibold">
            +{money(row.original.amount_cents)}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    features: TABLE_FEATURES,
    data: payments,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    initialState: { pagination: { pageIndex: 0, pageSize: 12 } },
  });

  const search =
    (table.getColumn("customer_name")?.getFilterValue() as string) ?? "";
  const method = (table.getColumn("method")?.getFilterValue() as string) ?? "all";
  const rows = table.getRowModel().rows;
  const filtered = table.getFilteredRowModel().rows;
  const total = filtered.reduce((s, r) => s + r.original.amount_cents, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={search}
          onChange={(v) => table.getColumn("customer_name")?.setFilterValue(v)}
          placeholder="Search customer, invoice or reference…"
          label="Search payments"
        />

        <Select
          value={method}
          onValueChange={(v) =>
            table
              .getColumn("method")
              ?.setFilterValue(String(v) === "all" ? undefined : String(v))
          }
        >
          <SelectTrigger size="sm" aria-label="Filter by method">
            <SelectValue>{labelOf(METHOD_OPTIONS, method)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {METHOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="tnum text-muted-foreground ml-auto text-caption">
          <span className="text-success font-semibold">{money(total)}</span>{" "}
          received
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast("Export started", {
              description: `${filtered.length} payments will be exported as CSV.`,
            })
          }
        >
          <Download className="size-3.5" />
          Export
        </Button>
      </div>

      <div className="bg-card shadow-e1 overflow-hidden rounded-xl border">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Banknote}
              title="No payments match that search"
              description="Try a different customer, invoice number or reference."
            />
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                      {hg.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn("h-9", CELL_CLASS[header.column.id])}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/30">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn("py-2", CELL_CLASS[cell.column.id])}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y lg:hidden">
              {rows.map((row) => {
                const p = row.original;
                return (
                  <li key={row.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <CustomerCell
                        id={p.customer_id}
                        name={p.customer_name}
                        sublabel={p.invoice_number}
                      />
                      <span className="figure text-success shrink-0 text-small font-semibold">
                        +{money(p.amount_cents)}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-caption">
                      {METHOD_LABEL[p.method]} · {p.reference} ·{" "}
                      {formatDate(p.received_at)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <TablePagination
              page={table.state.pagination.pageIndex + 1}
              pageCount={table.getPageCount()}
              total={filtered.length}
              noun={filtered.length === 1 ? "payment" : "payments"}
              onPrevious={() => table.previousPage()}
              onNext={() => table.nextPage()}
              canPrevious={table.getCanPreviousPage()}
              canNext={table.getCanNextPage()}
            />
          </>
        )}
      </div>
    </div>
  );
}

const CELL_CLASS: Record<string, string> = {
  customer_name: "pl-4",
  reference: "hidden xl:table-cell",
  method: "hidden xl:table-cell",
  amount_cents: "text-right pr-4",
};
