"use client";

import { useEffect, useState } from "react";

type LogEntry = { at: string; kind: string; to: string; ok: boolean; status?: number; error?: string; sandboxRestricted?: boolean };
type Config = {
  apiKeySet?: boolean;
  from?: string;
  usingTestSender?: boolean;
  /** What each front door actually sends as. */
  senderKosher?: string;
  senderItineraries?: string;
  /** One line per brand sending from a domain that is not its own. */
  senderMismatch?: string[];
  editsInbox?: string;
  contactInboxKosher?: string;
  contactInboxItineraries?: string;
  inboxesSplit?: boolean;
  editsInboxFromEnv?: boolean;
  contactInboxKosherFromEnv?: boolean;
  contactInboxItinerariesFromEnv?: boolean;
  lastFailure?: { at: string; to: string; error?: string; status?: number } | null;
  log?: LogEntry[];
  logAvailable?: boolean;
};
type Result = { ok?: boolean; to?: string; status?: number; id?: string; error?: string; sandboxRestricted?: boolean; config?: Config };

const code = "rounded bg-[var(--cream)] px-1 font-mono text-[12px]";

export default function EmailDeliveryTest() {
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/admin/email-test", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConfig(d))
      .catch(() => undefined);
  }, []);

  async function test(inbox: "contact-kosher" | "contact-itineraries" | "edits") {
    setBusy(inbox);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inbox }) });
      const data = await res.json();
      setResult(data);
      if (data.config) setConfig(data.config);
    } catch {
      setResult({ ok: false, error: "Could not reach the server." });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Email delivery</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Do form submissions reach your inbox?</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        Send a real test message to each inbox and see exactly what the mail service says. If it fails, the reason is shown here instead of being hidden in the server log.
      </p>

      {config && (
        <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Mail service key</dt>
            <dd className={config.apiKeySet ? "text-emerald-700" : "font-semibold text-red-700"}>
              {config.apiKeySet ? "RESEND_API_KEY is set" : "RESEND_API_KEY is missing — no email can be sent"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Sending from</dt>
            <dd className={config.usingTestSender ? "font-semibold text-amber-800" : "text-stone-700"}>
              {config.from}
              {config.usingTestSender ? " — sandbox sender" : ""}
            </dd>
            <dt className="text-stone-500">Kosher Travel sends as</dt>
            <dd className="text-stone-700">{config.senderKosher || "—"}</dd>
            <dt className="text-stone-500">Itineraries sends as</dt>
            <dd className="text-stone-700">{config.senderItineraries || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Contact form — Kosher Travel</dt>
            <dd className="text-stone-700">
              {config.contactInboxKosher}
              <span className="ml-2 text-xs text-stone-500">somebody writing in — these need an answer</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Contact form — Itineraries</dt>
            <dd className="text-stone-700">
              {config.contactInboxItineraries}
              <span className="ml-2 text-xs text-stone-500">its own company, its own inbox</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Edits, listings and submissions</dt>
            <dd className="text-stone-700">
              {config.editsInbox}
              <span className="ml-2 text-xs text-stone-500">corrections to check against a source</span>
            </dd>
          </div>
          {!config.inboxesSplit && (
            <div className="sm:col-span-2 text-xs text-amber-800">
              Two or more of these are pointing at the same mailbox. Different jobs will sit mixed together.
            </div>
          )}
        </dl>
      )}

      {/* THE FAILURE NOTHING ELSE HERE WOULD MENTION. Mail from the wrong
          domain sends perfectly: Resend answers 200, the log shows a success,
          and the only person who finds out is a customer who signed up on one
          site and got their code from the other one's address. */}
      {(config?.senderMismatch?.length ?? 0) > 0 && (
        <div className="mt-5 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          <strong>A site is sending from the wrong domain.</strong>
          <ul className="mt-1 list-disc pl-5">
            {config!.senderMismatch!.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2">
            Somebody signing up there gets their code from the other site&apos;s address. Set
            <code className={code}>RESEND_FROM_EMAIL</code> on this deployment to an address on its own domain, then redeploy.
          </p>
        </div>
      )}

      {config?.usingTestSender && (
        <div className="mt-5 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <strong>This is very likely why your mail isn&apos;t arriving.</strong> You&apos;re sending from Resend&apos;s shared sandbox address
          (<code className={code}>onboarding@resend.dev</code>), which is only allowed to deliver to the email address that owns the Resend
          account — messages to <code className={code}>{config.contactInboxKosher}</code> get rejected. To fix it: verify
          <strong> whiteglovekoshertravel.com</strong> in Resend (add the DNS records it gives you), then set
          <code className={code}>RESEND_FROM_EMAIL</code> to something like
          <code className={code}>White Glove Kosher Travel &lt;no-reply@whiteglovekoshertravel.com&gt;</code> and redeploy.
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => test("contact-kosher")} disabled={Boolean(busy)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">
          {busy === "contact-kosher" ? "Sending…" : "Test Kosher Travel's contact inbox"}
        </button>
        <button type="button" onClick={() => test("contact-itineraries")} disabled={Boolean(busy)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">
          {busy === "contact-itineraries" ? "Sending…" : "Test Itineraries' contact inbox"}
        </button>
        <button type="button" onClick={() => test("edits")} disabled={Boolean(busy)} className="border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-60">
          {busy === "edits" ? "Sending…" : "Test the edits inbox"}
        </button>
      </div>

      {result && (
        <div className={`mt-5 border-l-4 px-4 py-3 text-sm leading-6 ${result.ok ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-red-400 bg-red-50 text-red-900"}`}>
          {result.ok ? (
            <>
              <strong>Accepted by the mail service</strong> — sent to <code className={code}>{result.to}</code>
              {result.id ? <> (id <code className={code}>{result.id}</code>)</> : null}.
              <p className="mt-2">If it still doesn&apos;t appear, check that mailbox&apos;s spam folder, and confirm the mailbox actually exists and its MX records point to your mail host.</p>
            </>
          ) : (
            <>
              <strong>Failed to send to {result.to}</strong>
              {result.status ? ` (HTTP ${result.status})` : ""}.
              {result.error ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">{result.error}</pre> : null}
              {result.sandboxRestricted && <p className="mt-2 font-semibold">This is the sandbox-sender restriction described above — verify your domain in Resend and set RESEND_FROM_EMAIL.</p>}
            </>
          )}
        </div>
      )}

      {/* Real sends, from every route. A test can succeed while the contact
          form quietly fails, and until this existed there was nowhere that
          difference showed up: each serverless instance only remembered its
          own sends, so the dashboard never saw what /api/contact did. */}
      <div className="mt-8 border-t border-[var(--gold-light)] pt-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Recent messages the site actually tried to send</p>
        {!config?.logAvailable ? (
          <p className="mt-2 text-sm text-stone-500">
            Needs the shared store (UPSTASH_REDIS_REST_URL / _TOKEN) to keep a history — without it, each request is forgotten as soon as it finishes.
          </p>
        ) : config?.log?.length ? (
          <ul className="mt-3 space-y-2">
            {config.log.slice(0, 12).map((e, i) => (
              <li key={i} className={`border-l-4 px-3 py-2 text-sm leading-6 ${e.ok ? "border-emerald-300 bg-emerald-50/60 text-emerald-900" : "border-red-400 bg-red-50 text-red-900"}`}>
                <span className="font-semibold">{e.ok ? "Sent" : "Failed"}</span>
                {" · "}{e.kind}{" → "}<code className={code}>{e.to}</code>
                <span className="ml-2 text-xs opacity-70">{new Date(e.at).toLocaleString()}</span>
                {e.error && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs">{e.error.slice(0, 400)}</pre>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Nothing sent yet. Submit the contact form, or send a test above, and it will appear here.</p>
        )}
      </div>
    </section>
  );
}
