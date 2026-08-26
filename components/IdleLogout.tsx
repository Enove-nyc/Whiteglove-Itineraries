"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { withReturnPath } from "@/lib/return-path";

/**
 * Signs the user out after a period of inactivity. Any of the listed user
 * interactions resets the timer; when it elapses, we POST the logout endpoint
 * and either redirect or refresh.
 *
 * - scope "admin": always armed (admin pages are behind auth), redirects to login.
 * - scope "account": only arms when actually signed in, then just refreshes.
 */
export default function IdleLogout({
  minutes,
  endpoint,
  redirectTo,
  requireAccount = false,
}: {
  minutes: number;
  endpoint: string;
  redirectTo?: string;
  requireAccount?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    async function logout() {
      await fetch(endpoint, { method: "POST" }).catch(() => undefined);
      if (cancelled) return;
      if (redirectTo) {
        // The page they were on, so signing back in returns them to it rather
        // than to the admin front page. See lib/return-path.ts.
        const here = typeof window === "undefined" ? null : window.location.pathname + window.location.search;
        router.push(withReturnPath(redirectTo, here));
      }
      router.refresh();
    }

    function reset() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(logout, minutes * 60 * 1000);
    }

    async function arm() {
      if (requireAccount) {
        const data = await fetch("/api/account/me", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        if (cancelled || !data?.signedIn) return; // don't arm for signed-out visitors
      }
      events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
      reset();
    }

    arm();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, endpoint, redirectTo, requireAccount, router]);

  return null;
}
