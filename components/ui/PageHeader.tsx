import type { ReactNode } from "react";

/**
 * Every page should answer, in this order: where am I, what is this page
 * for, what should I do next. `eyebrow` names the section, the title says
 * what this is, `description` is one short plain-language line — not a
 * paragraph — and `action` is the single dominant next step, if there is one.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">{eyebrow}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
