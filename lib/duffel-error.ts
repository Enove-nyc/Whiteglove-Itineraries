export function explainDuffelError(status: number, body: string): { message: string; detail?: string } {
  let parsed: { errors?: Array<{ title?: string; message?: string; code?: string; type?: string }> } | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* Duffel answered with something that is not JSON; fall through. */
  }
  const first = parsed?.errors?.[0];
  const said = [first?.title, first?.message].filter(Boolean).join(" — ");
  const code = `${first?.code ?? ""} ${first?.type ?? ""}`.toLowerCase();

  if (status === 401 || /unauthorized|invalid_api_token|token/.test(code)) {
    return {
      message: "Duffel did not accept the access token.",
      detail:
        "Check DUFFEL_ACCESS_TOKEN in Vercel. Duffel issues separate tokens for test and live — a test token starts duffel_test_ and only returns made-up flights, a live one starts duffel_live_. Environment variables are read at build time, so redeploy after changing it.",
    };
  }
  if (status === 403) {
    return {
      message: "Duffel accepted the token but refused the request.",
      detail:
        said ||
        "A 403 from Duffel usually means the account is not finished — terms not accepted, or the live environment not activated yet. Check the Duffel dashboard for anything outstanding. If the reply was not from Duffel at all, a firewall in front of the deployment may be blocking api.duffel.com.",
    };
  }
  if (status === 429 || /rate_limit/.test(code)) {
    return { message: "Duffel is rate-limiting this account.", detail: "Too many searches in a short time. Wait a minute and try again." };
  }
  if (/no_route|not_found.*route/.test(code)) {
    return { message: "Duffel has no flights for that route on that date.", detail: said || undefined };
  }
  if (status >= 500) {
    return { message: "Duffel's own service is having trouble.", detail: said || "Nothing is wrong at this end — try again shortly." };
  }
  if (status === 400 || status === 422) {
    return {
      message: "Duffel refused the search as written.",
      // Duffel names the offending field, which is exactly what is needed here.
      detail: said || "One of the airports or dates was not something Duffel accepts.",
    };
  }
  // Never a bare status with nothing to do about it — that is the dead end this
  // whole function exists to remove.
  return {
    message: `Duffel returned HTTP ${status}.`,
    detail: said || "Duffel sent no explanation with this. Run the flight-search check on the admin connections screen, which reports the same request in full.",
  };
}
