import Link from "next/link";

import { cx } from "@/app/ui/foundation";

type ActionLinkCardProps = {
  href: string;
  title: string;
  description: string;
  meta?: string;
  className?: string;
};

export function ActionLinkCard({
  href,
  title,
  description,
  meta,
  className,
}: ActionLinkCardProps) {
  return (
    <Link
      href={href}
      className={cx(
        "surface-base surface-elevated surface-interactive block p-6 text-left",
        className,
      )}
    >
      <h2 className="type-title text-soft">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {meta ? <p className="mt-3 text-xs text-accent">{meta}</p> : null}
    </Link>
  );
}
