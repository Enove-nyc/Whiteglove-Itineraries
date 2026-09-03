"use client";

import { FormEvent, useState } from "react";
import DirectoryListingFields from "@/components/DirectoryListingFields";
import { draftProblems, type DirectoryDraft, type DirectoryFieldKey } from "@/lib/directory-fields";

/**
 * Sending in a listing, or a correction to one.
 *
 * The same boxes the owner has in the admin. What used to happen was that this
 * form collected five things, joined them into a paragraph, and posted the
 * paragraph — so accepting it meant reading the prose and retyping it into the
 * admin by hand. Now the fields arrive as fields, the review screen shows
 * which of them changed, and accepting writes the listing.
 */

export default function DirectoryListingForm({
  mode,
  /** The listing being corrected. Absent for a new one. */
  targetId = "directory",
  targetName = "",
  current,
  onDone,
}: {
  mode: "new" | "edit";
  targetId?: string;
  targetName?: string;
  current?: DirectoryDraft;
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<DirectoryDraft>(mode === "edit" && current ? { ...current } : {});
  const [who, setWho] = useState({ name: "", email: "" });
  const [ownsBusiness, setOwnsBusiness] = useState(false);
  const [publishContact, setPublishContact] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const set = (key: DirectoryFieldKey, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const givingContact = Boolean(draft.phone?.trim() || draft.whatsapp?.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = draftProblems(draft);
    if (!who.name.trim()) found.push("Your name, so we know who to thank or ask.");
    if (!who.email.trim()) found.push("Your email, in case we need to check something.");
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    setBusy(true);
    const response = await fetch("/api/content/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "directory",
        targetId,
        title: draft.name || targetName || "Directory listing",
        name: who.name,
        email: who.email,
        issue: mode === "new" ? "New directory listing" : `Correction to ${targetName || "a listing"}`,
        // Still sent, so the email notification and any older reader has
        // something readable. The draft below is what the review screen uses.
        suggestedInfo: Object.entries(draft).map(([k, v]) => `${k}: ${v}`).join("\n") + (note ? `\n\n${note}` : ""),
        source: draft.website ?? "",
        draft,
        consent: { ownsBusiness, publishContact },
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      setProblems([data?.error || "That did not send. Please try again."]);
      return;
    }
    setDone(true);
    // The caller decides what to do with the panel. Its own confirmation has
    // to replace this one, never simply remove it.
    onDone?.();
  }

  if (done) {
    return (
      <p className="rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] p-4 text-sm leading-6 text-[var(--navy)]">
        Thank you — sent for review. Nothing appears on the site until somebody has looked at it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] p-4 sm:p-6">
      <DirectoryListingFields draft={draft} onChange={set} current={mode === "edit" ? current : undefined} idPrefix={`${mode}-${targetId}`} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Your name</span>
          <input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Your email</span>
          <input type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Anything else we should know</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none" />
        </label>
      </div>

      {/* Permission for the number, asked only of the people who can give it.
          A number sent in by somebody else is not permission, and this must
          not become a way around that. */}
      {givingContact && (
        <div className="mt-5 border border-[var(--gold-light)] bg-white p-4">
          <label className="flex min-h-11 items-start gap-2">
            <input type="checkbox" checked={ownsBusiness} onChange={(e) => setOwnsBusiness(e.target.checked)} className="mt-1 h-4 w-4" />
            <span className="text-sm leading-6 text-[var(--navy)]">This is my own business, or I am authorised to speak for it.</span>
          </label>
          {ownsBusiness && (
            <label className="mt-2 flex min-h-11 items-start gap-2">
              <input type="checkbox" checked={publishContact} onChange={(e) => setPublishContact(e.target.checked)} className="mt-1 h-4 w-4" />
              <span className="text-sm leading-6 text-[var(--navy)]">You may publish this phone number on the site.</span>
            </label>
          )}
          <p className="mt-2 text-xs leading-5 text-stone-500">
            {ownsBusiness
              ? "Without the second tick we keep the number on file and reach you by it ourselves, but it does not go on the page."
              : "If the number is not yours to give, leave this — we will ask them before publishing it."}
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1">
          {problems.map((p) => <li key={p} className="text-sm leading-6 text-red-700">{p}</li>)}
        </ul>
      )}

      <button type="submit" disabled={busy} className="mt-5 inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60">
        {busy ? "Sending…" : mode === "new" ? "Send this listing" : "Send this correction"}
      </button>
    </form>
  );
}
