import Link from "next/link";
import AdminPlanOfferingForm from "@/components/AdminPlanOfferingForm";
import { PLAN_LABELS } from "@/lib/account-plans";
import { describeOffering, PAID_PLANS } from "@/lib/plan-billing";
import { listSubscriptions, planBillingStoreAvailable, readPlanOffering } from "@/lib/plan-billing-store";
import { stripeReadiness } from "@/lib/stripe";

const PAID_PLAN_LIST = PAID_PLANS.map((plan) => PLAN_LABELS[plan]).join(", ");

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

/**
 * Whether this site sells anything, and on what terms.
 *
 * SEPARATE FROM "LIMITS". Limits are what a plan lets somebody do; this is
 * whether the plan is for sale at all. Putting them on one screen would mean
 * the switch that takes money sitting beside the number of printable copies a
 * free account gets, and one of those is not like the other.
 */
export default async function PlanOfferingSettings() {
  const [offering, subscriptions] = await Promise.all([readPlanOffering(), listSubscriptions()]);
  const stripe = stripeReadiness();

  return (
    <div className="pb-12">
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              {PAID_PLAN_LIST}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              Whether the paid plans are offered, and how somebody comes by one. Off is the state a site that has
              never been set up is in, and it is a perfectly good state to leave this in.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Settings
          </Link>
        </div>
      </header>

      <section className={`${card} mt-8`}>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Right now</p>
        <p className="mt-2 text-lg leading-7 text-[var(--navy)]">{describeOffering(offering)}</p>
        {offering.open && offering.how === "stripe" && stripe.testMode && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            This is a Stripe <strong>test</strong> key. Checkout will work and no real money will move — which is right
            while you are trying it, and wrong the day you mean it.
          </p>
        )}
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Nothing is taken away</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Turning this off does not close anybody&rsquo;s account or demote anybody. People already on a paid plan stay
          on it; the offering simply stops being shown to anybody new. The same is true of a subscription that ends —
          the trips, the notes and the shared links are all still there on the account, with no plan chosen and its
          limits back in place for anything new.
        </p>
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">The settings</h2>
        <AdminPlanOfferingForm current={offering} storeReady={planBillingStoreAvailable()} stripe={stripe} />
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">On a card now</h2>
        {subscriptions.length === 0 ? (
          <p className={`${card} mt-3 text-sm leading-6 text-stone-600`}>
            Nobody. Accounts you put on a plan yourself do not appear here — this is only what Stripe is billing.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {subscriptions.map((row) => (
              <li key={row.account} className={`${card} flex flex-wrap items-center justify-between gap-3 text-sm`}>
                <span className="text-[var(--navy)]">{row.account}</span>
                <span className="text-stone-600">
                  {PLAN_LABELS[row.plan]} · {row.status}
                  {row.cancelAtPeriodEnd ? " · ending at the end of the period" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
