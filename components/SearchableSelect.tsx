"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalize } from "@/lib/place-search";

export type SearchableOption = {
  value: string;
  /** The main line — what the person is looking for. */
  label: string;
  /** A second line: country, category, whatever tells two similar entries apart. */
  hint?: string;
  /** Extra words that should match but need not be shown. */
  keywords?: string;
};

/**
 * A picker for lists too long to scroll.
 *
 * A native <select> holding 146 batei hachaim is a scroll, not a choice: you
 * cannot type "Lizhensk" and land on it, you hunt. This types to filter,
 * arrow-keys to move, Enter to choose, Escape to close — and it shows how many
 * of the total are matching, so an empty result reads as "nothing matches"
 * rather than "it broke".
 *
 * Native <select> is still the right control for short, fixed lists — statuses,
 * categories, a handful of days. This is for the long ones.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  label,
  id,
  className = "",
  emptyText = "Nothing matches that.",
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    // Folded, so typing a town without its accent still finds it.
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`).includes(q));
  }, [options, query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(matches.length - 1, next));
      });
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        choose(matches[active].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const base =
    "w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

  return (
    <div ref={boxRef} className="relative">
      {label && (
        <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? "picker"}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        className={`${label ? "mt-1.5 " : ""}${base} ${className}`}
        value={open ? query : selected?.label ?? ""}
        placeholder={selected ? selected.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 text-[var(--gold-ink)]">▾</span>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 border border-[var(--gold)] bg-[#FAF8F3] shadow-[0_16px_36px_rgba(16, 47, 53,.16)]">
          <p className="border-b border-[var(--gold-light)] px-3 py-1.5 text-[11px] text-stone-500">
            {matches.length === options.length ? "Choose an option" : "Filtered options"}
          </p>
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-stone-600">{emptyText}</p>
          ) : (
            <ul ref={listRef} id={`${id ?? "picker"}-list`} role="listbox" className="max-h-72 overflow-auto">
              {matches.map((o, i) => (
                <li key={o.value} data-index={i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(o.value);
                    }}
                    className={`block w-full px-3 py-2 text-left transition ${
                      i === active ? "bg-[var(--cream-deep)]" : ""
                    } ${o.value === value ? "font-semibold" : ""}`}
                  >
                    <span className="block text-sm text-[var(--navy)]">{o.label}</span>
                    {o.hint && <span className="block text-xs text-stone-500">{o.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
