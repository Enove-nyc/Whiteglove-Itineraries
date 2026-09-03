"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import LoginForm from "@/components/LoginForm";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useSignedIn } from "@/lib/use-signed-in";

/**
 * The small sign-in dialog that stands between a signed-out visitor and a
 * protected action — adding to Route, adding to an itinerary, saving a plan,
 * favoriting a place, submitting a review.
 *
 * ONE INSTANCE, mounted once in the root layout, opened from anywhere with
 * `useRequireSignIn()`. A component that wants to gate an action does not
 * build its own dialog — it calls `requireSignIn(() => doTheThing(), "Sign
 * in to save")` and either the action runs immediately (already signed in)
 * or the dialog opens, and the action runs the moment sign-in succeeds,
 * without leaving the page.
 *
 * REVERSES A DELIBERATE EARLIER DECISION. /login used to be, on purpose, "a
 * labelled full-page auth section, not a modal dialog" — tests/login-overlay
 * test said so by name. That page still exists for somebody who navigates to
 * Sign In directly (the header's Account icon, the mobile bar). This dialog
 * is for the different, newer case the brief asks for: an action interrupted
 * mid-task, which needs to resume in place rather than end on another page.
 *
 * GOOGLE IS THE ONE PATH THAT CANNOT RESUME IN PLACE. It is a real redirect
 * to Google and back — `next` carries the visitor back to the same page
 * signed in, but the specific click that opened the dialog is gone by then,
 * the way any client state is gone after a full navigation. Everything typed
 * into the password form resumes exactly; Google gets you back to the page,
 * not back into the middle of the click.
 */

type PendingRequest = { reason: string; onSuccess: () => void };

type GateContextValue = {
  requireSignIn: (onSuccess: () => void, reason?: string) => void;
};

const GateContext = createContext<GateContextValue | null>(null);

const DEFAULT_REASON = "Sign in to save";

export function useRequireSignIn(): (onSuccess: () => void, reason?: string) => void {
  const ctx = useContext(GateContext);
  const signedIn = useSignedIn();
  return useCallback(
    (onSuccess: () => void, reason?: string) => {
      if (signedIn) {
        onSuccess();
        return;
      }
      if (!ctx) {
        // No provider in the tree (e.g. an isolated test render) — fail open
        // to the real sign-in page rather than doing nothing.
        window.location.href = "/login";
        return;
      }
      ctx.requireSignIn(onSuccess, reason);
    },
    [ctx, signedIn],
  );
}

/**
 * Open the sign-in dialog for its own sake, with nothing waiting behind it.
 *
 * THE HEADER'S SIGN IN USED TO BE A LINK TO /login. Pressing it took somebody
 * off whatever they were reading, and changing their mind meant Back — from a
 * destination page three levels deep, several Backs. The dialog was already
 * built for interrupted actions; this is the same dialog with no action to
 * resume, so the page stays where it is and the X returns them to it.
 *
 * /login remains a real page, and has to: Google's sign-in is a full redirect
 * out and back, and somebody arriving from an email or a bookmark needs
 * somewhere to land.
 */
export function useOpenSignIn(): (reason?: string) => void {
  const requireSignIn = useRequireSignIn();
  return useCallback(
    (reason?: string) => requireSignIn(() => {}, reason || "Sign in"),
    [requireSignIn],
  );
}

export function SignInGateProvider({
  googleAvailable,
  phoneSignupAvailable,
  children,
}: {
  googleAvailable: boolean;
  phoneSignupAvailable: boolean;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const requireSignIn = useCallback((onSuccess: () => void, reason?: string) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending({ reason: reason || DEFAULT_REASON, onSuccess });
  }, []);

  const close = useCallback(() => setPending(null), []);
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(pending), close);

  return (
    <GateContext.Provider value={{ requireSignIn }}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[var(--wg-z-modal)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-gate-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="sign-in-gate-title" className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
                {pending.reason}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]"
              >
                ✕
              </button>
            </div>
            <LoginForm
              phoneSignupAvailable={phoneSignupAvailable}
              googleAvailable={googleAvailable}
              onSuccess={() => {
                const action = pending.onSuccess;
                setPending(null);
                action();
              }}
            />
          </div>
        </div>
      )}
    </GateContext.Provider>
  );
}
