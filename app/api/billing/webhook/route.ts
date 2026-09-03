import { NextRequest, NextResponse } from "next/server";
import { type AccountPlan, PLAN_LABELS } from "@/lib/account-plans";
import { getPlan, setPlan } from "@/lib/account-plan-store";
import { agencyIdFor, deleteInvite, listOpenInvites, readAgency, setAccountAgency, writeAgency } from "@/lib/agency-store";
import { isOwner as isAgencyOwner } from "@/lib/agency";
import { sendSubscriptionNotification } from "@/lib/email";
import { identityKey } from "@/lib/identity";
import { isOneTimePlan, isPaidPlan } from "@/lib/plan-billing";
import { grantTripPass } from "@/lib/trip-pass-store";
import {
  accountForCustomer,
  ownEntitledPlan,
  readSubscription,
  rememberCustomer,
  type SubscriptionRecord,
  writeOneTimePurchase,
  writeSubscription,
} from "@/lib/plan-billing-store";
import { customerIdOf, readSubscriptionFromStripe, statusIsPaid, stripeWebhookSecret, verifyWebhook } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * What Stripe tells us, and the only thing on this site that puts an account
 * onto a paid plan without a person deciding to.
 *
 * SO IT VERIFIES FIRST AND DOES NOTHING ELSE UNTIL IT HAS. The raw body is
 * signed with the endpoint secret; anything that does not match is a 400 with
 * no detail. Without that check this URL would hand out paid accounts to
 * anybody who could POST to it.
 *
 * IT ALWAYS ANSWERS 200 ONCE THE EVENT IS REAL. Stripe retries anything else
 * for days, and an event this endpoint does not care about — there are
 * hundreds — is not a failure. A real failure is logged and still acknowledged,
 * because the useful repair is the owner reading the log, not Stripe posting
 * the same broken thing every hour for three days.
 *
 * IT NEVER TAKES A PLAN AWAY THAT IT DID NOT GIVE. A cancellation only demotes
 * an account whose current plan is the one this subscription paid for. Somebody
 * the owner put on Business by hand, who separately tried a Pro subscription
 * and cancelled it, keeps what the owner gave them.
 */

/** Grant a Trip Pass purchase — the one thing common to it settling immediately
 *  (a card, at checkout) and settling days later (an async payment method). */
async function grantOneTimePurchase(account: string, plan: AccountPlan, trip?: string): Promise<void> {
  // THE PASS IS THE THING BOUGHT. It is granted first and its failure is the
  // loud one, because this — not the plan field — is what actually opens a
  // trip in the app (lib/companion-access.ts). A pass bought while looking at
  // a trip lands already spent on it; bought from the pricing page it is spare
  // until the buyer chooses which trip it is for.
  if (!(await grantTripPass(account, trip))) {
    console.error("[billing] paid but the Trip Pass could not be written:", { account, plan, trip });
  }
  if (!(await setPlan(account, plan, "Stripe one-time purchase"))) {
    console.error("[billing] paid but the plan could not be set:", { account, plan });
  }
  // Recorded permanently, separate from the plan field itself — see
  // ownEntitledPlan in lib/plan-billing-store.ts for why: the plan field
  // gets overwritten the moment this account joins an agency, and this
  // purchase has to survive that.
  await writeOneTimePurchase(account, plan);
  await sendSubscriptionNotification({ account, plan: PLAN_LABELS[plan], event: "started" });
}

/**
 * Has this checkout session's grant already been handled?
 *
 * Stripe redelivers events — a slow 200, a manual resend — and grantTripPass
 * APPENDS a pass, so a second delivery of the same completed session would mint
 * a second (spare) pass for a single $9 payment. The checkout session id is
 * stable across redeliveries of that purchase, so claiming it once with a TTL'd
 * set-if-absent makes the grant idempotent: the first delivery claims it and
 * proceeds, every later one is turned away here.
 *
 * A store that is not configured, or a write that fails, returns false — better
 * to risk handling a rare duplicate than to drop a real payment when Redis is
 * down. The TTL is comfortably longer than Stripe's own retry window.
 */
const PROCESSED_PREFIX = "white-glove:stripe-events:";
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 3;

async function grantAlreadyHandled(object: Record<string, unknown>): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const sessionId = typeof object.id === "string" ? object.id : "";
  if (!url || !token || !sessionId) return false;
  try {
    const key = encodeURIComponent(`${PROCESSED_PREFIX}${sessionId}`);
    const res = await fetch(`${url.replace(/\/$/, "")}/set/${key}/1?NX=true&EX=${PROCESSED_TTL_SECONDS}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as { result?: unknown };
    // "OK" — we just claimed it, so this is the first time. null — NX found the
    // key already there, so the grant has run before and must not run again.
    return payload.result !== "OK";
  } catch {
    return false;
  }
}

async function accountFor(object: Record<string, unknown>): Promise<string> {
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  if (typeof metadata.account === "string" && metadata.account) return metadata.account;
  const reference = object.client_reference_id;
  if (typeof reference === "string" && reference) return reference;
  const customer = customerIdOf(object.customer);
  return customer ? ((await accountForCustomer(customer)) ?? "") : "";
}

/** The trip a Trip Pass was bought from, if the checkout carried one. */
function tripFrom(object: Record<string, unknown>): string | undefined {
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  return typeof metadata.trip === "string" && metadata.trip ? metadata.trip : undefined;
}

function planFrom(object: Record<string, unknown>): AccountPlan | null {
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  return isPaidPlan(metadata.plan) ? metadata.plan : null;
}

function periodEnd(object: Record<string, unknown>): string | undefined {
  const seconds = object.current_period_end;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

export async function POST(request: NextRequest) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    // Not configured is not the same as forged. Say so in the log, since a
    // deployment taking payments with no webhook secret has a subscription
    // nobody will ever be granted.
    console.error("[billing] webhook received but STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  // The bytes as they arrived. Parsing first and re-serialising would change
  // them — key order, spacing — and the signature would never match again.
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers.get("stripe-signature"), secret);
  if (!event) return NextResponse.json({ error: "Bad signature." }, { status: 400 });

  try {
    const object = event.data.object;

    if (event.type === "checkout.session.completed") {
      const account = await accountFor(object);
      const plan = planFrom(object);
      const customerId = customerIdOf(object.customer);
      if (!account || !plan) {
        console.error("[billing] checkout completed with no account or plan on it:", { account, plan, customerId });
        return NextResponse.json({ received: true });
      }
      if (customerId) await rememberCustomer(customerId, account);

      // One Trip pays once — no subscription object exists for it at all, so
      // there is nothing to record beyond the plan itself, and nothing that
      // could ever end it from underneath somebody the way a cancelled
      // subscription can. See lib/plan-billing.ts's ONE_TIME_PLANS.
      if (object.mode === "payment" || isOneTimePlan(plan)) {
        // "Completed" is a checkout-page event, not a money-moved event. A
        // card pays immediately and payment_status is already "paid" here —
        // but Stripe also offers payment methods (ACH debit and others) that
        // settle DAYS later, where this event fires the moment the SESSION
        // finishes and payment_status is still "unpaid". Granting here on
        // those would mint a permanent entitlement for a charge that has not
        // happened yet and might still fail — and with no subscription
        // behind a one-time purchase, nothing would ever take it back.
        // createCheckoutSession pins this flow to cards only (lib/stripe.ts)
        // so this should always already be "paid"; the check stays as the
        // real guarantee rather than trusting that configuration alone.
        if (object.payment_status !== "paid") {
          console.log("[billing] one-time checkout completed but not yet paid — waiting on async settlement:", { account, plan });
          return NextResponse.json({ received: true });
        }
        // A redelivered "completed" for this same session must not mint a
        // second pass — see grantAlreadyHandled.
        if (await grantAlreadyHandled(object)) return NextResponse.json({ received: true });
        await grantOneTimePurchase(account, plan, tripFrom(object));
        return NextResponse.json({ received: true });
      }

      const subscriptionId = typeof object.subscription === "string" ? object.subscription : customerIdOf(object.subscription);
      const now = new Date().toISOString();
      const existing = await readSubscription(account);
      // Read back from Stripe rather than assuming "active" — a first
      // subscription with a trial attached (see lib/plan-billing.ts's
      // TRIAL_DAYS) is "trialing" from the moment this event fires, and the
      // next event that would otherwise correct it may not arrive for the
      // whole length of the trial.
      const stripeSub = subscriptionId ? await readSubscriptionFromStripe(subscriptionId) : null;
      const record: SubscriptionRecord = {
        account,
        plan,
        customerId,
        subscriptionId,
        status: stripeSub?.status || "active",
        startedAt: existing?.startedAt || now,
        updatedAt: now,
      };
      await writeSubscription(record);

      // The plan is set LAST, and its failure is loud. Everything above is
      // bookkeeping; this is the thing the person actually paid for.
      if (!(await setPlan(account, plan, "Stripe subscription"))) {
        console.error("[billing] paid but the plan could not be set:", { account, plan });
      }
      await sendSubscriptionNotification({ account, plan: PLAN_LABELS[plan], event: "started" });
      return NextResponse.json({ received: true });
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      // The other half of the guard above: a delayed payment method that
      // completed the checkout page unpaid has now actually cleared.
      const account = await accountFor(object);
      const plan = planFrom(object);
      if (!account || !plan) {
        console.error("[billing] async payment succeeded with no account or plan on it:", { account, plan });
        return NextResponse.json({ received: true });
      }
      // ONLY for the one-time path — the branch above only skipped granting
      // for a one-time purchase, never for a subscription. A subscription
      // whose first invoice settles asynchronously is not this branch's to
      // grant: its own status arrives on customer.subscription.updated the
      // same as an immediately-paid subscription, and granting unconditionally
      // here would have written a PERMANENT one-time-purchase record for a
      // Starter/Pro subscription — one that would outlive the subscription
      // itself ending.
      if (object.mode === "payment" || isOneTimePlan(plan)) {
        if (await grantAlreadyHandled(object)) return NextResponse.json({ received: true });
        await grantOneTimePurchase(account, plan, tripFrom(object));
      }
      return NextResponse.json({ received: true });
    }

    // async_payment_failed needs no branch: checkout.session.completed above
    // never granted anything for an unpaid session, so there is nothing to
    // take back.

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const account = await accountFor(object);
      if (!account) {
        console.error("[billing] subscription event with no account behind it:", customerIdOf(object.customer));
        return NextResponse.json({ received: true });
      }
      const status = typeof object.status === "string" ? object.status : "canceled";
      const existing = await readSubscription(account);
      const plan = planFrom(object) ?? existing?.plan ?? null;
      const now = new Date().toISOString();

      if (plan) {
        await writeSubscription({
          account,
          plan,
          customerId: customerIdOf(object.customer) || existing?.customerId || "",
          subscriptionId: typeof object.id === "string" ? object.id : existing?.subscriptionId || "",
          status: event.type === "customer.subscription.deleted" ? "canceled" : status,
          currentPeriodEnd: periodEnd(object) ?? existing?.currentPeriodEnd,
          cancelAtPeriodEnd: object.cancel_at_period_end === true,
          startedAt: existing?.startedAt || now,
          updatedAt: now,
        });
      }

      const ended = event.type === "customer.subscription.deleted" || !statusIsPaid(status);
      if (ended && plan) {
        // Only what this subscription gave. See the note at the top: a plan the
        // owner granted by hand is his to take away, not Stripe's.
        const current = await getPlan(account);
        if (current === plan) {
          await setPlan(account, "free", "Stripe subscription ended");
          await sendSubscriptionNotification({ account, plan: PLAN_LABELS[plan], event: "ended" });
        }

        // The Advisor Pro subscription that was paying for a whole agency
        // just ended. Every OTHER member was promoted to pro by hand when
        // they joined (app/api/account/agency/join/route.ts), with no
        // subscription of Stripe's own behind it — nothing else will ever
        // demote them, and left alone they would keep Advisor Pro for free,
        // indefinitely.
        //
        // TAKEN OFF THE AGENCY ENTIRELY, not just demoted — the same as the
        // owner removing them by hand (remove-member below). A seat nobody
        // is paying for is not a seat that is still theirs to keep warm: if
        // it stayed on the roster with agencyId still pointing at this
        // agency, the owner resubscribing later would find seats that
        // LOOK filled but promote nobody back (nothing re-checks a former
        // member automatically), which is worse than an honest empty
        // roster the owner re-invites onto. Each account is set back to
        // whatever THEIR OWN subscription or one-time purchase, if any,
        // actually entitles them to (ownEntitledPlan) rather than a blanket
        // free — the same rule leaving or being removed already follows.
        if (plan === "pro") {
          const agencyId = await agencyIdFor(account);
          const agency = agencyId ? await readAgency(agencyId) : null;
          if (agencyId && !agency) {
            // A transient read failure, not "no agency" — agencyId says
            // there should be one. Silently skipping the cleanup below would
            // leave every other member on unpaid Pro with nothing ever
            // trying again: Stripe does not retry this event once it is
            // acknowledged 200, and nothing else on the site re-checks a
            // former subscriber's agency on its own.
            console.error(`[agency] could not read agency ${agencyId} for ${account} after its Pro subscription ended — roster cleanup skipped`);
          }
          if (agency && isAgencyOwner(agency, account)) {
            const others = agency.members.filter((m) => identityKey(m.account) !== identityKey(account));
            for (const member of others) {
              await setAccountAgency(member.account, undefined);
              await setPlan(member.account, await ownEntitledPlan(member.account), "The agency's Advisor Pro subscription ended");
            }
            // Always written, even when `others` is empty: seatsPurchased
            // resets to the base seat (the owner alone) because nothing is
            // paying for extra seats once the subscription that bought them
            // has ended. Left at the old count, a resubscribed owner could
            // invite straight back up to capacity Stripe was never asked to
            // charge for again — buy-seats sets a fresh count the next time
            // seats are actually bought.
            const cleared = {
              ...agency,
              members: agency.members.filter((m) => identityKey(m.account) === identityKey(account)),
              seatsPurchased: 1,
              updatedAt: new Date().toISOString(),
            };
            if (!(await writeAgency(cleared))) {
              console.error(`[agency] could not clear the roster for ${agencyId} after its Pro subscription ended`);
            }
            // Any invite still open would otherwise keep working, whether or
            // not anybody had accepted one yet — used days later, it mints a
            // fresh unpaid Pro account the same way the members just removed
            // above got theirs. The invite route itself now also refuses
            // once the owner's plan has lapsed (see "invite" in
            // app/api/account/agency/route.ts), but a stale link already in
            // somebody's inbox does not care about that check until it is
            // used, so it is cleared here too rather than left to expire on
            // its own in up to 14 days.
            for (const invite of await listOpenInvites(agency.id)) await deleteInvite(invite);
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Everything else Stripe sends. Acknowledged and ignored on purpose.
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing] webhook handler threw:", error);
    // Still 200. See the note at the top.
    return NextResponse.json({ received: true });
  }
}
