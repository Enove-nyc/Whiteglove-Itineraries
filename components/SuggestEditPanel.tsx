"use client";

import { type FormEvent, useState } from "react";
import { Icon } from "@/components/icons/Icon";

/**
 * "Suggest edit" — the pencil on every detail surface.
 *
 * Context-aware: the page passes in what is being corrected, so the visitor
 * never types which page they mean, and the owner's review queue gets a
 * suggestion already attached to its target. Anyone may send one — no
 * sign-in, deliberately: the person who notices a wrong phone number is
 * rarely the person with an account, and the queue is reviewed by a person
 * before anything changes (lib/suggestions.ts).
 *
 * NOT the contact form. Contact is for questions and advertising; this is
 * one field about one listing, posted to the corrections queue the admin
 * already reviews.
 */
export default function SuggestEditPanel({
  targetType,
  targetId,
  title,
  compact = false,
}: {
  /** Which queue the correction files under — see /api/content/suggestions. */
  targetType: "location" | "accommodation" | "site";
  targetId: string;
  /** What the correction is about, shown back and sent along. */
  title: string;
  /** A quieter trigger for card rows, where a full button would shout. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [suggestedInfo, setSuggestedInfo] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/content/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, title, name, email, issue, suggestedInfo, source: source || undefined }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setState("error");
        setError(data?.error || "Please try again.");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
      setError("Could not send it — please try again.");
    }
  }

  const trigger = compact
    ? "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-stone-600 transition hover:text-[var(--navy)]"
    : "inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--gold-light)] px-3 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]";

  return (
    <div className={compact ? "inline-block" : "mt-6"}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Suggest edit" className={trigger}>
        <Icon name="pencil" className="h-4 w-4" />
        Suggest edit
      </button>

      {open && (
        <div className="mt-3 max-w-xl rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          {state === "sent" ? (
            <p className="text-sm font-semibold text-[var(--navy)]" role="status">
              Sent. Thank you — we check every correction before changing the page.
            </p>
          ) : (
            <form onSubmit={send} className="space-y-4">
              <p className="text-sm text-stone-600">
                About <span className="font-semibold text-[var(--navy)]">{title}</span>.
              </p>
              <label className="block text-sm font-semibold text-[var(--navy)]">
                What is wrong
                <textarea value={issue} onChange={(e) => setIssue(e.target.value)} required rows={2} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
              </label>
              <label className="block text-sm font-semibold text-[var(--navy)]">
                What it should say
                <textarea value={suggestedInfo} onChange={(e) => setSuggestedInfo(e.target.value)} required rows={2} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-[var(--navy)]">
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
                </label>
                <label className="block text-sm font-semibold text-[var(--navy)]">
                  Your email
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
                </label>
              </div>
              <label className="block text-sm font-semibold text-[var(--navy)]">
                Where you know it from <span className="font-normal text-stone-500">— optional</span>
                <input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
              </label>
              {state === "error" && <p className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={state === "sending"} className="inline-flex min-h-11 items-center rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-60">
                {state === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
