type DashboardPageHeaderProps = {
  title: string;
  description: string;
};

export function DashboardPageHeader({ title, description }: DashboardPageHeaderProps) {
  return (
    <header className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-zinc-600 dark:text-zinc-300">{description}</p>
    </header>
  );
}
