import BookingSearch from "@/components/BookingSearch";
import { inspectConfiguredDuffelToken } from "@/lib/duffel-token";

export const dynamic = "force-dynamic";

export default function PrivateBooking() {
  const token = inspectConfiguredDuffelToken();
  return (
    <section>
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Book a flight</h1>
      {token.kind === "test" && <p className="mt-4">Test mode uses sample flights and test cards.</p>}
      {token.ready ? <BookingSearch only="flights" reviewHref="/private-booking/review" /> :
        <p className="mt-4">Flight booking is currently unavailable.</p>}
    </section>
  );
}
