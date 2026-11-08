import { NextRequest, NextResponse } from "next/server";
import { readApiKey } from "@/lib/api-key";
import { explainDuffelError } from "@/lib/duffel-error";
import { inspectDuffelToken, duffelTokenHelp } from "@/lib/duffel-token";
import { redact } from "@/lib/redact";
import { isValidAccessToken } from "@/lib/secure-access";

// Is the Duffel token actually working?
//
// The same question the Routes check answers, for the other paid service. It
// exists for the same reason: "Duffel could not complete this flight search"
// appeared on the booking page with nothing behind it, and there was no screen
// anywhere that could say whether the token was wrong, the account was in test
// mode, or Duffel was simply having a bad morning.
//
// So this runs a real search over a route with plenty of flights on it and
// reports exactly what came back.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DUFFEL_URL = "https://api.duffel.com/air/offer_requests";

function admin(request: NextRequest) {
  return isValidAccessToken("admin", request.cookies.get("white_glove_admin")?.value);
}

/** Three weeks out: far enough ahead that every airline has loaded its schedule. */
function departureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!admin(request)) return NextResponse.json({ error: "Please sign in as an administrator." }, { status: 401 });

  // Read through the same cleaner as every other key — an invisible character
  // pasted in with a token breaks it exactly the way it broke the Maps key.
  const read = readApiKey("DUFFEL_ACCESS_TOKEN");
  if (!read.key && !read.unusable) {
    const help = duffelTokenHelp("missing");
    return NextResponse.json({
      keySet: false,
      ok: false,
      advice: help.detail,
    });
  }
  if (read.unusable || !read.key) {
    return NextResponse.json({ keySet: true, ok: false, error: "The value in DUFFEL_ACCESS_TOKEN is not a usable token.", advice: read.problems.join(" ") });
  }

  const inspected = inspectDuffelToken(read.key);
  if (inspected.kind !== "test" && inspected.kind !== "live") {
    const help = duffelTokenHelp(inspected.kind);
    return NextResponse.json({
      keySet: true,
      ok: false,
      mode: inspected.kind,
      error: help.message,
      advice: help.detail,
    });
  }

  const mode: "test" | "live" = inspected.kind;

  try {
    const response = await fetch(DUFFEL_URL, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
        Authorization: `Bearer ${read.key}`,
      },
      body: JSON.stringify({
        data: {
          // London to New York, both as whole-city codes — so this also proves
          // the metropolitan codes the search now sends are ones Duffel accepts.
          slices: [{ origin: "LON", destination: "NYC", departure_date: departureDate() }],
          passengers: [{ type: "adult" }],
          cabin_class: "economy",
          return_offers: true,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const explained = explainDuffelError(response.status, body);
      return NextResponse.json({
        keySet: true,
        ok: false,
        mode,
        status: response.status,
        error: redact(explained.message),
        advice: explained.detail ? redact(explained.detail) : undefined,
      });
    }

    const result = (await response.json()) as { data?: { offers?: Array<{ total_amount?: string; total_currency?: string }> } };
    const offers = result.data?.offers ?? [];
    if (!offers.length) {
      return NextResponse.json({
        keySet: true,
        ok: false,
        mode,
        error: "Duffel accepted the token but returned no flights for London → New York three weeks out.",
        advice:
          mode === "test"
            ? "This is a test token, and Duffel's test environment only has invented flights on a few routes. That is expected here — but it also means the admin search cannot ticket a real fare."
            : "A live token that finds nothing on this route usually means the account has no airlines enabled yet. Check the airline connections in the Duffel dashboard.",
      });
    }

    const cheapest = offers.reduce((low, o) => (Number(o.total_amount) < Number(low.total_amount) ? o : low), offers[0]);
    return NextResponse.json({
      keySet: true,
      ok: true,
      mode,
      offers: offers.length,
      cheapest: cheapest.total_amount ? `${cheapest.total_amount} ${cheapest.total_currency ?? ""}`.trim() : null,
      route: "London (all airports) → New York (all airports)",
      advice:
        mode === "test"
          ? "The token works, but it is a TEST token: these flights are invented by Duffel and cannot be ticketed. Swap it for the live token when you are ready to issue a real ticket from the admin."
          : "Working. The admin Duffel search can request real flights, and a city with several airports is searched as one." +
            (read.cleaned ? ` One thing to fix anyway: ${read.problems.join(" ")}` : ""),
      warning: read.cleaned ? read.problems.join(" ") : undefined,
    });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error));
    let advice = "The request to Duffel could not be completed.";
    if (/invalid header|Headers\.append|ByteString/i.test(message)) {
      advice = "The request was never sent: the stored token cannot go in an HTTP header. Delete DUFFEL_ACCESS_TOKEN in Vercel, paste it again, and redeploy.";
    } else if (/aborted|timeout|timed out/i.test(message)) {
      advice = "Duffel did not answer within twenty-five seconds. Flight searches are slow — try once more before assuming anything is wrong.";
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      advice = "The deployment could not resolve api.duffel.com. This one is the network.";
    }
    return NextResponse.json({ keySet: true, ok: false, mode, error: message, advice });
  }
}
