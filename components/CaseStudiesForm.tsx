"use client";

import { useActionState, useEffect, useState } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import type { CaseStudy } from "@/data/case-studies";
import { caseStudyCompleteness, caseStudyIsPublic } from "@/data/case-studies";
import {
  deleteCaseStudyAction,
  publishCaseStudyAction,
  reorderCaseStudyAction,
  saveCaseStudyAction,
  unpublishCaseStudyAction,
} from "@/app/admin/settings/proof/actions";

/**
 * Case studies as a LIST and a POP-UP — not one long form left open above them.
 *
 * The eleven-field editor used to sit open at the top of the page whether you
 * were adding one or only glancing at the list, so the page was a form you
 * scrolled past to reach anything. It is now the list of studies by name;
 * "Add a case study" and pressing a study both open the same form in a pop-up,
 * and it closes itself the moment a save goes through. The publish, order and
 * delete controls stay on the row, where they act on that one study.
 *
 * Genuine case studies only. Nothing is seeded. Incomplete / unpermitted /
 * unapproved records never reach the public site.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const cap = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

type Draft = {
  id: string;
  attribution: string;
  anonymised: boolean;
  location: string;
  tripType: string;
  quote: string;
  tripRequest: string;
  whatSolved: string;
  outcome: string;
  itineraryHref: string;
  permissionRecorded: boolean;
  approved: boolean;
  sortOrder: number;
};

function emptyDraft(): Draft {
  return {
    id: "",
    attribution: "",
    anonymised: false,
    location: "",
    tripType: "",
    quote: "",
    tripRequest: "",
    whatSolved: "",
    outcome: "",
    itineraryHref: "",
    permissionRecorded: false,
    approved: false,
    sortOrder: 0,
  };
}

function fromStudy(study: CaseStudy): Draft {
  return {
    id: study.id,
    attribution: study.attribution,
    anonymised: study.anonymised,
    location: study.location,
    tripType: study.tripType,
    quote: study.quote,
    tripRequest: study.tripRequest,
    whatSolved: study.whatSolved,
    outcome: study.outcome,
    itineraryHref: study.itineraryHref,
    permissionRecorded: study.permissionRecorded,
    approved: study.approved,
    sortOrder: study.sortOrder,
  };
}

export default function CaseStudiesForm({
  studies,
  storeReady,
}: {
  studies: CaseStudy[];
  storeReady: boolean;
}) {
  const [saveState, save, saving] = useActionState(saveCaseStudyAction, null);
  const [deleteState, del, deleting] = useActionState(deleteCaseStudyAction, null);
  const [publishState, publish, publishing] = useActionState(publishCaseStudyAction, null);
  const [unpublishState, unpublish, unpublishing] = useActionState(unpublishCaseStudyAction, null);
  const [reorderState, reorder, reordering] = useActionState(reorderCaseStudyAction, null);
  const [editing, setEditing] = useState<Draft | null>(null);

  const completeness = editing ? caseStudyCompleteness(editing) : null;
  const listBusy = deleting || publishing || unpublishing || reordering;
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => setEditing(null));

  // A save that went through closes the pop-up; the list below refreshes on its
  // own from the server action's revalidate.
  useEffect(() => {
    if (saveState?.ok) setEditing(null);
  }, [saveState]);

  if (!storeReady) {
    return (
      <p className="mt-8 border border-[var(--gold-light)] bg-[#fcfaf6] px-4 py-3 text-sm leading-6 text-stone-600">
        The private store is not connected. Case studies cannot be saved yet — and nothing invented is shown publicly.
      </p>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(emptyDraft())}
          className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
        >
          Add a case study
        </button>
        {(deleteState || publishState || unpublishState || reorderState) && (
          <span
            className={`text-sm font-semibold ${
              (deleteState ?? publishState ?? unpublishState ?? reorderState)?.ok ? "text-emerald-700" : "text-red-700"
            }`}
            role="status"
          >
            {(deleteState ?? publishState ?? unpublishState ?? reorderState)?.message}
          </span>
        )}
      </div>

      {/* The list: a study per row, pressable to edit. The eleven fields live in
          the pop-up, not stacked down the page. */}
      {studies.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--gold-light)] bg-[#fcfaf6] p-5 text-sm leading-6 text-stone-600">
          None yet — and that is correct. Do not invent any. Press <strong className="text-[var(--navy)]">Add a case
          study</strong> when a real client has permitted one.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)]">
          {studies.map((study, index) => {
            const publicReady = caseStudyIsPublic(study);
            return (
              /* STACKED ON A PHONE, SIDE BY SIDE FROM sm.
                 It was one flex row with flex-wrap, which sounds like it
                 handles narrow screens and does not: the four actions have a
                 fixed width and never shrink, so the flex-1 title collapsed to
                 nothing instead of wrapping. On a phone the rows read "S…" and
                 "F…" with the DRAFT pill sitting on top of "Move up" and
                 Delete pushed off the edge under the assistant button.
                 Measured on the owner's phone, not guessed. */
              <li key={study.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => setEditing(fromStudy(study))}
                  className="w-full min-w-0 text-left sm:flex-1"
                >
                  {/* WRAPS rather than truncating: a name and its state pill
                      squeezed onto one line is what produced "S…". */}
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--navy)] underline decoration-[var(--gold-light)] decoration-2 underline-offset-4">
                      {study.attribution || "Untitled study"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                        publicReady
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-stone-300 bg-stone-50 text-stone-600"
                      }`}
                    >
                      {publicReady ? "Public" : "Draft"}
                    </span>
                  </span>
                  {study.tripRequest && (
                    // Two lines on a phone, then clipped — a single truncated
                    // line at this width shows about three words.
                    <span className="mt-1 block max-w-2xl text-xs leading-5 text-stone-500 line-clamp-2">
                      {study.tripRequest}
                    </span>
                  )}
                </button>

                {/* gap-x-4 so two underlined words are not mistaken for one
                    link, and a real 44px target on touch — the same rule the
                    public side follows. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <form action={reorder}>
                    <input type="hidden" name="id" value={study.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" disabled={listBusy || index === 0} className="inline-flex min-h-11 items-center text-xs font-semibold text-stone-600 underline disabled:opacity-40 sm:min-h-0">
                      Move up
                    </button>
                  </form>
                  <form action={reorder}>
                    <input type="hidden" name="id" value={study.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button type="submit" disabled={listBusy || index === studies.length - 1} className="inline-flex min-h-11 items-center text-xs font-semibold text-stone-600 underline disabled:opacity-40 sm:min-h-0">
                      Move down
                    </button>
                  </form>
                  {publicReady ? (
                    <form action={unpublish}>
                      <input type="hidden" name="id" value={study.id} />
                      <button type="submit" disabled={listBusy} className="inline-flex min-h-11 items-center text-xs font-semibold text-amber-800 underline disabled:opacity-50 sm:min-h-0">
                        Unpublish
                      </button>
                    </form>
                  ) : (
                    <form action={publish}>
                      <input type="hidden" name="id" value={study.id} />
                      <button
                        type="submit"
                        disabled={listBusy || Boolean(caseStudyCompleteness(study))}
                        className="inline-flex min-h-11 items-center text-xs font-semibold text-emerald-800 underline disabled:opacity-50 sm:min-h-0"
                        title={caseStudyCompleteness(study) ?? undefined}
                      >
                        Publish
                      </button>
                    </form>
                  )}
                  <form action={del}>
                    <input type="hidden" name="id" value={study.id} />
                    <button type="submit" disabled={listBusy} className="inline-flex min-h-11 items-center text-xs font-semibold text-red-700 underline disabled:opacity-50 sm:min-h-0">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* The pop-up — the same form for adding and for editing. */}
      {editing && (
        <div
          className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-study-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(23,45,82,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="case-study-modal-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {editing.id ? "Edit case study" : "Add a case study"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Close
              </button>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Only publish what a real client permitted. This is not the sample itinerary — that page is an illustrative
              deliverable; these are genuine trip outcomes. Approval is refused until request, what you solved, outcome, and
              permission are all filled in.
            </p>

            <form action={save} className="mt-5 space-y-4">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="sortOrder" value={String(editing.sortOrder)} />
              <label className="block">
                <span className={cap}>Attribution</span>
                <input
                  name="attribution"
                  className={input}
                  value={editing.attribution}
                  onChange={(e) => setEditing((d) => (d ? { ...d, attribution: e.target.value } : d))}
                  placeholder="Name they agreed to, or “A family from Manchester”"
                  autoFocus
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="anonymised"
                  checked={editing.anonymised}
                  onChange={(e) => setEditing((d) => (d ? { ...d, anonymised: e.target.checked } : d))}
                />
                Anonymised (name withheld on the public page)
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={cap}>Location (optional)</span>
                  <input
                    name="location"
                    className={input}
                    value={editing.location}
                    onChange={(e) => setEditing((d) => (d ? { ...d, location: e.target.value } : d))}
                    placeholder="Rome · Italy"
                  />
                </label>
                <label className="block">
                  <span className={cap}>Trip type (optional)</span>
                  <input
                    name="tripType"
                    className={input}
                    value={editing.tripType}
                    onChange={(e) => setEditing((d) => (d ? { ...d, tripType: e.target.value } : d))}
                    placeholder="Family city break"
                  />
                </label>
              </div>
              <label className="block">
                <span className={cap}>Quote (optional)</span>
                <textarea
                  name="quote"
                  rows={2}
                  className={input}
                  value={editing.quote}
                  onChange={(e) => setEditing((d) => (d ? { ...d, quote: e.target.value } : d))}
                  placeholder="A short line in their words, only if they agreed"
                />
              </label>
              <label className="block">
                <span className={cap}>Original request</span>
                <textarea
                  name="tripRequest"
                  rows={3}
                  className={input}
                  value={editing.tripRequest}
                  onChange={(e) => setEditing((d) => (d ? { ...d, tripRequest: e.target.value } : d))}
                />
              </label>
              <label className="block">
                <span className={cap}>What White Glove solved</span>
                <textarea
                  name="whatSolved"
                  rows={3}
                  className={input}
                  value={editing.whatSolved}
                  onChange={(e) => setEditing((d) => (d ? { ...d, whatSolved: e.target.value } : d))}
                />
              </label>
              <label className="block">
                <span className={cap}>Result / outcome</span>
                <textarea
                  name="outcome"
                  rows={3}
                  className={input}
                  value={editing.outcome}
                  onChange={(e) => setEditing((d) => (d ? { ...d, outcome: e.target.value } : d))}
                />
              </label>
              <label className="block">
                <span className={cap}>Itinerary link (optional)</span>
                <input
                  name="itineraryHref"
                  className={input}
                  value={editing.itineraryHref}
                  onChange={(e) => setEditing((d) => (d ? { ...d, itineraryHref: e.target.value } : d))}
                  placeholder="/destinations/rome — path on this site only"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="permissionRecorded"
                  checked={editing.permissionRecorded}
                  onChange={(e) =>
                    setEditing((d) =>
                      d ? { ...d, permissionRecorded: e.target.checked, approved: e.target.checked ? d.approved : false } : d,
                    )
                  }
                />
                I have permission to publish this
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="approved"
                  checked={editing.approved}
                  onChange={(e) => setEditing((d) => (d ? { ...d, approved: e.target.checked } : d))}
                  disabled={Boolean(completeness)}
                />
                Approve for the public site
                {completeness && <span className="text-xs text-stone-500">— {completeness}</span>}
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
                >
                  Cancel
                </button>
                {saveState && !saveState.ok && (
                  <span className="text-sm font-semibold text-red-700">{saveState.message}</span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
