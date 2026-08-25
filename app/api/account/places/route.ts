import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import { accountCookieName, getCurrentAccountData, saveAccountCollection, toggleAccountPlace } from "@/lib/account-store";
import type { SavedPlace } from "@/data/route-utils";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const body = await request.json().catch(() => null) as { collection?: "route" | "favorites"; action?: "toggle" | "replace"; place?: SavedPlace; items?: SavedPlace[] } | null;
  if (!body?.collection) return NextResponse.json({ error: "Choose a collection to update." }, { status: 400 });
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (body.action === "replace") {
    if (!Array.isArray(body.items)) return NextResponse.json({ error: "Provide a list of places." }, { status: 400 });
    const saved = await saveAccountCollection(account.email, body.collection, body.items);
    if (!saved) return NextResponse.json({ error: "Could not save the account data." }, { status: 503 });
  } else {
    if (!body.place) return NextResponse.json({ error: "Choose a place to save." }, { status: 400 });
    const saved = await toggleAccountPlace(account.email, body.collection, body.place);
    if (!saved) return NextResponse.json({ error: "Could not save the account data." }, { status: 503 });
  }
  const next = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  return NextResponse.json({ ok: true, account: next });
}
