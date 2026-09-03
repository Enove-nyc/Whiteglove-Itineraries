"use client";

import { BUILT_IN_WORDS, type SiteWords } from "@/data/site-words";
import DateField from "@/components/DateField";
import { notBefore, today } from "@/lib/date-range";
import { useState } from "react";
import ComingSoonNotice from "@/components/ComingSoonNotice";

// The flight page listed six things to send us and gave nobody a way to send
// them. Every one of those six is a field here, so the page asks the questions
// it says it wants answered.
//
// It posts to the same contact route the rest of the site uses. A flight
// request is an enquiry, it belongs in the same inbox as the other enquiries,
// and inventing a second delivery path for it would mean a second thing that
// can quietly stop arriving.
//
// `open` is whether the service behind it is taking requests. Closed, the form
// is still here to be read but cannot be submitted — see lib/features.ts.

const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--gold-light)] bg-white px-4 py-3 text-base text-[var(--navy)] shadow-[0_3px_10px_rgba(16, 47, 53,.04)] outline-none transition placeholder:text-stone-400 focus:border-[var(--gold)] focus:ring-4 focus:ring-[rgba(170,139,82,.12)]";
const caption = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  from: "",
  to: "",
  depart: "",
  ret: "",
  adults: "1",
  children: "0",
  cabin: "Economy",
  baggage: "",
  budget: "",
  notes: "",
};

export default function FlightRequestForm({ open, words = BUILT_IN_WORDS }: {
  open: boolean;
  /**
   * The site's own wording, read on the server (/admin/settings/words). The
   * built-in set is a complete one, so a caller that passes nothing shows
   * exactly what this said before any of it was editable.
   */
  words?: SiteWords;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (patch: Partial<typeof EMPTY>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (error) setError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Belt and braces. The fields are inside a disabled fieldset, so a closed
    // form cannot normally be submitted at all — this is here so that if it
    // ever is, nothing leaves the browser.
    if (!open) return;
    if (!form.name.trim() || !form.email.trim() || !form.from.trim() || !form.to.trim() || !form.depart.trim()) {
      setError("Please add your name, email, where you are flying from and to, and the date out.");
      return;
    }
    if (form.depart < today()) {
      setError("Departure cannot be in the past.");
      return;
    }
    if (form.ret && form.ret < form.depart) {
      setError("The date back cannot be before the date out.");
      return;
    }
    setBusy(true);
    // Written out as a message rather than sent as fields, so it arrives
    // readable in an inbox instead of as a form dump.
    const message = [
      `From: ${form.from}`,
      `To: ${form.to}`,
      `Out: ${form.depart}${form.ret ? `   Back: ${form.ret}` : "   (one way)"}`,
      `Travelling: ${form.adults} adult${form.adults === "1" ? "" : "s"}${Number(form.children) > 0 ? `, ${form.children} child${form.children === "1" ? "" : "ren"}` : ""}`,
      `Cabin: ${form.cabin}`,
      form.baggage.trim() ? `Baggage: ${form.baggage.trim()}` : "Baggage: not said",
      form.budget.trim() ? `Budget: ${form.budget.trim()}` : "Budget: not said",
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : "",
      form.notes.trim() ? `\nAnything else:\n${form.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          subject: `Flight booking request — ${form.from} → ${form.to}`,
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send it just now.");
        return;
      }
      setSent(true);
      setForm(EMPTY);
    } catch {
      setError(`Could not reach us just now. Please try again, or email ${words.contactEmail}.`);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-[var(--gold-light)] bg-[#FAF8F3] p-8 text-center shadow-[0_18px_50px_rgba(16, 47, 53,.08)] sm:p-10">
        <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">We have your flight details.</p>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          A person reads this and comes back to you with what is available and what it costs. For anything urgent,
          email {words.contactEmail}.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 rounded-full border border-[var(--gold)] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 shadow-[0_18px_50px_rgba(16, 47, 53,.08)] sm:p-8 lg:p-10">
      <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--navy)] sm:text-4xl">Send us the flight</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
        Fill in what you know. A person reads it and comes back to you with the options and what they cost.
      </p>

      {!open && <ComingSoonNotice what="Personal flight booking" className="mt-6" contactEmail={words.contactEmail} />}

      {/* One disabled fieldset rather than a `disabled` on each field: it takes
          the whole form out of the tab order and out of validation in one
          move, which is exactly what "this is not taking requests" means. */}
      <fieldset disabled={!open} className={`mt-8 grid gap-x-5 gap-y-6 sm:grid-cols-2 ${open ? "" : "opacity-55"}`}>
        <label className="block"><span className={caption}>Flying from *</span><input required className={inputClass} value={form.from} onChange={(e) => set({ from: e.target.value })} placeholder="New York, JFK" /></label>
        <label className="block"><span className={caption}>Flying to *</span><input required className={inputClass} value={form.to} onChange={(e) => set({ to: e.target.value })} placeholder="Kraków, KRK" /></label>
        <label className="block"><span className={caption}>Date out *</span><DateField required value={form.depart} onChange={(v) => set({ depart: v })} min={today()} className={inputClass} ariaLabel="Date out" /></label>
        <label className="block"><span className={caption}>Date back — leave empty for one way</span><DateField min={notBefore(today(), form.depart)} value={form.ret} onChange={(v) => set({ ret: v })} className={inputClass} ariaLabel="Date back" /></label>
        <label className="block"><span className={caption}>Adults</span><input type="number" min={1} max={20} className={inputClass} value={form.adults} onChange={(e) => set({ adults: e.target.value })} /></label>
        <label className="block"><span className={caption}>Children</span><input type="number" min={0} max={20} className={inputClass} value={form.children} onChange={(e) => set({ children: e.target.value })} /></label>
        <label className="block">
          <span className={caption}>Cabin</span>
          <select className={inputClass} value={form.cabin} onChange={(e) => set({ cabin: e.target.value })}>
            <option>Economy</option>
            <option>Premium economy</option>
            <option>Business</option>
            <option>First</option>
            <option>Whatever is cheapest</option>
          </select>
        </label>
        <label className="block"><span className={caption}>Baggage</span><input className={inputClass} value={form.baggage} onChange={(e) => set({ baggage: e.target.value })} placeholder="2 checked bags, a stroller…" /></label>
        <label className="block"><span className={caption}>Budget</span><input className={inputClass} value={form.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="Per person, or for everyone" /></label>
        <label className="block"><span className={caption}>Your name *</span><input required className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="block"><span className={caption}>Email *</span><input required type="email" className={inputClass} value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="block"><span className={caption}>Phone</span><input type="tel" className={inputClass} value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
        <label className="block sm:col-span-2">
          <span className={caption}>Anything else</span>
          <textarea rows={4} className={inputClass} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Shabbos, a connection you want to avoid, seats together, an airline you have points with…" />
        </label>
      </fieldset>

      {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy || !open}
        className="mt-8 min-h-12 w-full rounded-full border border-[var(--navy)] bg-[var(--navy)] px-8 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_rgba(16, 47, 53,.16)] transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {!open ? "Currently unavailable" : busy ? "Sending…" : "Send the request"}
      </button>
    </form>
  );
}
