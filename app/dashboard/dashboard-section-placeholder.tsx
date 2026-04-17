import { SurfacePanel } from "@/app/ui/foundation";

type DashboardSectionPlaceholderProps = {
  title: string;
  description: string;
};

export function DashboardSectionPlaceholder({
  title,
  description,
}: DashboardSectionPlaceholderProps) {
  return (
    <SurfacePanel as="section" variant="glass" className="p-6">
      <h1 className="type-headline-lg">{title}</h1>
      <p className="mt-3 text-sm text-muted">{description}</p>
    </SurfacePanel>
  );
}
