"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

/**
 * Travelpayouts (Emerald) site-verification snippet.
 *
 * The affiliate dashboard requires this script on public pages so it can
 * confirm the domain. It has no business on /admin — that is a private
 * dashboard, not a page the affiliate programme is verifying, and there is
 * no reason to hand a third-party script a look at admin traffic. Loaded
 * once from the root layout via next/script; WordPress cache-bypass
 * attributes are not used here.
 */
export default function TravelpayoutsScript() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <Script
      src="https://emrldco.com/NTU5Nzcx.js?t=559771"
      strategy="afterInteractive"
      data-cmp-ab="2"
    />
  );
}
