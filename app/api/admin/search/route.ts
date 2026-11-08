import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-current";
import { listAllAccounts } from "@/lib/account-store";
import { canOpen } from "@/lib/admin-permissions";
import { searchAdmin } from "@/lib/admin-search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { identity, areas } = await currentAdmin();
  if (!identity) {
    return NextResponse.json({ error: "Please sign in as an administrator." }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q") || "";
  const raw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 40) : 24;
  const response = await searchAdmin(q, { areas, limit });
  if (q.trim().length >= 3 && canOpen(areas, "/admin/accounts")) {
    const needle = q.trim().toLowerCase();
    const accounts = await listAllAccounts();
    const matches = accounts.filter(account => account.email.toLowerCase().includes(needle) || account.name?.toLowerCase().includes(needle)).slice(0, 6);
    response.results = [...matches.map(account => ({ id: "account:" + account.email, section: "Screens" as const, kind: "User", title: account.name || account.email, subtitle: account.email, href: "/admin/accounts?q=" + encodeURIComponent(account.email) })), ...response.results].slice(0, limit);
  }
  return NextResponse.json(response);
}
