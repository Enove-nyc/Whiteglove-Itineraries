"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LoginForm from "@/components/LoginForm";

type State = { phase: "loading" } | { phase: "ready"; token: string; identity: string } | { phase: "error"; message: string };

export default function InvitationJoin() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (tokenRef.current === null) {
      tokenRef.current = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
      // The fragment never reaches server access logs; remove it from browser history too.
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    const token = tokenRef.current;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("This invitation is not available. Contact White Glove for a new link.");
        const response = await fetch("/api/account/invitation", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitationToken: token }), signal: controller.signal, cache: "no-store",
        });
        const data = await response.json() as { identity?: string; error?: string };
        if (!response.ok || !data.identity) throw new Error(data.error || "This invitation could not be checked.");
        if (!controller.signal.aborted) setState({ phase: "ready", token, identity: data.identity });
      } catch (error) {
        if (!controller.signal.aborted) setState({ phase: "error", message: error instanceof Error ? error.message : "This invitation could not be checked." });
      }
    })();
    return () => controller.abort();
  }, []);
  if (state.phase === "loading") return <p role="status" className="mt-6 text-sm text-stone-700">Checking your invitation…</p>;
  if (state.phase === "error") return <p role="alert" className="mt-6 text-sm leading-7 text-stone-700">{state.message} <Link href="/login" className="font-semibold text-[var(--navy)] underline">Log in</Link></p>;
  return <>
    <p className="mt-4 text-sm leading-7 text-stone-700">Create your account using the details on your invitation.</p>
    <LoginForm initialMode="signup" phoneSignupAvailable={state.identity.startsWith("+")} invitationToken={state.token} invitationIdentity={state.identity} />
    <p className="mt-6 text-sm text-stone-700">Already have an account? <Link href="/login" className="font-semibold text-[var(--navy)] underline">Log in</Link>.</p>
  </>;
}
