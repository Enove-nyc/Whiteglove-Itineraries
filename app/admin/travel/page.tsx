import { setProviderStage } from "@/app/admin/travel/actions";
import ProviderComparison from "@/components/admin/ProviderComparison";
import { routestackConfigured } from "@/lib/travel/adapters/routestack-cars";
import { stay22ApiConfigured } from "@/lib/stay22-api";
import { inspectConfiguredDuffelToken } from "@/lib/duffel-token";
import { routestackConfig } from "@/lib/travel/adapters/routestack-auth";
import { travelpayoutsTokenConfigured } from "@/lib/travelpayouts-api";
import { KNOWN_PAIRS, STAGE_LABELS, stageOf, type ProviderStage } from "@/lib/travel/registry";
import { weWouldBeTheSeller } from "@/lib/travel/engine";
import { ADMIN_RESERVE, callsThisMonth, monthlyLimit } from "@/lib/travel/provider-budget";
import { readProviderStages } from "@/lib/travel/registry-store";
import { healthRows, readTravelHealth } from "@/lib/travel/telemetry";
import { CATEGORY_LABELS, PROVIDER_LABELS, type ProviderId, type TravelCategory } from "@/lib/travel/types";
import { fingerprint, looksMasked } from "@/lib/travel/fingerprint";

export const dynamic = "force-dynamic";

/**
 * Travel providers — who supplies flights, hotels and cars, and how they are
 * behaving.
 *
 * NOTHING ON THIS SCREEN IS PUBLIC, and one column decides whether anything
 * ever becomes public: a provider is Off, in Testing (this screen only), or
 * Live for visitors. A new company arrives at Off and stays there until
 * somebody deliberately moves it.
 *
 * The comparison tool at the bottom runs a real search against the providers
 * in a category and shows what each one returned, how long it took and what
 * failed — which is the only way to answer "is this company any good for us"
 * with evidence rather than opinion.
 *
 * No key is displayed here, ever. Only whether one is present.
 */

/**
 * The variables each provider reads, so the screen can show a fingerprint of
 * what the server is actually holding — see lib/travel/fingerprint.ts for why
 * "Present" was not enough.
 */
const PROVIDER_VARS: Record<ProviderId, string[]> = {
  duffel: ["DUFFEL_ACCESS_TOKEN"],
  stay22: ["STAY22_API_KEY"],
  travelpayouts: ["TRAVELPAYOUTS_TOKEN"],
  routestack: ["ROUTESTACK_API_KEY", "ROUTESTACK_API_SECRET", "ROUTESTACK_API_BASE"],
};

/**
 * Which Duffel account a column of prices came out of, said either way.
 *
 * Duffel issues separate tokens for test and live, and a test one returns
 * made-up flights at made-up prices. Warning only on the test key made silence
 * carry the good news, and silence is a poor way to say anything on a screen
 * whose whole purpose is deciding which company to believe. The fingerprint
 * cannot settle it either: both kinds begin with the same six characters, so
 * every Duffel key on earth prints as "duffel…". So the row states the mode
 * outright, in both directions. Nothing else here has two modes.
 */
function keyMode(provider: ProviderId): { text: string; invented: boolean } | null {
  if (provider === "duffel") {
    const kind = inspectConfiguredDuffelToken().kind;
    if (kind === "test") return { text: "Test key — these fares are invented", invented: true };
    if (kind === "live") return { text: "Live key — real fares, real account", invented: false };
    return null;
  }
  if (provider === "routestack") {
    // RouteStack has the same two worlds behind two hostnames rather than two
    // key prefixes. Same reason for saying it: their sandbox answers with
    // well-formed prices for places that are not for sale.
    const config = routestackConfig();
    if (!config) return null;
    return config.base.includes("evolvemcp.")
      ? { text: "Sandbox — these prices are not a live market", invented: true }
      : { text: "Live market", invented: false };
  }
  return null;
}

/** Whether the environment has what this provider needs. Never the value. */
function configuredFor(provider: ProviderId): boolean {
  if (provider === "stay22") return stay22ApiConfigured();
  if (provider === "duffel") return inspectConfiguredDuffelToken().ready;
  if (provider === "travelpayouts") return travelpayoutsTokenConfigured();
  if (provider === "routestack") return routestackConfigured();
  return false;
}

const chip = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";

function StageChip({ stage }: { stage: ProviderStage }) {
  const tone =
    stage === "public"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : stage === "testing"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-stone-300 bg-stone-50 text-stone-600";
  return <span className={`${chip} ${tone}`}>{STAGE_LABELS[stage]}</span>;
}

export default async function AdminTravelProvidersPage() {
  const [stages, health] = await Promise.all([readProviderStages(), readTravelHealth()]);
  const rows = healthRows(health);
  const healthFor = (provider: ProviderId, category: TravelCategory) =>
    rows.find((row) => row.provider === provider && row.category === category);
  // What is left of each metered provider's month. Read once for the table
  // rather than per row, since every row of a provider shares one allowance.
  const meteredProviders = [...new Set(KNOWN_PAIRS.map((pair) => pair.provider))].filter(
    (provider) => monthlyLimit(provider) !== null,
  );
  const usage = new Map(
    await Promise.all(
      meteredProviders.map(async (provider) => [provider, await callsThisMonth(provider)] as const),
    ),
  );

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
          Travel providers
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
          Who supplies flights, hotels and cars underneath White Glove. Nothing here is on the public site unless its
          row says <strong className="font-semibold text-[var(--navy)]">Live for visitors</strong>. Testing means this
          screen and nowhere else.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Who is connected</h2>
        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--gold-light)] bg-white">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gold-light)] bg-[#FAF8F3] text-left">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Provider</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Category</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Key</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Health</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Shown to</th>
              </tr>
            </thead>
            <tbody>
              {KNOWN_PAIRS.map(({ provider, category }) => {
                const stage = stageOf(stages, provider, category);
                const configured = configuredFor(provider);
                const row = healthFor(provider, category);
                const sells = weWouldBeTheSeller(provider, category);
                return (
                  <tr key={`${provider}-${category}`} className="border-b border-[var(--gold-light)] last:border-0 align-top">
                    <td className="px-4 py-3 font-semibold text-[var(--navy)]">{PROVIDER_LABELS[provider]}</td>
                    <td className="px-4 py-3 text-stone-600">{CATEGORY_LABELS[category]}</td>
                    <td className="px-4 py-3">
                      {configured ? (
                        <span className={`${chip} border-emerald-300 bg-emerald-50 text-emerald-900`}>Present</span>
                      ) : (
                        <span className={`${chip} border-stone-300 bg-stone-50 text-stone-600`}>Not set</span>
                      )}
                      {(() => {
                        const limit = monthlyLimit(provider);
                        const used = usage.get(provider);
                        if (limit === null) return null;
                        const spent = used ?? 0;
                        const gone = spent >= limit;
                        return (
                          <p
                            className={`mt-1.5 text-[11px] font-semibold leading-4 ${
                              gone ? "text-red-700" : spent > limit * 0.8 ? "text-amber-800" : "text-stone-600"
                            }`}
                          >
                            {gone
                              ? `${spent} of ${limit} searches used this month — not being asked`
                              : `${spent} of ${limit} searches used this month`}
                            {!gone && spent >= limit - ADMIN_RESERVE ? (
                              <span className="block font-normal text-stone-500">
                                The comparison below has stopped, so the last {ADMIN_RESERVE} are left for visitors.
                              </span>
                            ) : null}
                          </p>
                        );
                      })()}
                      {(() => {
                        const mode = keyMode(provider);
                        return mode ? (
                          <p
                            className={`mt-1.5 text-[11px] font-semibold leading-4 ${
                              mode.invented ? "text-amber-800" : "text-emerald-800"
                            }`}
                          >
                            {mode.text}
                          </p>
                        ) : null;
                      })()}
                      <ul className="mt-1.5 space-y-0.5">
                        {PROVIDER_VARS[provider].map((name) => {
                          const value = process.env[name];
                          // AN ADDRESS IS NOT A CREDENTIAL. Fingerprinting the
                          // endpoint hid the one thing worth reading — whether
                          // this is the sandbox host or the live one.
                          const print = name.endsWith("_BASE") ? value?.trim() || null : fingerprint(value);
                          return (
                            <li key={name} className="whitespace-nowrap text-[11px] leading-4 text-stone-500">
                              <span className="text-stone-400">{name.replace(/^[A-Z]+_/, "")}</span>{" "}
                              {print ? (
                                <code className={looksMasked(value) ? "font-semibold text-red-700" : ""}>{print}</code>
                              ) : (
                                <span className="text-stone-400">—</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {row ? (
                        <span className="tabular-nums">
                          {row.calls} call{row.calls === 1 ? "" : "s"} · {row.averageMs}ms avg
                          {row.failures > 0 ? (
                            <>
                              {" · "}
                              <strong className="font-semibold text-red-700">{row.failures} failed</strong>
                            </>
                          ) : null}
                          {row.recentErrors[0] ? (
                            <span className="block text-xs text-stone-500">last error: {row.recentErrors[0].error}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-stone-400">Not called yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <form action={setProviderStage} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="provider" value={provider} />
                        <input type="hidden" name="category" value={category} />
                        <StageChip stage={stage} />
                        {sells ? (
                          <p className="w-full text-[11px] font-semibold leading-4 text-stone-600">
                            Admin only — White Glove would be the seller
                          </p>
                        ) : null}
                        <select
                          name="stage"
                          defaultValue={stage}
                          aria-label={`Who sees ${PROVIDER_LABELS[provider]} ${CATEGORY_LABELS[category]}`}
                          className="min-h-11 rounded-md border border-[var(--gold-light)] bg-white px-2 text-xs text-[var(--navy)]"
                        >
                          <option value="off">Off</option>
                          <option value="testing">Testing — admin only</option>
                          {/* NOT OFFERED WHERE WE WOULD BE THE SELLER. Duffel
                              is a real booking API: its order is ours, and so
                              is the refund and the chargeback. The rule is the
                              owner's and it is enforced three times over — the
                              option is absent here, the action refuses it, and
                              the search refuses it again. */}
                          {sells ? null : <option value="public">Live for visitors</option>}
                        </select>
                        <button
                          type="submit"
                          className="min-h-11 rounded-md border border-[var(--navy)] px-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-stone-500">
          &ldquo;Key&rdquo; never shows a credential. The line under it is a fingerprint — first six characters, last
          four, and the length — which is enough to compare against what a provider&rsquo;s dashboard shows, and not
          enough to use. A fingerprint in red contains an ellipsis, which means a masked value was pasted instead of
          the real one. Keys live in the environment and are set on Settings → Connections. A provider marked
          &ldquo;White Glove would be the seller&rdquo; cannot be shown to visitors at all: with that kind of company
          the booking, the refund and the chargeback are ours, and the site hands travelers to somebody else&rsquo;s
          checkout instead. Where a plan has a monthly allowance, the count below the key is every search this site sent that
          provider — the place lookups and tokens around a search are not billed and are not counted. Testing here
          spends the same allowance a traveler does — though the comparison stops early, leaving the last {ADMIN_RESERVE}{" "}
          searches for visitors — and a provider that has spent its month stops being asked until the month turns. A
          category with no provider left is not an empty page: cars fall back to a booking partner, which costs nothing
          per search and cannot run out.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Compare providers</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Runs one real search against every provider in a category — including the ones in Testing — and shows what
          each returned, how long it took, and what failed. Visitors never see this and never see these results.
        </p>
        <div className="mt-6">
          <ProviderComparison />
        </div>
      </section>
    </>
  );
}
