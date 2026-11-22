import { bookingPassword } from "@/lib/private-booking";

export const dynamic = "force-dynamic";

export default async function BookingAccess({ searchParams }: { searchParams: Promise<{ invalid?: string }> }) {
  const { invalid } = await searchParams;
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--gold-light)] bg-white p-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Private flight booking</h1>
      {bookingPassword() ? (
        <form action="/api/private-booking/access" method="post" className="mt-6 grid gap-4">
          <label htmlFor="booking-password" className="font-semibold">Booking password</label>
          <input id="booking-password" name="password" type="password" autoComplete="current-password" required
            className="rounded border border-stone-400 px-3 py-2" />
          {invalid && <p role="alert" className="text-red-800">That password didn’t match.</p>}
          <button type="submit" className="rounded bg-[var(--navy)] px-4 py-3 font-semibold text-white">Continue</button>
        </form>
      ) : <p className="mt-5">Private booking is currently unavailable.</p>}
    </section>
  );
}
