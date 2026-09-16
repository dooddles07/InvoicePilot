import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { WarmDemo } from "@/components/marketing/warm-demo";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <WarmDemo />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
