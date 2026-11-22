import Link from "next/link";
import Navbar from "@/components/Navbar";
import { cookies } from "next/headers";
import { currentBrand } from "@/lib/site-brand";
import { pageMetadata } from "@/lib/seo";
import { accountCookieName, getCurrentAccountData, getAccountData, withTrips } from "@/lib/account-store";
import { notFound, redirect } from "next/navigation";

export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({
    title: brand === "itineraries" ? "Trip inbox — White Glove Itineraries" : "Trip inbox",
    description: "Read and reply to messages from invited travelers.",
    path: "/itinerary/inbox",
    noIndex: true,
  });
}

export default async function TripInboxPage() {
  if ((await currentBrand()) !== "itineraries") notFound();
  const account = await getCurrentAccountData((await cookies()).get(accountCookieName())?.value);
  if (!account) redirect("/login?next=%2Fitinerary%2Finbox");
  const { trips } = withTrips(await getAccountData(account.email));
  const threads = trips.flatMap((trip) => trip.travelerPublication
    ? (trip.itinerary.travelers ?? []).flatMap((person) => {
        const token = trip.travelerShares?.[person.id];
        return token ? [{ token, name: person.name, trip: trip.name }] : [];
      })
    : []);

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--navy)]">
      <Navbar minimal />
      <section className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/itinerary" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Back to your itineraries</Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl">Trip inbox</h1>
        <p className="mt-3 text-sm text-stone-700">Open a private conversation with an invited traveler.</p>
        {threads.length === 0
          ? <p className="mt-6 text-sm">Traveler conversations appear here once you create a trip invite.</p>
          : <ul className="mt-6 space-y-3">
              {threads.map(({ token, name, trip }) => (
                <li key={token}>
                  <Link href={`/t/${encodeURIComponent(token)}/app?screen=messages`} prefetch={false} className="flex min-h-11 flex-col rounded-xl border border-[var(--gold-light)] bg-white p-4">
                    <span className="font-semibold">{name}</span>
                    <span className="mt-1 text-sm text-stone-600">{trip}</span>
                  </Link>
                </li>
              ))}
            </ul>}
      </section>
    </main>
  );
}
