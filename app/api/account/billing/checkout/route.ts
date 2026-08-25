import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { PLAN_LABELS } from "@/lib/account-plans";
import { getPlan } from "@/lib/account-plan-store";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
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
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { plan?: unknown; period?: unknown } | null;
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
  if (current === plan) {
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
