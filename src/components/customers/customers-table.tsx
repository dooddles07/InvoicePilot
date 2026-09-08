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
import { Building2, Download } from "lucide-react";
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
import { RiskBadge } from "@/components/invoicepilot/status-badge";
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
import { money, percent } from "@/lib/format";
import type { Customer, RiskLevel } from "@/types";
import { cn } from "@/lib/utils";

const RISK_OPTIONS: { value: RiskLevel | "all"; label: string }[] = [
  { value: "all", label: "All risk" },
  { value: "high", label: "High risk" },
  { value: "medium", label: "Medium risk" },
  { value: "low", label: "Low risk" },
];

const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

/** A small bar makes on-time rate comparable down the column at a glance. */
function OnTimeBar({ rate }: { rate: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="bg-muted hidden h-1.5 w-14 overflow-hidden rounded-full xl:block">
        <span
          className={cn(
            "block h-full rounded-full",
            rate >= 80 ? "bg-success" : rate >= 55 ? "bg-warning" : "bg-danger",
          )}
          style={{ width: `${Math.max(rate, 2)}%` }}
        />
      </span>
      <span className="tnum text-small font-medium">{percent(rate, 0)}</span>
    </span>
  );
}

export function CustomersTable({ customers }: { customers: Customer[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "outstanding_cents", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo<ColumnDef<TableFeatures, Customer>[]>(
    () => [
      {
        accessorKey: "name",
        filterFn: (row, _id, value: string) => {
          const q = value.toLowerCase();
          return (
            row.original.name.toLowerCase().includes(q) ||
            row.original.contact_name.toLowerCase().includes(q) ||
            row.original.industry.toLowerCase().includes(q)
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
            id={row.original.id}
            name={row.original.name}
            sublabel={row.original.industry}
          />
        ),
      },
      {
        accessorKey: "outstanding_cents",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="Outstanding"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="block text-right">
            <span className="figure block text-small font-semibold">
              {money(row.original.outstanding_cents)}
            </span>
            {row.original.overdue_cents > 0 ? (
              <span className="text-danger block text-caption">
                {money(row.original.overdue_cents)} overdue
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "open_invoice_count",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="Open"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tnum block text-right text-small">
            {row.original.open_invoice_count}
          </span>
        ),
      },
      {
        accessorKey: "avg_days_to_pay",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="Avg days to pay"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const beyond =
            row.original.avg_days_to_pay - row.original.payment_terms_days;
          return (
            <span className="block text-right">
              <span className="tnum block text-small">
                {row.original.avg_days_to_pay}
              </span>
              <span
                className={cn(
                  "block text-caption",
                  beyond > 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {beyond > 0 ? `+${beyond} vs terms` : "within terms"}
              </span>
            </span>
          );
        },
      },
      {
        accessorKey: "on_time_rate",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="On time"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <OnTimeBar rate={row.original.on_time_rate} />,
      },
      {
        accessorKey: "risk",
        enableSorting: false,
        filterFn: (row, _id, value: string) => row.original.risk === value,
        header: () => <span className={HEAD_LABEL}>Risk</span>,
        cell: ({ row }) => <RiskBadge risk={row.original.risk} />,
      },
    ],
    [],
  );

  const table = useTable({
    features: TABLE_FEATURES,
    data: customers,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    initialState: { pagination: { pageIndex: 0, pageSize: 12 } },
  });

  const search = (table.getColumn("name")?.getFilterValue() as string) ?? "";
  const riskFilter = (table.getColumn("risk")?.getFilterValue() as string) ?? "all";
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={search}
          onChange={(v) => table.getColumn("name")?.setFilterValue(v)}
          placeholder="Search customer, contact or industry…"
          label="Search customers"
        />

        <Select
          value={riskFilter}
          onValueChange={(v) =>
            table
              .getColumn("risk")
              ?.setFilterValue(String(v) === "all" ? undefined : String(v))
          }
        >
          <SelectTrigger size="sm" aria-label="Filter by risk">
            <SelectValue>{labelOf(RISK_OPTIONS, riskFilter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RISK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            toast("Export started", {
              description: `${total} customers will be exported as CSV.`,
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
              icon={Building2}
              title="No customers match that search"
              description="Try a different name, contact or industry."
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
                const c = row.original;
                return (
                  <li key={row.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <CustomerCell id={c.id} name={c.name} sublabel={c.industry} />
                      <span className="figure shrink-0 text-small font-semibold">
                        {money(c.outstanding_cents)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption">
                      <RiskBadge risk={c.risk} />
                      <span className="text-muted-foreground">
                        {c.open_invoice_count} open · {percent(c.on_time_rate, 0)} on
                        time
                      </span>
                      {c.overdue_cents > 0 ? (
                        <span className="text-danger">
                          {money(c.overdue_cents)} overdue
                        </span>
                      ) : null}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/customers/${c.id}`} />}
                      >
                        Open customer
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <TablePagination
              page={table.state.pagination.pageIndex + 1}
              pageCount={table.getPageCount()}
              total={total}
              noun={total === 1 ? "customer" : "customers"}
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
  name: "pl-4",
  outstanding_cents: "text-right",
  open_invoice_count: "text-right hidden xl:table-cell",
  avg_days_to_pay: "text-right",
  on_time_rate: "text-right",
  risk: "pr-4",
};
