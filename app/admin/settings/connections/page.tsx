import AiConnectionTest from "@/components/AiConnectionTest";
import EmailDeliveryTest from "@/components/EmailDeliveryTest";
import ContentExportPanel from "@/components/ContentExportPanel";
import ConnectionsPanel from "@/components/ConnectionsPanel";
import DuffelKeyTest from "@/components/DuffelKeyTest";
import { CONNECTIONS, DEPLOYMENT_SETTINGS, readConnectionsProperly } from "@/lib/connections";
import { duffelTokenHelp, inspectConfiguredDuffelToken } from "@/lib/duffel-token";
import MapKeyStatus from "@/components/MapKeyStatus";
import RoutingKeyTest from "@/components/RoutingKeyTest";
import SmsStatus from "@/components/SmsStatus";

export const dynamic = "force-dynamic";

export default function ConnectionSettings() {
  // Named one by one, because Next replaces `process.env.X` by name.
  const ENV: Record<string, string | undefined> = {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    WHITE_GLOVE_SESSION_SECRET: process.env.WHITE_GLOVE_SESSION_SECRET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_EMAIL_ITINERARIES: process.env.RESEND_FROM_EMAIL_ITINERARIES,
    NEXT_PUBLIC_SITE_BRAND: process.env.NEXT_PUBLIC_SITE_BRAND,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PAYMENTS_WEBHOOK_SECRET: process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    PLATFORM_FEE_BPS: process.env.PLATFORM_FEE_BPS,
    CRON_SECRET: process.env.CRON_SECRET,
    OWNER_NOTIFICATION_EMAIL: process.env.OWNER_NOTIFICATION_EMAIL,
    CONTACT_NOTIFICATION_EMAIL: process.env.CONTACT_NOTIFICATION_EMAIL,
    CONTACT_NOTIFICATION_EMAIL_ITINERARIES: process.env.CONTACT_NOTIFICATION_EMAIL_ITINERARIES,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    DUFFEL_ACCESS_TOKEN: process.env.DUFFEL_ACCESS_TOKEN,
    AERODATABOX_API_KEY: process.env.AERODATABOX_API_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    KAYAK_AFFILIATE_PARAMS: process.env.KAYAK_AFFILIATE_PARAMS,
    BOOKING_AFFILIATE_ID: process.env.BOOKING_AFFILIATE_ID,
    TRAVELPAYOUTS_MARKER: process.env.TRAVELPAYOUTS_MARKER,
    TRAVELPAYOUTS_TOKEN: process.env.TRAVELPAYOUTS_TOKEN,
    STAY22_AID: process.env.STAY22_AID,
    STAY22_API_KEY: process.env.STAY22_API_KEY,
    ROUTESTACK_API_KEY: process.env.ROUTESTACK_API_KEY,
    ROUTESTACK_API_SECRET: process.env.ROUTESTACK_API_SECRET,
    ROUTESTACK_API_BASE: process.env.ROUTESTACK_API_BASE,
    ROUTESTACK_MONTHLY_CALL_LIMIT: process.env.ROUTESTACK_MONTHLY_CALL_LIMIT,
    ADMIN_HOST: process.env.ADMIN_HOST,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
    RAILWAY_GIT_COMMIT_MESSAGE: process.env.RAILWAY_GIT_COMMIT_MESSAGE,
    RAILWAY_GIT_BRANCH: process.env.RAILWAY_GIT_BRANCH,
    MEDIA_DIR: process.env.MEDIA_DIR,
    NOMINATIM_URL: process.env.NOMINATIM_URL,
    TRELLO_BOARD_ID: process.env.TRELLO_BOARD_ID,
    TRELLO_REVIEW_LIST_ID: process.env.TRELLO_REVIEW_LIST_ID,
    TRELLO_DONE_LIST_ID: process.env.TRELLO_DONE_LIST_ID,
    TRELLO_CANDIDATE_SYNC_ENABLED: process.env.TRELLO_CANDIDATE_SYNC_ENABLED,
    TRELLO_API_KEY: process.env.TRELLO_API_KEY,
    TRELLO_TOKEN: process.env.TRELLO_TOKEN,
    SITE_ACCESS_PASSWORD: process.env.SITE_ACCESS_PASSWORD,
    SITE_PREVIEW_PASSWORD: process.env.SITE_PREVIEW_PASSWORD,
    SITE_LOCK_ENABLED: process.env.SITE_LOCK_ENABLED,
    TRIP_ARRANGEMENT: process.env.TRIP_ARRANGEMENT,
    DEFAULT_PHONE_COUNTRY: process.env.DEFAULT_PHONE_COUNTRY,
    DIRECTORY_FEATURED_NOTE: process.env.DIRECTORY_FEATURED_NOTE,
    // Files a reported site fault as an issue. Read here so the screen can say
    // whether it is set — a described variable the screen never reads shows as
    // missing for ever, which tests/connections.ts catches.
    GITHUB_ISSUE_TOKEN: process.env.GITHUB_ISSUE_TOKEN,
    GITHUB_ISSUE_REPO: process.env.GITHUB_ISSUE_REPO,
    GOOGLE_ROUTES_URL: process.env.GOOGLE_ROUTES_URL,
    OSRM_ROUTER_URL: process.env.OSRM_ROUTER_URL,
  };

  const duffel = inspectConfiguredDuffelToken();
  const duffelHelp = duffelTokenHelp(duffel.kind);

  return (
    <>
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Connections</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          The outside services the website leans on. Each one tells you whether it is working right now, and what to
          do if it is not. Nothing here is needed day to day.
        </p>
        <p className="mt-4 border-l-4 border-[var(--gold)] bg-[#fcfaf6] px-4 py-3 text-sm leading-6 text-stone-700">
          These run on the server and report back a plain answer. Keys and passwords are never sent to your browser
          — with one deliberate exception, the map key, which is public by design and explained in its own panel.
        </p>
      </header>

      {/* Every variable read by name: Next substitutes these at build time, so
          a whole-object read is not the same thing. Only emptiness is ever
          looked at — no value reaches the browser. */}
      <ConnectionsPanel readings={readConnectionsProperly(Object.fromEntries([...CONNECTIONS, ...DEPLOYMENT_SETTINGS].flatMap((c) => c.vars).map((name) => [name, ENV[name]])))} />

      <div className="mt-8 space-y-5">
        <EmailDeliveryTest />
        <SmsStatus />
        <RoutingKeyTest />
        <MapKeyStatus />
        <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Bookings</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Where searches go</h2>
          <dl className="mt-4 space-y-3 text-sm leading-6">
            <div>
              <dt className="font-semibold text-[var(--navy)]">Public site — booking partners</dt>
              <dd className="text-stone-600">
                Visitors search on /book through Stay22, Travelpayouts and the other partner links. Duffel is not
                available there, and no environment variable can turn it on.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--navy)]">
                Admin — Duffel{duffel.ready ? (duffel.kind === "test" ? " (test token)" : " (live token)") : " (not connected)"}
              </dt>
              <dd className="text-stone-600">
                Search and ticketing are at /admin/duffel, behind the money permission. A booking there is charged by
                Duffel as merchant of record. {duffelHelp.message}
              </dd>
            </div>
          </dl>
        </section>
        <DuffelKeyTest />
        <ContentExportPanel />
        <AiConnectionTest />
      </div>
    </>
  );
}
