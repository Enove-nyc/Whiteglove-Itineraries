"use client";

import { useActionState } from "react";
import { submissionReply, submitterLine } from "@/lib/photo-submissions";
import {
  type ActionResult,
  declineSubmissionAction,
  publishSubmissionAction,
} from "@/app/admin/photos/actions";

/**
 * Pictures people have sent in, waiting on the owner.
 *
 * The whole point is that this is a decision, not a formality — so the screen
 * shows who sent it and what they said before it shows the two buttons, and
 * the credit is a box you have to have filled rather than something already
 * agreed to.
 */

export type PendingSubmission = {
  id: string;
  url: string;
  caption: string | null;
  credit: string | null;
  submittedAt: string;
  submittedBy: string | null;
  submittedEmail: string | null;
  submitterNote: string | null;
  /** What it is a picture of, and where that lives. */
  ownerKind: string;
  slug: string;
  what: string;
  href: string;
  waiting: string;
};

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function PhotoSubmissionQueue({ submissions }: { submissions: PendingSubmission[] }) {
  if (!submissions.length) {
    return (
      <p className="border border-dashed border-[var(--gold-light)] p-8 text-center text-sm text-stone-500">
        Nothing waiting. Pictures people send in land here, and nothing goes on the site until you say so.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {submissions.map((submission) => <Card key={submission.id} submission={submission} />)}
    </div>
  );
}

function Card({ submission }: { submission: PendingSubmission }) {
  const [publishState, publish, publishing] = useActionState<ActionResult | null, FormData>(publishSubmissionAction, null);
  const [declineState, decline, declining] = useActionState<ActionResult | null, FormData>(declineSubmissionAction, null);
  const reply = submissionReply(submission, "declined", "");

  return (
    <article className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">
            Sent in · waiting {submission.waiting}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            A picture of {submission.what}
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            From {submitterLine(submission)}
          </p>
        </div>
        <a
          href={submission.href}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
        >
          See the page →
        </a>
      </div>

      {submission.submitterNote && (
        <p className="mt-3 border-l-4 border-[var(--gold)] bg-white px-3 py-2 text-sm leading-6 text-stone-700">
          {submission.submitterNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded
            blob served from /api/media; next/image cannot optimise it and
            would only add a second fetch. */}
        <img
          src={submission.url}
          alt={submission.caption ?? ""}
          className="h-44 w-60 shrink-0 border border-[var(--gold-light)] bg-white object-contain"
        />

        <form action={publish} className="min-w-0 flex-1">
          <input type="hidden" name="photoId" value={submission.id} />
          <input type="hidden" name="ownerKind" value={submission.ownerKind} />
          <input type="hidden" name="slug" value={submission.slug} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={captionClass}>Caption — edit it if you like</span>
              <input name="caption" defaultValue={submission.caption ?? ""} className={inputClass} />
            </label>
            <label className="block sm:col-span-2">
              <span className={captionClass}>Credit — goes under the picture</span>
              <input name="credit" defaultValue={submission.credit ?? ""} required className={inputClass} />
            </label>
            <label className="block sm:col-span-2">
              <span className={captionClass}>Where it came from (optional)</span>
              <input name="sourceUrl" className={inputClass} placeholder="A link, if there is one" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={publishing}
              className="min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
            >
              {publishing ? "Putting it up…" : "Put it on the site"}
            </button>
            {submission.submittedEmail && (
              <a
                href={reply.href}
                className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
              >
                Write back first
              </a>
            )}
            {publishState && (
              <span className={`text-sm font-semibold ${publishState.ok ? "text-emerald-700" : "text-red-700"}`}>
                {publishState.message}
              </span>
            )}
          </div>
        </form>
      </div>

      <form
        action={decline}
        className="mt-4 border-t border-[var(--gold-light)] pt-3"
        onSubmit={(event) => {
          if (!window.confirm("Turn this picture down and remove it? This can't be undone.")) event.preventDefault();
        }}
      >
        <input type="hidden" name="photoId" value={submission.id} />
        <input type="hidden" name="ownerKind" value={submission.ownerKind} />
        <input type="hidden" name="slug" value={submission.slug} />
        <button
          type="submit"
          disabled={declining}
          className="text-xs font-bold uppercase tracking-[0.12em] text-red-700 underline decoration-red-300 underline-offset-4 disabled:opacity-60"
        >
          {declining ? "Removing…" : "Turn it down"}
        </button>
        {declineState && <span className="ml-3 text-sm text-stone-600">{declineState.message}</span>}
      </form>
    </article>
  );
}
