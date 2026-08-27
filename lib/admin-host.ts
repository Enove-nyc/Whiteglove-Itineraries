/**
 * How admin URLs are written on the dedicated admin hostname.
 *
 * The screens still live under app/admin. On admin.example the browser should
 * show /imports, not /admin/imports. This file is the one definition of that
 * transform so middleware, login, and tests cannot drift.
 *
 * Aliases give the operational names from the admin brief without inventing
 * new public-site paths. /heritage, /hotels, /cemeteries and /tzaddikim stay
 * public on purpose — admin screens already link out to them.
 */

export const ADMIN_PATH_ALIASES: Record<string, string> = {
  "/admin/users": "/admin/accounts",
  "/admin/audit-log": "/admin/history",
  "/admin/providers": "/admin/directory/businesses",
};

/** First path segment on the admin host that is an admin screen, including aliases. */
export const ADMIN_HOST_SEGMENTS = [
  "accounts",
  "add",
  "advertisements",
  "airports",
  "alerts",
  "audit-log",
  "borders",
  "content",
  "countries",
  "destinations",
  "directory",
  "directory-listings",
  "duffel",
  "finances",
  "flight-itineraries",
  "growth",
  "hechsherim",
  "heritage-cemeteries",
  "history",
  "imports",
  "inventory",
  "eruvin",
  "kevarim",
  "kosher-apartments",
  "login",
  "messages",
  "mikvaos",
  "pages",
  "photos",
  "planner",
  "providers",
  "ratings",
  "recycle",
  "reports",
  "settings",
  "shomrim",
  "shuls",
  "team",
  "travel",
  "users",
  "vacation-destinations",
] as const;

export function isAdminHostSegment(pathname: string): boolean {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  return (ADMIN_HOST_SEGMENTS as readonly string[]).includes(segment);
}

export function stripAdminPrefix(pathname: string): string {
  if (pathname === "/admin" || pathname === "/admin/") return "/";
  if (pathname.startsWith("/admin/")) return pathname.slice("/admin".length) || "/";
  return pathname || "/";
}

export function toCanonicalAdminPath(pathname: string): string {
  const prefixed = pathname.startsWith("/admin") ? pathname : pathname === "/" ? "/admin" : `/admin${pathname}`;
  const parts = prefixed.split("/").filter(Boolean);
  if (parts[0] !== "admin" || !parts[1]) return prefixed === "/admin/" ? "/admin" : prefixed;
  const aliasKey = `/admin/${parts[1]}`;
  const mapped = ADMIN_PATH_ALIASES[aliasKey];
  if (!mapped) return prefixed.replace(/\/+$/, "") || "/admin";
  const rest = parts.slice(2).join("/");
  return rest ? `${mapped}/${rest}` : mapped;
}

/**
 * A return path after login. Relative only — never a protocol-relative or
 * off-site URL, and never a token-bearing query we did not already have.
 */
export function safeAdminNext(raw: string | null | undefined, fallback = "/admin"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  const [path, query = ""] = value.split("?");
  const cleanPath = path.replace(/\/+$/, "") || "/";
  if (cleanPath === "/login" || cleanPath === "/admin/login") return fallback;
  const canonical = toCanonicalAdminPath(cleanPath);
  return query ? `${canonical}?${query}` : canonical;
}

export function adminLoginPath(onAdminHost: boolean): string {
  return onAdminHost ? "/login" : "/admin/login";
}

export function adminHomePath(onAdminHost: boolean): string {
  return onAdminHost ? "/" : "/admin";
}

export function publicAdminHref(href: string, onAdminHost: boolean): string {
  if (!onAdminHost) return href;
  return stripAdminPrefix(href);
}

/**
 * Where an unauthenticated visitor should go, in one hop.
 *
 * Authed visitors hitting /admin/… on the admin host go to the bare path.
 * Unauthed visitors go straight to /login?next= so /admin/foo does not bounce
 * through /foo first.
 */
export function adminHostEntry(pathname: string, search: string, authed: boolean): { kind: "redirect"; pathname: string; search: string; permanent: boolean } | { kind: "stay" } {
  if (!pathname.startsWith("/admin")) return { kind: "stay" };
  const dest = stripAdminPrefix(pathname);
  const destSearch = search.startsWith("?") ? search : search ? `?${search}` : "";
  if (!authed && dest !== "/login") {
    const next = `${dest}${destSearch}`;
    const loginSearch = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    return { kind: "redirect", pathname: "/login", search: loginSearch, permanent: false };
  }
  return { kind: "redirect", pathname: dest, search: destSearch, permanent: true };
}
