"use client";

import { useEffect, useState } from "react";
import { useRequireSignIn } from "@/components/SignInGate";
import {
  MAX_COMMENT,
  type TripComment,
  commentProblem,
  describeComments,
  inOrder,
  mayDelete,
  mayResolve,
  whenWritten,
  whoWrote,
} from "@/lib/trip-comments";

/**
 * The notes on a shared trip.
 *
 * WHAT THIS SCREEN MUST NOT DO is decide anything. Every rule about who may
 * write, resolve or delete is enforced on the server against the owner's own
 * record; the same rules are read here only so a button that would be refused
 * is not offered in the first place. Hiding a button is a courtesy. It is not
 * a permission, and nothing here is what stops anybody.
 *
 * Somebody who can only look sees the thread and is told, once and plainly,
 * that they cannot write on it — rather than finding out by typing a paragraph
 * and pressing a button that fails.
 */

export default function TripComments({
  shareId,
  owner,
  now,
  /** Ids of the flights, stays and stops that still exist, for the notes about them. */
  liveIds,
  labels,
}: {
  shareId: string;
  owner: string;
  now: string;
  liveIds: string[];
  labels: Record<string, string>;
}) {
  const [comments, setComments] = useState<TripComment[] | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [you, setYou] = useState("");
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const requireSignIn = useRequireSignIn();
  const [error, setError] = useState("");

  // Fetched once, and the answer written from the promise's own callback
  // rather than from the effect body. The thread lives on the server; this is
  // subscribing to it, which is what an effect is for.
  useEffect(() => {
    let alive = true;
    fetch(`/api/account/itinerary/comments?share=${encodeURIComponent(shareId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { comments?: TripComment[]; canComment?: boolean; you?: string } | null) => {
        if (!alive) return;
        // No data means not signed in, or not shared with this person. Either
        // way there is no thread and nothing worth saying about why.
        setComments(data?.comments ?? []);
        setCanComment(Boolean(data?.canComment));
        setYou(data?.you ?? "");
      })
      .catch(() => {
        if (alive) setComments([]);
      });
    return () => {
      alive = false;
    };
  }, [shareId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const problem = commentProblem(body);
    if (problem) {
      setError(problem);
      return;
    }
    // A comment is signed with a name and kept on somebody's trip, so it needs
    // an account like every other write on the site. The endpoint has always
    // refused without one; asking here means the visitor meets the same dialog
    // as everywhere else instead of a red line under a form they had already
    // filled in — and the comment they typed is still there afterwards.
    requireSignIn(() => void post(), "Sign in to comment");
  }

  async function post() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/account/itinerary/comments?share=${encodeURIComponent(shareId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, about: about || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "That could not be sent.");
      return;
    }
    setComments(data.comments ?? []);
    setBody("");
  }

  async function markDone(comment: TripComment, done: boolean) {
    setBusy(true);
    const res = await fetch(`/api/account/itinerary/comments?share=${encodeURIComponent(shareId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: comment.id, done }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "That could not be saved.");
      return;
    }
    setComments(data.comments ?? []);
  }

  async function remove(comment: TripComment) {
    setBusy(true);
    const res = await fetch(
      `/api/account/itinerary/comments?share=${encodeURIComponent(shareId)}&id=${encodeURIComponent(comment.id)}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "That could not be removed.");
      return;
    }
    setComments(data.comments ?? []);
  }

  if (comments === null) return null;
  const live = new Set(liveIds);

  return (
    <section className="mt-10 border border-[var(--gold-light)] bg-[#FAF8F3] p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Notes</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">What people have said</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{describeComments(comments)}</p>

      {comments.length > 0 && (
        <ul className="mt-6 space-y-3">
          {inOrder(comments).map((comment) => {
            // A note about a stop that has since been deleted. Kept, because
            // somebody wrote it and the point may still stand, and said so
            // rather than shown under a heading that is not there.
            const gone = comment.about !== undefined && !live.has(comment.about);
            return (
              <li
                key={comment.id}
                className={`border px-4 py-3 ${comment.doneAt ? "border-[var(--gold-light)] bg-white/60" : "border-[var(--gold)] bg-white"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--navy)]">
                    {whoWrote(comment)}
                    {comment.about && (
                      <span className="ml-2 text-xs font-normal text-stone-500">
                        {gone ? "on something since removed" : `on ${labels[comment.about] ?? "a stop"}`}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-400">{whenWritten(comment, now)}</p>
                </div>
                <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-7 ${comment.doneAt ? "text-stone-400" : "text-stone-700"}`}>
                  {comment.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {comment.doneAt && <span className="text-xs font-semibold text-emerald-700">Dealt with</span>}
                  {you && mayResolve(comment, you, owner) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markDone(comment, !comment.doneAt)}
                      className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500 underline decoration-[var(--gold)] underline-offset-2 disabled:opacity-50"
                    >
                      {comment.doneAt ? "Still open" : "Mark done"}
                    </button>
                  )}
                  {you && mayDelete(comment, you) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(comment)}
                      className="text-xs font-bold uppercase tracking-[0.1em] text-stone-400 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canComment ? (
        <form onSubmit={send} className="mt-6">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Leave a note</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_COMMENT}
              rows={3}
              placeholder="The hotel is forty minutes from the shul…"
              className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {liveIds.length > 0 && (
              <select
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                aria-label="What this is about"
                className="rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)]"
              >
                <option value="">About the whole trip</option>
                {liveIds.map((id) => (
                  <option key={id} value={id}>{labels[id] ?? id}</option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Leave the note"}
            </button>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
        </form>
      ) : (
        <p className="mt-6 border-l-4 border-[var(--gold-light)] bg-white px-4 py-3 text-sm leading-6 text-stone-500">
          You can read this trip but not write on it. Ask whoever shared it if you would like to leave notes.
        </p>
      )}
    </section>
  );
}
