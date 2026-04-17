import { SectionHeader, SurfacePanel } from "@/app/ui/foundation";

type DashboardPageHeaderProps = {
  title: string;
  description: string;
};

export function DashboardPageHeader({ title, description }: DashboardPageHeaderProps) {
  return (
    <SurfacePanel variant="glass" className="p-5">
      <SectionHeader title={title} description={description} />
    </SurfacePanel>
  );
}
