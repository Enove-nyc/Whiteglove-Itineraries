import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private flight booking | White Glove Itineraries",
  robots: { index: false, follow: false },
};

export default function PrivateBookingLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">{children}</div>;
}
