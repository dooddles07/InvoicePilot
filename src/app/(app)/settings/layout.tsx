import { PageHeader } from "@/components/invoicepilot/page-header";
import { Reveal } from "@/components/motion/reveal";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <Reveal>
        <PageHeader
          title="Settings"
          description="Workspace, collections behaviour and developer access."
        />
      </Reveal>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
