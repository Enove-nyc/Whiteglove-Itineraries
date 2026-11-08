import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminBreadcrumbs, adminLabelFor } from "@/lib/admin-nav";

// The admin has about twenty screens and several look alike two clicks in —
// "Everything", "Towns" and "Kevarim" are all lists of places. The trail says
// which one you are on without having to recognise it.

const labels = (path: string) => adminBreadcrumbs(path).map((c) => c.label);
const links = (path: string) => adminBreadcrumbs(path).map((c) => c.href ?? null);

describe("the admin trail", () => {
  it("is just the dashboard on the dashboard", () => {
    assert.deepEqual(labels("/admin"), ["Dashboard"]);
  });

  it("never links to the page you are already on", () => {
    // A link to where you are is a dead control.
    for (const path of ["/admin", "/admin/pages", "/admin/kevarim", "/admin/settings/passwords"]) {
      const crumbs = adminBreadcrumbs(path);
      assert.equal(crumbs[crumbs.length - 1].href, undefined, `${path} last crumb should not be a link`);
    }
  });

  it("names a nested directory catalog, not the hub", () => {
    assert.deepEqual(labels("/admin/directory/attractions"), ["Dashboard", "Directory", "Things to do"]);
    assert.deepEqual(labels("/admin/directory/stays"), ["Dashboard", "Directory", "Where to stay"]);
    assert.deepEqual(labels("/admin/directory/food"), ["Dashboard", "Directory", "Kosher food"]);
  });

  it("links every crumb except the last", () => {
    assert.deepEqual(links("/admin/kevarim"), ["/admin", "/admin/directory", null]);
  });

  it("names a screen the nav does not list, rather than pretending you are on the section front page", () => {
    const trail = labels("/admin/settings/passwords");
    assert.equal(trail[0], "Dashboard");
    assert.equal(trail[trail.length - 1], "Passwords");
    assert.ok(trail.length >= 3);
  });

  it("works on the admin hostname, where paths have no /admin prefix", () => {
    // Signing in at admin.…/ serves bare paths; the trail has to read them the
    // same way the middleware does.
    assert.deepEqual(labels("/kevarim"), labels("/admin/kevarim"));
    assert.deepEqual(labels("/"), ["Dashboard"]);
  });
});

describe("naming a screen", () => {
  it("gives the screen's own name, not the section's", () => {
    assert.equal(adminLabelFor("/admin/shomrim"), "Shomrim");
    assert.equal(adminLabelFor("/admin"), "Dashboard");
  });
});
