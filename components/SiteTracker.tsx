"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function SiteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const seenKey = `white-glove-viewed:${pathname}`;
    try {
      if (sessionStorage.getItem(seenKey)) return;
      sessionStorage.setItem(seenKey, "1");
    } catch {
      // Privacy settings can disable storage; browsing must still work.
    }
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "page_view", value: pathname }), keepalive: true }).catch(() => undefined);
  }, [pathname]);
  return null;
}
