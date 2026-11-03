import { ITINERARIES_DEVELOPMENT_MESSAGE } from "@/lib/launch-status";

export default function DevelopmentNotice() {
  return (
    <aside aria-label="Development status" className="border-b border-white/20 bg-[var(--navy)] px-5 py-3 text-center text-sm leading-6 text-white">
      <p className="mx-auto max-w-5xl">{ITINERARIES_DEVELOPMENT_MESSAGE}</p>
    </aside>
  );
}
