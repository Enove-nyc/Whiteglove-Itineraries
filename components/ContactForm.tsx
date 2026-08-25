"use client";

import { useState } from "react";
import { BUILT_IN_WORDS, type SiteWords } from "@/data/site-words";
import {
  composeMessage,
  missingFields,
  reasonSpec,
  type ContactReason,
} from "@/lib/contact-reasons";

/**
 * The short form: a correction, an advertising enquiry, a site fault, or a
 * question.
 *
 * A fourth reason — asking us to plan a trip — used to be handled by a
 * separate form here. That service was removed from the site outright; see
 * AGENTS.md, "Personal trip planning has been removed". This form now covers
 * every remaining errand, and it exists because each of them needs two or
 * three specific facts that a bare message box does not collect — which page
 * the error is on, which business is enquiring — and every one of those costs
 * a reply asking for what the form should have asked for.
 *
 * WHICH FIELDS APPEAR IS NOT DECIDED HERE. lib/contact-reasons.ts owns that,
 * so a field cannot leak from one errand to another: nobody reporting a wrong
 * address is asked how many children are travelling.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-base text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)] sm:text-sm";
const caption = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600";

export default function ContactForm({
  reason,
  words = BUILT_IN_WORDS,
}: {
  reason: ContactReason;
  /**
   * The site's own wording, read on the server (/admin/settings/words). The
   * built-in set is a complete one, so a caller that passes nothing shows
   * exactly what this said before any of it was editable.
   */
  words?: SiteWords;
}) {
  const spec = reasonSpec(reason);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please add your name, email, and a message.");
      return;
    }
    // Named, rather than "please fill in the required fields" — the browser
    // will say that too, and this is the message somebody gets when they have
    // pasted around it.
    const missing = missingFields(reason, answers);
    if (missing.length > 0) {
      setError(`Please add: ${missing.map((field) => field.label.toLowerCase()).join(", ")}.`);
      return;
    }
    setBusy(true);
    // A network failure used to leave the button stuck on "Sending…" with no
    // error. try/catch/finally reports the failure and always frees the button.
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          // The reason travels with the message so the server can put the right
          // card on the board. It is checked there against the known list rather
          // than trusted — this is a public endpoint.
          reason,
          subject: spec.subject,
          message: composeMessage(reason, answers, form.message),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send your message.");
        return;
      }
      setSent(true);
      setForm({ name: "", email: "", phone: "", message: "" });
      setAnswers({});
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="wg-card border border-[var(--gold-light)] bg-[#fcfaf6] p-8 text-center">
        <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
          Thank you — your message is on its way.
        </p>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          {words.replyPromise} For anything urgent, email us directly at {words.contactEmail}.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 min-h-11 border border-[var(--gold)] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="wg-card border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
      <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
        {spec.heading}
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {spec.fields.map((field) => (
          <label key={field.name} className={field.kind === "textarea" ? "block sm:col-span-2" : "block"}>
            <span className={caption}>
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.kind === "textarea" ? (
              <textarea
                required={field.required}
                placeholder={field.placeholder}
                className={`${inputClass} min-h-[100px]`}
                value={answers[field.name] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [field.name]: e.target.value })}
              />
            ) : (
              <input
                type={field.kind === "url" ? "url" : "text"}
                required={field.required}
                placeholder={field.placeholder}
                className={inputClass}
                value={answers[field.name] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [field.name]: e.target.value })}
              />
            )}
            {field.hint && <span className="mt-1.5 block text-xs leading-5 text-stone-500">{field.hint}</span>}
          </label>
        ))}

        <label className="block">
          <span className={caption}>Your name *</span>
          <input
            required
            autoComplete="name"
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className={caption}>Email *</span>
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={caption}>Phone (optional)</span>
          <input
            autoComplete="tel"
            className={inputClass}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={caption}>{spec.messageLabel} *</span>
          <textarea
            required
            className={`${inputClass} min-h-[140px]`}
            placeholder={spec.messagePlaceholder}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send message"}
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
