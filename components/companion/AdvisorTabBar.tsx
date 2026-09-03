import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/Icon";

/**
 * THE ADVISOR APP'S BOTTOM BAR, ON THE TOOL PAGES IT LEAVES TO.
 *
 * The advisor app (components/AdvisorApp.tsx) is a four-tab shell, and opening
 * a trip stays inside it. But every TOOL — the pipeline, a proposal, a client
 * form, payments — is its own full page, and stepping onto one dropped the gold
 * bottom bar entirely: no tabs, and the only way back was the small home link
 * in the web header. That is the "you go into an option and lose the footer"
 * the owner reported.
 *
 * This puts the same bar back on those pages. It is NAVIGATIONAL, not the app's
 * stateful bar: each tab is a link to /advisor?tab=…, which opens the shell on
 * that tab. So Account (the dashboard) — and Trips, Messages, Wallet — is one
 * tap away from any tool, and the tools read as part of the app rather than
 * places you fall out to.
 *
 * MOBILE ONLY. The bar is the phone app's chrome; on a wide screen the advisor
 * moves by the ordinary header, so it hides at `sm`. The tool page pairs it
 * with `pb-24 sm:pb-0` so its own content clears the fixed bar on a phone.
 *
 * Palette lifted from AdvisorApp so the two cannot drift.
 */

const NAVY = "#102F35";
const MUTED = "#5a544e";

const TABS: { tab: string; label: string; icon: IconName }[] = [
  { tab: "trips", label: "Trips", icon: "suitcase" },
  { tab: "messages", label: "Messages", icon: "chat" },
  { tab: "wallet", label: "Wallet", icon: "wallet" },
  { tab: "account", label: "Account", icon: "account" },
];

export default function AdvisorTabBar() {
  return (
    <nav
      aria-label="Advisor app"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[rgba(16, 47, 53,.1)] bg-[#C7BFB1] px-2.5 pt-2 sm:hidden"
      style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
    >
      {TABS.map((t) => (
        <Link
          key={t.tab}
          href={`/advisor?tab=${t.tab}`}
          aria-label={t.label}
          className="flex flex-1 flex-col items-center justify-center gap-[3px] px-1 py-2"
          style={{ color: MUTED, textDecoration: "none" }}
        >
          <Icon name={t.icon} className="h-5 w-5" strokeWidth={1.7} />
          <span style={{ font: "500 10.5px/1 Inter,sans-serif", letterSpacing: ".01em", color: NAVY }}>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
