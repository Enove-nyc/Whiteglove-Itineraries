/** Crawler policy only. Authentication and unguessable, revocable trip codes remain the access controls. */
export const PRIVATE_PATHS = [
  "/admin", "/api", "/account", "/login", "/join", "/access", "/embed",
  "/itinerary", "/my-route", "/command-center", "/book/review",
  "/i/", "/t", "/f", "/p", "/form", "/app", "/advisor", "/agency",
  "/clients", "/forms", "/group", "/history", "/pipeline", "/payments",
  "/commissions", "/activity", "/proposal", "/library", "/addons",
  "/optimize", "/translate", "/search", "/rate", "/alerts", "/offline", "/version",
] as const;

/** Match path segments; /app must not also block /apple or /application. */
export function isPrivatePath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}
