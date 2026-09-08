# Running the real site locally, so its buttons can actually be pressed

This is the White Glove Itineraries copy of the kosher repository's rig, and
three things differ. THE BRAND HAS TO BE SET: this deployment runs with
`NEXT_PUBLIC_SITE_BRAND=itineraries`, and without it the build behaves as the
kosher site — the home page, the zmanim layer and the guide-path rules all key
off it. THE PORT IS 3003 here, so both sites can be up at once and a change can
be looked at on each. AND THE STORE IS DELIBERATELY SHARED: production runs
both deployments against one Neon database and one Upstash namespace, so
pointing both local apps at the same bridge and the same redis stand-in is not
a shortcut, it is the arrangement being reproduced.

`write-paths.mjs` is NOT here. It lives in the kosher repository and presses
the admin's write paths there. The admin dashboard is shared and every screen
it touches exists on this side too, but the listing catalog here has no
quick-edit panel, so several of its checks would report a structural difference
as a failure. Run it there; it is the same admin.

Nothing in here ships. It exists so that a session — or a person — can open the
site as the owner sees it, with a real database and a real signed-in admin, and
click things. Every automated test in this repository reads source or calls a
pure function; none of them press a button. Two live bugs found in one evening
(a lookup that returned 431 and silently unverified every kosher badge, an
admin "Open the full editor" link that led to the generic Add page) were
invisible to the test suite and obvious within a minute of clicking.

The awkward part is the database. Production uses Neon, and the app talks to it
through `@prisma/adapter-neon` — the Neon serverless driver, which speaks the
Postgres wire protocol inside **WebSocket binary frames over TLS on :443**, not
plain TCP. A local `postgres` on 5433 cannot answer that. `ws-pg-bridge.mjs`
is the missing piece: it terminates TLS, does the RFC 6455 handshake and frame
decoding by hand, and pipes the payload into a normal socket.

## Setup, once

```sh
# 1. Postgres. initdb refuses to run as root, so give it a user of its own.
PG=/usr/lib/postgresql/16/bin
useradd -m pguser 2>/dev/null; mkdir -p /tmp/pgdata && chown pguser /tmp/pgdata
su pguser -c "$PG/initdb -D /tmp/pgdata -U wg --auth=trust"
su pguser -c "$PG/pg_ctl -D /tmp/pgdata -o '-p 5433 -k /tmp' -l /tmp/pg.log start"
$PG/createdb -h 127.0.0.1 -p 5433 -U wg whiteglove

# The Neon driver always authenticates; trust auth makes it send a startup
# message the server does not expect ("invalid frontend message type 112").
$PG/psql -h 127.0.0.1 -p 5433 -U wg -d whiteglove -c "ALTER USER wg PASSWORD 'wg';"
sed -i -E 's/^(host\s+all\s+all\s+\S+\s+)trust/\1password/' /tmp/pgdata/pg_hba.conf
su pguser -c "$PG/pg_ctl -D /tmp/pgdata reload"

# 2. Schema.
DATABASE_URL='postgresql://wg:wg@127.0.0.1:5433/whiteglove' npx prisma migrate deploy

# 3. A throwaway certificate for the bridge.
openssl req -x509 -newkey rsa:2048 -nodes -keyout ws.key -out ws.crt -days 2 \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
```

## Every run

```sh
cd scripts/local-audit
node ws-pg-bridge.mjs &     # wss://127.0.0.1:443  →  127.0.0.1:5433
node redis-mock.mjs &       # http://127.0.0.1:6380 — the Upstash REST shapes

cd ../..
# NEXT_PUBLIC_SITE_BRAND is read at BUILD time as well as at run time, so it
# has to be set for the build too — a build without it is the kosher site.
NEXT_PUBLIC_SITE_BRAND=itineraries npx next build
NODE_TLS_REJECT_UNAUTHORIZED=0 \
DATABASE_URL='postgresql://wg:wg@127.0.0.1:5433/whiteglove' \
UPSTASH_REDIS_REST_URL=http://127.0.0.1:6380 UPSTASH_REDIS_REST_TOKEN=local \
OWNER_EMAIL=owner@audit.local ADMIN_PASSWORD=audit-local-pass \
WHITE_GLOVE_SESSION_SECRET=audit-local-session-secret-0123456789 \
NEXT_PUBLIC_SITE_BRAND=itineraries \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3003 \
npx next start -p 3003 &

curl -s http://127.0.0.1:3003/api/health   # both checks must say ok:true
node scripts/local-audit/bootstrap-auth.mjs http://127.0.0.1:3003
```

`bootstrap-auth.mjs` registers the owner account, marks it verified by editing
the record in the Redis stand-in (the verification code is stored only as a
hash, and no mail is sent locally), signs in, opens an admin session, seeds the
database from `data/*.ts`, and writes `auth-state.json` — a Playwright
`storageState` carrying the three cookies. Hand that to a browser context and
you are the owner.

## Clicking

```sh
node scripts/local-audit/crawl.mjs       http://127.0.0.1:3003 public.json 50
node scripts/local-audit/admin-crawl.mjs http://127.0.0.1:3003 admin.json
```

Both walk the site at 1280px and 390px, follow every same-origin link, press
every visible control that does not write, and record dead links, stuck
`Loading`, spinners that never stop, horizontal overflow, controls under the
fixed bottom bar, dialogs that ignore Escape, failed requests and page errors.
`admin-crawl.mjs` deliberately does **not** press Save, Delete, Approve,
Publish, Import or Upload; those want a scripted run of their own that checks
the row afterwards.

## The one that will fool you rather than waste your time

**A brand-aware component renders the KOSHER branch on `127.0.0.1`, whatever
you built.** `useSiteBrand` settles the brand from `window.location.hostname`
after mount, and `brandForHost` decides by looking for the string
`whitegloveitineraries` in it. `127.0.0.1` does not contain it, so every
brand-aware component on this rig answers "kosher" — the itinerary footer signs
the page "White Glove Kosher Travel", offers "Browse kevarim" instead of "Open
the app", and the zmanim button appears. None of that is a bug and all of it
looks exactly like one.

`NEXT_PUBLIC_SITE_BRAND` does not save you: it is only the server snapshot, and
the client corrects to the host a moment later — deliberately, so one build can
be served on a preview host.

THE FIX IS A HOSTNAME, not a code change:

```sh
echo "127.0.0.1 whitegloveitineraries.local" >> /etc/hosts
# then browse http://whitegloveitineraries.local:3003 and bootstrap against it,
# so the cookies are issued for that host too.
node scripts/local-audit/bootstrap-auth.mjs http://whitegloveitineraries.local:3003
```

Any name containing `whitegloveitineraries` works. Check you have it right
before believing anything about branding: the footer should read "White Glove
Itineraries" and offer "Open the app".

AND THE MOMENT YOU LEAVE 127.0.0.1, THE CSP BITES. The app sends
`upgrade-insecure-requests`. Browsers exempt localhost from it; a named host
they do not, so every chunk is rewritten to `https://…:3003`, the http-only
server resets the connection, and the page arrives as server-rendered HTML that
never hydrates — no console error, no failed API call, just a screen that sits
on "Loading your itineraries…" looking signed out. Serve the upgraded URLs from
the http origin in the browser context rather than putting TLS in front of the
dev server:

```js
await ctx.route("https://whitegloveitineraries.local:3003/**", async (route) => {
  const res = await route.fetch({ url: route.request().url().replace("https://", "http://") });
  await route.fulfill({ response: res });
});
```

Cookies want `ctx.addCookies([{ name, value, url }])` too — a `.local` domain
written into a `storageState` file is not delivered, and looks identical to
being signed out.

## Two things that will waste your time

**Playwright's browser path is wrong.** `PLAYWRIGHT_BROWSERS_PATH` points at a
build that is not installed, and `chromium.launch()` fails asking you to run
`playwright install` — which the environment tells you not to do. Pass
`executablePath` explicitly; find it with
`find /opt/pw-browsers -name headless_shell -o -name chrome | head -1`.

**Chromium cannot reach the public internet.** Through this environment's proxy
every navigation to a real domain ends in `ERR_CONNECTION_RESET`, whatever the
proxy settings. `curl` works; the browser does not. So the live sites can only
be checked with `curl`, and anything needing a rendered page has to run against
the local server. Say so plainly in any report rather than implying the live
site was clicked.

## What has actually been pressed

The write-path run described in the kosher repository's copy of this file was
done there, against the shared admin, and is not repeated here.

What has been pressed on THIS side is the itinerary builder, on
`whitegloveitineraries.local` so the brand was the real one. A trip was made, two
travellers were put in two different families, a flight was added and assigned
to one of them with the "Who is this for" selector, and the trip was reloaded —
`unitKey: "family:cohen family"` was in the store afterwards. Then a traveller
link was made for each family and fetched: the Levy link carries neither airport
of the Cohens' flight, the Cohen link carries both, and both links still list
everyone on the trip by name. That is the whole of what per-unit privacy is
supposed to do, seen working rather than asserted.

Not yet pressed here: the day cards, the print preview, the item forms' first
screens, and the five fixtures from the owner's brief.
