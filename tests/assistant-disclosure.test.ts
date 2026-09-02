import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ANSWER_LABEL,
  ASSISTANT_HOME_LABEL,
  ASSISTANT_HOME_SUPPORT,
  ASSISTANT_INPUT_NOTICE,
  SOURCED_LABEL,
  citedSources,
  claimsWhiteGloveReview,
  stripFalseAttribution,
} from "@/lib/assistant-disclosure";

/**
 * THE ASSISTANT IS PUBLIC, AND IT IS NEVER MISTAKEN FOR THE SITE'S OWN WORD.
 *
 * Everywhere else here, a practical detail carries a source and a date because
 * somebody checked it. An AI answer carries neither and looks identical. These
 * hold the line between the two: the label on every answer, the warning beside
 * the input, and the sentences the assistant is not allowed to say.
 */

const BOX = readFileSync("components/TravelAssistantBox.tsx", "utf8");
const HOME = readFileSync("app/page.tsx", "utf8");
const ROUTE = readFileSync("app/api/itinerary/ai/route.ts", "utf8");

describe("the words, exactly as the owner set them", () => {
  it("keeps the homepage label and its supporting text", () => {
    assert.equal(ASSISTANT_HOME_LABEL, "Ask the AI travel assistant");
    assert.equal(
      ASSISTANT_HOME_SUPPORT,
      "Get ideas and help exploring the site. Answers are AI-generated — check important details before relying on them.",
    );
  });

  it("keeps the notice beside the input and the label on an answer", () => {
    // SHORTER THAN THEY WERE, AND NOT WEAKER. Both used to say what White
    // Glove had not done — "may not have been reviewed or verified" — which is
    // an internal worry facing outwards. The two things a reader has to take
    // away are that a machine wrote it and that they should check before
    // relying on it, and both survive in half the words.
    assert.equal(ASSISTANT_INPUT_NOTICE, "AI-generated. Check important travel details before relying on them.");
    assert.equal(ANSWER_LABEL, "AI-generated · Check important details");
  });

  it("STILL SAYS IT IS AI, AND STILL SAYS TO CHECK — the two that may never go", () => {
    for (const line of [ASSISTANT_INPUT_NOTICE, ANSWER_LABEL, ASSISTANT_HOME_SUPPORT]) {
      assert.match(line, /AI-generated/i, `"${line}" no longer says it is AI`);
    }
    for (const line of [ASSISTANT_INPUT_NOTICE, ANSWER_LABEL, ASSISTANT_HOME_SUPPORT]) {
      assert.match(line, /check/i, `"${line}" no longer tells the reader to check`);
    }
  });

});

describe("where the disclosure appears", () => {
  it("the assistant is on the homepage, under its own label", () => {
    assert.match(HOME, /<TravelAssistantBox/);
    assert.match(HOME, /ASSISTANT_HOME_LABEL/);
    assert.match(HOME, /ASSISTANT_HOME_SUPPORT/);
  });

  it("the homepage keeps search above it — the assistant is the quieter door", () => {
    const search = HOME.indexOf("<DestinationSearch");
    const assistant = HOME.indexOf("<TravelAssistantBox");
    assert.ok(search > -1 && assistant > search, "the assistant has moved above the search box");
  });

  it("every answer carries the label, and the notice sits by the input", () => {
    assert.match(BOX, /ANSWER_LABEL/);
    assert.match(BOX, /ASSISTANT_INPUT_NOTICE/);
    // The label is not conditional on anything.
    assert.doesNotMatch(BOX, /\{[^}]*\?[^}]*ANSWER_LABEL/);
  });

  it("an answer does not look like an editorial page", () => {
    assert.match(BOX, /border-dashed/);
    assert.match(BOX, /aria-label="AI-generated answer"/);
  });

  it("the sourced badge is shown only when the answer cited a page", () => {
    assert.match(BOX, /sources\.length > 0 &&/);
    assert.match(BOX, /SOURCED_LABEL/);
  });
});

describe("what the assistant may not claim", () => {
  const BANNED = [
    "White Glove recommends the Hotel Rimonim.",
    "This restaurant is White Glove verified.",
    "The hours were verified by White Glove.",
    "We verified the minyan times last week.",
    "Our expert says the mikvah opens at six.",
    "This listing was reviewed and approved by White Glove.",
  ];

  for (const sentence of BANNED) {
    it(`refuses: ${sentence.slice(0, 42)}…`, () => {
      assert.equal(claimsWhiteGloveReview(sentence), true);
      const { text, removed } = stripFalseAttribution(sentence);
      assert.equal(removed, 1);
      assert.equal(text, "");
    });
  }

  it("removes only the false sentence and keeps the answer around it", () => {
    const answer = [
      "Rome has several kosher restaurants in the old ghetto.",
      "White Glove recommends the one on Via del Portico.",
      "Confirm the hechsher and the hours before you go.",
    ].join(" ");
    const { text, removed } = stripFalseAttribution(answer);
    assert.equal(removed, 1);
    assert.match(text, /several kosher restaurants/);
    assert.match(text, /Confirm the hechsher/);
    assert.doesNotMatch(text, /White Glove recommends/);
  });

  it("leaves an honest answer completely alone", () => {
    const answer = "There is kosher food in Rome. Confirm the certification with the restaurant before relying on it.";
    const { text, removed } = stripFalseAttribution(answer);
    assert.equal(removed, 0);
    assert.equal(text, answer);
  });

  it("the phrases are refused in the prompt as well as stripped from the answer", () => {
    assert.match(ROUTE, /White Glove recommends/);
    assert.match(ROUTE, /we verified/i);
    assert.match(ROUTE, /our expert says/i);
    assert.match(ROUTE, /stripFalseAttribution/);
  });
});

describe("crediting a published page", () => {
  const pages = [
    { title: "Rome", href: "/destinations/rome" },
    { title: "Kosher food finder", href: "/kosher" },
    { title: "Kosher travel", href: "/kosher-travel" },
  ];

  it("credits a page the answer actually pointed at", () => {
    const found = citedSources("See /destinations/rome for what is there.", pages);
    assert.deepEqual(found.map((s) => s.href), ["/destinations/rome"]);
  });

  it("does not credit a page merely because it exists", () => {
    assert.deepEqual(citedSources("Rome is worth a week.", pages), []);
  });

  it("does not let one path swallow another", () => {
    // /kosher must not be credited by a mention of /kosher-travel.
    const found = citedSources("Read /kosher-travel first.", pages);
    assert.deepEqual(found.map((s) => s.href), ["/kosher-travel"]);
  });
});

describe("what a visitor reads when it cannot answer", () => {
  it("never shows the owner's setup instructions to a traveler", () => {
    // The assistant is on the front page now. An unconfigured key used to
    // answer with the environment variables to set, which is the site telling
    // its visitors what its owner has not done yet.
    const shown = ROUTE.match(/reason: "[^"]+"/g) ?? [];
    for (const line of shown) {
      assert.doesNotMatch(line, /API_KEY|env|environment variable/i, line);
      assert.doesNotMatch(line, /HTTP \$\{|Gemini \(|Anthropic \(/i, line);
    }
    // The detail still reaches the server log, where the owner can see it.
    assert.match(ROUTE, /console\.warn\("\[assistant\]/);
  });
});

describe("the assistant's own rules, in the prompt", () => {
  it("says what it is and refuses to speak for White Glove", () => {
    assert.match(ROUTE, /You are an AI assistant/);
    assert.match(ROUTE, /Never imply that an answer was written, reviewed, checked or approved/);
    assert.match(ROUTE, /not a substitute for a rav|substitute for a rav/i);
  });

  it("prefers published pages and says when it is not using them", () => {
    assert.match(ROUTE, /PUBLISHED WHITE GLOVE PAGES/);
    assert.match(ROUTE, /searchSite/);
    assert.match(ROUTE, /general knowledge/i);
  });

  it("invents nothing that a traveler would act on", () => {
    assert.match(ROUTE, /NEVER invent a kosher certification or hechsher, opening hours, minyan or zman times, mikvah details/);
    assert.match(ROUTE, /confirm kashrus, schedules, opening hours and Shabbos arrangements/i);
  });

  it("says plainly when it cannot confirm something", () => {
    assert.match(ROUTE, /do not have current information/i);
  });
});
