import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PENDING_COOKIE, authorizeUrl, callbackUrl, googleConfig } from "@/lib/google-signin";
import { rateLimit, requesterKey, tooManyMessage } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/seo";
import { publicUrl } from "@/lib/public-origin";

/**
 * Start signing in with Google.
 *
 * The three one-time values — state, nonce and the PKCE verifier — are made
 * here and kept in a SHORT-LIVED HTTP-ONLY COOKIE rather than in a store,
 * because they belong to this browser and this attempt and nothing else needs
 * to see them. The callback compares against the cookie and clears it.
 *
 * What each one stops:
 *   state    — somebody feeding this browser a sign-in it never started.
 *   nonce    — a token from a different attempt being replayed into this one.
 *   verifier — an intercepted code being redeemed by anybody but this browser.
 */
export const dynamic = "force-dynamic";



export async function GET(request: NextRequest) {
  const config = googleConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });
  if (!config) return NextResponse.redirect(publicUrl(request, "/login?google=unavailable"));

  const gate = await rateLimit(`google-start:${requesterKey(request.headers)}`, { limit: 20, windowSeconds: 15 * 60 });
  if (!gate.ok) return NextResponse.json({ error: tooManyMessage(gate.retryAfter) }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });

  // Only a path on this site. A full URL here would turn the sign-in into an
  // open redirect somebody could point anywhere — the same rule the sign-in
  // page already applies to its own `next`.
  const wanted = request.nextUrl.searchParams.get("next") ?? "";
  const next = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/account";

  // The address registered in the Google console. Prefer the site's own
  // configured address: a redirect URI derived from request headers behind a
  // proxy can come out as something Google was never told about, and the error
  // it produces then is one the visitor can do nothing with.
  const origin = siteOrigin()?.origin ?? request.nextUrl.origin;
  const redirectUri = callbackUrl(origin);

  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const response = NextResponse.redirect(authorizeUrl({ clientId: config.clientId, redirectUri, state, codeChallenge: challenge, nonce }));
  response.cookies.set(PENDING_COOKIE, JSON.stringify({ state, nonce, verifier, next, redirectUri }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to pick an account and type a password, short enough that a
    // half-finished sign-in on a shared machine does not sit there all day.
    maxAge: 10 * 60,
  });
  return response;
}
