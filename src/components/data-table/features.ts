import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * One feature set for every table in the app (TanStack v9 is opt-in per
 * feature). Declaring it once keeps the invoices, customers and payments
 * tables behaving identically — the same sort, filter, paginate and select
 * semantics everywhere, which is half of what "consistent" means to a user.
 */
export const TABLE_FEATURES = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  columnFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
});

export type TableFeatures = typeof TABLE_FEATURES;
