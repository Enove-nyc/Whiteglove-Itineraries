import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CONTACT_REASONS,
  composeMessage,
  missingFields,
  readReason,
  reasonSpec,
} from "@/lib/contact-reasons";
import { assigneeFor } from "@/lib/trello";
import { publicPaths } from "@/lib/site-map";

/**
 * The contact page asks what the message is about before it asks anything else.
 *
 * WHAT IT DID BEFORE. It opened on a trip-planning form, whoever you were.
 * Somebody writing to say a shul's address had changed met eleven questions
 * about their dates and their kosher standards; somebody asking about
 * advertising met the same. Both wrote in the message box instead, and both
 * cost a reply asking for the one fact the form should have asked for. The
 * trip-planning reason itself is gone now — the service it asked about was
 * removed from the site outright, not merely demoted — so what remains below
 * is the same rule applied to the four errands that are left.
 *
 * THE RULE, and it is the same one every reason follows: a field belongs to a
 * reason and appears for that reason only. It is asserted here against the
 * data rather than against the markup, so it survives the page being
 * rewritten.
 *
 * AND THE OTHER THING THIS FILE WATCHES: personal booking assistance is not
 * offered anywhere on the public site any more. That is a positioning
 * decision, it is invisible in the code, and it is exactly the kind of thing
 * that comes back one helpful link at a time.
 */

const PAGE = readFileSync("app/contact/page.tsx", "utf8");
const FORM = readFileSync("components/ContactForm.tsx", "utf8");

describe("the reasons", () => {
  it("is four, and each is answerable without reading the others", () => {
    // Four since the site fault was split out of "something here is wrong":
    // one is a claim about the world and one is a claim about the site, and
    // only the second can be checked without ringing somebody up.
    assert.equal(CONTACT_REASONS.length, 4);
    for (const reason of CONTACT_REASONS) {
      assert.ok(reason.label.length > 5, reason.value);
      assert.ok(reason.blurb.length > 10, `${reason.value} has no blurb`);
      assert.ok(reason.subject.length > 3, `${reason.value} has no inbox subject`);
      assert.ok(reason.messageLabel.length > 3, `${reason.value} has no label on its message box`);
    }
  });

  it("gives each one its own subject, so the errands do not look alike in a list", () => {
    const subjects = new Set(CONTACT_REASONS.map((reason) => reason.subject));
    assert.equal(subjects.size, CONTACT_REASONS.length);
  });

  it("COVERS THE ERRANDS THE SITE ACTUALLY HAS", () => {
    assert.deepEqual(
      CONTACT_REASONS.map((reason) => reason.value),
      ["correction", "advertise", "fault", "question"],
    );
  });

  it("HAS NO TRIP-PLANNING REASON LEFT", () => {
    const values: string[] = CONTACT_REASONS.map((reason) => reason.value);
    assert.ok(!values.includes("trip"), "personal planning is back as a contact reason");
  });

  it("SENDS THE SITE FAULT TO THE BOT AND EVERYTHING ELSE TO A PERSON", () => {
    // The one distinction the board is built on. A wrong address is a claim
    // about the world and only somebody who can ring the place up can settle
    // it; a broken button is a claim about this repository.
    assert.equal(assigneeFor("fault"), "bot");
    for (const kind of ["photo", "suggestion", "listing", "plan", "report", "contact"] as const) {
      assert.equal(assigneeFor(kind), "owner", kind);
    }
  });
});

describe("a field belongs to one reason", () => {
  it("NEVER SHOWS ONE REASON'S FIELDS UNDER ANOTHER", () => {
    // The failure this whole module exists to prevent: somebody reporting a
    // wrong address asked how many children are travelling.
    for (const reason of CONTACT_REASONS) {
      for (const field of reason.fields) {
        for (const other of CONTACT_REASONS) {
          if (other.value === reason.value) continue;
          assert.ok(
            !other.fields.some((entry) => entry.name === field.name),
            `${field.name} is asked for both ${reason.value} and ${other.value}`,
          );
        }
      }
    }
  });

  it("asks the correction for the page and the advertiser for the business", () => {
    assert.deepEqual(reasonSpec("correction").fields.map((f) => f.name), ["page", "source"]);
    assert.deepEqual(reasonSpec("advertise").fields.map((f) => f.name), ["business", "website", "where"]);
  });

  it("asks a plain question nothing extra at all", () => {
    assert.deepEqual(reasonSpec("question").fields, []);
  });

  it("MAKES THE SOURCE OPTIONAL ON A CORRECTION", () => {
    // Requiring it turns away the person who was there last month and has no
    // link — which is most of the corrections worth having. It decides how
    // fast the fix goes live, not whether it is believed, and the field says
    // so where somebody reads it.
    const source = reasonSpec("correction").fields.find((field) => field.name === "source");
    assert.ok(source);
    assert.equal(source.required, false);
    assert.match(source.hint ?? "", /not required/i);
  });
});

describe("reading the reason off the URL", () => {
  it("takes the ones it knows", () => {
    for (const reason of CONTACT_REASONS) assert.equal(readReason(reason.value), reason.value);
    assert.equal(readReason("ADVERTISE"), "advertise");
    assert.equal(readReason(" advertise "), "advertise");
  });

  it("TREATS ANYTHING ELSE AS NO REASON, not as a default", () => {
    // Landing on the trip form because somebody mistyped a query string is the
    // old page's behaviour arriving by the back door.
    assert.equal(readReason("trips"), "");
    assert.equal(readReason(undefined), "");
    assert.equal(readReason(""), "");
    assert.equal(readReason(["nonsense", "trip"]), "");
  });
});

describe("what reaches the inbox", () => {
  it("puts the answers above the message", () => {
    const body = composeMessage("correction", { page: "/uman", source: "I was there" }, "The gate code has changed.");
    assert.ok(body.indexOf("Which page: /uman") < body.indexOf("The gate code has changed."));
    assert.match(body, /Where you know it from: I was there/);
    // The "(optional)" is for the person filling it in, not for the person
    // reading it.
    assert.doesNotMatch(body, /\(optional\)/);
  });

  it("LEAVES OUT WHAT WAS NOT ANSWERED rather than printing a blank label", () => {
    const body = composeMessage("advertise", { business: "Hotel X", website: "", where: "Rome" }, "Interested.");
    assert.doesNotMatch(body, /Website/);
    assert.match(body, /Business name: Hotel X/);
  });

  it("carries nothing extra for a reason that asks nothing extra", () => {
    assert.equal(composeMessage("question", { page: "/smuggled" }, "Hello."), "Hello.");
  });

  it("names what is missing rather than saying “required fields”", () => {
    assert.deepEqual(missingFields("advertise", { business: "Hotel X" }).map((f) => f.name), ["where"]);
    assert.deepEqual(missingFields("advertise", { business: "X", where: "Rome" }), []);
    // The optional one never blocks a send.
    assert.deepEqual(missingFields("correction", { page: "/uman" }), []);
  });
});

describe("the page", () => {
  it("OPENS ON THE CHOICE, not on a form", () => {
    // reasonsForBrand is CONTACT_REASONS filtered to the ones this front door
    // can act on — see tests/contact-brand. Still the list, still from here.
    assert.match(PAGE, /reasonsForBrand\(brand\)/);
    assert.match(PAGE, /\{reasons\.map\(/);
  });

  it("HAS NO PLANNING FORM LEFT TO OPEN ON", () => {
    assert.doesNotMatch(PAGE, /PlanningRequestForm/);
    assert.doesNotMatch(PAGE, /reason === "trip"/);
  });

  it("MAKES THE REASONS LINKS, so the choice survives a refresh and works without scripts", () => {
    assert.match(PAGE, /href=\{`\/contact\?reason=\$\{entry\.value\}`\}/);
    // A server component. A client toggle would lose the deep link the footer
    // and any advertising page need.
    assert.doesNotMatch(PAGE, /"use client"/);
  });

  it("shows no form until a reason is picked, and still gives an address", () => {
    assert.match(PAGE, /reason === "" \?/);
    // Resolved by brand now, because the built-in address names the kosher
    // domain and this deployment is not it.
    assert.match(PAGE, /mailto:\$\{contactEmail\}/);
  });

  it("sends every reason to the one short form", () => {
    assert.match(PAGE, /<ContactForm reason=\{reason\}/);
  });

  it("marks the chosen one for a screen reader, not only in colour", () => {
    assert.match(PAGE, /aria-current=\{chosen \? "true" : undefined\}/);
  });
});

describe("the short form", () => {
  it("renders the reason's fields rather than a list of its own", () => {
    assert.match(FORM, /spec\.fields\.map/);
    assert.doesNotMatch(FORM, /name="business"/, "a field is typed into the form as well as the data");
  });

  it("composes the message through the one function that knows the rules", () => {
    assert.match(FORM, /composeMessage\(reason, answers, form\.message\)/);
    assert.match(FORM, /subject: spec\.subject/);
  });

  it("announces the error rather than only colouring it", () => {
    assert.match(FORM, /role="alert"/);
  });
});

describe("personal booking assistance is offered nowhere at all", () => {
  const PUBLIC_FILES = [
    "app/page.tsx",
    "app/contact/page.tsx",
    "app/destinations/(hub)/page.tsx",
    "app/destinations/[destination]/page.tsx",
    "app/heritage/page.tsx",
    "app/hotels/page.tsx",
    "app/book/page.tsx",
    "components/Footer.tsx",
    "components/Navbar.tsx",
    "components/ItineraryFooter.tsx",
    "lib/navigation.ts",
    "lib/starting-points.ts",
    "components/VacationCard.tsx",
  ];

  it("KEEPS THE OFFER OFF EVERY COMMERCIAL SURFACE, AND OFF THE CONTACT PAGE TOO", () => {
    // On a hotel result, "we can arrange this for you" turns a usable tool
    // into a sales funnel — the visitor stops reading the kosher notes and
    // starts working out what the catch is. It used to still be true on the
    // contact page, deliberately, as the one place the offer belonged; the
    // owner removed the service outright, so it is checked here too now.
    const offers = [
      /have us (plan|book)\b/i,
      /we (can )?arrange (it|this|the trip)/i,
      /let us plan/i,
      /nothing is charged for asking/i,
      /hand it over/i,
      /somebody else did the arranging/i,
      // The link, not only the words. A destination page carried
      // "/contact?trip=vacation&destination=Rome" twice.
      /href=\{?`?\/contact\?trip=/,
      /PlanningRequestForm/,
    ];
    for (const file of PUBLIC_FILES) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const offer of offers) {
        assert.doesNotMatch(source, offer, `${file} offers to arrange the trip`);
      }
    }
  });

  it("has no request form left on disk to offer", () => {
    assert.throws(() => readFileSync("components/PlanningRequestForm.tsx", "utf8"));
  });
});

describe("the page that said it was being built", () => {
  it("IS GONE FROM THE SITEMAP", () => {
    // It promised a premium honeymoon service, listed six things that service
    // would include, and offered a quote — none of which existed. Submitting
    // it to Google was submitting a page that says it is not ready.
    for (const entry of publicPaths()) {
      assert.notEqual(entry.path, "/honeymoon", "the honeymoon page is still offered to crawlers");
    }
  });

  it("redirects to the filter that is real", () => {
    // "Couples and honeymoon" is a filter over destinations this site holds
    // records for, which is the nearest true thing.
    const config = readFileSync("next.config.ts", "utf8");
    assert.match(config, /source: "\/honeymoon", destination: "\/destinations\?kind=couples"/);
  });

  it("leaves no page behind it", () => {
    assert.throws(() => readFileSync("app/honeymoon/page.tsx", "utf8"));
  });
});

describe("the owner's door is not in the footer", () => {
  // REVERSED TWICE, and this is where it rests. It was out (a door nobody
  // but the owner uses, advertised from three hundred pages), then in at his
  // explicit word as one of five named footer links, and now out again at his
  // word — admin is reached at its own subdomain. The link protected nothing
  // either way; what settles it is that it is furniture for one person on a
  // page written for everybody else.
  it("carries no Admin link at all", () => {
    const footer = readFileSync("components/Footer.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(footer, /"\/admin"/, "the owner's door is not customer-facing furniture");
    assert.doesNotMatch(footer, /Admin/, "no Admin label in the public footer");
  });
});
