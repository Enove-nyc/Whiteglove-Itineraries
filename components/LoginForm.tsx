"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { forgetSignedIn } from "@/lib/use-signed-in";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password-rules";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

type Delivery = {
  error?: string;
  email?: string;
  verificationRequired?: boolean;
  sentVia?: "text message" | "email";
  sentTo?: string;
  delivered?: boolean;
  deliveryError?: string;
};

/**
 * Tell the person where to look for the code.
 *
 * Somebody who signed up with a number should not be told to check their
 * email — they never gave one. And when the send itself failed, say so here
 * rather than leaving them staring at an inbox waiting for nothing.
 */
function whereTheCodeWent(data: Delivery | null, what: string): string {
  if (data?.delivered === false) {
    return `Your account is ready, but the ${what} could not be sent${data.sentTo ? ` to ${data.sentTo}` : ""}. ${data.deliveryError ?? ""} Try “Resend code”, or use a different address.`.trim();
  }
  const via = data?.sentVia ?? "email";
  const to = data?.sentTo ? ` to ${data.sentTo}` : "";
  return via === "text message"
    ? `We sent the ${what} by text${to}. Enter it below.`
    : `Check your email${to} for the ${what}, then enter it below.`;
}

/**
 * Signing in with an email address or a phone number.
 *
 * One field takes both, because asking somebody to choose "email or phone"
 * before they have typed anything is a decision they should not have to make.
 * The phone half only appears when a text service is actually connected —
 * offering it otherwise would take a number and then leave the person waiting
 * for a code that was never going to arrive.
 */
/** Google's mark, inline — nothing here fetches an image from Google. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginForm({
  phoneSignupAvailable = false,
  next,
  googleAvailable = false,
  googleProblem,
  onSuccess,
}: {
  phoneSignupAvailable?: boolean;
  /** Where to go once they are in — set when they were sent here mid-task. */
  next?: string;
  /** Whether the Google button can work. Off unless both keys are set. */
  googleAvailable?: boolean;
  /** What went wrong last time, if they have just come back from Google. */
  googleProblem?: string;
  /**
   * Called instead of navigating, when this form is inside the sign-in
   * dialog rather than the full /login page. The dialog is the one that
   * resumes whatever the visitor was doing — this component only reports
   * that signing in worked.
   */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // A way to reach them, not a way to sign in. Never required.
  const [contactPhone, setContactPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"signup" | "login" | "verify" | "forgot" | "reset">("signup");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Inside the dialog this form is only ever mounted while signed out —
    // the gate that opens it checks first — so there is nothing to redirect
    // from and no /account to replace the page with.
    if (onSuccess) return;
    let active = true;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && (data?.signedIn || data?.account?.email)) router.replace(next ?? "/account");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router, next, onSuccess]);

  async function continueToAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    // Signup validation must run BEFORE the button is disabled. It used to run
    // after setSaving(true) with no reset, so a too-short password or an
    // unticked terms box returned early and left the submit button disabled
    // forever. These are early returns with just a message — nothing is sent.
    if (mode === "signup") {
      if (!agreed) { setMessage("Please agree to the terms and the privacy policy to create an account."); return; }
      const problem = passwordProblem(password);
      if (problem) { setMessage(problem); return; }
    }

    setSaving(true);

    // A network rejection anywhere below used to leave the button stuck. The
    // whole request path is wrapped so a failed fetch resets saving and says
    // so, rather than sticking on "Checking...".
    try {
      if (mode === "forgot") {
        const response = await fetch("/api/account/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        setSaving(false);
        if (!response.ok) {
          setMessage(data?.error || "Please try again.");
          return;
        }
        // The same words whether or not the account exists. Saying where the
        // code went would say that an account is there to send it to.
        setMode("reset");
        setMessage(data?.message ?? "If that account exists, a reset code is on its way.");
        return;
      }

      if (mode === "reset") {
        const response = await fetch("/api/account/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, password: newPassword }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        setSaving(false);
        if (!response.ok) {
          setMessage(data?.error || "Please try again.");
          return;
        }
        setMode("login");
        setPassword("");
        setCode("");
        setNewPassword("");
        setMessage("Password updated. Log in with your new password.");
        return;
      }

      const endpoint = mode === "signup" ? "/api/account/register" : mode === "login" ? "/api/account/login" : "/api/account/verify";
      const payload = mode === "verify" ? { email, code } : mode === "signup" ? { email, password, name, phone: contactPhone } : { email, password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null) as Delivery | null;
      if (!response.ok) {
        setMessage(data?.error || "Please try again.");
        setSaving(false);
        if (data?.verificationRequired) setMode("verify");
        return;
      }
      if (mode === "signup") {
        setMode("verify");
        setMessage(whereTheCodeWent(data, "verification code"));
        setSaving(false);
        return;
      }
      forgetSignedIn();
      if (onSuccess) {
        onSuccess();
        return;
      }
      router.push(next ?? "/account");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Please check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={continueToAccount}>
      {/* A LINK, not a form. Google's flow is a redirect this server starts,
          and the sign-in page is already one <form> — a second one inside it
          would be dropped by the browser. */}
      {googleAvailable && (mode === "signup" || mode === "login") && (
        <div>
          {googleProblem && (
            <p className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{googleProblem}</p>
          )}
          <a
            href={`/api/account/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="flex min-h-11 w-full items-center justify-center gap-3 border border-[var(--gold-light)] bg-white px-4 py-3 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)]"
          >
            <GoogleG />
            Continue with Google
          </a>
          {/* NOTHING IS EXPLAINED HERE, deliberately. This used to read "the
              same account, without the password" — true, and the answer to a
              question a customer does not have. That one account backs both
              ways in is how the site is built, not something the person
              signing in has to hold in their head: they press Continue with
              Google and they are in. Whether a password also exists is the
              owner's business, and it is on the admin's own sign-in log.

              The behaviour is unchanged and is covered by lib/google-signin.ts
              and lib/account-store.ts — the copy went, the guarantee did
              not. */}
          <div className="my-5 flex items-center gap-4">
            <span className="h-px flex-1 bg-[var(--gold-light)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">or</span>
            <span className="h-px flex-1 bg-[var(--gold-light)]" />
          </div>
        </div>
      )}

      {(mode === "signup" || mode === "login") && (
        <div className="grid grid-cols-2 border border-[var(--gold-light)] p-1">
          <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} className={`min-h-11 px-4 py-2 text-xs font-bold uppercase tracking-[0.13em] transition ${mode === "signup" ? "bg-[var(--navy)] text-white" : "text-[var(--navy)]"}`}>Sign up</button>
          <button type="button" onClick={() => { setMode("login"); setMessage(""); }} className={`min-h-11 px-4 py-2 text-xs font-bold uppercase tracking-[0.13em] transition ${mode === "login" ? "bg-[var(--navy)] text-white" : "text-[var(--navy)]"}`}>Log in</button>
        </div>
      )}

      {mode === "signup" && (
        <label className="block text-sm font-semibold text-[var(--navy)]">Your name
          <input value={name} onChange={(event) => setName(event.target.value)} type="text" required autoComplete="off" name="new-account-name" placeholder="e.g. Yaakov Cohen" className="mt-2 w-full border border-[var(--gold-light)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]" />
        </label>
      )}

      <label className="block text-sm font-semibold text-[var(--navy)]">
        {phoneSignupAvailable ? "Email address or phone number" : "Email address"}
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          // Not type="email" once numbers are allowed: the browser would
          // refuse to submit a perfectly good phone number.
          type={phoneSignupAvailable ? "text" : "email"}
          inputMode={phoneSignupAvailable ? "text" : "email"}
          // Saved details are offered when logging in and never when signing
          // up. Autofilling a sign-up form with an account somebody already
          // has is how people end up making a second one, or typing their
          // existing password into a "choose a password" box.
          autoComplete={mode === "login" ? "username" : "off"}
          name={mode === "login" ? "username" : "new-account-id"}
          required
          placeholder={phoneSignupAvailable ? "you@example.com or +1 555 123 4567" : "you@example.com"}
          className="mt-2 w-full border border-[var(--gold-light)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]"
        />
        {phoneSignupAvailable && mode === "signup" && (
          <span className="mt-1.5 block text-xs font-normal leading-5 text-stone-500">
            Either one. Whichever you use, that is where the code comes — by text if you give a number.
          </span>
        )}
      </label>

      {mode === "signup" && (
        <label className="block text-sm font-semibold text-[var(--navy)]">
          Phone number <span className="font-normal text-stone-500">— optional</span>
          <input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="new-account-phone"
            placeholder="+1 555 123 4567"
            className="mt-2 w-full border border-[var(--gold-light)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]"
          />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-stone-500">
            Only so we can reach you about a trip — it is never how you sign in. Leave it blank if you would rather not; nothing needs it.
          </span>
        </label>
      )}

      {(mode === "signup" || mode === "login") && (
        <label className="block text-sm font-semibold text-[var(--navy)]">Password
          <div className="relative mt-2">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              required
              // Signing up must meet the minimum before the browser will
              // submit; logging in accepts whatever the existing password is.
              minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              name={mode === "login" ? "password" : "new-password"}
              placeholder={mode === "login" ? "Your password" : "Choose a password"}
              className="w-full border border-[var(--gold-light)] bg-white px-4 py-3 pr-12 outline-none focus:border-[var(--gold)]"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-[var(--navy)] hover:text-[var(--gold-ink)]">
              <EyeIcon open={showPassword} />
            </button>
          </div>
          {/* Said before it is typed, not after it is rejected. */}
          {mode === "signup" && (
            <span className="mt-1.5 block text-xs font-normal leading-5 text-stone-500">
              At least {MIN_PASSWORD_LENGTH} characters.
            </span>
          )}
        </label>
      )}

      {/* Agreeing to the terms is a thing somebody does, not a thing done to
          them by a line of small print under a button. Unticked by default,
          and the form will not submit without it. */}
      {mode === "signup" && (
        <label className="flex items-start gap-3 text-sm leading-6 text-stone-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            required
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--navy)]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-2">terms of use</Link>{" "}
            and the{" "}
            <Link href="/privacy" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-2">privacy policy</Link>.
          </span>
        </label>
      )}

      {/* ON THE LOG-IN FORM ONLY. Password recovery belongs with signing in, not
          with creating an account — under the sign-up form's terms checkbox it
          read as out of place, a recovery link on a screen for people who have
          nothing to recover yet. Somebody who already has an account switches to
          Log in with the tabs above and finds it here, under the password.
          Thumb-sized, like every other control on the site. */}
      {mode === "login" && (
        <button type="button" onClick={() => { setMode("forgot"); setMessage(""); }} className="inline-flex min-h-11 items-center self-start text-xs font-bold uppercase tracking-[0.13em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4">
          Forgot password?
        </button>
      )}

      {mode === "verify" && (
        <label className="block text-sm font-semibold text-[var(--navy)]">Verification code
          <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required placeholder="Enter the 6-digit code" className="mt-2 w-full border border-[var(--gold-light)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]" />
        </label>
      )}

      {mode === "reset" && (
        <>
          <label className="block text-sm font-semibold text-[var(--navy)]">Reset code
            <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required placeholder="Enter the 6-digit code" className="mt-2 w-full border border-[var(--gold-light)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]" />
          </label>
          <label className="block text-sm font-semibold text-[var(--navy)]">New password
            <div className="relative mt-2">
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type={showPassword ? "text" : "password"} required autoComplete="new-password" name="new-password" placeholder="Choose a new password" className="w-full border border-[var(--gold-light)] bg-white px-4 py-3 pr-12 outline-none focus:border-[var(--gold)]" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-[var(--navy)] hover:text-[var(--gold-ink)]">
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </label>
        </>
      )}

      {message && <p className="text-sm leading-6 text-amber-800">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="submit" disabled={saving} className="w-full bg-[var(--navy)] px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--gold)] disabled:opacity-60">
          {saving ? "Checking..." : mode === "signup" ? "Create account" : mode === "verify" ? "Verify account" : mode === "forgot" ? "Send reset code" : mode === "reset" ? "Update password" : "Log in"}
        </button>
        {mode === "verify" && (
          <button type="button" disabled={saving} onClick={async () => { setSaving(true); const response = await fetch("/api/account/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const data = await response.json().catch(() => null) as Delivery | null; setSaving(false); setMessage(response.ok ? whereTheCodeWent(data, "verification code") : data?.error || "Please try again."); }} className="w-full border border-[var(--gold-light)] px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">Resend code</button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button type="button" disabled={saving} onClick={() => { setMode("login"); setMessage(""); }} className="w-full border border-[var(--gold-light)] px-5 py-4 text-sm font-bold uppercase tracking-[0.14em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]">Back to log in</button>
        )}
      </div>
    </form>
  );
}