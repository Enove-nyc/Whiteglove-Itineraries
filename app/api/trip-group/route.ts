import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSharedItineraryByShareId } from "@/lib/account-store";
import { sameOrigin } from "@/lib/secure-access";
import { rateLimit } from "@/lib/rate-limit";
import { groupKey, memberCookieName, readMember, signMember } from "@/lib/trip-group-identity";
import { readTripGroup, sendTripGroup } from "@/lib/trip-group-store";

export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
// POST reads keep the trip credential out of request URLs and access logs.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Please open your trip again." }, 403);
  const raw = await request.text();
  if (raw.length > 6000) return reply({ error: "That message is too long." }, 413);
  let body: { code?: unknown; action?: unknown; name?: unknown; text?: unknown };
  try { body = JSON.parse(raw); } catch { return reply({ error: "That request could not be read." }, 400); }
  if (!body || typeof body !== "object") return reply({ error: "Open a trip first." }, 400);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(code)) return reply({ error: "That trip code is not active." }, 404);
  const action = body.action;
  if (action !== "join" && action !== "read" && action !== "send") return reply({ error: "Choose a chat action." }, 400);
  const group = groupKey(code);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`trip-group:${action}:${group}:${groupKey(ip)}`, { limit: action === "send" ? 40 : 120, windowSeconds: 60 });
  if (!limited.ok) return reply({ error: "Please wait a moment before trying again." }, 429);
  // Always resolve against the live trip. Revoking sharing closes chat too;
  // a stale cookie, raw trip id, or guessed neighboring id grants no access.
  if (!(await getSharedItineraryByShareId(code))) return reply({ error: "That trip code is not active." }, 404);
  const secret = process.env.WHITE_GLOVE_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) return reply({ error: "Trip chat is unavailable. Please try again later." }, 503);
  const cookie = memberCookieName(code);
  let member = readMember(request.cookies.get(cookie)?.value, code, secret);
  if (action === "join") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 60) return reply({ error: "Enter your name, up to 60 characters." }, 400);
    member = { id: member?.id ?? randomUUID(), name, group };
    const response = reply({ member: { id: member.id, name: member.name } });
    response.cookies.set(cookie, signMember(member, secret), {
      httpOnly: true, secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/trip-group", maxAge: 60 * 60 * 24 * 180,
    });
    return response;
  }
  if (!member) return reply({ needsName: true }, 401);
  try {
    if (action === "send") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > 2000) return reply({ error: "Write a message of up to 2,000 characters." }, 400);
      return reply({ messages: await sendTripGroup(member, text), member: { id: member.id, name: member.name } });
    }
    return reply({ messages: await readTripGroup(group), member: { id: member.id, name: member.name } });
  } catch { return reply({ error: "Could not reach the trip chat. Please try again." }, 503); }
}
