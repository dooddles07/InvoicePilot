"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type ColumnVisibilityState,
} from "@tanstack/react-table";
import {
  Check,
  Download,
  Ellipsis,
  Eye,
  Mail,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import {
  BulkBar,
  HEAD_LABEL,
  SortHeader,
  TablePagination,
  TableSearch,
} from "@/components/data-table/parts";
import { TABLE_FEATURES, type TableFeatures } from "@/components/data-table/features";
import { CustomerCell } from "@/components/invoicepilot/customer-cell";
import { EmptyState } from "@/components/invoicepilot/empty-state";
import {
  InvoiceStatusBadge,
  RiskBadge,
} from "@/components/invoicepilot/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { OPEN_STATUSES } from "@/lib/data";
import { formatDateShort, money, dueLabel } from "@/lib/format";
import type { Invoice, InvoiceStatus, RiskLevel } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "overdue", label: "Overdue" },
  { value: "disputed", label: "Disputed" },
  { value: "paid", label: "Paid" },
];

const RISK_OPTIONS: { value: RiskLevel | "all"; label: string }[] = [
  { value: "all", label: "All risk" },
  { value: "high", label: "High risk" },
  { value: "medium", label: "Medium risk" },
  { value: "low", label: "Low risk" },
];

const AGE_OPTIONS = [
  { value: "all", label: "Any age" },
  { value: "open", label: "Open only" },
  { value: "overdue", label: "Overdue only" },
  { value: "60", label: "60+ days late" },
] as const;

type AgeFilter = (typeof AGE_OPTIONS)[number]["value"];

/** Base UI shows the raw value unless the trigger is told what to display. */
const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

export function InvoicesTable({
  invoices,
  today,
}: {
  invoices: Invoice[];
  /** The demo ledger's reference date, so "days late" never drifts. */
  today: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "due_date", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [age, setAge] = useState<AgeFilter>("open");

  // Age is a row-level predicate rather than a column filter: it spans two
  // fields (status and days overdue) and reads better as one control.
  const data = useMemo(() => {
    if (age === "all") return invoices;
    // "Open" means money the business is owed — a draft is not outstanding,
    // so it stays out of the count the page header quotes.
    if (age === "open")
      return invoices.filter((i) => OPEN_STATUSES.includes(i.status));
    if (age === "overdue") return invoices.filter((i) => i.days_overdue > 0);
    return invoices.filter((i) => i.days_overdue > 60);
  }, [invoices, age]);

  const columns = useMemo<ColumnDef<TableFeatures, Invoice>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected()
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked === true)
            }
            aria-label="Select all invoices on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
            aria-label={`Select ${row.original.number}`}
          />
        ),
      },
      {
        accessorKey: "number",
        filterFn: (row, _id, value: string) => {
          const q = value.toLowerCase();
          return (
            row.original.number.toLowerCase().includes(q) ||
            row.original.customer_name.toLowerCase().includes(q) ||
            (row.original.po_number ?? "").toLowerCase().includes(q)
          );
        },
        header: ({ column }) => (
          <SortHeader
            label="Invoice"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <Link
            href={`/invoices/${row.original.id}`}
            className="font-mono text-caption font-medium hover:underline"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "customer_name",
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
        accessorKey: "issue_date",
        sortFn: "datetime",
        header: ({ column }) => (
          <SortHeader
            label="Issued"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="tnum text-muted-foreground text-small">
            {formatDateShort(row.original.issue_date)}
          </span>
        ),
      },
      {
        accessorKey: "due_date",
        sortFn: "datetime",
        header: ({ column }) => (
          <SortHeader
            label="Due"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const late = row.original.days_overdue > 0 && row.original.status !== "paid";
          return (
            <span className="block">
              <span className="tnum block text-small">
                {formatDateShort(row.original.due_date)}
              </span>
              <span
                className={cn(
                  "block text-caption",
                  late ? "text-danger" : "text-muted-foreground",
                )}
              >
                {row.original.status === "paid"
                  ? "settled"
                  : dueLabel(row.original.due_date, new Date(today))}
              </span>
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        enableSorting: false,
        filterFn: (row, _id, value: string) => row.original.status === value,
        header: () => <span className={HEAD_LABEL}>Status</span>,
        cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "risk",
        enableSorting: false,
        filterFn: (row, _id, value: string) => row.original.risk === value,
        header: () => <span className={HEAD_LABEL}>Risk</span>,
        cell: ({ row }) =>
          row.original.status === "paid" ? (
            <span className="text-muted-foreground text-caption">—</span>
          ) : (
            <RiskBadge risk={row.original.risk} />
          ),
      },
      {
        accessorKey: "balance_cents",
        sortFn: "basic",
        header: ({ column }) => (
          <SortHeader
            label="Balance"
            align="end"
            sorted={column.getIsSorted()}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="block text-right">
            <span className="figure block text-small font-semibold">
              {money(
                row.original.status === "paid"
                  ? row.original.amount_cents
                  : row.original.balance_cents,
              )}
            </span>
            {row.original.paid_cents > 0 && row.original.status !== "paid" ? (
              <span className="text-muted-foreground block text-caption">
                {money(row.original.paid_cents)} paid
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${row.original.number}`}
                  >
                    <Ellipsis className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  nativeButton={false}
                  render={<Link href={`/invoices/${row.original.id}`} />}
                >
                  <Eye className="size-4" />
                  View invoice
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    toast.success("Reminder queued", {
                      description: `A reminder for ${row.original.number} will go to ${row.original.customer_name}.`,
                    })
                  }
                >
                  <Mail className="size-4" />
                  Send reminder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    toast("Preparing PDF", {
                      description: `${row.original.number} will download shortly.`,
                    })
                  }
                >
                  <Download className="size-4" />
                  Download PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [today],
  );

  const table = useTable({
    features: TABLE_FEATURES,
    data,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 12 } },
  });

  const search = (table.getColumn("number")?.getFilterValue() as string) ?? "";
  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ?? "all";
  const riskFilter =
    (table.getColumn("risk")?.getFilterValue() as string) ?? "all";

  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const selected = table.getFilteredSelectedRowModel().rows;
  const selectedValue = selected.reduce(
    (s, r) => s + r.original.balance_cents,
    0,
  );

  const setColumnFilter = (id: string, value: string) =>
    table.getColumn(id)?.setFilterValue(value === "all" ? undefined : value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={search}
          onChange={(v) => table.getColumn("number")?.setFilterValue(v)}
          placeholder="Search invoice, customer or PO…"
          label="Search invoices"
        />

        <Select
          value={statusFilter}
          onValueChange={(v) => setColumnFilter("status", String(v))}
        >
          <SelectTrigger size="sm" aria-label="Filter by status">
            <SelectValue>{labelOf(STATUS_OPTIONS, statusFilter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={riskFilter}
          onValueChange={(v) => setColumnFilter("risk", String(v))}
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

        <Select value={age} onValueChange={(v) => setAge(v as AgeFilter)}>
          <SelectTrigger size="sm" aria-label="Filter by age">
            <SelectValue>{labelOf(AGE_OPTIONS, age)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-3.5" />
                  Columns
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-muted-foreground text-caption">
                Visible columns
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                  >
                    {COLUMN_LABEL[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast("Export started", {
                description: `${total} invoices will be exported as CSV.`,
              })
            }
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </div>

      <BulkBar count={selected.length} onClear={() => table.resetRowSelection()}>
        <span className="tnum text-muted-foreground mr-1 text-caption">
          {money(selectedValue)} outstanding
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast.success("Reminders queued", {
              description: `${selected.length} reminders will be sent from your address.`,
            })
          }
        >
          <Mail className="size-3.5" />
          Send reminders
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast.success("Marked as paid", {
              description: `${selected.length} invoices settled for ${money(selectedValue)}.`,
            })
          }
        >
          <Check className="size-3.5" />
          Mark paid
        </Button>
      </BulkBar>

      <div className="bg-card shadow-e1 overflow-hidden rounded-xl border">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Eye}
              title="No invoices match those filters"
              description="Try widening the status or age filter, or clear the search."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    table.resetColumnFilters();
                    setAge("open");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Table on desktop, cards on small screens: hiding half the
                columns would leave a finance manager without the fields they
                actually scan for. */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      {headerGroup.headers.map((header) => (
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
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn("py-2", CELL_CLASS[cell.column.id])}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y lg:hidden">
              {rows.map((row) => {
                const inv = row.original;
                return (
                  <li key={row.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <CustomerCell
                        id={inv.customer_id}
                        name={inv.customer_name}
                        sublabel={inv.number}
                      />
                      <span className="figure shrink-0 text-small font-semibold">
                        {money(
                          inv.status === "paid"
                            ? inv.amount_cents
                            : inv.balance_cents,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InvoiceStatusBadge status={inv.status} />
                      <RiskBadge risk={inv.risk} />
                      <span
                        className={cn(
                          "text-caption",
                          inv.days_overdue > 0 && inv.status !== "paid"
                            ? "text-danger"
                            : "text-muted-foreground",
                        )}
                      >
                        {inv.status === "paid"
                          ? "settled"
                          : dueLabel(inv.due_date, new Date(today))}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/invoices/${inv.id}`} />}
                      >
                        Open invoice
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
              noun={total === 1 ? "invoice" : "invoices"}
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

const COLUMN_LABEL: Record<string, string> = {
  number: "Invoice",
  customer_name: "Customer",
  issue_date: "Issued",
  due_date: "Due",
  status: "Status",
  risk: "Risk",
  balance_cents: "Balance",
};

const CELL_CLASS: Record<string, string> = {
  select: "w-10 pl-4",
  issue_date: "hidden xl:table-cell",
  risk: "hidden xl:table-cell",
  balance_cents: "text-right",
  actions: "w-10 pr-4",
};
