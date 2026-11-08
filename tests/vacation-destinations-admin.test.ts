import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TRIP_THEMES, vacationDestinations } from "@/data/vacation-destinations";
import { ADMIN_HOST_SEGMENTS } from "@/lib/admin-host";
import { areaForPath } from "@/lib/admin-permissions";
import { PHOTO_OWNER_KINDS, pathsToRefresh } from "@/lib/photos";

/**
 * Holiday destinations became editable without a deploy.
 *
 * THE BUG THIS CLOSES: the admin's destination screen read the database's
 * `Destination` table, which holds towns with kevarim in them. Rome, Venice,
 * Florence and seventeen others live in data/vacation-destinations.ts and had
 * no row anywhere, so the owner could not find them in the admin at all and
 * editing one meant editing code and deploying.
 */

const VIEW = readFileSync("lib/vacation-destinations-view.ts", "utf8");
const STORE = readFileSync("lib/vacation-destinations-admin.ts", "utf8");
const ACTIONS = readFileSync("app/admin/vacation-destinations/actions.ts", "utf8");
const PAGE = readFileSync("app/admin/vacation-destinations/page.tsx", "utf8");
const EDITOR = readFileSync("components/VacationDestinationEditor.tsx", "utf8");
const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

describe("the holiday destinations screen exists and is reachable", () => {
  it("is filed under an area, so it is gated like every other admin screen", () => {
    assert.equal(areaForPath("/admin/vacation-destinations"), "directory");
    assert.match(readFileSync("app/admin/vacation-destinations/layout.tsx", "utf8"), /AreaGate area="directory"/);
  });

  it("is served on the admin host", () => {
    assert.ok((ADMIN_HOST_SEGMENTS as readonly string[]).includes("vacation-destinations"));
  });

  it("re-checks admin auth in every action, because a server action is a POST", () => {
    const actions = ACTIONS.match(/export async function \w+/g) ?? [];
    assert.ok(actions.length >= 4, "no actions found");
    assert.equal(
      (ACTIONS.match(/await requireAdmin\(\)/g) ?? []).length,
      actions.length,
      "an action is not checking admin auth",
    );
  });

  it("NAMES SAY WHICH IS WHICH — 'Towns' and 'Destinations' did not", () => {
    // The two lists share exactly one place (Prague) and answer different
    // questions, but the first names given to the screens could be read either
    // way, and were. The names now carry the distinction on their own.
    const NAV = readFileSync("lib/admin-nav.ts", "utf8");
    assert.match(NAV, /href: "\/admin\/destinations",\s*label: "Heritage towns"/);
    assert.match(NAV, /href: "\/admin\/vacation-destinations",\s*label: "Vacation destinations"/);
    assert.match(PAGE, /Vacation destinations/);

    // And each screen points at the other, so neither is a dead end for
    // somebody who opened the wrong one.
    const TOWNS = readFileSync("app/admin/destinations/page.tsx", "utf8");
    assert.match(TOWNS, /href="\/admin\/vacation-destinations"/);
    assert.match(PAGE, /href="\/admin\/destinations"/);
  });

  it("can be searched, like the heritage towns screen", () => {
    // It shipped without one, so the two destination screens behaved
    // differently for no reason anybody could have guessed.
    const PICKER = readFileSync("components/VacationDestinationPicker.tsx", "utf8");
    assert.match(PAGE, /<VacationDestinationPicker/);
    assert.match(PICKER, /Find a destination/);
    // Folded, so "Krakow" finds Kraków — nobody types the accent.
    assert.match(PICKER, /normalize\(query\)/);
    // Country and towns are searchable too: "Italy" should bring back all of
    // them, and so should "Bellagio".
    assert.match(PICKER, /destination\.country/);
    assert.match(PICKER, /destination\.cities\.join\(" "\)/);
  });

  it("points across when one place really is on both lists", () => {
    // Prague, today. Editing it here and wondering why the shomer's number has
    // not changed is the obvious mistake.
    assert.match(PAGE, /is on both lists/);
    assert.match(PAGE, /its Heritage towns page/);
  });
});

describe("the database overlays the file rather than replacing it", () => {
  it("every editable column is optional, because empty means 'leave it alone'", () => {
    const model = SCHEMA.slice(SCHEMA.indexOf("model VacationDestination {"));
    const body = model.slice(0, model.indexOf("\n}"));
    for (const field of ["name", "country", "whyGo", "overview", "bestTime", "suits", "transport"]) {
      assert.match(body, new RegExp(`${field}\\s+String\\?`), `${field} is not optional — clearing it would blank the site`);
    }
  });

  it("a blank field falls back to the built-in text", () => {
    assert.match(VIEW, /function said\(/);
    assert.match(VIEW, /said\(row\.name\) \?\? from\.name/);
    assert.match(VIEW, /saidList\(row\.cities\) \?\? from\.cities/);
  });

  it("editing a built-in destination for the first time creates its row", () => {
    // Same as a beis hachaim: the built-in ones have no row until something is
    // saved against them.
    assert.match(STORE, /prisma\.vacationDestination\.upsert/);
    assert.match(STORE, /export async function vacationDestinationPhotoOwner/);
  });

  it("hiding is how a shipped destination comes off the site", () => {
    // Deleting the row would only put the built-in text back — it is an
    // overlay, so there is nothing else for a delete to remove.
    assert.match(VIEW, /if \(row\.status !== "PUBLISHED"\) continue;/);
    assert.match(STORE, /export async function setVacationDestinationVisible/);
  });

  it("the editor warns that an empty box is not an empty field", () => {
    assert.match(EDITOR, /Emptying a box does not empty it on the site/);
  });

  it("refuses to add a destination on a slug the file already ships", () => {
    // Otherwise "add" would silently become "edit Rome".
    assert.match(ACTIONS, /vacationDestinations\.some\(\(destination\) => destination\.slug === slug\)/);
  });

  it("falls back to the built-in list when the database is off", () => {
    assert.match(VIEW, /if \(!DB_ENABLED\) return base;/);
    assert.match(VIEW, /catch \{\s*return base;/);
  });
});

describe("every screen reads the same list", () => {
  const readers: Array<[string, string]> = [
    ["the destination page", "app/destinations/[destination]/page.tsx"],
    ["the destinations hub", "app/destinations/(hub)/page.tsx"],
    ["the sitemap", "app/sitemap.ts"],
    ["site search", "lib/site-search-index.ts"],
    ["the front page's featured list", "lib/featured-destinations.ts"],
    ["the planner's starting points", "app/itinerary/page.tsx"],
    ["where to stay", "app/hotels/page.tsx"],
  ];

  for (const [what, file] of readers) {
    it(`${what} reads through the view`, () => {
      assert.match(
        readFileSync(file, "utf8"),
        /getVacationDestinations|getVacationDestinationBySlug/,
        `${file} still reads the data file, so an owner-added destination would be missing from it`,
      );
    });
  }

  it("the redirect map stays on the built-in list, deliberately", () => {
    // It runs on the edge, which cannot reach the database — and a destination
    // the owner added has no old address to redirect anyway.
    const MIGRATION = readFileSync("lib/route-migration.ts", "utf8");
    assert.match(MIGRATION, /DELIBERATELY THE BUILT-IN LIST/);
    assert.match(MIGRATION, /vacationSlugs: vacationDestinations\.map/);
  });

  it("the built-in list is still the twenty the site shipped with", () => {
    assert.ok(vacationDestinations.length >= 20);
    assert.ok(vacationDestinations.some((destination) => destination.slug === "rome"));
  });
});

describe("a destination can carry pictures", () => {
  it("is a photo owner in its own right, separate from a town", () => {
    assert.ok((PHOTO_OWNER_KINDS as readonly string[]).includes("vacation-destination"));
    assert.ok((PHOTO_OWNER_KINDS as readonly string[]).includes("destination"));
  });

  it("refreshes the destination's own pages when a picture changes", () => {
    const paths = pathsToRefresh("vacation-destination", "rome");
    assert.ok(paths.includes("/destinations/rome"));
    assert.ok(paths.includes("/destinations"));
  });

  it("only published pictures reach a visitor", () => {
    // An uncredited picture is held as a draft rather than refused, so drafts
    // are exactly the ones nobody has permission for yet.
    assert.match(VIEW, /where: \{ status: "PUBLISHED" \}/);
  });

  it("shows the credit next to the picture", () => {
    const PHOTOS = readFileSync("components/DestinationPhotos.tsx", "utf8");
    assert.match(PHOTOS, /photo\.credit/);
    assert.match(PHOTOS, /if \(!photos\.length\) return null;/);
  });

  it("a picture write busts the destination list, not just the pages", () => {
    const TOWN_ACTIONS = readFileSync("app/admin/destinations/actions.ts", "utf8");
    assert.match(TOWN_ACTIONS, /VACATION_DESTINATIONS_TAG/);
  });
});

describe("the new table can reach a database that already exists", () => {
  const UPGRADE = readFileSync("lib/upgrade-sql.ts", "utf8");
  const INIT = readFileSync("lib/init-sql.ts", "utf8");
  const SETUP = readFileSync("lib/db-setup.ts", "utf8");

  it("creates the table from the generated script", () => {
    // Plain CREATE TABLE, not IF NOT EXISTS — the generated script relies on
    // ensureTables swallowing "already exists", which is how it doubles as the
    // way a new table reaches a database that was set up before it.
    assert.match(INIT, /CREATE TABLE "VacationDestination"/);
    assert.match(SETUP, /already exists/i);
  });

  it("tells the owner to press the button rather than failing on save", () => {
    // The site has no migration step on deploy, so the day this ships the
    // table is not there yet. Without this the first save failed with a raw
    // Postgres error naming a relation, which says nothing about what to do.
    const STORE_SRC = readFileSync("lib/vacation-destinations-admin.ts", "utf8");
    assert.match(STORE_SRC, /export async function vacationDestinationsTableReady/);
    assert.match(PAGE, /vacationDestinationsTableReady/);
    assert.match(PAGE, /<DbSetupButton \/>/);
    assert.match(PAGE, /The database needs one update before this screen can save/);
  });

  it("adds the picture column by ALTER, because Photo already exists", () => {
    // On an existing database the CREATE TABLE carrying this column is
    // skipped — the table is already there — so the column has to arrive on
    // its own or every destination picture fails to save.
    assert.match(UPGRADE, /ALTER TABLE "Photo" ADD COLUMN IF NOT EXISTS "vacationDestinationId" TEXT;/);
  });

  it("retries a foreign key that needed a column the upgrade had not added yet", () => {
    // INIT_SQL ends with the foreign keys and UPGRADE_SQL runs after it, so a
    // key onto a newly-added column cannot succeed on the first pass. It used
    // to take the whole setup down rather than just itself.
    assert.match(SETUP, /const deferred: string\[\] = \[\];/);
    assert.match(SETUP, /for \(const statement of deferred\) await run\(statement, true\);/);
    assert.match(INIT, /ADD CONSTRAINT "Photo_vacationDestinationId_fkey"/);
  });
});

describe("the themes the owner can actually save", () => {
  it("ACCEPTS EVERY THEME THE EDITOR OFFERS, INCLUDING HERITAGE", () => {
    // The editor's checkboxes come from TRIP_THEMES and the read layer used to
    // filter against a hand-copied list of six that left "heritage" out. So
    // ticking Heritage, pressing save and being told it saved left the
    // destination missing from the Heritage filter, with nothing to say why.
    // The two lists are one list now; this fails if they are ever split again.
    const view = readFileSync("lib/vacation-destinations-view.ts", "utf8");
    assert.match(view, /const THEMES: readonly string\[\] = TRIP_THEMES\.map/);
    assert.match(view, /const SEASONS: readonly string\[\] = SEASON_OPTIONS\.map/);
    assert.doesNotMatch(
      view,
      /const THEMES: readonly string\[\] = \[/,
      "the theme list must not be written out a second time",
    );
    assert.ok(
      TRIP_THEMES.some((theme) => theme.value === "heritage"),
      "heritage is a trip type and the filter depends on it",
    );
  });
});
