"use client";

import { useEffect } from "react";

/**
 * Remembers the code a client opened their trip with, so the app behaves like a
 * login rather than asking for the code again on every visit.
 *
 * A client reaches the app at /i/<code>/app or /t/<code>/app. Pressing back, or
 * closing the installed app and reopening it, would otherwise land them on /app
 * with an empty code field — the code lived only in that one URL. This writes
 * the current app path to a cookie the /app door reads on the way in, so a
 * returning client is taken straight back to their trip. Pass `path={null}` to
 * forget it (a code that no longer opens anything clears itself this way).
 *
 * The stored value is the trip's own share token, which the client already
 * holds — it is a capability, not a credential, so a plain readable cookie
 * (six months, this site only) is the right store.
 */
const COOKIE = "wg-app-path";

export default function ClientCodeMemory({ path }: { path: string | null }) {
  useEffect(() => {
    try {
      if (path) {
        document.cookie = `${COOKIE}=${encodeURIComponent(path)}; path=/; max-age=15552000; SameSite=Lax`;
      } else {
        document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      }
    } catch {
      // A browser that refuses cookies just falls back to asking for the code.
    }
  }, [path]);
  return null;
}
