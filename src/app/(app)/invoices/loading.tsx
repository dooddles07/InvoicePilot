import { TableSkeleton } from "@/components/invoicepilot/page-skeletons";

export default function Loading() {
  return <TableSkeleton label="Loading your invoices" rows={12} />;
}
