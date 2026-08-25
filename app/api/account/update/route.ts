import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/secure-access";
import {
  accountCookieName,
  changeAccountEmail,
  createSessionCookie,
  getCurrentAccountSummary,
  readSessionEmail,
  updateAccountProfile,
} from "@/lib/account-store";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const cookieStore = await cookies();
  const cookie = cookieStore.get(accountCookieName())?.value;
  const email = readSessionEmail(cookie);
  if (!email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { name?: string; phone?: string; email?: string }
    | null;
  if (!body) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const profile = await updateAccountProfile(email, { name: body.name, phone: body.phone });
  if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: 400 });

  let currentEmail = email;
  let emailChanged = false;
  const requestedEmail = body.email?.trim().toLowerCase();
  if (requestedEmail && requestedEmail !== email) {
    const changed = await changeAccountEmail(email, requestedEmail);
    if (!changed.ok) return NextResponse.json({ error: changed.error }, { status: 400 });
    currentEmail = changed.email;
    emailChanged = true;
  }

  const summary = await getCurrentAccountSummary(createSessionCookie(currentEmail));
  const response = NextResponse.json({ ok: true, account: summary });
  if (emailChanged) {
    response.cookies.set(accountCookieName(), createSessionCookie(currentEmail), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
