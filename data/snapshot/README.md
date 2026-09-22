# The database, written down

`content.json` in this folder is a copy of what the White Glove database held
when it was last written here, on 18 August 2026 — before this repository was
separated from White Glove Kosher Travel. It is not refreshed on a schedule any
more, and `npm run snapshot` with a `DATABASE_URL` in the environment is what
writes it.

**The nightly snapshot lives in the kosher repository.** Both sites read one
Postgres and one Redis, and everything in them is guide content — batei
hachaim, tzaddikim, shomer numbers, directory listings — whose pages answer 410
on this domain. One nightly run covers both stores, and it is that one. Nothing
in the application reads this file; it is a record for people, not a fallback.

**Do not edit it by hand.** It is generated, and the next run will overwrite
anything typed into it. To change what it says, change the content in the admin
and the next snapshot will follow.

## Why it is here

The site's content lives in two places. The `data/*.ts` files are in git and
ship with the code. Everything added or corrected through the admin — new batei
hachaim, tzaddikim, shomer numbers, edited pages — lives in Postgres. The public
pages merge the two, so the *site* is right, but a checkout of this repository
is not: it holds the built-in half and gives no sign that the other half exists.

Anybody working from a checkout therefore states half the truth confidently. It
happened: a shomer's number the owner had entered through the admin was reported
back to him as missing, because it was in the database and the database is not
in git.

This file closes that gap. With it, a checkout shows what the live site shows, a
changed phone number is a diff somebody can read, and there is a copy of the
corpus that does not depend on the database being reachable.

## What is in it, and what is not

Published content only. This repository is public, and the snapshot is built to
be safe in it: every line is already on a page any visitor can load. Draft pages
are dropped.

The private backup is a different thing — the admin export, which includes
drafts and is deliberately not committed anywhere. See `lib/content-export.ts`.
