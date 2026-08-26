import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A wired (real) trip must never read like the Rome showcase it was built
 * from. These pin the specific ways the two used to bleed together — a real
 * trip telling a client with a live advisor they are "on your own", a
 * Directions button that opens nothing, a landing time sitting in "Where" —
 * by checking the conditions are actually there in the source, the same way
 * tests/companion-chat.test.ts pins the route's fences.
 */

const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

describe("a live advisor thread is never called 'on your own'", () => {
  it("the home screen's guide-mode card only shows without a real chat", () => {
    assert.match(APP, /isGuideMode && !usesRealChat && \(/);
  });

  it("the Guide tab's own kicker reads as an advisor once a real chat exists", () => {
    assert.match(APP, /chat: hasConcierge \|\| usesRealChat \? "Your advisor" : "On your own"/);
  });
});

describe("Directions only appears for a real place, never a flight", () => {
  it("is gated on having a place and not being a flight", () => {
    assert.match(APP, /actHasDirections = Boolean\(act\.place\) && act\.kind !== "travel"/);
  });

  it("links to a real maps search rather than doing nothing", () => {
    const button = APP.slice(APP.indexOf("actHasDirections &&"), APP.indexOf("Ask to move this"));
    assert.match(button, /maps\/search\/\?api=1&query=\$\{encodeURIComponent\(act\.place\)\}/);
  });
});

describe("a landing time rides with When, not Where", () => {
  it("the activity screen's When row folds in arriveNote instead of leaving it in place", () => {
    const rows = APP.slice(APP.indexOf("const actRows"), APP.indexOf("actHasDirections ="));
    assert.match(rows, /label: "When", value: act\.arriveNote \? `\$\{act\.time\} · \$\{act\.arriveNote\}` : act\.time/);
  });
});

describe("the profile screen is honest about who is looking at it", () => {
  it("a client on a share code is never told they are 'signed in'", () => {
    const screen = APP.slice(APP.indexOf("const profileScreen"), APP.indexOf("let body: ReactNode"));
    assert.match(screen, /liveChat\?\.side === "client" \? "Your trip" : "Signed in as"/);
    assert.match(screen, /You opened this with the code your advisor sent you/);
  });
});

describe("a finished trip never opens as if it were day one", () => {
  it("the home screen's day pill reads the trip's own tripFinished flag", () => {
    assert.match(APP, /trip\.tripFinished \? "Trip finished" : `Day \$\{trip\.todayIndex \+ 1\} of \$\{trip\.days\.length\}`/);
  });
});

describe("the empty guide does not promise content that will never come", () => {
  it("says nothing is there rather than naming features that might be off", () => {
    const guide = APP.slice(APP.indexOf("const guideChat"), APP.indexOf("const walletScreen"));
    assert.match(guide, /There is nothing local to show for this trip yet\./);
    assert.doesNotMatch(guide, /kosher food, the Shabbos times and the sights/);
  });
});

describe("the bottom-nav chat tab reads as White Glove's own, not a generic messaging app", () => {
  it("is labelled Advisor for a real trip, Messages only for the advisor's own inbox", () => {
    assert.match(APP, /tabDefs\.push\(\["messages", advisorInbox \? "Messages" : "Advisor"\]\)/);
  });
});

describe("Guide is back, but folded into You rather than a tab of its own — a real trip's bottom nav stays at four", () => {
  it("a real trip never pushes a standalone guide tab", () => {
    assert.doesNotMatch(APP, /tabDefs\.push\(\["guide"/);
  });

  it("the You screen renders the guide section", () => {
    const profile = APP.slice(APP.indexOf("const profileScreen"), APP.indexOf("let body: ReactNode"));
    assert.match(profile, /\{guideSection\}/);
  });

  it("the Guide screen carries a per-day note, plus kosher/Shabbos only when the account has turned it on", () => {
    const guide = APP.slice(APP.indexOf("const guideDays"), APP.indexOf("const profileScreen"));
    assert.match(guide, /d\.guideNote/);
    // The kosher-and-Shabbos layer rides in trip.guideSections, which
    // lib/companion-trip.ts only ever populates when AppPrefs.kosherFeatures
    // is on (CompanionSettings).
    assert.match(guide, /trip\.guideSections/);
  });

  it("only the advisor's own side can edit a day's note — a client on a code link never gets the control", () => {
    const guide = APP.slice(APP.indexOf("const guideDays"), APP.indexOf("const profileScreen"));
    assert.match(guide, /!isClientViewer && trip\.tripId && d\.date/);
  });
});

describe("Rail / Cards / Bands is gone, not just hidden", () => {
  it("carries no TStyle type, tstyle state, or a picker for it", () => {
    assert.doesNotMatch(APP, /TStyle/);
    assert.doesNotMatch(APP, /tstyle/);
    assert.doesNotMatch(APP, /cardsView|bandsView/);
    assert.doesNotMatch(APP, /Day timeline/);
  });

  it("the day screen just renders the timeline view, unconditionally", () => {
    const dayScreen = APP.slice(APP.indexOf("const dayScreen"), APP.indexOf("const activityScreen"));
    assert.match(dayScreen, /\{railView\}/);
  });
});

describe("the desktop showcase no longer explains the app to a traveler", () => {
  it("drops the headline and the 'built on the itinerary' paragraph", () => {
    assert.doesNotMatch(APP, /The trip in your pocket/);
    assert.doesNotMatch(APP, /Built on the itinerary the planner already produces/);
  });
});

describe("the trip title is never repeated word for word", () => {
  it("the home screen's h2 is skipped when it would just echo the header above it", () => {
    const home = APP.slice(APP.indexOf("const homeScreen"), APP.indexOf("{open &&"));
    assert.match(home, /\{trip\.tripTitle !== trip\.homeTitle && \(/);
  });
});

describe("a sent/read tick shows once, not on every message", () => {
  it("computes the last message I sent, the same way the old single 'Read' mark did", () => {
    assert.match(APP, /let lastMineAt: string \| null = null;/);
  });

  it("the tick is gated on being that one message, not merely being mine", () => {
    assert.match(APP, /\{mine && m\.at === lastMineAt && \(/);
    assert.doesNotMatch(APP, /\{mine && !m\.deletedAt && \(\s*<span[^>]*>\s*<Icon name=\{seenRead/);
  });
});

describe("the overflow menu belongs to its own bubble, and recedes until touched", () => {
  it("is centered on the bubble rather than pinned to its bottom edge", () => {
    const row = APP.slice(APP.indexOf('flexDirection: mine ? "row-reverse" : "row", maxWidth') - 60, APP.indexOf("{hasMenu &&"));
    assert.match(row, /alignItems: "center"/);
  });

  it("dims by default and comes to full opacity only while open", () => {
    assert.match(APP, /opacity: menuOpen \? 1 : 0\.55/);
  });
});

describe("an itinerary reference rides with the message it was asked from", () => {
  it("is staged like a reply — attached on send, not typed into the words", () => {
    assert.match(APP, /const \[itineraryRef, setItineraryRef\] = useState<string \| null>\(null\)/);
    assert.match(APP, /setItineraryRef\(subject\)/);
    assert.match(APP, /\.\.\.\(itineraryRef \? \{ itineraryRef \} : \{\}\)/);
    assert.match(APP, /setItineraryRef\(null\)/);
  });

  it("renders as its own small tag on the sent message, not folded into the text", () => {
    assert.match(APP, /const itineraryTag = m\.itineraryRef && \(/);
    assert.match(APP, /\{itineraryTag\}/);
  });
});

describe("activity details lead with the actions a traveler actually needs", () => {
  it("Call and Confirmation sit between Directions and the message button, only when real", () => {
    const buttons = APP.slice(APP.indexOf("actHasDirections &&"), APP.indexOf("Ask to move this"));
    assert.match(buttons, /act\.phone && \(/);
    assert.match(buttons, /href=\{`tel:\$\{act\.phone/);
    assert.match(buttons, /act\.href && \(/);
    assert.ok(buttons.indexOf("act.phone &&") < buttons.indexOf("act.href &&"), "Call comes before Confirmation");
  });
});

describe("wallet rows carry real phone numbers and addresses as taps, not plain text", () => {
  it("a Call link and a Directions link render when the row has them", () => {
    const wallet = APP.slice(APP.indexOf("const walletScreen"), APP.indexOf("const profileScreen"));
    assert.match(wallet, /href=\{`tel:\$\{r\.phone/);
    assert.match(wallet, /maps\/search\/\?api=1&query=\$\{encodeURIComponent\(r\.address\)\}/);
  });
});

describe("the composer never triggers iOS's auto-zoom", () => {
  it("every message text field is 16px, not 14 — under 16 zooms the whole page on focus", () => {
    const inputs = [...APP.matchAll(/<input[\s\S]*?\/>/g)].filter((m) => /placeholder=/.test(m[0]));
    const textareas = [...APP.matchAll(/<textarea[\s\S]*?\/>/g)];
    assert.ok(inputs.length >= 2, "expects the caption and demo composer inputs");
    assert.ok(textareas.length >= 1, "expects the growing draft textarea");
    for (const [tag] of [...inputs, ...textareas]) {
      assert.doesNotMatch(tag, /fontSize: 14[,}]/, "a text field must not sit at the pre-zoom size");
    }
  });
});
