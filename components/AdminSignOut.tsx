"use client";

import { usePathname, useRouter } from "next/navigation";
import { adminHref } from "@/lib/admin-nav";
import { forgetOfflineData } from "@/lib/offline-forget";

export default function AdminSignOut() {
  const router = useRouter();
  const pathname = usePathname();
  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    // Consistency with the idle timeout, which clears on the admin endpoint too:
    // every sign-out takes any on-device trip with it. See lib/offline-forget.ts.
    await forgetOfflineData().catch(() => undefined);
    router.push(adminHref("/admin/login", pathname));
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="border border-[var(--gold-light)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
    >
      Sign out
    </button>
  );
}
