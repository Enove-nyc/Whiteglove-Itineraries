/**
 * The login address, carrying the page somebody was thrown out of.
 *
 * WHAT THIS FIXES, in the owner's words: he was signed out while working on a
 * particular admin screen, put the password back in, and landed on the admin
 * front page every time. The middleware that guards /admin already puts the
 * wanted page in ?next= — but the redirect that actually fires when a session
 * lapses under him passed no such thing, so the page was simply dropped.
 *
 * ITS OWN FILE so it can be tested as the pure function it is. It lived inside
 * a "use client" component, where a test could only grep the source for it —
 * and a grep passes whether or not the logic is right, which is the wrong kind
 * of test to have guarding a redirect.
 *
 * The RAW path goes in, exactly as the middleware does it: safeAdminNext() on
 * the other side canonicalises it and refuses anything off-site, and it works
 * whether or not this deployment is on an admin hostname because that helper
 * adds or strips the /admin prefix to suit.
 */

/** A login page is never its own return path — that is a loop. */
function isLoginPath(path: string): boolean {
  const withoutQuery = path.split("?")[0];
  return /(^|\/)login\/?$/.test(withoutQuery);
}

export function withReturnPath(loginHref: string, here: string | null | undefined): string {
  if (!here) return loginHref;
  // Relative only. A protocol-relative or absolute address here would turn a
  // timed-out session into an open redirect.
  if (!here.startsWith("/") || here.startsWith("//") || here.includes("://")) return loginHref;
  if (isLoginPath(here)) return loginHref;
  const separator = loginHref.includes("?") ? "&" : "?";
  return `${loginHref}${separator}next=${encodeURIComponent(here)}`;
}
