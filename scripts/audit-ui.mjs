// Measure the site at every breakpoint, instead of guessing about it.
//
//   npm run build && npx next start -p 3130
//   node scripts/audit-ui.mjs [base-url]
//
// This exists because "responsive" and "accessible" are claims, and the only
// honest way to make them is to load the real pages in a real browser at the
// real widths and read the numbers back. It reports, per page and per width:
//
//   overflow         the page scrolls sideways, and which element does it
//   duplicate-search more than one site-search box visible at once
//   nav-doubled      the desktop bar and the menu button both showing
//   touch-target     a control under 44px tall on a phone-sized screen
//   tab-order        the first tab stop is not the skip link, or the order
//                    jumps back up the page
//   unlabeled-input  a form control with no accessible name
//   heading-order    no h1, more than one h1, or a level skipped on the way down
//   contrast         text under 4.5:1 against what is actually behind it
//                    (3:1 for large text), measured from the rendered colours
//   zoom-overflow    the page scrolls sideways at 200% browser zoom, or with
//                    the text alone doubled (WCAG 1.4.10 and 1.4.4)
//
// Findings are not all bugs — read them. Inline links inside a paragraph are
// deliberately exempt from the touch-target check (making a link in running
// text 44px tall breaks the paragraph), and third-party attribution links are
// left as they are.
//
// Chromium only. WebKit is not installed in CI, so Safari's date and form
// controls still need checking by hand on a real device.

import { chromium } from "playwright";

/**
 * Launch whichever Chromium this machine actually has.
 *
 * Playwright's default is the headless-shell build it downloads itself. Some
 * environments ship a full Chromium at a fixed path instead and skip that
 * download, and there the default launch fails with "Executable doesn't
 * exist" — which reads like a broken script rather than a missing download.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to point at a specific binary.
 */
async function launchChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch (error) {
    for (const candidate of ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
      try {
        return await chromium.launch({ executablePath: candidate });
      } catch {
        /* try the next one */
      }
    }
    throw error;
  }
}


/**
 * IS THIS ACTUALLY ON THE SCREEN — which `offsetParent !== null` does not
 * answer, and this audit had been trusting it to.
 *
 * A closed `<details>` does not use `display: none`; it hides its contents
 * with `content-visibility`. So every link inside every collapsed fold kept an
 * offsetParent and a bounding box, and the audit measured all of them. On one
 * destination page that was 55 of the 95 controls it thought were visible —
 * their tap targets, their contrast, and their place in the tab order, all
 * reported from geometry nobody can see. It is the same mistake an outside
 * scanner made against this site in the same week, reporting empty headings
 * inside collapsed sections.
 *
 * checkVisibility answers it properly. The `sr-only` exception is deliberate
 * and lives at the call sites that want it: text positioned off-screen for a
 * screen reader is invisible on purpose and still has to be counted.
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3130";
const WIDTHS = [
  [320, 568], [375, 667], [390, 844], [430, 932],
  // 640×360 is a 1280×720 desktop at 200% browser zoom: zoom shrinks the CSS
  // viewport and lays the page out at that width, so the reflow is identical.
  [640, 360],
  [768, 1024], [1024, 768], [1280, 720], [1440, 900],
];
const PAGES = [
  ["/", "homepage"],
  ["/plan", "trip start flow"],
  ["/destinations", "destinations hub"],
  ["/hotels", "hotels and stays"],
  // With a search in it, which is a different page: a summary line, a
  // prefilled form, and a filtered list rather than the whole directory.
  ["/hotels?destination=Rome&in=2026-09-01&out=2026-09-08&adults=3&children=2", "hotels, searched"],
  // /flights and /cars folded into the booking page and are redirects now.
  // Auditing a redirect measures the page it lands on twice and reports the
  // findings against a name that no longer exists.
  ["/book?type=cars", "book — cars tab"],
  // Transfers left /cars when a transfer programme was joined. Audited in its
  // own right, because a page nothing measures is a page that drifts.
  ["/transfers", "airport transfers"],
  ["/things-to-do", "things to do"],
  ["/destinations/rome", "vacation destination"],
  ["/kosher-travel", "kosher travel hub"],
  ["/heritage", "heritage landing"],
  // NOT /services, and not ?reason=trip. Both were the personal trip-planning
  // offer, which was removed from the site outright — /services now redirects
  // to /plan, and "trip" is not a contact reason any more (lib/contact-reasons
  // says so, and forbids adding it back). Auditing either measured a redirect
  // or a fallback and reported it under the name of a page that is gone.
  ["/sample-itinerary", "sample itinerary"],
  ["/contact", "contact reasons"],
  // The conditional fields only exist behind a reason, so auditing the bare
  // page would measure a form nobody is shown.
  ["/contact?reason=question", "contact — question"],
  ["/contact?reason=advertise", "contact — advertising"],
  ["/verification", "verification method"],
  ["/stops", "destination directory"],
  ["/cemeteries", "cemetery directory"],
  // warsaw, not uman: uman is a city GUIDE at /uman and has never had a
  // /heritage/towns page, so this entry was auditing a 404 and reporting
  // nothing wrong with it.
  ["/heritage/towns/warsaw", "heritage town"],
  ["/uman", "city guide"],
  ["/hechsherim", "certification marks"],
  ["/book", "book"],
  ["/login", "login"],
  ["/itinerary", "route planner"],
  ["/directory", "provider directory"],
  ["/map", "map"],
];

const browser = await launchChromium();
const findings = [];
const note = (page, width, kind, detail) => findings.push({ page, width, kind, detail });

for (const [path, label] of PAGES) {
  for (const [width, height] of WIDTHS) {
    const p = await browser.newPage({ viewport: { width, height } });
    try {
      await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
      // Wait until the stylesheet has actually applied — an unstyled page
      // reports every control as 17px tall and the whole audit becomes noise.
      await p.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)", null, { timeout: 20000 });
      await p.waitForTimeout(600);
      const broke = await p.evaluate(() => /Reload|Application error/.test(document.body.innerText.slice(0, 400)) && document.body.innerText.length < 600);
      if (broke) throw new Error("page rendered an error screen");

      // 1. Horizontal overflow, and what is causing it.
      const overflow = await p.evaluate(() => {
        const docW = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= docW) return null;
        const guilty = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > docW + 1 || r.left < -1) {
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none") continue;
            guilty.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
          }
        }
        return { docW, scrollW: document.documentElement.scrollWidth, guilty: guilty.slice(0, 4) };
      });
      if (overflow) note(label, width, "overflow", `${overflow.scrollW}>${overflow.docW} :: ${overflow.guilty.join(" | ")}`);

      // 2. More than one visible site-search box. Page-level filters (the
      // provider search, the airport pickers) are not duplicates of it, and
      // neither is a second search that says what it searches — the heritage
      // landing page's kever search is deliberate and is named for what it
      // does. Two boxes both called "Search the site" is the mistake.
      const searches = await p.evaluate(() => {
        const seen = [];
        // Matched on the search box's accessible name rather than its
        // placeholder: the placeholder is editable from /admin/settings/words,
        // and a check keyed to it silently stops checking the day the owner
        // rewrites it.
        for (const el of document.querySelectorAll('input[aria-label="Search the site"]')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") seen.push(`@${Math.round(r.x)},${Math.round(r.y)}`);
        }
        return seen;
      });
      if (searches.length > 1) note(label, width, "duplicate-search", `${searches.length} visible: ${searches.join(" ; ")}`);

      // 2b. A row of choices that has come apart onto two lines.
      //
      // This is here because it happened and nobody could see it. The three
      // trip types on the booking page — round trip, one way, multi-city —
      // were a wrapping row, and on a phone the third dropped onto a line of
      // its own below the fold. The row that was left read as the whole
      // choice, and multi-city looked like something this site could not do.
      // It was reported twice as "there is no multi city".
      //
      // A wrapped row is not overflow and it is not an error; nothing else
      // here would ever have caught it.
      const split = await p.evaluate(() => {
        const out = [];
        for (const group of document.querySelectorAll("[data-choice-row]")) {
          const tops = new Set();
          for (const child of group.children) {
            const r = child.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (child.tagName !== "BUTTON") continue;
            tops.add(Math.round(r.top));
          }
          if (tops.size > 1) out.push(`${group.dataset.choiceRow}: ${tops.size} lines`);
        }
        return out;
      });
      for (const detail of split) note(label, width, "row-split", detail);

      // 3. The desktop bar and a control calling itself the navigation menu,
      // both on screen at the same width.
      const nav = await p.evaluate(() => {
        const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const menuBtn = [...document.querySelectorAll("button")].find((b) => /navigation menu/i.test(b.getAttribute("aria-label") || ""));
        const primary = [...document.querySelectorAll("nav a")].filter((a) => vis(a) && /^(Plan a Trip|Vacation Ideas|Kosher Travel|Travel Services|Heritage Travel)$/.test((a.textContent || "").trim()));
        return { menu: vis(menuBtn), primaryLinks: primary.length };
      });
      if (nav.menu && nav.primaryLinks >= 3) note(label, width, "nav-doubled", `a "navigation menu" button and ${nav.primaryLinks} primary links both visible`);

      // 4. Touch targets under 44px, on the widths where a thumb is doing the
      // pointing. Inline links inside running text are exempt — WCAG's target
      // size rule exempts them, and enlarging them breaks the paragraph.
      if (width <= 430) {
        const small = await p.evaluate(() => {
          const out = [];
          const visible = (el) =>
            typeof el.checkVisibility === "function"
              ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: false, visibilityProperty: true })
              : el.offsetParent !== null;
          for (const el of document.querySelectorAll("a, button, summary, [role=button]")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (!visible(el)) continue;
            // An inline link is a link inside a run of text, wherever that run
            // lives. Requiring a p/li/span ancestor as well missed inline map
            // control links inside a div and reported them as undersized targets.
            // Enlarging one breaks the line it sits in, which is exactly why
            // the target-size rule exempts them. Same test as audit-admin.mjs.
            const inline = getComputedStyle(el).display === "inline";
            if (r.height < 44 && !inline) {
              const text = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 32);
              if (text) out.push(`${Math.round(r.height)}px "${text}"`);
            }
          }
          return out;
        });
        if (small.length) note(label, width, "touch-target", `${small.length} under 44px :: ${[...new Set(small)].slice(0, 8).join(" | ")}`);
      }

      if (width === 390) {
        // 5. Tab order: the skip link first, and no long jumps back up the page.
        /**
         * NO GRID CAN PASS THE OLD VERSION OF THIS, and every grid on the site
         * was failing it.
         *
         * It compared each tab stop against a RUNNING MAXIMUM — the lowest
         * point reached so far — so once one card in a row was taller than its
         * neighbours, every link in the next card counted as a jump backwards.
         * On /destinations/rome that was "Compare every place to stay" at 2320
         * followed by the next card's "Navigate →" at 2191: two cards in the
         * same visual row, tabbed in the order somebody reads them. Nothing
         * about it is out of order.
         *
         * It also measured elements inside `position: fixed` containers — the
         * mobile bottom bar, the assistant button — whose document position is
         * whatever the viewport happened to be showing. Those floated near the
         * bottom of the first screen and so read as a jump back up from the
         * footer.
         *
         * Between them they were the whole of this audit's remaining findings:
         * nineteen, none of them real, on a report that is meant to be read.
         *
         * Comparing CONSECUTIVE stops instead makes a grid row what it is — a
         * few dozen pixels either way — and leaves a genuine jump, which is a
         * footer link followed by a header link, hundreds or thousands of
         * pixels apart. Which is why one is now worth reporting: the tolerance
         * of two was there to absorb the noise this used to generate.
         */
        const order = await p.evaluate(() => {
          const insideFixed = (el) => {
            for (let node = el; node && node !== document.body; node = node.parentElement) {
              if (getComputedStyle(node).position === "fixed") return true;
            }
            return false;
          };
          const visible = (el) =>
            typeof el.checkVisibility === "function"
              ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: false, visibilityProperty: true })
              : el.offsetParent !== null;
          const items = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(visible);
          let backwards = 0, previous = null;
          for (const el of items.slice(0, 40)) {
            if (insideFixed(el)) continue;
            const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
            if (previous !== null && top < previous - 200) backwards += 1;
            previous = top;
          }
          return { first: (items[0]?.textContent || "").trim().slice(0, 30), backwards };
        });
        if (order.first !== "Skip to content") note(label, "any", "tab-order", `first tab stop is "${order.first}", not the skip link`);
        if (order.backwards > 0) note(label, "any", "tab-order", `${order.backwards} backward jumps in the first 40 tab stops`);

        // 6. Form controls with no accessible name.
        const unnamed = await p.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("input, select, textarea")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (el.type === "hidden") continue;
            const named =
              el.getAttribute("aria-label") ||
              el.getAttribute("aria-labelledby") ||
              el.getAttribute("title") ||
              (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
              el.closest("label");
            if (!named) out.push(`${el.tagName.toLowerCase()}[type=${el.type || "-"}] name=${el.name || "-"} ph=${(el.placeholder || "-").slice(0, 24)}`);
          }
          return out;
        });
        if (unnamed.length) note(label, "any", "unlabeled-input", `${unnamed.length} :: ${[...new Set(unnamed)].slice(0, 6).join(" | ")}`);

        // 7. Headings: exactly one h1, and no level skipped on the way down.
        //
        // A screen reader user navigates a long page by its headings. A page
        // with no h1 has no name in that list, and a jump from h2 to h4 reads
        // as a missing section rather than a styling choice.
        const headings = await p.evaluate(() => {
          const visible = (el) =>
            typeof el.checkVisibility === "function"
              ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: false, visibilityProperty: true })
              : el.offsetParent !== null;
          const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
            .filter((el) => visible(el) || el.className.includes("sr-only"))
            .map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent || "").trim().slice(0, 40) }));
          const problems = [];
          const h1s = levels.filter((h) => h.level === 1);
          if (h1s.length === 0) problems.push("no h1");
          if (h1s.length > 1) problems.push(`${h1s.length} h1s: ${h1s.map((h) => h.text).join(" / ")}`);
          for (let i = 1; i < levels.length; i += 1) {
            if (levels[i].level > levels[i - 1].level + 1) {
              problems.push(`h${levels[i - 1].level} → h${levels[i].level} at "${levels[i].text}"`);
            }
          }
          return problems;
        });
        for (const problem of headings) note(label, "any", "heading-order", problem);

        // 8. Contrast, measured from what is actually rendered rather than
        //    from the palette. A token that clears 4.5:1 on cream can fail on
        //    the navy section three components away, and only the real page
        //    knows which background a given line of text ended up on.
        const contrast = await p.evaluate(() => {
          // Same predicate as the other checks: a closed <details> keeps its
          // contents measurable, and contrast on text nobody can see is not a
          // finding. See the touch-target block above.
          const visible = (el) =>
            typeof el.checkVisibility === "function"
              ? el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: false, visibilityProperty: true })
              : el.offsetParent !== null;
          const parse = (value) => {
            const match = /rgba?\(([^)]+)\)/.exec(value || "");
            if (!match) return null;
            const [r, g, b, a] = match[1].split(",").map((n) => Number.parseFloat(n));
            return { r, g, b, a: a === undefined ? 1 : a };
          };
          const luminance = ({ r, g, b }) => {
            const channel = (c) => {
              const v = c / 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
          };
          /**
           * What is painted behind this text, or null when we cannot tell.
           *
           * NULL IS AN ANSWER AND IT MATTERS. Three things make a background
           * unmeasurable from the ancestors alone: a gradient (the vacation
           * cards put white type on a navy-to-slate wash, and
           * `backgroundColor` on that element is transparent); an absolutely
           * positioned sibling painted underneath (the booking page's pay
           * toggle slides a navy pill behind the active label); and an
           * overlay on top. In all three the text is perfectly legible and a
           * naive walk reports white on white.
           *
           * Reporting those as failures is worse than not checking them: an
           * audit whose output is mostly wrong stops being read, and the real
           * finding — every small-caps eyebrow on the site at 2.9:1 — is what
           * gets lost in the noise. So they are skipped, and skipping is
           * counted so the number is visible.
           */
          let unmeasured = 0;
          const behind = (el, rect) => {
            // A sibling painted under this element: absolutely positioned,
            // overlapping, and carrying its own background.
            const siblings = el.parentElement ? Array.prototype.slice.call(el.parentElement.children) : [];
            for (const sibling of siblings) {
              if (sibling === el || sibling.contains(el)) continue;
              const style = getComputedStyle(sibling);
              if (style.position !== "absolute" && style.position !== "fixed") continue;
              const own = parse(style.backgroundColor);
              if (!own || own.a < 0.5) continue;
              const box = sibling.getBoundingClientRect();
              const overlaps = box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
              if (overlaps) return null;
            }
            for (let node = el; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              // A gradient or an image: no single colour to compare against.
              if (style.backgroundImage && style.backgroundImage !== "none") return null;
              const colour = parse(style.backgroundColor);
              if (colour && colour.a > 0.5) return colour;
            }
            return { r: 255, g: 255, b: 255, a: 1 };
          };
          const out = [];
          const seen = new Set();
          for (const el of document.querySelectorAll("p, span, a, button, li, h1, h2, h3, h4, dt, dd, label, legend, figcaption")) {
            // Only elements holding their own text, and only text that is
            // actually on screen.
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
            if (!own) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.opacity === "0") continue;
            if (!visible(el)) continue;
            if (el.closest(".sr-only") || el.className.toString().includes("sr-only")) continue;
            const ink = parse(style.color);
            if (!ink || ink.a < 0.5) continue;
            const paper = behind(el, rect);
            if (!paper) {
              unmeasured += 1;
              continue;
            }
            const light = Math.max(luminance(ink), luminance(paper));
            const dark = Math.min(luminance(ink), luminance(paper));
            const ratio = (light + 0.05) / (dark + 0.05);
            const size = Number.parseFloat(style.fontSize);
            const bold = Number.parseInt(style.fontWeight, 10) >= 700;
            // WCAG "large text": 24px, or 18.66px when bold.
            const large = size >= 24 || (bold && size >= 18.66);
            const needed = large ? 3 : 4.5;
            if (ratio + 0.01 < needed) {
              const key = `${style.color}|${style.fontSize}|${(el.textContent || "").trim().slice(0, 24)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(`${ratio.toFixed(2)}:1 (needs ${needed}) ${style.color} on rgb(${paper.r},${paper.g},${paper.b}) — "${(el.textContent || "").trim().slice(0, 32)}"`);
            }
          }
          return { failures: out.slice(0, 8), unmeasured };
        });
        for (const problem of contrast.failures) note(label, "any", "contrast", problem);
        // Said out loud rather than hidden: these are the gradients, the
        // sliding pills and the overlays, and they still need a pair of eyes.
        if (contrast.unmeasured) console.log(`note: ${label} — ${contrast.unmeasured} text nodes on a gradient or an overlay, not measured`);
      }
    } catch (error) {
      note(label, width, "error", String(error).split("\n")[0].slice(0, 140));
    }
    await p.close();
  }
}
/**
 * TEXT ALONE AT 200%, which is the harder half of the zoom question.
 *
 * Browser zoom is covered by the widths above — zooming to 200% on a 1280
 * screen lays the page out at 640, and that width is in the list. What it does
 * NOT cover is somebody who has set a larger default font size and left the
 * window where it was (WCAG 1.4.4). Then the text doubles and the boxes do
 * not, which is how a fixed-height card starts clipping its own last line and
 * a nav bar starts scrolling sideways.
 *
 * Root font-size rather than a CSS transform, because that is what the setting
 * actually changes: rem-based spacing grows with it and px-based spacing does
 * not, and the difference between those two is exactly what breaks.
 */
for (const [path, label] of PAGES) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    await p.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)", null, { timeout: 20000 });
    await p.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await p.waitForTimeout(500);

    const problems = await p.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const guilty = [];
      if (document.documentElement.scrollWidth > docW + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          if (r.right > docW + 1 || r.left < -1) {
            guilty.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
          }
        }
      }
      // Text cut off by a fixed height. `overflow: hidden` on a box whose
      // content is now taller than it is the way doubled text disappears
      // silently rather than pushing the page about.
      const clipped = [];
      for (const el of document.querySelectorAll("p, h1, h2, h3, li, dd, span, button, a")) {
        // Visually-hidden text is a 1px box with overflow:hidden BY DESIGN —
        // that is how sr-only works, and every one of them would otherwise be
        // reported as clipped, which is how a check stops being read.
        if (el.closest(".sr-only") || el.className.toString().includes("sr-only")) continue;
        const style = getComputedStyle(el);
        if (style.overflow !== "hidden" && style.overflowY !== "hidden") continue;
        if (style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none") continue;
        if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
          clipped.push(`${el.tagName.toLowerCase()} ${el.scrollHeight}>${el.clientHeight}`);
        }
      }
      return {
        overflow: guilty.length ? { docW, scrollW: document.documentElement.scrollWidth, guilty: guilty.slice(0, 4) } : null,
        clipped: clipped.slice(0, 4),
      };
    });

    if (problems.overflow) {
      note(label, "text-200%", "zoom-overflow", `${problems.overflow.scrollW}>${problems.overflow.docW} :: ${problems.overflow.guilty.join(" | ")}`);
    }
    if (problems.clipped.length) note(label, "text-200%", "zoom-clipped", problems.clipped.join(" | "));
  } catch (error) {
    note(label, "text-200%", "error", String(error).split("\n")[0].slice(0, 140));
  }
  await p.close();
}

await browser.close();

const byKind = {};
for (const f of findings) (byKind[f.kind] ||= []).push(f);
for (const kind of Object.keys(byKind).sort()) {
  console.log(`\n===== ${kind.toUpperCase()} (${byKind[kind].length}) =====`);
  const seen = new Set();
  for (const f of byKind[kind]) {
    const key = `${f.page}|${f.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const widths = byKind[kind].filter((o) => o.page === f.page && o.detail === f.detail).map((o) => o.width).join(",");
    console.log(`${f.page} @ ${widths}\n    ${f.detail}`);
  }
}
console.log(`\nTOTAL ${findings.length}`);
process.exit(findings.length ? 1 : 0);
