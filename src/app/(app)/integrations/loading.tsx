import { CardGridSkeleton } from "@/components/invoicepilot/page-skeletons";

export default function Loading() {
  return <CardGridSkeleton label="Loading integrations" count={6} />;
}
