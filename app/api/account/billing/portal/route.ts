import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { readSubscription } from "@/lib/plan-billing-store";
import { siteOrigin } from "@/lib/seo";
import { createPortalSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Changing a card, or cancelling.
 *
 * SENT TO STRIPE'S OWN PAGE ON PURPOSE. Cancelling is the moment a subscription
 * either behaves decently or does not, and building that screen here would mean
 * building a way to make it hard. Stripe's portal shows what they pay, when it
 * renews, and a cancel button that works — and it is the same page whether the
 * subscription was bought yesterday or two years ago.
 *
 * Somebody the owner put on a plan by hand has no Stripe customer and gets a
 * plain answer saying so, rather than an error.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const subscription = await readSubscription(account.email);
  if (!subscription?.customerId) {
    return NextResponse.json(
      { error: "There is no subscription on this account. If somebody set your plan up for you, write to us and we will sort it out." },
      { status: 409 },
    );
  }

  const origin = siteOrigin()?.origin || request.nextUrl.origin;
  const session = await createPortalSession({ customerId: subscription.customerId, returnUrl: `${origin}/account` });
  if (!session.ok || !session.data.url) {
    console.error("[billing] portal failed:", session.ok ? "no url returned" : session.error);
    return NextResponse.json({ error: "That could not be opened just now. Please try again shortly." }, { status: 502 });
  }
  return NextResponse.json({ url: session.data.url });
}
