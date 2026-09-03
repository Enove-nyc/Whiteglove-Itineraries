import Link from "next/link";
import AdminUnsubscribeButton from "@/components/AdminUnsubscribeButton";
import { ALERT_TOPIC_LABELS, type AlertTopic } from "@/lib/email-alerts";
import { alertsStoreAvailable, listAlertSignups } from "@/lib/email-alerts-store";
import { emailConfigStatus } from "@/lib/email";
import { getAlertSignupTotal, getAlertTopicCounts } from "@/lib/site-analytics";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

export default async function AdminAlertsPage() {
  const storeReady = alertsStoreAvailable();
  const [signups, emailStatus, topicCounts, totalTracked] = await Promise.all([
    storeReady ? listAlertSignups(200) : Promise.resolve([]),
    emailConfigStatus(),
    getAlertTopicCounts(20),
    getAlertSignupTotal(),
  ]);

  const destinationRequests = signups.filter(
    (s) => s.destinationSlug || s.destinationQuery || s.topics.includes("destination_updates") || s.topics.includes("searched_destination"),
  );

  return (
    <div className="pb-12">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Customer updates</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Alerts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          People who asked to be told about new destinations, listings, seasonal programmes or a specific place. Consent
          is required at signup. This screen is the list itself — who asked and for what. Writing to them is its own
          screen, with its own switch.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          <Link href="/admin/alerts/send" className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Send an update →
          </Link>
          <Link href="/admin/growth" className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Search &amp; booking numbers →
          </Link>
        </p>
      </header>

      <section className={`${card} mt-7 space-y-2`}>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Delivery</h2>
        {!emailStatus.apiKeySet ? (
          <p className="text-sm leading-6 text-stone-600">
            Resend is not connected (<code>RESEND_API_KEY</code> missing). Signups are still stored when Redis is on, but
            nothing is emailed from here — no fake send.
          </p>
        ) : (
          <p className="text-sm leading-6 text-stone-600">
            Resend is configured. From: <code>{emailStatus.from}</code>
            {emailStatus.usingTestSender ? " (sandbox sender — only delivers to the Resend account owner until a domain is verified)." : "."}
          </p>
        )}
        {!storeReady ? (
          <p className="text-sm leading-6 text-amber-900">
            Private store not connected — signups cannot be saved until UPSTASH_REDIS_REST_URL and _TOKEN are set.
          </p>
        ) : (
          <p className="text-sm leading-6 text-stone-600">
            {signups.length} active signup{signups.length === 1 ? "" : "s"}
            {totalTracked > 0 ? ` · ${totalTracked} signup events counted in analytics` : ""}.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Topics people chose</h2>
        {topicCounts.length === 0 ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>No topic counts yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {topicCounts.map((row) => (
              <li key={row.label} className={`${card} flex justify-between gap-3 text-sm`}>
                <span className="text-[var(--navy)]">
                  {ALERT_TOPIC_LABELS[row.label as AlertTopic] || row.label}
                </span>
                <span className="tabular-nums text-stone-500">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Destination alert requests</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Signups tied to a place — updates for a destination, or “tell me when this searched place is added”.
        </p>
        {destinationRequests.length === 0 ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {destinationRequests.slice(0, 40).map((row) => (
              <li key={`${row.email}-dest`} className={`${card} text-sm`}>
                <p className="font-semibold text-[var(--navy)]">{row.destinationSlug || row.destinationQuery || "Place named in topics"}</p>
                <p className="mt-1 text-stone-600">{row.email}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Active signups</h2>
        {!storeReady ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>Connect the private store to see signups.</p>
        ) : signups.length === 0 ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>Nobody has signed up yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {signups.map((row) => (
              <li key={row.email} className={`${card} flex flex-wrap items-start justify-between gap-4`}>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--navy)]">{row.email}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {row.topics.map((t) => ALERT_TOPIC_LABELS[t]).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Consent {row.consentedAt.slice(0, 10)}
                    {row.sourcePage ? ` · from ${row.sourcePage}` : ""}
                    {row.destinationSlug || row.destinationQuery
                      ? ` · ${row.destinationSlug || row.destinationQuery}`
                      : ""}
                  </p>
                </div>
                <AdminUnsubscribeButton email={row.email} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
