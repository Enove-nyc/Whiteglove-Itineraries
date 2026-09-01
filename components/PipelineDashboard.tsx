"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pipelineStats, TRIP_STAGE_LABEL, TRIP_STAGE_ORDER, type TripStage } from "@/data/trip-pipeline";
import { formatCents } from "@/data/trip-payments";
import { useDeviceClock } from "@/components/TripProgressStrip";
import { followAlong, tripProgress, type FollowStop } from "@/lib/trip-progress";

/** One day of a traveling trip, as the pipeline API sends it — see TravelDay in app/api/account/pipeline/route.ts. */
type TravelDay = { date: string; activities: FollowStop[]; lodging?: { name: string; address?: string } };

type Row = {
  id: string;
  name: string;
  client: string;
  advisor: string;
  startDate: string;
  endDate: string;
  stage: TripStage;
  needsAttention: boolean;
  shareId?: string;
  unread: boolean;
  updatedAt: string;
  /** What this trip still owes, when a balance has actually been set up. */
  outstandingCents?: number;
  currency?: string;
  /** Only present for a trip in the "traveling" stage — see travelDaysFor server-side. */
  travelDays?: TravelDay[];
  /** What the advisor recorded earning on this trip — Advisor Pro only. */
  commissionCents?: number;
  commissionCurrency?: string;
};

type View = "board" | "upcoming" | "traveling" | "awaiting_approval" | "attention" | "unread";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "board", label: "Board" },
  { id: "upcoming", label: "Upcoming" },
  { id: "traveling", label: "Currently traveling" },
  { id: "awaiting_approval", label: "Awaiting approval" },
  { id: "attention", label: "Changes requiring attention" },
  { id: "unread", label: "Unread messages" },
];

const cardBase = "rounded-xl border border-[var(--gold-light)] bg-white p-4 text-sm";

function rowsFor(view: View, rows: Row[], today: string): Row[] {
  switch (view) {
    case "upcoming":
      return rows.filter((r) => r.stage === "confirmed" && r.startDate > today);
    case "traveling":
      return rows.filter((r) => r.stage === "traveling");
    case "awaiting_approval":
      return rows.filter((r) => r.stage === "awaiting_approval");
    case "attention":
      return rows.filter((r) => r.needsAttention);
    case "unread":
      return rows.filter((r) => r.unread);
    default:
      return rows;
  }
}

/**
 * What the advisor recorded earning on this trip, and a way to change it.
 *
 * Advisor Pro only — the caller decides whether to render this at all, the
 * same way it decides whether to draw the business-at-a-glance strip.
 * `onSave(null)` clears the amount entirely rather than storing a zero.
 */
function CommissionField({
  cents,
  currency,
  onSave,
}: {
  cents?: number;
  currency?: string;
  onSave: (cents: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cents !== undefined ? String(cents / 100) : "");

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = draft.trim() === "" ? null : Math.round(Number(draft) * 100);
          if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
          onSave(parsed);
          setEditing(false);
        }}
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Commission $</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Commission earned"
          autoFocus
          className="min-h-[32px] w-24 rounded-md border border-[var(--gold-light)] bg-white px-2 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
        />
        <button type="submit" className="rounded-full border border-[var(--navy)] bg-[var(--navy)] px-2.5 py-1 text-[11px] font-bold text-white">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-bold text-stone-500">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(cents !== undefined ? String(cents / 100) : "");
        setEditing(true);
      }}
      className="mt-2 text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
    >
      {cents !== undefined ? `Commission: ${formatCents(cents, currency)}` : "Add commission"}
    </button>
  );
}

function RowCard({
  row,
  onOpen,
  onStage,
  showAnalytics,
  onCommission,
}: {
  row: Row;
  onOpen: (path: string) => void;
  onStage?: (stage: "inquiry" | "planning") => void;
  showAnalytics: boolean;
  onCommission: (cents: number | null) => void;
}) {
  return (
    <div className={cardBase}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--navy)]">{row.client || row.name}</p>
          {row.client && <p className="text-xs text-stone-500">{row.name}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {row.needsAttention && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Changes requested
            </span>
          )}
          {row.unread && (
            <span className="rounded-full bg-[var(--navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Unread
            </span>
          )}
        </div>
      </div>
      {(row.startDate || row.endDate) && (
        <p className="mt-2 text-xs text-stone-500">
          {row.startDate} {row.endDate ? `→ ${row.endDate}` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => onOpen("/itinerary")} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          Open itinerary
        </button>
        {/* Carry the trip in the address so the proposal and form screens build
            and read THIS trip's, not whichever one is otherwise "open". */}
        <button type="button" onClick={() => onOpen(`/proposal?trip=${row.id}`)} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          Proposal
        </button>
        <button type="button" onClick={() => onOpen(`/forms?trip=${row.id}`)} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          Forms
        </button>
        <button type="button" onClick={() => onOpen(`/history?trip=${row.id}`)} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          History
        </button>
        {row.shareId && (
          <a href={`/advisor?trip=${row.id}`} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
            Open in the app
          </a>
        )}
      </div>
      {showAnalytics && <CommissionField cents={row.commissionCents} currency={row.commissionCurrency} onSave={onCommission} />}
      {onStage && (row.stage === "inquiry" || row.stage === "planning") && (
        <div className="mt-3 flex gap-2 border-t border-[var(--gold-light)] pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Mark as</span>
          <button
            type="button"
            onClick={() => onStage("inquiry")}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${row.stage === "inquiry" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-stone-300 text-stone-500"}`}
          >
            Inquiry
          </button>
          <button
            type="button"
            onClick={() => onStage("planning")}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${row.stage === "planning" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-stone-300 text-stone-500"}`}
          >
            Planning
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A traveling client's row, showing where they are RIGHT NOW rather than
 * just their dates.
 *
 * Reuses the same followAlong/tripProgress logic already driving the
 * client-facing app and the advisor's own live planner view
 * (components/TripProgressStrip.tsx) — read here off the ADVISOR's own
 * device clock, since it is the advisor's screen, not the traveler's.
 */
function TravelingRowCard({ row, onOpen }: { row: Row; onOpen: (path: string) => void }) {
  const { today, nowMinutes } = useDeviceClock();
  const progress = tripProgress({ startDate: row.startDate, endDate: row.endDate, today });
  const todayStops = progress.followDate ? row.travelDays?.find((d) => d.date === progress.followDate) : undefined;
  const follow = todayStops ? followAlong({ stops: todayStops.activities, nowMinutes }) : null;

  return (
    <div className={cardBase}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--navy)]">{row.client || row.name}</p>
          {row.client && <p className="text-xs text-stone-500">{row.name}</p>}
        </div>
        {progress.phase === "during" && (
          <span className="rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gold-ink)]">
            Day {progress.dayNumber} of {progress.totalDays}
          </span>
        )}
      </div>
      {follow ? (
        <p className="mt-2 text-sm leading-6 text-stone-600">{follow.says}</p>
      ) : (
        <p className="mt-2 text-sm text-stone-500">{row.startDate} → {row.endDate}</p>
      )}
      {todayStops?.lodging && (
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Tonight: {todayStops.lodging.name}
          {todayStops.lodging.address ? ` — ${todayStops.lodging.address}` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => onOpen("/itinerary")} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          Open itinerary
        </button>
        {row.shareId && (
          <a href={`/advisor?trip=${row.id}`} className="text-xs font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
            Open in the app
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Every client trip, one row each. Reads /api/account/pipeline, which derives
 * each trip's stage from its own proposal status and dates rather than a
 * second status kept in sync by hand — see data/trip-pipeline.ts.
 *
 * OPENING A TRIP switches which trip is active for the account (the same
 * "switch" action the trip list already uses) and then goes to the page that
 * always works on the active trip — the itinerary builder and the proposal
 * builder do not yet take a trip id in the URL, so this is how a many-trip
 * business reaches trip #40's proposal without that plumbing existing twice.
 */
export default function PipelineDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [today, setToday] = useState("");
  // The business-at-a-glance strip is Advisor Pro — read off the same
  // response the rows already come from, not a second request.
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("board");
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/pipeline", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          setError(data?.error || "Could not load the pipeline.");
        } else {
          setRows(data?.rows || []);
          setToday(data?.today || "");
          setShowAnalytics(Boolean(data?.showAnalytics));
        }
      } catch {
        if (active) setError("Could not reach the account service.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => rowsFor(view, rows, today), [view, rows, today]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, rowsFor(v.id, rows, today).length])), [rows, today]);

  // The business, at a glance — above the row-by-row board, not instead of
  // it. See pipelineStats in data/trip-pipeline.ts for the actual rules,
  // kept pure and tested there rather than inline here.
  const stats = useMemo(() => pipelineStats(rows, today), [rows, today]);

  async function openTrip(id: string, path: string) {
    setSwitching(id);
    try {
      await fetch("/api/account/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", id }),
      });
      router.push(path);
    } finally {
      setSwitching(null);
    }
  }

  async function setStage(id: string, stage: "inquiry" | "planning") {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, stage } : r)));
    await fetch("/api/account/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: id, stage }),
    }).catch(() => undefined);
  }

  async function saveCommission(id: string, cents: number | null) {
    const res = await fetch("/api/account/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "commission", id, commissionCents: cents }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!data?.ok) return;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, commissionCents: cents ?? undefined, commissionCurrency: cents === null ? undefined : r.commissionCurrency ?? "USD" } : r)),
    );
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="text-sm font-semibold text-red-700">{error}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm leading-6 text-stone-600">
        No client trips yet. Once you plan a trip for a client — name them on a trip&apos;s Details — it shows up here.
      </p>
    );
  }

  return (
    <div>
      {showAnalytics && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardBase}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Active client trips</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{stats.activeCount}</p>
          </div>
          <div className={cardBase}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Traveling now</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{counts.traveling}</p>
          </div>
          <div className={cardBase}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Departing in 30 days</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{stats.departingSoon}</p>
          </div>
          <div className={cardBase}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Outstanding</p>
            {stats.outstandingByCurrency.length === 0 ? (
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{formatCents(0)}</p>
            ) : (
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {stats.outstandingByCurrency.map(([currency, cents]) => formatCents(cents, currency)).join(" · ")}
              </p>
            )}
          </div>
          <div className={cardBase}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Commission earned</p>
            {stats.commissionByCurrency.length === 0 ? (
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{formatCents(0)}</p>
            ) : (
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {stats.commissionByCurrency.map(([currency, cents]) => formatCents(cents, currency)).join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-[var(--gold-light)] pb-4">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${
              view === v.id ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] bg-white text-[var(--navy)] hover:border-[var(--gold)]"
            }`}
          >
            {v.label}
            {v.id !== "board" && counts[v.id] > 0 ? ` (${counts[v.id]})` : ""}
          </button>
        ))}
      </div>

      {view === "board" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TRIP_STAGE_ORDER.map((stage) => {
            const inStage = rows.filter((r) => r.stage === stage);
            if (inStage.length === 0) return null;
            return (
              <div key={stage} className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                  {TRIP_STAGE_LABEL[stage]} <span className="font-normal text-stone-400">({inStage.length})</span>
                </p>
                <div className="flex flex-col gap-3">
                  {inStage.map((row) => (
                    <RowCard
                      key={row.id}
                      row={row}
                      onOpen={(path) => (switching ? undefined : openTrip(row.id, path))}
                      onStage={(s) => setStage(row.id, s)}
                      showAnalytics={showAnalytics}
                      onCommission={(cents) => saveCommission(row.id, cents)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing here right now.</p>
          ) : (
            filtered.map((row) =>
              view === "traveling" && row.travelDays ? (
                <TravelingRowCard key={row.id} row={row} onOpen={(path) => (switching ? undefined : openTrip(row.id, path))} />
              ) : (
                <RowCard
                  key={row.id}
                  row={row}
                  onOpen={(path) => (switching ? undefined : openTrip(row.id, path))}
                  showAnalytics={showAnalytics}
                  onCommission={(cents) => saveCommission(row.id, cents)}
                />
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}
