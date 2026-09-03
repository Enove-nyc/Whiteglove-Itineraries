"use client";

import { useRouter } from "next/navigation";
import { forgetSignedIn } from "@/lib/use-signed-in";
import { forgetOfflineData } from "@/lib/offline-forget";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    // The route buttons cache the answer for the life of the page.
    forgetSignedIn();
    // Take the trip off this device with the session — the offline itinerary and
    // the wallet's boarding passes must not outlive a sign-out on a shared or
    // borrowed computer. See lib/offline-forget.ts.
    await forgetOfflineData();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="border border-[var(--gold-light)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
    >
      Sign out
    </button>
  );
}
