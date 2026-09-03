import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BlastBlock } from "@/lib/email-blast";
import { absoluteUrl, renderBlastHtml, renderBlastText, safeHref } from "@/lib/email-template";

/**
 * What a White Glove email looks like, and the four ways an email template
 * quietly breaks.
 *
 * An email is not a web page: it is rendered by Word on Outlook, by a stripped
 * parser in Gmail, and on a phone screen most of the time. So what is pinned
 * down here is not how it looks — that is a matter of taste and a preview —
 * but the things that make it arrive wrong: a relative image URL that resolves
 * to nothing in an inbox, an unescaped quote that closes an attribute, a
 * javascript: href in a message the reader trusts, and a missing unsubscribe.
 */

const ORIGIN = "https://www.whiteglovekoshertravel.com";

function render(blocks: BlastBlock[]) {
  return renderBlastHtml({
    blast: { blocks, subject: "Vienna" },
    origin: ORIGIN,
    becauseLine: "You asked about new kosher destinations.",
    unsubscribeUrl: `${ORIGIN}/api/alerts/unsubscribe?token=abc`,
  });
}

describe("addresses in an email", () => {
  it("MAKES AN UPLOADED PICTURE ABSOLUTE", () => {
    // "/api/media?id=m-1" is a fine URL in a browser and nothing at all in an
    // inbox — there is no page for it to be relative to.
    assert.equal(absoluteUrl("/api/media?id=m-1", ORIGIN), `${ORIGIN}/api/media?id=m-1`);
    assert.equal(absoluteUrl("https://cdn.example.com/a.jpg", ORIGIN), "https://cdn.example.com/a.jpg");
    assert.equal(absoluteUrl("", ORIGIN), "");
    assert.equal(absoluteUrl("javascript:alert(1)", ORIGIN), "");
  });

  it("REFUSES ANY SCHEME BUT HTTP AND HTTPS", () => {
    // A message composed in an admin screen and sent from an address the reader
    // trusts is precisely where a javascript: href must not be possible.
    assert.equal(safeHref("javascript:alert(1)"), "");
    assert.equal(safeHref("data:text/html,<script>"), "");
    assert.equal(safeHref("mailto:a@b.com"), "");
    assert.equal(safeHref("/relative"), "");
    assert.equal(safeHref("https://example.com/a?b=1&c=2"), "https://example.com/a?b=1&amp;c=2");
  });
});

describe("what the letter always carries", () => {
  const html = render([{ kind: "text", text: "Hello." }]);

  it("PUTS THE MARK AT THE TOP, ABSOLUTELY ADDRESSED, AND THE NAME AS TEXT", () => {
    // It was /logo.png, whose artwork reads "White Glove Itineraries" — the
    // old company name, drawn into the picture and so uncorrectable by an alt
    // attribute. Every letter this site sent was signed with it.
    //
    // The mark carries no words, so the name is set as text below it. That is
    // better than a wordmark would have been anyway: most clients block
    // pictures by default, and a blocked crest says nothing about who wrote.
    assert.ok(html.includes(`${ORIGIN}/logo-hand-navy.png`));
    assert.ok(!html.includes("/logo.png"), "the old wordmark is back in the letter");
    assert.ok(html.includes(">White Glove</div>"));
    assert.ok(html.includes("Kosher Travel</div>"));
  });

  it("CANNOT BE SENT WITHOUT THE UNSUBSCRIBE AND THE REASON", () => {
    // Both are appended by the template, not passed as optional extras. There
    // is no flag anywhere that removes either.
    assert.match(html, /Stop these emails/);
    assert.ok(html.includes("You asked about new kosher destinations."));
    assert.ok(html.includes("token=abc"));
  });

  it("is a table-based layout with inline styles, because Outlook is Word", () => {
    assert.match(html, /<table role="presentation"/);
    assert.ok(!html.includes("display:flex"), "flexbox in an email");
    assert.ok(!html.includes("display:grid"), "grid in an email");
    assert.ok(!/<style[\s>]/.test(html), "a <style> block Gmail would strip");
  });

  it("paints the background on a table rather than the body alone", () => {
    // A background on <body> alone is dropped by several clients, which is how
    // an email ends up on stark white.
    assert.match(html, /<table[^>]+background:#D5CEC3/);
  });
});

describe("the pieces", () => {
  it("draws a heading, words, a rule, a picture and a button", () => {
    const html = render([
      { kind: "heading", text: "Pesach in the Dolomites" },
      { kind: "text", text: "First line.\n\nSecond line." },
      { kind: "divider" },
      { kind: "image", url: "/api/media?id=m-1", alt: "The hotel", caption: "Selva", href: "https://example.com/a" },
      { kind: "button", label: "See the programme", href: "https://example.com/b" },
    ]);
    assert.match(html, /Pesach in the Dolomites/);
    assert.equal((html.match(/<p style="margin:0 0 16px/g) ?? []).length, 2, "two paragraphs");
    assert.ok(html.includes(`${ORIGIN}/api/media?id=m-1`));
    assert.match(html, /alt="The hotel"/);
    assert.match(html, /Selva/);
    assert.match(html, /See the programme/);
  });

  it("SETS A BUTTON IN A TABLE, NOT A PADDED ANCHOR", () => {
    // Outlook ignores padding on an <a>, and the button arrives as a bare blue
    // underlined word in the middle of the message.
    const html = render([{ kind: "text", text: "Hi" }, { kind: "button", label: "Go", href: "https://example.com" }]);
    const button = html.slice(html.indexOf("Go") - 500, html.indexOf("Go"));
    assert.match(button, /<table/);
  });

  it("leaves out a picture with no file and a button with nowhere to go", () => {
    const html = render([
      { kind: "text", text: "Hi" },
      { kind: "image", url: "", alt: "x", caption: "", href: "" },
      { kind: "button", label: "Go", href: "" },
    ]);
    assert.ok(!html.includes("<img src=\"\""));
    assert.ok(!html.includes(">Go<"));
  });

  it("ESCAPES EVERYTHING THE OWNER TYPED", () => {
    const html = render([
      { kind: "heading", text: 'A "quote" & <b>bold</b>' },
      { kind: "image", url: "/api/media?id=m", alt: '" onerror="alert(1)', caption: "", href: "" },
    ]);
    assert.ok(!html.includes("<b>bold</b>"));
    assert.ok(!html.includes('onerror="alert(1)"'));
    assert.match(html, /&amp;/);
  });

  it("REFUSES A javascript: BUTTON WITHOUT DROPPING THE REST OF THE MESSAGE", () => {
    const html = render([
      { kind: "text", text: "Still here." },
      { kind: "button", label: "Press", href: "javascript:alert(1)" },
    ]);
    assert.ok(!html.includes("javascript:"));
    assert.match(html, /Still here\./);
  });
});

describe("the plain-text half", () => {
  it("is a readable message rather than a page of markup", () => {
    const text = renderBlastText({
      blast: {
        blocks: [
          { kind: "heading", text: "Vienna" },
          { kind: "text", text: "It is up." },
          { kind: "button", label: "Look", href: "https://example.com" },
          { kind: "image", url: "/x", alt: "A shul", caption: "", href: "" },
        ],
      },
      origin: ORIGIN,
      becauseLine: "You asked.",
      unsubscribeUrl: `${ORIGIN}/u`,
    });
    assert.match(text, /VIENNA/);
    assert.match(text, /It is up\./);
    assert.match(text, /Look: https:\/\/example\.com/);
    assert.match(text, /\[A shul\]/);
    assert.match(text, /Stop these emails: /);
    assert.ok(!text.includes("<"), "markup leaked into the text part");
  });

  it("still renders a draft written before there were blocks", () => {
    const input = {
      blast: { body: "An old draft." },
      origin: ORIGIN,
      becauseLine: "You asked.",
      unsubscribeUrl: `${ORIGIN}/u`,
    };
    assert.match(renderBlastHtml(input), /An old draft\./);
    assert.match(renderBlastText(input), /An old draft\./);
  });
});
