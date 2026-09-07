"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INQUIRY_STATUS_LABEL,
  LEAD_SOURCES,
  closedInquiries,
  followUpDue,
  openInquiries,
  summariseInquiry,
  type Inquiry,
  type InquiryStatus,
} from "@/data/inquiries";

/**
 * The enquiries tab on the pipeline — the calls that are not trips yet.
 *
 * ONE SCREEN, NOT A FIFTH PLACE TO CHECK. The owner's spec asks for one
 * operational dashboard, so this sits as a view on the pipeline beside the
 * trips rather than on a page of its own. The form asks for a contact and
 * nothing else as a must; the list leads with what is late; and a finished
 * enquiry drops out of the working list but stays one press away.
 *
 * Built for a phone first: an advisor writes these down between calls, on
 * whatever is in their hand. Every control is at least 44px tall and the
 * rows stack rather than tabulate.
 */

const inputCls = "w-full rounded-lg border border-[var(--gold-light)] px-3 py-2.5 text-sm";
const labelCls = "text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold-ink)]";
const button = "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-bold transition";
const primary = `${button} bg-[var(--navy)] text-white hover:opacity-90 disabled:opacity-60`;
const quiet = `${button} border border-[var(--gold-light)] bg-white text-[var(--navy)] hover:border-[var(--gold)] disabled:opacity-60`;

type Draft = {
  contact: string;
  destination: string;
  dates: string;
  travelers: string;
  budget: string;
  source: string;
  followUpOn: string;
  notes: string;
  status: InquiryStatus;
};

const EMPTY: Draft = { contact: "", destination: "", dates: "", travelers: "", budget: "", source: "", followUpOn: "", notes: "", status: "new" };

function draftFrom(inquiry: Inquiry): Draft {
  return {
    contact: inquiry.contact,
    destination: inquiry.destination ?? "",
    dates: inquiry.dates ?? "",
    travelers: inquiry.travelers ? String(inquiry.travelers) : "",
    budget: inquiry.budget ? String(inquiry.budget) : "",
    source: inquiry.source ?? "",
    followUpOn: inquiry.followUpOn ?? "",
    notes: inquiry.notes ?? "",
    status: inquiry.status,
  };
}

function InquiryForm({ initial, onSave, onCancel, busy }: { initial: Draft; onSave: (draft: Draft) => void; onCancel: () => void; busy: boolean }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.contact.trim()) onSave(draft);
      }}
      className="rounded-xl border border-[var(--gold-light)] bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelCls}>Who asked</span>
          <input value={draft.contact} onChange={set("contact")} placeholder="The Cohens" className={inputCls} autoFocus required />
        </label>
        <label className="block">
          <span className={labelCls}>Where, roughly</span>
          <input value={draft.destination} onChange={set("destination")} placeholder="Italy — maybe Rome and the lakes" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>When, roughly</span>
          <input value={draft.dates} onChange={set("dates")} placeholder="Sometime in August" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Travelers</span>
          <input type="number" inputMode="numeric" min={1} value={draft.travelers} onChange={set("travelers")} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Budget, roughly</span>
          <input type="number" inputMode="numeric" min={1} value={draft.budget} onChange={set("budget")} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Follow up on</span>
          <input type="date" value={draft.followUpOn} onChange={set("followUpOn")} className={inputCls} />
        </label>
        <label className="block">
          {/* Optional, and it stays optional: recorded when the advisor already
              knows, never something a caller is interrogated about. */}
          <span className={labelCls}>How they found you, if you know</span>
          <select value={draft.source} onChange={set("source")} className={inputCls}>
            <option value="">—</option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Status</span>
          <select value={draft.status} onChange={set("status")} className={inputCls}>
            {(["new", "working", "quoted", "lost"] as InquiryStatus[]).map((status) => (
              <option key={status} value={status}>{INQUIRY_STATUS_LABEL[status]}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Notes</span>
          <textarea value={draft.notes} onChange={set("notes")} rows={3} placeholder="Anniversary. Wants a kitchen. Grandmother uses a walker." className={inputCls} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !draft.contact.trim()} className={primary}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} className={quiet}>Cancel</button>
      </div>
    </form>
  );
}

function StatusPill({ status }: { status: InquiryStatus }) {
  return (
    <span className="rounded-full border border-[var(--gold-light)] bg-[var(--cream)] px-2.5 py-1 text-[11px] font-bold text-[var(--navy)]">
      {INQUIRY_STATUS_LABEL[status]}
    </span>
  );
}

export default function InquiriesPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Inquiry | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/inquiries", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { inquiries?: Inquiry[]; today?: string; error?: string } | null;
      if (!res.ok || !data?.inquiries) {
        setError(data?.error ?? "Could not load enquiries.");
        return;
      }
      setRows(data.inquiries);
      setToday(data.today ?? new Date().toISOString().slice(0, 10));
    } catch {
      setError("Could not reach the account service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Async wrapper rather than a bare call from the effect body: a bare call
    // enters it synchronously, which the rule counts as a setState during the
    // effect. Same shape the rest of this repo uses.
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/account/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; inquiries?: Inquiry[]; tripId?: string } | null;
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "Something went wrong.");
      return null;
    }
    if (data.inquiries) setRows(data.inquiries);
    setError("");
    return data;
  }

  async function save(draft: Draft) {
    const id = editing && editing !== "new" ? editing.id : undefined;
    setBusy(id ?? "new");
    try {
      const inquiry = {
        contact: draft.contact,
        destination: draft.destination,
        dates: draft.dates,
        travelers: draft.travelers ? Number(draft.travelers) : undefined,
        budget: draft.budget ? Number(draft.budget) : undefined,
        source: draft.source || undefined,
        followUpOn: draft.followUpOn,
        notes: draft.notes,
        status: draft.status,
      };
      const done = await post({ action: "save", id, inquiry });
      if (done) setEditing(null);
    } finally {
      setBusy(null);
    }
  }

  async function startTrip(inquiry: Inquiry) {
    setBusy(inquiry.id);
    try {
      const done = await post({ action: "start_trip", id: inquiry.id });
      if (done?.tripId) router.push("/itinerary");
    } finally {
      setBusy(null);
    }
  }

  async function remove(inquiry: Inquiry) {
    if (!window.confirm(`Delete the enquiry from ${inquiry.contact}? This can't be undone.`)) return;
    setBusy(inquiry.id);
    try {
      await post({ action: "delete", id: inquiry.id });
    } finally {
      setBusy(null);
    }
  }

  const open = openInquiries(rows, today);
  const finished = closedInquiries(rows);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-stone-600">
          The calls that are not trips yet. Write down what you know and come back to it — nothing here needs more than a name.
        </p>
        {editing === null && (
          <button type="button" onClick={() => setEditing("new")} className={primary}>+ New enquiry</button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {editing === "new" && (
        <div className="mt-4">
          <InquiryForm initial={EMPTY} onSave={(draft) => void save(draft)} onCancel={() => setEditing(null)} busy={busy === "new"} />
        </div>
      )}

      {loading ? (
        <div aria-hidden="true" className="mt-4 space-y-2">
          <div className="h-3 w-2/3 rounded bg-[var(--cream-deep)]" />
          <div className="h-3 w-1/2 rounded bg-[var(--cream-deep)]" />
        </div>
      ) : open.length === 0 && editing !== "new" ? (
        <p className="mt-4 text-sm text-stone-500">No open enquiries.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {open.map((inquiry) =>
            editing !== null && editing !== "new" && editing.id === inquiry.id ? (
              <li key={inquiry.id}>
                <InquiryForm initial={draftFrom(inquiry)} onSave={(draft) => void save(draft)} onCancel={() => setEditing(null)} busy={busy === inquiry.id} />
              </li>
            ) : (
              <li key={inquiry.id} className="rounded-xl border border-[var(--gold-light)] bg-white p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--navy)]">{inquiry.contact}</p>
                    {summariseInquiry(inquiry) && <p className="mt-0.5 text-stone-600">{summariseInquiry(inquiry)}</p>}
                    {inquiry.budget ? <p className="mt-0.5 text-xs text-stone-500">Budget about {inquiry.budget.toLocaleString()}</p> : null}
                  </div>
                  <StatusPill status={inquiry.status} />
                </div>
                {inquiry.followUpOn && (
                  <p className={`mt-2 text-xs font-semibold ${followUpDue(inquiry, today) ? "text-[var(--gold-ink)]" : "text-stone-500"}`}>
                    {followUpDue(inquiry, today) ? "⚑ Follow up — due " : "Follow up "}
                    {inquiry.followUpOn}
                  </p>
                )}
                {inquiry.notes && <p className="mt-2 whitespace-pre-line text-stone-700">{inquiry.notes}</p>}
                {inquiry.source && <p className="mt-2 text-xs text-stone-400">Via {inquiry.source}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy === inquiry.id} onClick={() => void startTrip(inquiry)} className={primary}>
                    {busy === inquiry.id ? "Starting…" : "Start a trip"}
                  </button>
                  <button type="button" onClick={() => setEditing(inquiry)} className={quiet}>Edit</button>
                  <button type="button" disabled={busy === inquiry.id} onClick={() => void remove(inquiry)} className={`${button} text-stone-500 hover:text-red-700`}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {finished.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished} className={quiet}>
            {showFinished ? "Hide finished" : `Finished (${finished.length})`}
          </button>
          {showFinished && (
            <ul className="mt-3 flex flex-col gap-2">
              {finished.map((inquiry) => (
                <li key={inquiry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--gold-light)] bg-[var(--cream)] px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--navy)]">{inquiry.contact}</span>
                    {summariseInquiry(inquiry) && <span className="text-stone-600"> · {summariseInquiry(inquiry)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={inquiry.status} />
                    {inquiry.status === "lost" && (
                      <button type="button" onClick={() => setEditing(inquiry)} className={`${button} text-xs text-[var(--navy)] underline`}>Reopen</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {editing !== null && editing !== "new" && !open.some((row) => row.id === editing.id) && (
        <div className="mt-4">
          <InquiryForm initial={{ ...draftFrom(editing), status: "working" }} onSave={(draft) => void save(draft)} onCancel={() => setEditing(null)} busy={busy === editing.id} />
        </div>
      )}
    </div>
  );
}
