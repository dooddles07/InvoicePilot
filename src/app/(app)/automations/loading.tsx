import { CardGridSkeleton } from "@/components/invoicepilot/page-skeletons";

export default function Loading() {
  return (
    <CardGridSkeleton
      label="Loading your automations"
      count={4}
      columns="lg:grid-cols-2"
    />
  );
}
