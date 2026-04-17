import type { HTMLAttributes, ReactNode } from "react";

type ContainerWidth = "narrow" | "default" | "wide";
type PanelVariant = "card" | "elevated" | "glass" | "subtle";
type StatusTone = "success" | "danger" | "default";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  width?: ContainerWidth;
};

type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  className?: string;
  titleClassName?: string;
};

type SurfacePanelProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "form";
  variant?: PanelVariant;
  interactive?: boolean;
};

type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
};

type StatusMessageProps = {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
};

type ChoiceCardProps = {
  title: string;
  description: string;
  meta?: string;
  onClick?: () => void;
  className?: string;
};

const widthClassByVariant: Record<ContainerWidth, string> = {
  narrow: "max-w-xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
};

const panelClassByVariant: Record<PanelVariant, string> = {
  card: "surface-card",
  elevated: "surface-elevated",
  glass: "surface-glass",
  subtle: "surface-subtle",
};

const toneClassByVariant: Record<StatusTone, string> = {
  success: "status-success",
  danger: "status-danger",
  default: "status-default",
};

export function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function PageContainer({
  children,
  className,
  width = "default",
  ...rest
}: PageContainerProps) {
  return (
    <div
      className={cx("mx-auto w-full px-4 sm:px-6", widthClassByVariant[width], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  eyebrow,
  className,
  titleClassName,
}: SectionHeaderProps) {
  return (
    <header className={cx("space-y-3", className)}>
      {eyebrow ? <p className="type-eyebrow">{eyebrow}</p> : null}
      <h1 className={cx("type-headline-lg", titleClassName)}>{title}</h1>
      {description ? <p className="type-body text-muted">{description}</p> : null}
    </header>
  );
}

export function SurfacePanel({
  as: Tag = "div",
  variant = "elevated",
  interactive = false,
  className,
  children,
  ...rest
}: SurfacePanelProps) {
  return (
    <Tag
      className={cx(
        "surface-base",
        panelClassByVariant[variant],
        interactive && "surface-interactive",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function FormField({ label, hint, children, className }: FormFieldProps) {
  return (
    <label className={cx("field-group", className)}>
      <span className="field-label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function StatusMessage({
  tone = "default",
  className,
  children,
}: StatusMessageProps) {
  const liveMode = tone === "danger" ? "assertive" : "polite";
  const role = tone === "danger" ? "alert" : "status";

  return (
    <p
      role={role}
      aria-live={liveMode}
      className={cx("status-message", toneClassByVariant[tone], className)}
    >
      {children}
    </p>
  );
}

export function ChoiceCard({
  title,
  description,
  meta,
  onClick,
  className,
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "surface-base surface-elevated surface-interactive w-full p-6 text-left",
        className,
      )}
    >
      <h2 className="type-title">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {meta ? <p className="mt-3 text-xs text-accent">{meta}</p> : null}
    </button>
  );
}
