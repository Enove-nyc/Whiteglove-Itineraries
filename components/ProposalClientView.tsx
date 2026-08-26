"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import {
  PROPOSAL_COMPONENT_LABEL,
  type Proposal,
  type ProposalOption,
} from "@/data/proposal";

/**
 * A client's own side of a proposal — comparing options, picking one,
 * approving it or asking for changes, and a small comment thread with the
 * advisor. No account: everything here goes through the proposal's own
 * public link (app/api/proposal/[shareId]/route.ts), the same way a shared
 * itinerary or flight document already works.
 */

function money(amount: number | undefined, currency = "USD"): string {
  if (typeof amount !== "number") return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

function OptionCard({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: ProposalOption;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition ${selected ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/40" : "border-[var(--gold-light)]"}`}
    >
      {option.photoMediaId && (
        // eslint-disable-next-line @next/next/no-img-element -- a planner-uploaded photo, arbitrary aspect ratio
        <img src={`/api/media?id=${encodeURIComponent(option.photoMediaId)}`} alt="" className="h-44 w-full object-cover" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{option.name}</h3>
            {option.summary && <p className="mt-1 text-sm text-stone-600">{option.summary}</p>}
          </div>
          {typeof option.totalPrice === "number" && (
            <p className="whitespace-nowrap text-right font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
              {money(option.totalPrice, option.currency)}
            </p>
          )}
        </div>

        {option.components.length > 0 && (
          <ul className="mt-4 space-y-2.5 border-t border-[var(--gold-light)] pt-4">
            {option.components.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-sm">
                <Icon name={c.kind === "flight" ? "plane" : "map-pin"} className="mt-0.5 h-4 w-4 flex-none text-[var(--gold-ink)]" />
                <div>
                  <p className="font-semibold text-[var(--navy)]">
                    {c.name} <span className="font-normal text-stone-400">· {PROPOSAL_COMPONENT_LABEL[c.kind]}</span>
                  </p>
                  {c.description && <p className="text-stone-600">{c.description}</p>}
                  {(c.checkIn || c.checkOut) && (
                    <p className="text-stone-500">{c.checkIn}{c.checkOut ? ` – ${c.checkOut}` : ""}</p>
                  )}
                  {(c.from || c.to) && <p className="text-stone-500">{[c.from, c.to].filter(Boolean).join(" → ")}{c.date ? ` · ${c.date}` : ""}</p>}
                  {typeof c.price === "number" && <p className="text-stone-500">{money(c.price, option.currency)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={onSelect}
          className={`mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-5 text-xs font-bold uppercase tracking-[0.12em] transition disabled:opacity-60 ${
            selected
              ? "border-[var(--navy)] bg-[var(--navy)] text-white"
              : "border-[var(--gold)] text-[var(--navy)] hover:bg-[var(--navy)] hover:text-white"
          }`}
        >
          {selected && <Icon name="check" className="h-4 w-4" />}
          {selected ? "Selected" : "Select this option"}
        </button>
      </div>
    </div>
  );
}

export default function ProposalClientView({
  shareId,
  proposal: initial,
  expired,
}: {
  shareId: string;
  proposal: Proposal;
  expired: boolean;
}) {
  const [proposal, setProposal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changesText, setChangesText] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [commentText, setCommentText] = useState("");

  const decided = proposal.status === "approved" || proposal.status === "confirmed";

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/proposal/${encodeURIComponent(shareId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { proposal?: Proposal; error?: string } | null;
      if (!res.ok || !data?.proposal) {
        setError(data?.error ?? "That didn't go through. Try again.");
        return false;
      }
      setProposal(data.proposal);
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {expired && !decided && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This proposal has expired. Reach out to your advisor for a fresh one.
        </div>
      )}

      <div className={`grid gap-5 ${proposal.options.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {proposal.options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            selected={proposal.selectedOptionId === option.id}
            disabled={busy || decided || expired}
            onSelect={() => void act({ kind: "select", optionId: option.id })}
          />
        ))}
      </div>

      {!decided && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !proposal.selectedOptionId || expired}
            onClick={() => void act({ kind: "approve" })}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy || expired}
            onClick={() => setShowChanges((s) => !s)}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] px-6 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-60"
          >
            Ask for changes
          </button>
        </div>
      )}

      {decided && (
        <p className="text-sm font-semibold text-emerald-700">
          {proposal.status === "confirmed" ? "Confirmed — your itinerary is on its way." : "Approved — your advisor has been notified."}
        </p>
      )}

      {showChanges && !decided && (
        <div className="rounded-xl border border-[var(--gold-light)] bg-white p-4">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]" htmlFor="proposal-changes">
            What would you like different?
          </label>
          <textarea
            id="proposal-changes"
            value={changesText}
            onChange={(e) => setChangesText(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-[var(--gold-light)] p-3 text-sm"
            placeholder="A different hotel, a later flight, a lower budget…"
          />
          <button
            type="button"
            disabled={busy || !changesText.trim()}
            onClick={async () => {
              const ok = await act({ kind: "request_changes", text: changesText });
              if (ok) {
                setChangesText("");
                setShowChanges(false);
              }
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-60"
          >
            Send
          </button>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}

      {proposal.comments.length > 0 && (
        <div className="space-y-2 border-t border-[var(--gold-light)] pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Notes</p>
          {proposal.comments.map((c, i) => (
            <p key={i} className="text-sm text-stone-700">
              <span className="font-semibold text-[var(--navy)]">{c.from === "planner" ? "Your advisor" : "You"}:</span> {c.text}
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-[var(--gold-light)] pt-5">
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]" htmlFor="proposal-comment">
          Have a question?
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="proposal-comment"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="min-h-11 flex-1 rounded-lg border border-[var(--gold-light)] px-3 text-sm"
            placeholder="Ask your advisor anything about this proposal"
          />
          <button
            type="button"
            disabled={busy || !commentText.trim()}
            onClick={async () => {
              const ok = await act({ kind: "comment", text: commentText });
              if (ok) setCommentText("");
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
