import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";
import { accountCookieName, getCurrentAccountData, getTrips } from "@/lib/account-store";
import { isBillingPeriod, isOneTimePlan, isPaidPlan, planIsOfferable, priceIdFor, TRIAL_DAYS, trialEligible } from "@/lib/plan-billing";
import { readPlanOffering, readSubscription, rememberCustomer } from "@/lib/plan-billing-store";
import { siteOrigin } from "@/lib/seo";
import { createCheckoutSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Starting a subscription.
 *
 * THIS ROUTE REFUSES BY DEFAULT. A deployment where the owner has not opened
 * the offering, or has it on "ask" rather than Stripe, answers "not open" — it
 * does not fall through to a checkout because somebody found the address. The
 * switch is checked here, on the server, every time; the button on the account
 * page not being drawn is a courtesy, not the control.
 *
 * IT NEVER TOUCHES A CARD. Everything it does is create a session on Stripe and
 * hand back the URL of Stripe's own page. Nothing about the card comes back
 * here, then or ever.
 *
 * IT DOES NOT SET THE PLAN. Pressing subscribe and arriving on Stripe's page is
 * not paying; a route that granted Pro at this point would give it away to
 * anybody who clicked and then closed the tab. The plan is set by the webhook,
 * when Stripe says money moved.
 */
/**
 * The trip id to carry through Stripe, or undefined.
 *
 * Undefined for anything this account does not own — a tampered id, a stale
 * one from a tab left open, or a trip deleted since the page was drawn. Never
 * throws: a purchase must not fail because the trip list could not be read, so
 * an unreadable list means the pass is granted spare rather than not at all.
 */
async function ownTrip(email: string, wanted: unknown): Promise<string | undefined> {
  if (typeof wanted !== "string" || !wanted) return undefined;
  const trips = await getTrips(email).catch(() => []);
  return trips.some((trip) => trip.id === wanted) ? wanted : undefined;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { plan?: unknown; period?: unknown; trip?: unknown } | null;
  const plan = body?.plan;
  if (!isPaidPlan(plan)) return NextResponse.json({ error: "Choose which account you want." }, { status: 400 });
  const oneTime = isOneTimePlan(plan);
  // One Trip has one price, not a monthly/yearly choice — the period a
  // traveler sends is ignored for it, and its single price lives in the
  // same "monthly" slot every other plan's monthly price does.
  const period = oneTime ? "monthly" : isBillingPeriod(body?.period) ? body.period : "monthly";

  const offering = await readPlanOffering();
  if (offering.how !== "stripe" || !planIsOfferable(offering, plan)) {
    return NextResponse.json(
      { error: oneTime ? "That is not something you can buy here at the moment." : "That is not something you can subscribe to here at the moment." },
      { status: 409 },
    );
  }

  const priceId = priceIdFor(offering, plan, period);
  if (!priceId) {
    return NextResponse.json(
      { error: oneTime ? `${PLAN_LABELS[plan]} is not offered right now.` : `${PLAN_LABELS[plan]} is not offered ${period === "yearly" ? "yearly" : "monthly"}.` },
      { status: 409 },
    );
  }

  const current = await getPlan(account.email);
  // A SECOND TRIP PASS IS A REAL PURCHASE, not a duplicate. A pass is bought
  // per trip now, so somebody taking a second trip is meant to buy a second
  // one, and "you are already on Trip Pass" would be the site turning down
  // money for a thing it says it sells one at a time. The check still stands
  // for a subscription, where paying twice buys nothing.
  if (current === plan && !oneTime) {
    return NextResponse.json({ error: `You are already on ${PLAN_LABELS[plan]}.` }, { status: 409 });
  }

  const origin = siteOrigin()?.origin || request.nextUrl.origin;
  // Reuse the Stripe customer they already have, so somebody moving from Pro to
  // Business does not end up as two customers with two cards on file.
  const existing = await readSubscription(account.email);

  const session = await createCheckoutSession({
    priceId,
    plan,
    account: account.email,
    email: account.email.includes("@") ? account.email : undefined,
    customerId: existing?.customerId || undefined,
    successUrl: `${origin}/account?subscribed=${encodeURIComponent(plan)}`,
    cancelUrl: `${origin}/account?subscribed=cancelled`,
    mode: oneTime ? "payment" : "subscription",
    // Which trip they were looking at, so the pass lands on it — see the
    // `trip` note in createCheckoutSession.
    //
    // CHECKED AGAINST THEIR OWN TRIPS, NEVER TAKEN ON TRUST. This arrives in
    // the request body, so it can be edited to any string at all. Sending
    // somebody else's trip id does NOT unlock their trip — a pass is only ever
    // read back against the account that holds it, and opening a trip needs
    // the trip to be yours as well — but it does bind a $9 purchase to a trip
    // this account has not got, where nothing will ever release it and the
    // account page will say "every Trip Pass you have bought is on a trip".
    // The buyer pays and gets nothing. An id that is not theirs is dropped, so
    // the pass arrives spare and they can choose a trip for it.
    trip: oneTime ? await ownTrip(account.email, body?.trip) : undefined,
    trialDays: trialEligible(plan, Boolean(existing)) ? TRIAL_DAYS : undefined,
  });

  if (!session.ok || !session.data.url) {
    // The real reason goes to the log for the owner; the traveller gets a
    // sentence they can act on, because Stripe's messages are written for
    // developers and would only worry them.
    console.error("[billing] checkout failed:", session.ok ? "no url returned" : session.error);
    return NextResponse.json({ error: "That could not be started just now. Please try again shortly." }, { status: 502 });
  }

  // Written BEFORE they reach Stripe's page, because the webhook that arrives
  // when they pay may carry only a customer id, and this is the way back to a
  // person. A customer id with no account behind it is a payment nobody can be
  // given anything for.
  if (session.data.customer) await rememberCustomer(session.data.customer, account.email);

  return NextResponse.json({ url: session.data.url });
}
