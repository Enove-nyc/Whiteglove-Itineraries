import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { currentBrand } from "@/lib/site-brand";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppCodeEntry from "@/components/companion/AppCodeEntry";
import ClientCodeMemory from "@/components/companion/ClientCodeMemory";
import TripCompanionCode from "@/components/companion/TripCompanionCode";
import { accountCookieName, getCurrentAccountSummary, getSharedItineraryByShareId, getSharedTraveler, getTrips, listTravelerInvites } from "@/lib/account-store";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const brand = await currentBrand();
  return pageMetadata({ title: brand === "itineraries" ? "Your trip companion — White Glove Itineraries" : "Your trip companion — White Glove Kosher Travel", description: "Your itinerary, personal travel wallet and trip group chat.", path: "/app", noIndex: true });
}

export default async function AppPage({ searchParams }: { searchParams: Promise<{ enter?: string }> }) {
  const params = await searchParams;
  const itineraries = (await currentBrand()) === "itineraries";
  const jar = await cookies();
  const account = await getCurrentAccountSummary(jar.get(accountCookieName())?.value);
  const remembered = jar.get("wg-app-path")?.value ?? "";
  const match = /^\/i\/([A-Za-z0-9_-]+)\/app$/.exec(remembered);
  if (params.enter !== "1" && match && await getSharedItineraryByShareId(match[1])) redirect(remembered);
  const travelerPath = /^\/t\/([A-Za-z0-9_-]+)\/app$/.exec(remembered);
  if (params.enter !== "1" && itineraries && account && travelerPath && await getSharedTraveler(travelerPath[1], account.email)) redirect(remembered);
  const [trips, invites] = account
    ? await Promise.all([getTrips(account.email), itineraries ? listTravelerInvites(account.email) : []])
    : [[], []];
  return <><Navbar minimal homeHref="/app" bottomBar={false} /><main className="min-h-screen bg-[#FAF8F3] px-5 pb-16 pt-[calc(2rem+env(safe-area-inset-top))] text-[#102F35]">
    {remembered && !match && !travelerPath ? <ClientCodeMemory path={null} /> : null}
    <section className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em]">White Glove · Trip companion</p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl">Your trip, with you.</h1>
      <p className="mt-4 text-base leading-7 text-stone-600">{itineraries ? "Open the invite from your trip organizer and sign in with the email they used. You can also find an invite by signing in here." : "Your itinerary, personal travel wallet and a conversation with the people on your trip."}</p>
      {itineraries && <details className="mt-4 text-sm leading-6 text-stone-700">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Install on your phone</summary>
        <p>On iPhone, open Safari and choose Share → Add to Home Screen. On Android, open Chrome and choose Install app or Add to Home screen from the menu. Sign in on the installed app to find your trips.</p>
      </details>}
      {invites.length > 0 && <section className="mt-8">
        <h2 className="text-xl font-semibold">Trips you’ve been invited to</h2>
        <ul className="mt-4 space-y-3">
          {invites.map(({ shareId, title }) => <li key={shareId}><Link prefetch={false} href={`/t/${encodeURIComponent(shareId)}/app`} className="flex min-h-11 items-center rounded-xl border border-stone-200 bg-white p-4 font-semibold">{title}</Link></li>)}
        </ul>
      </section>}
      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-xl font-semibold">Enter your trip code</h2>
        <p className="mb-4 mt-2 text-sm leading-6 text-stone-600">If someone shared a trip code with you, enter it here.</p>
        <AppCodeEntry />
      </div>
      {account ? <section className="mt-8">
        <h2 className="text-xl font-semibold">Your trips</h2>
        {trips.length ? <ul className="mt-4 space-y-4">{trips.map((trip) => <li key={trip.id} className="rounded-2xl border border-stone-200 bg-white p-5"><h3 className="font-semibold">{trip.name}</h3><TripCompanionCode tripId={trip.id} /></li>)}</ul>
          : <p className="mt-3 text-sm leading-6 text-stone-600">Your saved itineraries will appear here. Build your itinerary on the website, then open it here for travel.</p>}
      </section> : <p className="mt-6 text-sm leading-7 text-stone-600">Already saved an itinerary? <Link href="/login?next=%2Fapp%3Fenter%3D1" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Log in to find your trips</Link></p>}
      <p className="mt-8 text-sm"><Link href={itineraries ? "/app/preview" : "/sample-itinerary"} className="inline-flex min-h-11 items-center underline underline-offset-4">Explore a sample itinerary</Link></p>
    </section>
  </main><Footer minimal /></>;
}

