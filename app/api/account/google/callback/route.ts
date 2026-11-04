import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, createSessionCookie, hasAccountStorage, signInWithGoogle } from "@/lib/account-store";
import { hasSiteAccess } from "@/lib/admin-roles";
import { claimsFromIdToken, googleConfig, identityFrom, TOKEN_ENDPOINT } from "@/lib/google-signin";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { recordSignIn, whereFrom } from "@/lib/signin-log";
import { PENDING_COOKIE } from "@/lib/google-signin";
import { publicUrl } from "@/lib/public-origin";

/**
 * Coming back from Google.
 *
 * Everything that could go wrong here sends the visitor back to the sign-in
 * page with a short reason rather than showing them a JSON error, because the
 * only thing they can act on is "try again" or "use your password".
 */
export const dynamic = "force-dynamic";

type Pending = { state: string; nonce: string; verifier: string; next: string; redirectUri: string };

function back(request: NextRequest, problem: string) {
  const url = publicUrl(request, "/login");
  url.searchParams.set("google", problem);
  const response = NextResponse.redirect(url);
  response.cookies.delete(PENDING_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const config = googleConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });
  if (!config) return back(request, "unavailable");
  if (!hasAccountStorage()) return back(request, "storage");

  const gate = await rateLimit(`google-callback:${requesterKey(request.headers)}`, { limit: 20, windowSeconds: 15 * 60 });
  if (!gate.ok) return NextResponse.json({ error: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });

  // Somebody pressing "cancel" on Google's screen is not an error worth a
  // scary message — it is a decision.
  if (request.nextUrl.searchParams.get("error")) return back(request, "cancelled");

  let pending: Pending | null = null;
  try {
    const raw = request.cookies.get(PENDING_COOKIE)?.value;
    pending = raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    pending = null;
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  // A reply with no matching cookie is either an expired attempt or one this
  // browser never started. Neither is something to sign anybody in for.
  if (!pending || !code || !state || state !== pending.state) return back(request, "state");

  let idToken: string | undefined;
  try {
    const exchanged = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: pending.redirectUri,
        grant_type: "authorization_code",
        code_verifier: pending.verifier,
      }),
    });
    if (!exchanged.ok) return back(request, "exchange");
    idToken = ((await exchanged.json()) as { id_token?: string }).id_token;
  } catch {
    return back(request, "exchange");
  }
  if (!idToken) return back(request, "exchange");

  // Read only from Google's own token endpoint, over TLS, in a request this
  // server made — but every claim inside it is still checked. Above all
  // email_verified: linking by address means whoever proves they hold the
  // address gets the account behind it. See lib/google-signin.ts.
  const who = identityFrom(claimsFromIdToken(idToken), { clientId: config.clientId, nonce: pending.nonce, now: Date.now() });
  if (!who.ok) {
    const url = publicUrl(request, "/login");
    url.searchParams.set("googleSays", who.reason);
    const refused = NextResponse.redirect(url);
    refused.cookies.delete(PENDING_COOKIE);
    return refused;
  }

  const signedIn = await signInWithGoogle(who.identity);
  if (!signedIn.ok) {
    const url = publicUrl(request, "/login");
    url.searchParams.set("googleSays", signedIn.error);
    const failed = NextResponse.redirect(url);
    failed.cookies.delete(PENDING_COOKIE);
    return failed;
  }

  await recordSignIn({
    at: new Date().toISOString(),
    // Recorded as its own kind, so the log can answer "how did they get in"
    // rather than showing a password sign-in that never happened.
    how: (await hasSiteAccess(signedIn.email)) ? "invited" : "google",
    email: signedIn.email,
    ...whereFrom(request.headers),
  });

  // NOT request.url. Behind Railway's proxy that is localhost, and this is
  // the redirect that takes somebody to their account after signing in — see
  // lib/public-origin.ts for the sign-in that ended on a page nobody could load.
  const response = NextResponse.redirect(publicUrl(request, pending.next));
  response.cookies.delete(PENDING_COOKIE);
  response.cookies.set(accountCookieName(), createSessionCookie(signedIn.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
