import { NextResponse } from "next/server";
import { readiness } from "@/lib/readiness-data";

export const dynamic = "force-dynamic";

/**
 * What Railway asks before it moves traffic onto a new container.
 *
 * 503 ONLY WHEN THIS BUILD CANNOT DO ITS JOB — today that means the database
 * schema is older than the migrations this build ships, which is the one way
 * a deploy here goes wrong quietly. Everything else is reported in the body
 * and still answers 200; see lib/readiness.ts for why a cold cache must not
 * block a deploy.
 *
 * NOTHING SECRET LEAVES. Names and one-line states, never a connection string,
 * and no-store so nothing in between keeps an answer that was true a minute ago.
 */
export async function GET() {
  const state = await readiness();
  return NextResponse.json(state, {
    status: state.ready ? 200 : 503,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
