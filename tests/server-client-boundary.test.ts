import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A SERVER COMPONENT MAY NOT CALL A FUNCTION THAT LIVES IN A CLIENT MODULE.
 *
 * WHAT THIS COST. `advisorPlacesFor` was a pure function — a plan in, a
 * filtered list of links out, no hooks and no browser — and it sat in
 * components/AccountMenu.tsx, which is "use client", because that is where the
 * menu using it happened to be. Next turns every export of a client module
 * into a client reference, so importing it on the server gives a marker
 * object rather than the function. app/advisor/page.tsx is a server component
 * and called it, so every request to the advisor's own dashboard threw:
 *
 *   Attempted to call advisorPlacesFor() from the server but advisorPlacesFor
 *   is on the client.
 *
 * The paid dashboard served the error page, and nothing caught it. `tsc` is
 * happy — the types are correct, it is the runtime boundary that is not.
 * `next build` is happy, because the failure only happens when the page
 * renders. And the page is behind a login, so no unauthenticated check ever
 * reaches it. It was found by a person opening their own dashboard.
 *
 * WHAT THIS CHECKS. Every server page and layout under app/ — anything with no
 * "use client" of its own — and every value it imports from a module that does
 * have one. Types are fine (erased before runtime) and so are components (that
 * is the whole point of the boundary). A plain value or function is not.
 */

const clientModule = (file: string) => /^\s*["']use client["']/.test(readFileSync(file, "utf8"));

/** "@/components/AccountMenu" -> "components/AccountMenu.tsx", or null. */
function resolve(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = spec.slice(2);
  for (const ext of [".tsx", ".ts"]) {
    try {
      readFileSync(base + ext, "utf8");
      return base + ext;
    } catch {
      // not this extension
    }
  }
  return null;
}

describe("server components do not import values out of client modules", () => {
  const serverFiles = execSync("find app -name 'page.tsx' -o -name 'layout.tsx' -o -name 'route.ts'", {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((file) => !clientModule(file));

  it("has server files to check at all", () => {
    // A resolve() or find() that silently returns nothing would make every
    // assertion below pass while checking nothing.
    assert.ok(serverFiles.length > 40, `only found ${serverFiles.length} server files`);
  });

  for (const file of serverFiles) {
    it(`${file} imports only components and types from client modules`, () => {
      const source = readFileSync(file, "utf8");
      const offences: string[] = [];

      for (const match of source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["']/g)) {
        const [, clause, spec] = match;
        const target = resolve(spec);
        if (!target || !clientModule(target)) continue;

        // The default import is the component. `import type` is erased.
        const braces = clause.match(/\{([^}]*)\}/);
        if (!braces || /^\s*import\s+type/.test(match[0])) continue;

        for (const named of braces[1].split(",")) {
          const name = named.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
          if (!name) continue;
          // `import { type Foo }` is erased too.
          if (/^type\s/.test(named.trim())) continue;
          // A capitalised name is a component, which is what the boundary is
          // FOR — it gets serialised and rendered on the client.
          if (/^[A-Z]/.test(name)) continue;
          offences.push(`${name} from ${spec}`);
        }
      }

      assert.deepEqual(
        offences,
        [],
        `${file} calls into a "use client" module at runtime: ${offences.join(", ")}. ` +
          "Move the value into lib/ — see lib/account-places.ts.",
      );
    });
  }
});
