"use client";

import { useState } from "react";
import type { EditSuggestion, SuggestionStatus } from "@/lib/admin-content";
import { changedFields, type DirectoryDraft } from "@/lib/directory-fields";
import { replyDraft, reviewProblem, sortForReview, suggestionSection, waitingFor, type ReviewDecision, type ReviewInput } from "@/lib/suggestions";

/**
 * The review queue for corrections people send in.
 *
 * What was here before was the list and three buttons — approved, rejected,
 * needs-info — each of which wrote one word and nothing else. You could not
 * say why, could not ask for the missing detail, could not correct the wording
 * before accepting it, and the moment you pressed a second button the first
 * decision was gone.
 */

type ReviewResult = string | null;

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  pending: "Waiting",
  approved: "Accepted",
  rejected: "Turned down",
  "needs-info": "Asked for more",
};

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approved: "Accept",
  rejected: "Turn down",
  "needs-info": "Ask for more",
};

function statusStyle(status: SuggestionStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "rejected") return "border-stone-300 bg-stone-100 text-stone-700";
  if (status === "needs-info") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

const field =
  "mt-1 w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";
const fieldLabel = "block text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function SuggestionReview({ suggestions, links, readAt, currentListings = {}, listingConsent = {}, onReview }: {
  suggestions: EditSuggestion[];
  /** Public page for a target, where the page could work out which one it is. */
  links: Record<string, string>;
  /** When the list was read. Ages are measured from here, not from a
   *  clock read while rendering, so the server and the browser agree. */
  readAt: number;
  /** What each directory listing says now, so a review shows what changes. */
  currentListings?: Record<string, DirectoryDraft>;
  /** Which of those listings already publish their number, by the owner's record. */
  listingConsent?: Record<string, boolean>;
  onReview: (id: string, input: ReviewInput) => Promise<ReviewResult>;
}) {
  const [filter, setFilter] = useState<SuggestionStatus | "all">("pending");
  const ordered = sortForReview(suggestions);
  const shown = filter === "all" ? ordered : ordered.filter((item) => item.status === filter);

  if (suggestions.length === 0) {
    return (
      <div className="mt-6 border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <p className="text-sm leading-6 text-stone-600">
          Nothing sent in yet. Every page carries a &ldquo;Suggest an edit&rdquo; link, and what people write there arrives here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {(["pending", "all", "approved", "needs-info", "rejected"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setFilter(name)}
            className={`min-h-11 px-4 text-xs font-bold uppercase tracking-[0.12em] ${
              filter === name ? "border border-[var(--navy)] bg-[var(--navy)] text-white" : "border border-[var(--gold-light)] text-[var(--navy)]"
            }`}
          >
            {name === "all" ? "Everything" : STATUS_LABEL[name]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-stone-600">
          {filter === "pending" ? "Nothing waiting — the queue is clear." : "Nothing with that answer yet."}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {shown.map((item) => (
            <SuggestionCard key={item.id} item={item} publicHref={links[item.targetId]} readAt={readAt} current={currentListings[item.targetId]} currentConsent={listingConsent[item.targetId] ?? false} onReview={onReview} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ item, publicHref, readAt, current, currentConsent = false, onReview }: {
  item: EditSuggestion;
  publicHref?: string;
  readAt: number;
  current?: DirectoryDraft;
  currentConsent?: boolean;
  /** What each directory listing says now, so a review shows what changes. */
  currentListings?: Record<string, DirectoryDraft>;
  /** Which of those listings already publish their number, by the owner's record. */
  listingConsent?: Record<string, boolean>;
  onReview: (id: string, input: ReviewInput) => Promise<ReviewResult>;
}) {
  // Pending items open ready to answer; already-decided ones stay shut until
  // you say you want to change your mind, so the queue is not a wall of forms.
  const [open, setOpen] = useState(item.status === "pending");
  const [notes, setNotes] = useState("");
  // Pre-filled with the visitor's own words, because approving them unchanged
  // is the common case. Editing this never touches what they wrote.
  const [accepted, setAccepted] = useState(item.acceptedInfo ?? item.suggestedInfo);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState<ReviewDecision | "">("");
  const section = suggestionSection(item.targetType);
  const reply = replyDraft(item);
  const waited = waitingFor(item.createdAt, readAt);

  // A listing filled in on the same form the owner uses. When it is here,
  // accepting writes the listing instead of the owner retyping the paragraph.
  const listing = item.draft;
  const changes = listing ? changedFields(current ?? {}, listing) : [];

  async function decide(status: ReviewDecision, apply = false) {
    const complaint = reviewProblem({ status, notes });
    if (complaint) {
      setProblem(complaint);
      return;
    }
    setProblem("");
    setBusy(status);
    const error = await onReview(item.id, { status, notes, acceptedInfo: accepted, apply });
    setBusy("");
    if (error) {
      setProblem(error);
      return;
    }
    setNotes("");
    setOpen(false);
  }

  return (
    <article className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
            {item.targetType}
            {/* A real space, not just a margin — a margin is invisible to a
                screen reader, which reads "locationwaiting today". */}
            {waited && item.status === "pending" && <span className="ml-2 text-stone-400">{" · "}waiting {waited}</span>}
          </p>
          <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{item.title}</h3>
        </div>
        <span className={`border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${statusStyle(item.status)}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      <p className="mt-3 text-sm text-stone-600">
        <strong className="text-[var(--navy)]">{item.name}</strong> · {item.email}
      </p>
      <p className="mt-3 text-sm leading-6 text-stone-700"><strong>What&apos;s wrong:</strong> {item.issue}</p>
      {listing ? (
        /* Filled in on the same form as the admin, so it is shown as fields
           rather than as the paragraph it used to arrive as. Only what
           changes: a table of thirteen rows with one difference in it buries
           the difference. */
        <div className="mt-3 border border-[var(--gold-light)] bg-white">
          <p className="border-b border-[var(--gold-light)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
            {current && Object.keys(current).length ? `${changes.length} ${changes.length === 1 ? "change" : "changes"} to this listing` : "A new listing"}
          </p>
          {changes.length === 0 ? (
            <p className="px-4 py-3 text-sm leading-6 text-stone-500">Nothing here differs from what is already published.</p>
          ) : (
            <dl className="divide-y divide-[var(--gold-light)]">
              {changes.map((change) => (
                <div key={change.key} className="px-4 py-2.5">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{change.label}</dt>
                  <dd className="mt-0.5 text-sm leading-6 text-[var(--navy)]">
                    {change.from && <span className="mr-2 text-stone-400 line-through decoration-1">{change.from}</span>}
                    {change.to}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {item.contactConsent && (
            <p className="border-t border-[var(--gold-light)] px-4 py-2 text-xs leading-5 text-emerald-800">
              They said the business is theirs and the number may be published. {item.contactConsentNote}
            </p>
          )}
          {/* What will actually happen to the number, which depends on the
              listing as well as the submission. Warning that a number will be
              withheld when the listing already publishes it would be telling
              the reviewer the opposite of the truth. */}
          {!item.contactConsent && (listing.phone || listing.whatsapp) && (
            currentConsent ? (
              <p className="border-t border-[var(--gold-light)] px-4 py-2 text-xs leading-5 text-amber-800">
                This changes a number you already publish, and it did not come from the business. Worth ringing the new
                one before accepting.
              </p>
            ) : (
              <p className="border-t border-[var(--gold-light)] px-4 py-2 text-xs leading-5 text-amber-800">
                No permission given for the number — it will be kept on file and not published. Ask them, then tick the
                box on the listing.
              </p>
            )
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-stone-700"><strong>Their correction:</strong> {item.suggestedInfo}</p>
      )}
      {item.currentInfo && <p className="mt-2 text-sm leading-6 text-stone-500"><strong>On the page then:</strong> {item.currentInfo}</p>}
      {item.source && <p className="mt-2 text-sm leading-6 text-stone-500"><strong>Their source:</strong> {item.source}</p>}
      {item.acceptedInfo && (
        <p className="mt-2 border-l-2 border-emerald-300 pl-3 text-sm leading-6 text-emerald-900">
          <strong>Accepted as:</strong> {item.acceptedInfo}
        </p>
      )}

      {/* Where to go and change it. Recording a decision never used to lead
          anywhere — the record it was about sat somewhere else, to be found by
          hand. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-bold uppercase tracking-[0.12em]">
        {publicHref && (
          <a href={publicHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            See the page →
          </a>
        )}
        <a href={section.href} className="inline-flex min-h-11 items-center text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
          Fix it in {section.label} →
        </a>
        {item.status !== "pending" && (
          <a href={reply.href} className="inline-flex min-h-11 items-center text-stone-500 underline decoration-[var(--gold-light)] underline-offset-4">
            Write back →
          </a>
        )}
      </div>

      {item.history && item.history.length > 0 && (
        <details className="mt-4 border-t border-[var(--gold-light)] pt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
            What happened to this ({item.history.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {item.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-sm leading-6 text-stone-600">
                <span className="font-semibold text-[var(--navy)]">{STATUS_LABEL[event.status]}</span>
                {" · "}
                {new Date(event.at).toLocaleString()}
                {event.notes && <span className="block text-stone-500">{event.notes}</span>}
                {event.accepted && <span className="block text-stone-500">Wording changed before accepting.</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-11 items-center border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
        >
          Change the answer
        </button>
      ) : (
        <div className="mt-4 border-t border-[var(--gold-light)] pt-4">
          {!listing && (
            <>
              <label className={fieldLabel}>
                Accept it as
                <textarea value={accepted} onChange={(event) => setAccepted(event.target.value)} rows={2} className={field} />
              </label>
              <p className="mt-1 text-[11px] leading-5 text-stone-400">
                Edit this to fix a typo or trim it before accepting. What they wrote is kept either way.
              </p>
            </>
          )}

          <label className={`${fieldLabel} ${listing ? "" : "mt-4"}`}>
            Why — needed to turn down or ask for more
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="What is missing, or why it stays as it is."
              className={field}
            />
          </label>

          {listing && (
            <p className="mt-3 text-xs leading-5 text-stone-500">
              {current && Object.keys(current).length
                ? "Accepting writes these changes straight onto the listing."
                : "Accepting adds the listing, hidden. Listing somebody is a second decision, so it is one more tick in Businesses before it goes live."}
            </p>
          )}

          {problem && <p className="mt-2 text-sm leading-6 text-red-700">{problem}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {(["approved", "needs-info", "rejected"] as const).map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy !== "" || (status === "approved" && Boolean(listing) && changes.length === 0)}
                onClick={() => decide(status, status === "approved" && Boolean(listing))}
                className={`min-h-11 border px-4 text-xs font-bold uppercase tracking-[0.12em] disabled:opacity-60 ${
                  status === "approved"
                    ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                    : "border-[var(--gold-light)] text-[var(--navy)]"
                }`}
              >
                {busy === status
                  ? "Saving…"
                  : status === "approved" && listing
                    ? current && Object.keys(current).length ? "Accept and update the listing" : "Accept and add the listing"
                    : DECISION_LABEL[status]}
              </button>
            ))}
            {item.status !== "pending" && (
              <button
                type="button"
                onClick={() => { setOpen(false); setProblem(""); }}
                className="min-h-11 px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500"
              >
                Leave it
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
