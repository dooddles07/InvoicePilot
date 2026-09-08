import { TableSkeleton } from "@/components/invoicepilot/page-skeletons";

export default function Loading() {
  return <TableSkeleton label="Loading your customers" rows={12} />;
}
