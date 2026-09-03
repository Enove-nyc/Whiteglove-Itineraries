/**
 * A Business account's own preferences for the White Glove app.
 *
 * SEPARATE FROM THE PLAN AND FROM THE TRIP. A plan is what kind of account
 * somebody has; a trip is one journey. This is how the account wants the app
 * itself to behave, across every trip they hand out — kept on its own key so it
 * neither rides on the auth record nor has to be written onto each trip.
 *
 * THE KOSHER-AND-SHABBOS LAYER IS OFF UNTIL ASKED FOR. This is a general
 * itinerary product; candle-lighting, when Shabbos ends, the kosher places near
 * a trip and a warning that a stop falls on Shabbos are a real feature, but not
 * every agency plans kosher travel, so they are hidden until an account turns
 * them on. An account that plans kosher trips flips one switch.
 *
 * ONE SWITCH, EVERY SURFACE. It began as an app-only setting while the planner
 * and the command centre showed Shabbos to everybody regardless — which meant a
 * general travel agency saw "this stop is planned for Shabbos" on a screen they
 * never asked for it on, and could not turn it off. `kosherFeatures` is now the
 * single gate: the companion app, the planner's zmanim, and the command
 * centre's Shabbos warnings all read it. Anything Shabbos-shaped added later
 * reads it too — tests/shabbos-behind-the-switch.test.ts fails if it does not.
 */

import { identityKey } from "@/lib/identity";

export type AppPrefs = {
  /** Whether candle-lighting, Shabbos times, Shabbos warnings and kosher places are shown at all. */
  kosherFeatures: boolean;
};

export const DEFAULT_APP_PREFS: AppPrefs = { kosherFeatures: false };

const KEY_PREFIX = "white-glove:app-prefs:";

export function appPrefsStoreAvailable(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis<T>(path: string, body?: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

const keyFor = (account: string) => `${KEY_PREFIX}${identityKey(account)}`;

/** This account's app preferences, falling back to the defaults. */
export async function getAppPrefs(account: string): Promise<AppPrefs> {
  const raw = await redis<string>(`get/${encodeURIComponent(keyFor(account))}`);
  if (!raw) return { ...DEFAULT_APP_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return { kosherFeatures: Boolean(parsed?.kosherFeatures) };
  } catch {
    return { ...DEFAULT_APP_PREFS };
  }
}

/** Save this account's app preferences. Returns whether it stuck. */
export async function setAppPrefs(account: string, prefs: AppPrefs): Promise<boolean> {
  if (!appPrefsStoreAvailable()) return false;
  const key = encodeURIComponent(keyFor(account));
  const value = encodeURIComponent(JSON.stringify({ kosherFeatures: Boolean(prefs.kosherFeatures) }));
  return (await redis(`set/${key}/${value}`)) !== null;
}
