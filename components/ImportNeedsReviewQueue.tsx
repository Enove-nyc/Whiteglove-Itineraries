"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { reviewContentImportCandidateAction } from "@/app/admin/imports/actions";
import type {
  ImportReviewQueue,
  ReviewQueueItem,
  ReviewQueueItemStatus,
  ReviewQueueKind,
} from "@/lib/review-queue";
import { isOpenReviewStatus, reviewQueueKindLabel, reviewQueueStatusLabel } from "@/lib/review-queue";

type StatusFilter = "OPEN" | "ALL" | ReviewQueueItemStatus;
type OriginFilter = "ALL" | "database" | "source_pack";

const countCardClass =
  "w-full min-w-0 rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2";

function CountCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filter the queue to ${label.toLowerCase()}.`}
      className={`${countCardClass} flex flex-col hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-[0_8px_22px_rgba(16, 47, 53,.08)] ${
        active ? "border-[var(--gold)] shadow-[0_8px_22px_rgba(16, 47, 53,.08)]" : ""
      }`}
    >
      {typeof value === "number" && (
        <span className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{value}</span>
      )}
      <span className="block text-xs font-bold uppercase tracking-[0.13em] text-[var(--gold-ink)]">{label}</span>
    </button>
  );
}

function statusClass(status: ReviewQueueItemStatus) {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DUPLICATE") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "REJECTED") return "border-stone-200 bg-stone-50 text-stone-600";
  if (status === "AWAITING_VERIFICATION") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function matches(item: ReviewQueueItem, query: string) {
  const text = [item.name, item.city, item.country, item.destination, item.market, item.batchName]
    .join(" ")
    .toLocaleLowerCase("en");
  return text.includes(query.toLocaleLowerCase("en"));
}

function rowActionLabel(item: ReviewQueueItem) {
  if (item.origin === "database") return "Open review";
  if (item.href.includes("trello")) return "Open Trello review";
  return "Open Bulk imports";
}

export default function ImportNeedsReviewQueue({
  queue,
  initialQuery = "",
}: {
  queue: ImportReviewQueue;
  initialQuery?: string;
}) {
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [kind, setKind] = useState<"ALL" | ReviewQueueKind>("ALL");
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [market, setMarket] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState(100);
  const [focusIndex, setFocusIndex] = useState(0);
  const [skipNote, setSkipNote] = useState("");
  const [queueState, queueAction, queuePending] = useActionState(reviewContentImportCandidateAction, null);
  const queueRef = useRef<HTMLElement | null>(null);

  const markets = useMemo(
    () => [...new Set(queue.items.map((item) => item.market).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
    [queue.items],
  );
  const batches = useMemo(() => {
    const map = new Map(queue.items.map((item) => [item.batchSlug, item.batchName]));
    for (const pack of queue.packs) map.set(pack.slug, pack.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "en"));
  }, [queue.items, queue.packs]);

  const filtered = useMemo(
    () =>
      queue.items.filter((item) => {
        if (status === "OPEN" && !isOpenReviewStatus(item.status)) return false;
        if (status !== "OPEN" && status !== "ALL" && item.status !== status) return false;
        if (kind !== "ALL" && item.kind !== kind) return false;
        if (origin !== "ALL" && item.origin !== origin) return false;
        if (market !== "ALL" && item.market !== market) return false;
        if (batch !== "ALL" && item.batchSlug !== batch) return false;
        return matches(item, query);
      }),
    [queue.items, status, kind, origin, market, batch, query],
  );
  const shown = filtered.slice(0, limit);
  const openItems = filtered.filter((item) => isOpenReviewStatus(item.status));
  const current = openItems[Math.min(focusIndex, Math.max(openItems.length - 1, 0))] ?? null;
  const currentNumber = current ? Math.min(focusIndex, openItems.length - 1) + 1 : 0;

  function applyCountFilter(next: {
    status?: StatusFilter;
    kind?: "ALL" | ReviewQueueKind;
    origin?: OriginFilter;
  }) {
    if (next.status !== undefined) setStatus(next.status);
    if (next.kind !== undefined) setKind(next.kind);
    if (next.origin !== undefined) setOrigin(next.origin);
    setLimit(100);
    setFocusIndex(0);
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="mt-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard
          label="Awaiting verification"
          value={queue.counts.awaitingVerification}
          active={status === "OPEN" && origin === "ALL" && kind === "ALL"}
          onClick={() => applyCountFilter({ status: "OPEN", origin: "ALL", kind: "ALL" })}
        />
        <CountCard
          label="Needs review"
          value={queue.counts.needsReview}
          active={status === "NEEDS_REVIEW" && origin === "ALL"}
          onClick={() => applyCountFilter({ status: "NEEDS_REVIEW", origin: "ALL" })}
        />
        <CountCard
          label="In source packs only"
          value={queue.counts.sourcePackOnly}
          active={origin === "source_pack"}
          onClick={() => applyCountFilter({ status: "OPEN", origin: "source_pack" })}
        />
        <CountCard
          label="Possible duplicates"
          value={queue.counts.duplicates}
          active={status === "DUPLICATE" && origin === "ALL"}
          onClick={() => applyCountFilter({ status: "DUPLICATE", origin: "ALL" })}
        />
      </div>

      <section className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] p-5" aria-labelledby="review-one-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">One at a time</p>
            <h2 id="review-one-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
              Review this record
            </h2>
          </div>
          <p className="text-sm font-semibold text-[var(--navy)]" aria-live="polite">
            {openItems.length === 0 ? "None remaining" : `${currentNumber} of ${openItems.length} remaining`}
          </p>
        </div>
        {current ? (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{current.kindLabel}</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)]">{current.name}</p>
              {current.aliases.length > 0 && (
                <p className="mt-2 text-sm text-stone-600">Also known as {current.aliases.join(", ")}</p>
              )}
              <dl className="mt-4 space-y-2 text-sm text-stone-700">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Place</dt>
                  <dd>
                    {[current.address, current.city, current.region, current.country].filter(Boolean).join(", ") || current.destination}
                  </dd>
                </div>
                {current.coordinates && (
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Coordinates</dt>
                    <dd>{current.coordinates}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Source</dt>
                  <dd>
                    {current.sourceName || "Imported source"}
                    {current.sourceUrl ? (
                      <>
                        {" · "}
                        <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-[var(--gold)] underline-offset-4">
                          Open source
                        </a>
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Status</dt>
                  <dd>
                    {current.statusLabel}
                    {current.publishBlockers > 0 ? ` · ${current.publishBlockers} missing required field${current.publishBlockers === 1 ? "" : "s"}` : ""}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <p className="text-sm leading-6 text-stone-600">
                Approve, edit, reject, or merge on the review screen. Skip leaves this record in the queue and does not
                change the count.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={current.href}
                  className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white"
                >
                  {rowActionLabel(current)}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSkipNote("Skipped. Still in the queue.");
                    setFocusIndex((index) => (openItems.length <= 1 ? 0 : (index + 1) % openItems.length));
                  }}
                  className="inline-flex min-h-11 items-center border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
                >
                  Skip for now
                </button>
                {current.origin === "database" && (
                  <>
                    <form action={queueAction}>
                      <input type="hidden" name="id" value={current.id.replace(/^db:/, "")} />
                      <button
                        type="submit"
                        name="intent"
                        value="reject"
                        disabled={queuePending}
                        onClick={(event) => {
                          if (!window.confirm(`Reject “${current.name}”? It stays in the private audit trail.`)) event.preventDefault();
                        }}
                        className="inline-flex min-h-11 items-center border border-rose-300 px-4 text-xs font-bold uppercase tracking-[0.12em] text-rose-800 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </form>
                    <form action={queueAction}>
                      <input type="hidden" name="id" value={current.id.replace(/^db:/, "")} />
                      <button
                        type="submit"
                        name="intent"
                        value="duplicate"
                        disabled={queuePending}
                        onClick={(event) => {
                          if (!window.confirm(`Mark “${current.name}” as a duplicate? Both records are kept.`)) event.preventDefault();
                        }}
                        className="inline-flex min-h-11 items-center border border-amber-400 px-4 text-xs font-bold uppercase tracking-[0.12em] text-amber-950 disabled:opacity-50"
                      >
                        Duplicate
                      </button>
                    </form>
                  </>
                )}
              </div>
              {queueState && (
                <p className={`text-sm font-semibold ${queueState.ok ? "text-emerald-700" : "text-red-700"}`}>{queueState.message}</p>
              )}
              {skipNote && <p className="text-sm text-stone-600">{skipNote}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-stone-600">Nothing in this filter still needs a decision.</p>
        )}
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(queue.counts.byKind) as ReviewQueueKind[]).map((key) => (
          <CountCard
            key={key}
            label={reviewQueueKindLabel(key)}
            active={kind === key}
            onClick={() => applyCountFilter({ kind: key })}
          />
        ))}
      </div>

      <section className="mt-8 space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Private import packs</h2>
        {queue.packs.length === 0 ? (
          <p className="text-sm text-stone-600">No private import packs were found under data/imports.</p>
        ) : (
          queue.packs.map((pack) => (
            <article key={pack.slug} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{pack.path}</p>
                  <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{pack.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {pack.candidateCount} candidate{pack.candidateCount === 1 ? "" : "s"}
                    {pack.needsReviewCount > 0 ? ` · ${pack.needsReviewCount} awaiting verification` : ""}
                    {pack.inDatabase ? " · already in the database queue" : " · not yet in the database"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{pack.note}</p>
                </div>
                <Link
                  href={pack.href}
                  className="inline-flex min-h-11 shrink-0 items-center border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white"
                >
                  {pack.href.includes("trello") ? "Open Trello review" : "Open Bulk imports"}
                </Link>
              </div>
            </article>
          ))
        )}
      </section>

      <section ref={queueRef} className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <label className="block min-w-0 flex-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
            Search
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(100);
              }}
              placeholder="Name, destination, market…"
              className="mt-1 w-full max-w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy)] outline-none focus:border-[var(--gold)]"
            />
          </label>
          <Filter
            label="Status"
            value={status}
            onChange={(value) => {
              setStatus(value as StatusFilter);
              setLimit(100);
            }}
          >
            <option value="OPEN">Still needs attention</option>
            <option value="ALL">Every state</option>
            <option value="AWAITING_VERIFICATION">{reviewQueueStatusLabel("AWAITING_VERIFICATION")}</option>
            <option value="NEEDS_REVIEW">{reviewQueueStatusLabel("NEEDS_REVIEW")}</option>
            <option value="DUPLICATE">{reviewQueueStatusLabel("DUPLICATE")}</option>
            <option value="REJECTED">{reviewQueueStatusLabel("REJECTED")}</option>
            <option value="PUBLISHED">{reviewQueueStatusLabel("PUBLISHED")}</option>
          </Filter>
          <Filter
            label="Origin"
            value={origin}
            onChange={(value) => {
              setOrigin(value as OriginFilter);
              setLimit(100);
            }}
          >
            <option value="ALL">Every origin</option>
            <option value="database">Staged in database</option>
            <option value="source_pack">Source packs only</option>
          </Filter>
          <Filter
            label="Type"
            value={kind}
            onChange={(value) => {
              setKind(value as typeof kind);
              setLimit(100);
            }}
          >
            <option value="ALL">Every type</option>
            <option value="attraction">{reviewQueueKindLabel("attraction")}</option>
            <option value="stay">{reviewQueueKindLabel("stay")}</option>
            <option value="food">{reviewQueueKindLabel("food")}</option>
            <option value="practical">{reviewQueueKindLabel("practical")}</option>
          </Filter>
          <Filter
            label="Market"
            value={market}
            onChange={(value) => {
              setMarket(value);
              setLimit(100);
            }}
          >
            <option value="ALL">Every market</option>
            {markets.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Filter>
          <Filter
            label="Batch"
            value={batch}
            onChange={(value) => {
              setBatch(value);
              setLimit(100);
            }}
          >
            <option value="ALL">Every batch</option>
            {batches.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </Filter>
        </div>

        {!queue.databaseReady && (
          <p className="mt-5 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-stone-700">
            {queue.configured
              ? "The private database is not ready yet, so staged review rows are unavailable. Source packs below are still private and not public."
              : "The private content database is not connected. Source packs below are still private and not public."}
          </p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-[var(--gold-light)] text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
              <tr>
                <th className="px-3 py-3">Listing</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Market / destination</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id} className="border-b border-[var(--gold-light)] align-top">
                  <td className="px-3 py-4">
                    <p className="font-semibold text-[var(--navy)]">{item.name}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {item.city}, {item.country}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-stone-700">{item.kindLabel}</td>
                  <td className="px-3 py-4 text-stone-700">
                    <p>{item.destination}</p>
                    {item.market && <p className="mt-1 text-xs text-stone-500">{item.market}</p>}
                  </td>
                  <td className="px-3 py-4 text-stone-700">{item.batchName}</td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                      {item.statusLabel}
                    </span>
                    {item.publishBlockers > 0 && (
                      <p className="mt-1 text-xs text-stone-500">
                        {item.publishBlockers} blocker{item.publishBlockers === 1 ? "" : "s"}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white"
                    >
                      {rowActionLabel(item)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && <p className="mt-6 text-sm text-stone-600">No candidates match these filters.</p>}
        {filtered.length > shown.length && (
          <button
            type="button"
            onClick={() => setLimit((current) => current + 100)}
            className="mt-6 min-h-11 border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Show 100 more
          </button>
        )}
      </section>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 w-full text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] xl:w-44">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full max-w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy)] outline-none focus:border-[var(--gold)]"
      >
        {children}
      </select>
    </label>
  );
}
