import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { askForPlan, getPlan, openRequestFor, planStoreAvailable } from "@/lib/account-plan-store";
import { PLAN_LABELS } from "@/lib/account-plans";
import { sendPlanRequestNotification } from "@/lib/email";
import { siteOrigin } from "@/lib/seo";
import { cardIfWanted } from "@/lib/trello-store";
import { requestProblem } from "@/lib/account-plans";
import { accountCookieName, readSessionEmail } from "@/lib/account-store";

/**
 * Asking for a different kind of account.
 *
 * NOTHING IS CHARGED HERE, and there is nothing in this file that could
 * charge anybody: no card, no processor, no order. It writes down that a
 * person wants One Trip, Advisor Starter or Advisor Pro so the owner can see
 * it and answer. The screen that calls this says so in as many words.
 *
 * The plan itself is never set from here. A person saying they would like
 * one is not the same as having it, and an endpoint that granted what it was
 * asked for would make the whole thing meaningless.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const account = readSessionEmail(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!planStoreAvailable()) {
    return NextResponse.json({ error: "Plans are unavailable at the moment. Please try again shortly." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { wanted?: string; note?: string } | null;
  if (!body) return NextResponse.json({ error: "Choose which kind of account you want." }, { status: 400 });

  // Checked against what they are actually on, read now — not against
  // whatever the page believed when it was drawn.
  const current = await getPlan(account);
  const problem = requestProblem({ current, wanted: body.wanted, note: body.note });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const saved = await askForPlan({
    account,
    // Safe: requestProblem returned null, so this is one of the known plans.
    wanted: body.wanted as "one_trip" | "starter" | "pro",
    note: body.note,
  });
  if (!saved) return NextResponse.json({ error: "That could not be saved. Please try again." }, { status: 500 });

  // Told to the owner, because the request used to arrive in complete silence
  // — written to the store, shown on /admin/accounts, and announced nowhere.
  // Meanwhile the person who asked was told "we will be in touch".
  //
  // NOT AWAITED, and it must not be. The request IS saved; an email service
  // that is slow or away must not turn a saved request into an error the
  // person sees, which would have them ask again and again.
  void sendPlanRequestNotification({
    account,
    wanted: PLAN_LABELS[body.wanted as "one_trip" | "starter" | "pro"],
    currentPlan: PLAN_LABELS[current],
    note: body.note,
  }).catch(() => undefined);

  // And a card, for an owner who works from a board rather than an inbox.
  void cardIfWanted({
    kind: "plan",
    about: PLAN_LABELS[body.wanted as "one_trip" | "starter" | "pro"],
    siteUrl: siteOrigin()?.toString(),
  });

  return NextResponse.json({ ok: true, request: await openRequestFor(account) });
}
