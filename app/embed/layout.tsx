import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Bare chrome for partner widgets iframed from /book.
 *
 * Root layout still wraps this (notice, skip link). The notice is skipped for
 * /embed in lib/beta-notice.ts so a full-screen popup does not sit inside the
 * search form.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-[#FAF8F3] p-2 sm:p-3">{children}</div>;
}
