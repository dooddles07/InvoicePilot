import { CardGridSkeleton } from "@/components/invoicepilot/page-skeletons";

export default function Loading() {
  return <CardGridSkeleton label="Loading your reports" count={7} />;
}
