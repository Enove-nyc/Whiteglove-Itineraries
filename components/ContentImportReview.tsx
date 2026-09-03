"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { ContentImportDashboard, ContentImportCandidateView, ContentImportStatus } from "@/lib/content-imports";
import { stageBuiltInContentBatchAction } from "@/app/admin/imports/actions";
import { contentImportCandidatePath } from "@/lib/bulk-content";

const statusLabel: Record<ContentImportStatus, string> = {
  NEEDS_REVIEW: "Needs review",
  DUPLICATE: "Possible duplicate",
  REJECTED: "Rejected",
  PUBLISHED: "Published",
};

function statusClass(status: ContentImportStatus) {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DUPLICATE") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "REJECTED") return "border-stone-200 bg-stone-50 text-stone-600";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function candidateMatches(candidate: ContentImportCandidateView, query: string) {
  const text = [candidate.name, candidate.city, candidate.region, candidate.country, candidate.category, candidate.sourceName, candidate.sourceId]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en");
  return text.includes(query.toLocaleLowerCase("en"));
}

export default function ContentImportReview({ dashboard }: { dashboard: ContentImportDashboard }) {
  const [status, setStatus] = useState<"ALL" | ContentImportStatus>("ALL");
  const [kind, setKind] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const [stageState, stageAction, staging] = useActionState(stageBuiltInContentBatchAction, null);

  const filtered = useMemo(
    () => dashboard.candidates.filter((candidate) =>
      (status === "ALL" || candidate.status === status) &&
      (kind === "ALL" || candidate.kind === kind) &&
      (batch === "ALL" || candidate.batchSlug === batch) &&
      candidateMatches(candidate, query),
    ),
    [dashboard.candidates, status, kind, batch, query],
  );
  const shown = filtered.slice(0, limit);
  const kinds = [...new Set(dashboard.candidates.map((candidate) => candidate.kind))];

  return (
    <section className="mt-8">
      <section className="mt-8 space-y-4">
        {dashboard.batches.map((source) => (
          <article key={source.slug} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Source package</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{source.name}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {source.sourceName} · {source.license}
                </p>
                {/* A package compiled from dozens of official sources has no one
                    set of terms to link to, and linking one of sixty-five would
                    say the other sixty-four were it. Those packages leave the
                    URL empty; every candidate below still carries its own real
                    source link, which is where the provenance is. */}
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Attribution: {source.attribution}
                  {source.sourceUrl ? (
                    <>
                      . <a className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4" href={source.sourceUrl} target="_blank" rel="noreferrer">Read source terms ↗</a>
                    </>
                  ) : (
                    <> — each candidate below links to the source it came from.</>
                  )}
                </p>
              </div>
              {source.stagedCandidates < source.packageCandidates && (
                dashboard.databaseReady ? (
                  <form action={stageAction}>
                    <input type="hidden" name="batchSlug" value={source.slug} />
                    <button type="submit" disabled={staging || source.packageCandidates === 0} className="min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
                      {staging ? "Staging…" : `Stage ${source.packageCandidates} candidates`}
                    </button>
                  </form>
                ) : (
                  <p className="max-w-sm border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-stone-700">
                    Connect and set up the private content database before these candidates can enter the review queue.
                  </p>
                )
              )}
            </div>
          </article>
        ))}
        {stageState && (
          <p className={`border-l-4 px-4 py-3 text-sm leading-6 ${stageState.ok ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-rose-500 bg-rose-50 text-rose-900"}`}>
            {stageState.message}
          </p>
        )}
      </section>

      <section className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <label className="block min-w-0 flex-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
            Search candidates
            <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(100); }} placeholder="Name, city, source ID…" className="mt-1 w-full max-w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy)] outline-none focus:border-[var(--gold)]" />
          </label>
          <Filter label="Status" value={status} onChange={(value) => { setStatus(value as "ALL" | ContentImportStatus); setLimit(100); }}>
            <option value="ALL">Every state</option>
            {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Filter>
          <Filter label="Type" value={kind} onChange={(value) => { setKind(value); setLimit(100); }}>
            <option value="ALL">Every type</option>
            {kinds.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </Filter>
          <Filter label="Batch" value={batch} onChange={(value) => { setBatch(value); setLimit(100); }}>
            <option value="ALL">Every batch</option>
            {dashboard.batches.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </Filter>
        </div>

        {!dashboard.databaseReady && dashboard.candidates.length > 0 && (
          <p className="mt-5 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-stone-700">
            This is a source-package preview. It is not public content and has not been written to the database.
          </p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-[var(--gold-light)] text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
              <tr>
                <th className="px-3 py-3">Listing</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((candidate) => (
                <tr key={candidate.id} className="border-b border-[var(--gold-light)] align-top">
                  <td className="px-3 py-4">
                    <p className="font-semibold text-[var(--navy)]">{candidate.name}</p>
                    {candidate.category && <p className="mt-1 text-xs text-stone-500">{candidate.category.replace(/_/g, " ")}</p>}
                  </td>
                  <td className="px-3 py-4 text-stone-700">{candidate.kindLabel}</td>
                  <td className="px-3 py-4 text-stone-700">{[candidate.city, candidate.region, candidate.country].filter(Boolean).join(", ")}</td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${statusClass(candidate.status)}`}>{statusLabel[candidate.status]}</span>
                    {candidate.publishBlockers.length > 0 && <p className="mt-1 text-xs text-stone-500">{candidate.publishBlockers.length} blocker{candidate.publishBlockers.length === 1 ? "" : "s"}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
                      {candidate.sourceName} ↗
                    </a>
                    <p className="mt-1 text-xs text-stone-500">{candidate.sourceId}</p>
                  </td>
                  <td className="px-3 py-4">
                    {dashboard.databaseReady ? (
                      <Link href={contentImportCandidatePath(candidate.sourceId, candidate.id)} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">Open review →</Link>
                    ) : (
                      <span className="text-xs text-stone-500">Stage first</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="mt-6 text-sm text-stone-600">No candidates match these filters.</p>}
        {filtered.length > shown.length && (
          <button type="button" onClick={() => setLimit((current) => current + 100)} className="mt-6 min-h-11 border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
            Show 100 more
          </button>
        )}
      </section>
    </section>
  );
}

function Filter({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 w-full text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)] xl:w-44">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full max-w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy)] outline-none focus:border-[var(--gold)]">
        {children}
      </select>
    </label>
  );
}
