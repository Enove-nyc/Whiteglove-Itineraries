"use client";

import TripCompanionCode from "@/components/companion/TripCompanionCode";

/** Open this saved trip without an advisor or a purchase step. */
export default function TripAppCode({ tripId }: { tripId: string; tripName: string; code?: string | null }) {
  return <TripCompanionCode tripId={tripId} />;
}
