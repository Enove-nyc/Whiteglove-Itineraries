"use client";

import { useEffect, useState } from "react";
import {
  googleMapsBrowserKey,
  googleMapsBrowserKeyMalformed,
  googleMapsAvailable,
  probeGoogleMaps,
  type GoogleMapsProbeResult,
} from "@/lib/google-maps-loader";

// Is the Google map ready for visitors?
//
// A browser key restricted to the wrong hostname, or a project with no billing
// account, can otherwise fail without an actionable owner-facing message.
//
// So this does the real thing: it asks the browser to load Google's map script
// exactly as the map pages do, constructs a tiny map (many refusals only fire
// then), and reports what happened — including which named Google error, when
// Google logged one.

type State = GoogleMapsProbeResult["state"] | "checking";

export default function MapKeyStatus() {
  // Whether a key exists is a build-time constant, the same on the server and
  // in the browser, so it is the starting state rather than something an effect
  // has to discover. Only whether Google ACCEPTS it needs finding out.
  const hasKey = googleMapsAvailable();
  // "Set but not a key" is its own answer. Without it the screen tells the
  // owner to add a variable that is sitting right there in Vercel.
  const malformed = googleMapsBrowserKeyMalformed();
  const [state, setState] = useState<State>(hasKey ? "checking" : malformed ? "bad-key" : "no-key");
  // What Google itself said. "Refused" used to list three possible causes and
  // leave the owner to work out which — and the answer was sitting in the
  // browser console the whole time, where nobody thinks to look. Google names
  // the reason exactly: RefererNotAllowedMapError, ApiNotActivatedMapError,
  // BillingNotEnabledMapError, InvalidKeyMapError.
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!hasKey) return;
    let live = true;

    probeGoogleMaps().then((result) => {
      if (!live) return;
      setState(result.state);
      if (result.state === "refused") setReason(result.reason);
    });

    return () => {
      live = false;
    };
  }, [hasKey]);

  // Which of the three it is, in the words the owner needs, once Google has
  // said. Anything unrecognised falls through to the three-cause list below.
  const EXPLAINED: Record<string, { what: string; fix: string }> = {
    RefererNotAllowedMapError: {
      what: "Google refused the address this page is being served from.",
      fix: "Open Google Cloud Console → APIs & Services → Credentials → the browser map key → Application restrictions → Websites, and add these exact entries: https://whiteglovekoshertravel.com/* , https://www.whiteglovekoshertravel.com/* , https://*.vercel.app/* , and your admin hostname if you have one. Wait a few minutes, then reload this page — no redeploy needed for a restriction change.",
    },
    RefererDeniedMapError: {
      what: "Google refused the address this page is being served from.",
      fix: "Add this hostname under the key's Website restrictions (same list as RefererNotAllowed).",
    },
    ApiNotActivatedMapError: {
      what: "Maps JavaScript API is not switched on for the project this key belongs to.",
      fix: "In that key's Google Cloud project, open https://console.cloud.google.com/apis/library/maps-backend.googleapis.com and Enable Maps JavaScript API. The Routes API key used for driving times is a different key and may be on a different project — enabling it there changes nothing here.",
    },
    BillingNotEnabledMapError: {
      what: "The project this key belongs to has no billing account.",
      fix: "In Google Cloud → Billing, link a billing account to that project. Google serves no map at all without one, even inside the free allowance.",
    },
    InvalidKeyMapError: {
      what: "Google does not recognise this key at all.",
      fix: "Copy the browser key again from Credentials (Maps JavaScript key only — not the Routes / driving-times key), put it in Vercel as NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY, and Redeploy. NEXT_PUBLIC_ values are baked in at build time.",
    },
  };
  const explained = reason ? EXPLAINED[reason] : undefined;

  // Enough of the key to tell WHICH key this is without printing it. Three
  // fixes applied to the wrong one of two keys look exactly like three fixes
  // that did not work, and there is no way to tell them apart from here.
  const key = googleMapsBrowserKey();
  const fingerprint = key && key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : null;

  const tone =
    state === "working"
      ? "border-green-600 bg-green-50"
      : state === "refused" || state === "bad-key" || state === "timeout"
        ? "border-red-400 bg-red-50"
        : "border-[var(--gold)] bg-[#FAF8F3]";

  return (
    <section className={`border-l-4 ${tone} border-y border-r border-[var(--gold-light)] p-6`}>
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">The map</h2>

      {state === "checking" && <p className="mt-3 text-sm leading-6 text-stone-600">Checking… loading the script and drawing a tiny map the way visitors do.</p>}

      {state === "no-key" && (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <strong>The public map is unavailable.</strong> Visitors see the map-unavailable state until a browser key
            is configured.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            To use Google&apos;s map, add <code className="rounded bg-white px-1">NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code>{" "}
            in Vercel for Production, then Redeploy. It must be a <em>different</em> key from the one that works out driving times.
          </p>
        </>
      )}

      {state === "bad-key" && (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <strong>The key is set, but the value is not a key.</strong> It holds a character that cannot appear in
            one — almost always something invisible picked up when the key was copied, which looks identical to a
            correct key in every box you paste it into. Visitors are seeing the map-unavailable state.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Delete <code className="rounded bg-white px-1">NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code> in Vercel, copy
            the key again straight from Google&apos;s console rather than from a document or a message, and redeploy.
          </p>
        </>
      )}

      {fingerprint && state !== "no-key" && (
        <p className="mt-3 text-xs leading-5 text-stone-500">
          The key in the page is <code className="rounded bg-white px-1">{fingerprint}</code>. Check that against the
          key you edited in Google&apos;s console — this is the browser key, not the one that works out driving times.
        </p>
      )}

      {state === "working" && (
        <p className="mt-3 text-sm leading-6 text-stone-700">
          <strong>Drawing with Google.</strong> The key is set, Google accepted it from this address, and a map could
          be constructed here — the same check the public map uses.
        </p>
      )}

      {state === "timeout" && (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <strong>Google&apos;s script never became ready in time.</strong> Visitors are seeing the map-unavailable state.
            Usually a blocked script, a slow network, or an ad blocker — less often a key that never answers.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Reload this page on a clean browser profile. If it still times out, confirm the browser key exists in
            the built page (fingerprint above) and that Maps JavaScript API is enabled with billing on that project.
          </p>
        </>
      )}

      {state === "refused" && explained && (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <strong>Google refused the key, and said why.</strong> {explained.what} Visitors are seeing the
            map-unavailable state meanwhile.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">{explained.fix}</p>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            Google&apos;s own words for it: <code className="rounded bg-white px-1">{reason}</code>. Restriction
            changes can take a few minutes to reach Google&apos;s edge — reload this page to check again. No redeploy
            is needed for a restriction change; a new or changed key value in Vercel does need a Redeploy.
          </p>
        </>
      )}

      {state === "refused" && !explained && (
        <>
          <p className="mt-3 text-sm leading-6 text-stone-700">
            <strong>A key is set, but Google would not load the map here.</strong> Visitors are seeing the
            map-unavailable state instead. Almost always one of these — check them in this order on the key&apos;s own
            Google Cloud project:
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-stone-600">
            <li>
              <em>Website restrictions</em> include <code className="rounded bg-white px-1">https://whiteglovekoshertravel.com/*</code>{" "}
              and <code className="rounded bg-white px-1">https://www.whiteglovekoshertravel.com/*</code> (and{" "}
              <code className="rounded bg-white px-1">https://*.vercel.app/*</code> for previews).
            </li>
            <li>
              <em>Maps JavaScript API</em> is enabled on that project (
              <code className="rounded bg-white px-1">maps-backend.googleapis.com</code>).
            </li>
            <li>That project has a billing account linked.</li>
            <li>
              The value in Vercel is this browser key, then Redeployed — not the Routes / driving-times key.
            </li>
          </ol>
        </>
      )}

      {/* The one key on the site that is meant to be public, said plainly, so
          nobody tries to "fix" it by hiding it — or reuses the server key here. */}
      <p className="mt-4 border-t border-[var(--gold-light)] pt-3 text-xs leading-5 text-stone-500">
        This key is the one exception to keys never reaching the browser: Google&apos;s map runs in the visitor&apos;s
        browser, so its key necessarily goes out in the page. That is normal, and it is protected by restricting it —
        to the Maps JavaScript API and to your own hostnames — rather than by hiding it. Which is exactly why it must
        not be the same key as the server&apos;s.
      </p>
    </section>
  );
}
