"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { anchoredStyle, measureAnchor, useAnchorTracking, type AnchorBox } from "@/lib/anchored-panel";

// A date field that looks like the rest of the site.
//
// The browser's own date control cannot be styled. Every browser draws its own
// white box with bold black type and its own calendar popup, which is why the
// dates were the one part of the planner that looked like it came from
// somewhere else. Chrome will not let CSS near the calendar at all, so the only
// way to have the site's cream, navy and gold on a calendar is to draw one.
//
// This is that calendar. It keeps everything the native control gave us — a
// `min` that greys out impossible days, arrow keys, typing a date straight in,
// the same YYYY-MM-DD value going in and out — and adds nothing clever.
//
// On a phone it still uses the native control underneath, because a
// hand-written popover is worse than the one built into the operating system
// when you are choosing with a thumb.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(iso: string) {
  const m = ISO.exec(iso ?? "");
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** How the date reads to a person: "Tue 11 Aug 2026". */
export function readableDate(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  // Noon UTC so a daylight-saving shift cannot move the weekday.
  const at = new Date(Date.UTC(p.y, p.m, p.d, 12));
  return at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
}

function firstWeekday(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1, 12)).getUTCDay();
}

function todayIso() {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

export default function DateField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className = "",
  ariaLabel,
  id,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * For a form posted the ordinary way rather than read from React state —
   * the admin's server actions, which take a FormData. Without it those forms
   * had to use a bare `input type="date"`, which is exactly the control this
   * component exists to replace.
   */
  name?: string;
  /** Earliest allowed date, YYYY-MM-DD. Days before it cannot be chosen. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => parts(value) ?? parts(min ?? "") ?? parts(todayIso())!);
  const boxRef = useRef<HTMLDivElement>(null);

  // Which month the calendar shows. Set when it opens rather than kept in step
  // with the value, because it only matters while it is open — and something
  // else may well have moved the value in the meantime (the end date being
  // carried along by the start, a flight lookup filling the form in).
  const openAt = () => setCursor(parts(value) ?? parts(min ?? "") ?? parts(todayIso())!);

  // Where the calendar goes. Measured against the viewport and drawn with
  // `position: fixed`, because the booking panel hides its overflow and used
  // to cut 181px off the bottom of the month. See lib/anchored-panel.ts.
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const remeasure = useCallback(() => setAnchor(measureAnchor(boxRef.current, 360)), []);
  useAnchorTracking(open, remeasure);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grid = useMemo(() => {
    const total = daysInMonth(cursor.y, cursor.m);
    const lead = firstWeekday(cursor.y, cursor.m);
    const cells: Array<string | null> = Array(lead).fill(null);
    for (let d = 1; d <= total; d += 1) cells.push(isoOf(cursor.y, cursor.m, d));
    return cells;
  }, [cursor.y, cursor.m]);

  const blocked = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const step = (by: number) => {
    const m = cursor.m + by;
    setCursor({ ...cursor, y: cursor.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  const choose = (iso: string) => {
    if (blocked(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      {/* The real value, so a form still validates and submits it. On a phone
          this is the control people actually get — the OS picker beats
          anything drawn here when you are choosing with a thumb. */}
      <input
        id={id}
        name={name}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} wg-date-native`}
      />

      {/* The site's own calendar, over the top on anything with a pointer. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            openAt();
            remeasure();
          }
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${readableDate(value) || "choose a date"}` : `Choose a date${value ? `, currently ${readableDate(value)}` : ""}`}
        className={`${className} wg-date-face absolute inset-0 flex min-h-11 items-center justify-between text-left disabled:opacity-60`}
      >
        <span className={value ? "text-[var(--navy)]" : "text-stone-400"}>{readableDate(value) || "Choose a date"}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="ml-2 h-4 w-4 shrink-0 text-[var(--gold-ink)]">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4M17 3v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          style={anchoredStyle(anchor)}
          className="z-[var(--wg-z-popover)] w-[19rem] max-w-[92vw] border border-[var(--gold)] bg-[#FAF8F3] p-3 shadow-[0_16px_36px_rgba(16, 47, 53,.18)]"
        >
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="min-h-11 min-w-11 px-2 text-[var(--navy)] transition hover:text-[var(--gold-ink)]">
              ‹
            </button>
            <p className="font-[family-name:var(--font-display)] text-lg text-[var(--navy)]">
              {MONTHS[cursor.m]} {cursor.y}
            </p>
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="min-h-11 min-w-11 px-2 text-[var(--navy)] transition hover:text-[var(--gold-ink)]">
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-stone-400">
                {d}
              </span>
            ))}
            {grid.map((iso, i) =>
              iso === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  key={iso}
                  type="button"
                  onClick={() => choose(iso)}
                  disabled={blocked(iso)}
                  aria-current={iso === value ? "date" : undefined}
                  className={`min-h-[34px] text-sm transition ${
                    iso === value
                      ? "bg-[var(--navy)] font-bold text-white"
                      : blocked(iso)
                        ? "text-stone-300"
                        : iso === todayIso()
                          ? "border border-[var(--gold)] text-[var(--navy)] hover:bg-[var(--cream-deep)]"
                          : "text-[var(--navy)] hover:bg-[var(--cream-deep)]"
                  }`}
                >
                  {Number(iso.slice(8))}
                </button>
              ),
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--gold-light)] pt-2">
            <button
              type="button"
              onClick={() => choose(min && todayIso() < min ? min : todayIso())}
              className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
            >
              {min && todayIso() < min ? "Earliest" : "Today"}
            </button>
            {!required && value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 underline decoration-stone-300 underline-offset-4"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
