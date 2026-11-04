/**
 * Signing in with Google.
 *
 * THE OWNER'S DECISION, recorded here so it is not re-litigated: signing in
 * with Google lands on THE SAME ACCOUNT as the password. It is not a second
 * account and not a second identity — it is the same person, allowed to skip
 * typing a password. An email that already has an account signs into that
 * account, with everything already in it.
 *
 * THE ONE THING THAT MAKES THAT SAFE is `email_verified`. Linking by email
 * means whoever proves they hold an address gets the account behind it, so the
 * proof has to be real. Google says whether it has actually verified the
 * address, and it is not always true — a Workspace account on a custom domain
 * can carry an address nobody confirmed. Accepting one of those would hand a
 * stranger somebody else's saved trips, their boarding passes and their notes,
 * and it would look exactly like an ordinary sign-in. So an unverified address
 * is refused outright rather than treated as a weaker yes.
 *
 * Pure functions, no network and no store, so every refusal above can be
 * tested without either.
 */

export type GoogleConfig = { clientId: string; clientSecret: string };

/** Google's issuer, both spellings it uses. */
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Whether Google sign-in is switched on.
 *
 * Off unless BOTH are set, and off is the right default: a half-configured
 * button that sends somebody to a Google error page is worse than no button.
 */
export function googleConfig(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * The address Google sends people back to.
 *
 * Has to match what is registered in the Google console EXACTLY — same scheme,
 * same host, same path, no trailing slash — or Google refuses the sign-in with
 * an error the visitor cannot do anything about.
 */
export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/account/google/callback`;
}

/** Where to send somebody to sign in. */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  // The address and the name, and nothing else. This site has no business
  // asking for somebody's calendar to let them save a kever.
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Nothing here needs offline access, so no refresh token is asked for —
  // one would be a long-lived credential kept for no reason.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/* ---- what comes back ---------------------------------------------------- */

export type IdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  sub?: string;
};

export type GoogleIdentity = { email: string; name?: string; googleId: string };

/** The payload of a JWT, without verifying it. See `identityFrom`. */
export function claimsFromIdToken(idToken: string): IdTokenClaims | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Who this is, or why we will not say.
 *
 * The signature is not checked here, and deliberately: this token is read only
 * from Google's own token endpoint, over TLS, in a request this server made —
 * which is the case OpenID Connect explicitly allows it for. What still has to
 * be checked is everything about the CONTENTS, because a token that is
 * genuinely Google's can still be one issued for a different application:
 *
 *   `aud`   — issued for THIS site, not for some other app whose token
 *             somebody replayed here.
 *   `iss`   — Google issued it.
 *   `exp`   — it has not expired.
 *   `nonce` — it answers the request we actually started.
 *   `email_verified` — GOOGLE HAS CHECKED THE ADDRESS. Everything about
 *             linking rests on this one; see the note at the top of the file.
 */
export function identityFrom(
  claims: IdTokenClaims | null,
  expect: { clientId: string; nonce: string; now: number },
): { ok: true; identity: GoogleIdentity } | { ok: false; reason: string } {
  if (!claims) return { ok: false, reason: "Google's reply could not be read." };
  if (!claims.iss || !ISSUERS.has(claims.iss)) return { ok: false, reason: "That sign-in did not come from Google." };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expect.clientId)) return { ok: false, reason: "That sign-in was issued for a different website." };
  if (!claims.exp || claims.exp * 1000 <= expect.now) return { ok: false, reason: "That sign-in took too long. Try again." };
  if (!claims.nonce || claims.nonce !== expect.nonce) return { ok: false, reason: "That sign-in did not match the one that was started. Try again." };

  const email = claims.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "Google did not share an email address, so there is nothing to sign in to." };
  // Google sends this as a boolean, and as the string "true" on some paths.
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!verified) {
    return {
      ok: false,
      reason: "Google has not verified that email address, so we cannot use it to open an account. Sign in with your password instead.",
    };
  }
  if (!claims.sub) return { ok: false, reason: "Google's reply was incomplete. Try again." };
  return { ok: true, identity: { email, name: claims.name?.trim() || undefined, googleId: claims.sub } };
}

/* ---- what the visitor is told ------------------------------------------- */

/**
 * What happened, for the sign-in page to show.
 *
 * Kept short and never technical. Somebody who has just been bounced back from
 * Google wants to know whether to try again or do something else, and
 * "invalid_grant" answers neither.
 */
export const SIGN_IN_PROBLEMS: Record<string, string> = {
  cancelled: "Sign-in with Google was cancelled.",
  state: "That sign-in link had expired. Try again.",
  exchange: "Google could not complete the sign-in. Try again.",
  unavailable: "Signing in with Google is not set up on this site yet.",
  storage: "Accounts are not available just now. Try again shortly.",
};

export function describeProblem(code: string | null | undefined): string | null {
  if (!code) return null;
  return SIGN_IN_PROBLEMS[code] ?? "That sign-in did not complete. Try again.";
}

/** Shared by the Google sign-in routes; route files export handlers only. */
export const PENDING_COOKIE = "white_glove_google";
