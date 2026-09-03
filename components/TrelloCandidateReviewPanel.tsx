"use client";

import { useActionState, useState } from "react";
import {
  saveTrelloCandidateReviewSettingsAction,
  syncTrelloCandidateReviewCardsAction,
} from "@/app/admin/imports/trello/actions";
import {
  TRELLO_CANDIDATE_REVIEW_ENVIRONMENT,
  TRELLO_CANDIDATE_SYNC_BATCH_SIZE,
  type TrelloCandidateReviewReadiness,
  type TrelloCandidateReviewSettingsInput,
} from "@/lib/trello-candidate-review";

type Props = {
  settings: TrelloCandidateReviewSettingsInput | null;
  readiness: TrelloCandidateReviewReadiness & { source: "admin" | "environment" | "none" };
  mappings: { available: boolean; synced: number; creating: number; unknown: number };
  candidateCount: number;
  candidateSourceLabel: string;
  candidateSourceAvailable: boolean;
  withheldForMissingProvenance: number;
};

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 font-mono text-xs text-[var(--navy)] outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

function Readiness({ label: title, ready }: { label: string; ready: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-[var(--gold-light)] py-2 last:border-b-0">
      <span>{title}</span>
      <span className={`text-xs font-bold uppercase tracking-[0.1em] ${ready ? "text-emerald-700" : "text-amber-800"}`}>
        {ready ? "Configured" : "Needs setup"}
      </span>
    </li>
  );
}

export default function TrelloCandidateReviewPanel({
  settings,
  readiness,
  mappings,
  candidateCount,
  candidateSourceLabel,
  candidateSourceAvailable,
  withheldForMissingProvenance,
}: Props) {
  const [saveState, saveAction, saving] = useActionState(saveTrelloCandidateReviewSettingsAction, null);
  const [syncState, syncAction, syncing] = useActionState(syncTrelloCandidateReviewCardsAction, null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function downloadExport() {
    setExporting(true);
    setExportNote(null);
    try {
      const response = await fetch("/api/admin/imports/trello/export", { cache: "no-store" });
      if (!response.ok) {
        setExportNote(response.status === 401 ? "Please sign in as an administrator again." : "The private review export could not be built.");
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "white-glove-trello-review.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      setExportNote(`Saved ${name}. Keep it inside the review team.`);
    } catch {
      setExportNote("Could not reach the server.");
    } finally {
      setExporting(false);
    }
  }

  const sourceLabel =
    readiness.source === "admin"
      ? "Saved admin scope"
      : readiness.source === "environment"
        ? "Server environment scope"
        : "No Trello scope saved";
  const syncReady = readiness.ready && candidateSourceAvailable;
  const syncReadinessMessage = candidateSourceAvailable
    ? readiness.message
    : "Candidate source setup is required before a sync can be prepared.";

  return (
    <div className="mt-8 space-y-6">
      <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Private workflow</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Review cards, not public listings</h2>
        {candidateSourceAvailable ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            This queue contains {candidateCount} source-attributed editorial candidates from the {candidateSourceLabel}. Each private card keeps its source link and attribution for review.
          </p>
        ) : (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            No source-attributed editorial candidates are available yet. Add a reviewed source pack before preparing an export or enabling a card sync.
          </p>
        )}
        {withheldForMissingProvenance > 0 && (
          <p className="mt-3 text-sm leading-6 text-amber-900">
            {withheldForMissingProvenance} candidate{withheldForMissingProvenance === 1 ? "" : "s"} remain outside this workflow until their source trail is complete.
          </p>
        )}
        <p className="mt-3 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-[var(--navy)]">
          Assigning, moving, or completing a Trello card does not publish a listing. Public publishing remains a separate, explicit review action in White Glove admin.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="border border-[var(--gold-light)] bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Sync readiness</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{sourceLabel}</h2>
          <p className={`mt-3 text-sm leading-6 ${syncReady ? "text-emerald-800" : "text-amber-900"}`}>{syncReadinessMessage}</p>
          {!syncReady && (
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Viewing this page and downloading an internal export do not contact Trello. Sync stays unavailable until every requirement is configured.
            </p>
          )}
          <ul className="mt-4 text-sm text-stone-700">
            <Readiness label="Server credentials" ready={readiness.credentialsConfigured} />
            <Readiness label="Board scope" ready={readiness.boardConfigured} />
            <Readiness label="Review list" ready={readiness.reviewListConfigured} />
            <Readiness label="Done / approved list" ready={readiness.doneListConfigured} />
            <Readiness label="Owner-enabled sync" ready={readiness.enabled} />
            <Readiness label="Private card mapping" ready={readiness.mappingStoreAvailable} />
          </ul>
        </div>

        <div className="border border-[var(--gold-light)] bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Card records</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Idempotent mapping</h2>
          {!mappings.available ? (
            <p className="mt-3 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              Private mapping storage is not ready yet. An export is still available, but sync stays disabled so retries cannot create duplicate cards.
            </p>
          ) : (
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-3">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Mapped</dt>
                <dd className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{mappings.synced}</dd>
              </div>
              <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-3">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Creating</dt>
                <dd className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{mappings.creating}</dd>
              </div>
              <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-3">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Reconcile</dt>
                <dd className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{mappings.unknown}</dd>
              </div>
            </dl>
          )}
          <p className="mt-4 text-sm leading-6 text-stone-600">
            A stable source candidate ID reserves its Trello card before it is created. An unclear network result is held for manual reconciliation instead of retried into a duplicate.
          </p>
        </div>
      </section>

      <section className="border border-[var(--gold-light)] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Configure the non-secret scope</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Choose the exact board and lists</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
          Board and list IDs are not credentials. They can be saved here after the private database is set up, or supplied as a server-environment fallback. The API key and token are never shown or accepted on this page.
        </p>
        {!readiness.configurationStoreAvailable && (
          <p className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            The private configuration table is not ready. Add and set up <code>DATABASE_URL</code> before saving this form. Until then, only the server-environment fallback can describe a scope, and sync remains blocked without a private card mapping.
          </p>
        )}
        <form action={saveAction} className="mt-6 space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className={label}>Board ID</span>
              <input name="boardId" defaultValue={settings?.boardId ?? ""} className={input} disabled={!readiness.configurationStoreAvailable || saving} />
            </label>
            <label className="block">
              <span className={label}>Review list ID</span>
              <input name="reviewListId" defaultValue={settings?.reviewListId ?? ""} className={input} disabled={!readiness.configurationStoreAvailable || saving} />
            </label>
            <label className="block">
              <span className={label}>Done / approved list ID</span>
              <input name="doneListId" defaultValue={settings?.doneListId ?? ""} className={input} disabled={!readiness.configurationStoreAvailable || saving} />
            </label>
          </div>
          <label className="flex items-start gap-3 border border-[var(--gold-light)] bg-[#FAF8F3] p-4 text-sm leading-6 text-stone-700">
            <input name="enabled" type="checkbox" defaultChecked={settings?.enabled ?? false} disabled={!readiness.configurationStoreAvailable || saving} className="mt-1" />
            <span>
              <span className="block font-semibold text-[var(--navy)]">Allow protected candidate-card sync</span>
              <span className="block text-stone-600">Cards still require a signed-in directory administrator to start a small batch, and Trello must verify the board/list relationship first.</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!readiness.configurationStoreAvailable || saving}
              className="min-h-11 bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save scope"}
            </button>
            {saveState && <span className={`text-sm font-semibold ${saveState.ok ? "text-emerald-700" : "text-rose-700"}`}>{saveState.message}</span>}
          </div>
        </form>
      </section>

      <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Export or sync</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Prepare the review queue</h2>
        {candidateCount === 0 ? (
          <p className="mt-3 border-l-4 border-[var(--gold)] bg-[var(--cream)] px-4 py-3 text-sm leading-6 text-stone-700">
            There are no private candidates ready for a Trello review card.
          </p>
        ) : (
          <>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
              Download a private JSON payload at any time. Once readiness is complete, sync uses batches of up to {TRELLO_CANDIDATE_SYNC_BATCH_SIZE} cards so the board remains reviewable and retries remain safe.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={downloadExport}
                disabled={exporting}
                className="min-h-11 border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
              >
                {exporting ? "Building export…" : "Download internal review export"}
              </button>
              <form action={syncAction}>
                <button
                  type="submit"
                  disabled={!readiness.ready || syncing}
                  className="min-h-11 bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                >
                  {syncing ? "Syncing…" : `Sync next ${TRELLO_CANDIDATE_SYNC_BATCH_SIZE} cards`}
                </button>
              </form>
            </div>
            {exportNote && <p className="mt-3 text-sm font-semibold text-[var(--navy)]">{exportNote}</p>}
            {syncState && <p className={`mt-3 text-sm font-semibold ${syncState.ok ? "text-emerald-700" : "text-rose-700"}`}>{syncState.message}</p>}
          </>
        )}
      </section>

      <section className="border border-[var(--gold-light)] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Secure connection checklist</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
          <li>Set <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.apiKey}</code> and <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.token}</code> only in the server environment.</li>
          <li>Set the board, review list, and Done / approved list above. If the database is unavailable, the server fallback names are <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.boardId}</code>, <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.reviewListId}</code>, and <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.doneListId}</code>.</li>
          <li>Enable the workflow above, or use <code>{TRELLO_CANDIDATE_REVIEW_ENVIRONMENT.syncEnabled}=1</code> with the server fallback. No card is created until a directory administrator starts a sync.</li>
          <li>Let the first protected sync verify that both lists belong to the configured board. Assign reviewers and move approved cards to the configured Done list in Trello; then explicitly publish only customer-ready listings from White Glove admin.</li>
        </ol>
      </section>
    </div>
  );
}
