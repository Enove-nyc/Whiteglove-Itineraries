"use client";

import { useEffect, useState } from "react";

/**
 * Is there somebody signed in?
 *
 * Asked once per page rather than once per button: a kever page can carry a
 * dozen "add to my route" buttons, and twelve identical requests for the same
 * answer is silly. The answer is cached in the module for the life of the page,
 * and cleared when a sign-in or sign-out happens so buttons update without a
 * reload.
 *
 * `null` means "not known yet". Buttons should stay quiet in that moment rather
 * than flashing "sign in" at somebody who is already signed in.
 */

export type Viewer = {
  signedIn: boolean;
  /** What they are called, when they have told us. */
  name?: string;
  /** What they sign in with — an email address or a phone number. */
  id?: string;
  /** On any paid plan. The header turns the logo hand gold. */
  paid?: boolean;
};

const SIGNED_OUT: Viewer = { signedIn: false };

let cached: Promise<Viewer> | null = null;
const listeners = new Set<(value: Viewer) => void>();

function ask(): Promise<Viewer> {
  cached ??= fetch("/api/account/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d): Viewer => (d?.signedIn ? { signedIn: true, name: d.account?.name, id: d.sessionEmail, paid: Boolean(d.paid) } : SIGNED_OUT))
    .catch(() => SIGNED_OUT);
  return cached;
}

/** Await the existing session lookup when an action is pressed before hydration settles. */
export function currentViewer(): Promise<Viewer> { return ask(); }

/** Ask again — after signing in or out, so the buttons catch up. */
export function forgetSignedIn() {
  cached = null;
  void ask().then((value) => {
    for (const listener of listeners) listener(value);
  });
}

/** Who is looking, or null while we are still asking. */
export function useViewer(): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let live = true;
    const update = (value: Viewer) => {
      if (live) setViewer(value);
    };
    listeners.add(update);
    void ask().then(update);
    return () => {
      live = false;
      listeners.delete(update);
    };
  }, []);

  return viewer;
}

export function useSignedIn(): boolean | null {
  const viewer = useViewer();
  return viewer === null ? null : viewer.signedIn;
}

/** Where to send somebody to sign in, and come back to where they were. */
export function signInHref(): string {
  if (typeof window === "undefined") return "/login";
  // Never carry the sign-in pages themselves back as `next`: once signed in the
  // login page sends you to `next`, so next=/login would loop you on /login
  // rather than land you at your account. The login page guards this too.
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login" || path === "/access") return "/login";
  const here = `${window.location.pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(here)}`;
}
