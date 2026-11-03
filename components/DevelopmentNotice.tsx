import { ITINERARIES_DEVELOPMENT_MESSAGE } from "@/lib/launch-status";

export default function DevelopmentNotice() {
  return (
    <aside aria-label="Development status" className="border-b border-[#dce9e5] bg-[#f0f7f4] px-4 py-2 text-center text-xs leading-5 text-[#355b52]">
      <p className="mx-auto max-w-5xl">{ITINERARIES_DEVELOPMENT_MESSAGE}</p>
    </aside>
  );
}

