import Link from "next/link";
import AdminDuffelTools from "@/components/AdminDuffelTools";
import { duffelTokenHelp, inspectConfiguredDuffelToken } from "@/lib/duffel-token";

/**
 * The Duffel flight (and stay) tools, in the admin and nowhere else.
 *
 * WHY IT LIVES HERE. Duffel is a real booking engine: it takes a card, issues
 * a ticket, and creates an obligation to the traveler that a referral link
 * does not. Running it on the public site made this an online travel agent
 * in every way that matters legally. Visitors search through partner links
 * on /book. This screen is the only place that can search and book through
 * Duffel, and it is gated to the money area.
 *
 * `/book` and `/book/review` no longer offer it. `lib/booking-partners.ts`
 * cannot route the public site to Duffel at all.
 */
export default function AdminDuffelPage() {
  const token = inspectConfiguredDuffelToken();
  const help = duffelTokenHelp(token.kind);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.26em] text-[var(--gold-ink)]">Money · Duffel</p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)]">
        Search and book through Duffel
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-stone-600">
        This is the only place on the site that can issue a ticket. Visitors search through the partner links on{" "}
        <Link href="/book" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          the booking page
        </Link>
        . Nothing there uses Duffel, and no setting can turn it on for them.
      </p>

      <div className="mt-8 rounded-xl border border-[var(--gold)] bg-[#FAF8F3] p-5">
        <p className="text-sm leading-6 text-stone-700">
          <span className="font-semibold text-[var(--navy)]">A booking made here is a real one.</span> Search
          creates live offers. If you continue to pay, Duffel collects the card and is the merchant of record —
          White Glove is not taking cards on the public site. Airline change and refund rules apply from the
          moment a ticket is issued. This screen is admin-only.
        </p>
      </div>

      {!token.ready ? (
        <div className="mt-8 rounded-xl border-2 border-amber-600 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">{help.message}</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">{help.detail}</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            You can confirm the key from{" "}
            <Link href="/admin/settings/connections" className="font-semibold underline">
              Connections
            </Link>
            . The search below is wired; it will not return fares until a real token is set.
          </p>
        </div>
      ) : token.kind === "test" ? (
        <div className="mt-8 rounded-xl border-2 border-amber-600 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Connected in test mode.</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">{help.detail}</p>
        </div>
      ) : null}

      <div className="mt-8">
        {/* Choose-flight continues at /admin/duffel/review */}
        <AdminDuffelTools />
      </div>
    </div>
  );
}
