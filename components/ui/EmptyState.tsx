import type { ReactNode } from "react";

/**
 * Every empty screen answers three things: what's missing, why you're
 * seeing this (title/description), and what to do next (action). Never
 * just "No data" — see AGENTS.md "Empty states".
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--gold-light)] bg-white/60 p-10 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
