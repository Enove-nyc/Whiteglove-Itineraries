"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/** Affiliate domain verification belongs on public discovery pages. */
export default function TravelpayoutsScript() {
  const pathname = usePathname();
  // Trip codes and account flows are private, not affiliate discovery pages.
  if (/^\/(?:join|app|i|t|account|advisor|admin)(?:\/|$)/.test(pathname)) return null;
  return (
    <Script
      src="https://emrldco.com/NTU5Nzcx.js?t=559771"
      strategy="afterInteractive"
      data-cmp-ab="2"
    />
  );
}
