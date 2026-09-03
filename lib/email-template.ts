/**
 * What a White Glove email looks like.
 *
 * THE OWNER ASKED FOR THIS AND HE WAS RIGHT. The blast used to go out as plain
 * paragraphs, on the argument that a note from a person reads better than a
 * designed one. That is true of a note; it is not true of a letter about a
 * Pesach programme with a photograph of the place in it. An email from this
 * site should look like this site — the crest, the cream, the gold rule, the
 * display face on the headings — because the thing people forward is the thing
 * that looked like it was made on purpose.
 *
 * WHY IT IS WRITTEN IN TABLES AND INLINE STYLES, IN 2026. Email clients are not
 * browsers. Outlook on Windows renders HTML with Microsoft Word's engine, which
 * has never supported flexbox, grid, or float in any way worth relying on, and
 * Gmail strips <style> blocks in several of its clients. Every rule here is
 * therefore an inline attribute on a table cell. It is not how anybody would
 * write a web page and it is exactly how every email that arrives looking right
 * is built.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   · No web fonts. Georgia and Arial are on every machine that will open this;
 *     a font that has to be fetched is a font half the readers will not see, and
 *     the fallback is what they get instead.
 *   · No background images, no rounded corners on anything structural, no
 *     shadows. Outlook drops all three and the layout has to still be right.
 *   · No two-column layout. It collapses unpredictably on a phone, and 70% of
 *     these will be read on a phone.
 *   · Nothing above the crest. Some clients show the first line of the body as
 *     a preview; that line should be the message, not "View in browser".
 *
 * THE FOOTER IS NOT OPTIONAL AND IS NOT A PARAMETER. Why they are getting this,
 * how to stop, and who sent it are appended by this module to every message it
 * renders. There is no flag that removes them — see lib/email.ts, which is the
 * only caller.
 */

import { blocksOf, blockHasContent, splitLinks, type BlastBlock } from "@/lib/email-blast";

/* ---- the palette, matched to app/globals.css ---------------------------- */

const NAVY = "#102F35";
const INK = "#2d2c2a";
const BODY_INK = "#4a4a48";
const GOLD = "#C6A15B";
/** The one that carries words. --gold is a rule; --gold-ink clears 4.5:1. */
const GOLD_INK = "#6B4A1C";
const GOLD_RULE = "#D8BC7A";
const CREAM = "#D5CEC3";
const SURFACE = "#FAF8F3";

const SANS = "Arial, Helvetica, sans-serif";
const DISPLAY = "Georgia, 'Times New Roman', serif";

/** 600px is the width every email client has agreed on for twenty years. */
const WIDTH = 600;

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * An address safe to put in an href.
 *
 * ONLY http AND https, and everything else becomes nothing. A message composed
 * in an admin screen and sent from an address the reader trusts is precisely
 * where a `javascript:` href must not be possible, and "the owner would not do
 * that" is not a control.
 */
export function safeHref(raw: string): string {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return "";
  return escapeEmailHtml(value);
}

/**
 * A picture's address, made absolute.
 *
 * An uploaded image is stored as `/api/media?id=…`, which is a perfectly good
 * URL in a browser and nothing at all in an inbox — there is no page for it to
 * be relative to. Every image in an email has to name its host.
 */
export function absoluteUrl(raw: string, origin: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin.replace(/\/$/, "")}${value}`;
  return "";
}

/* ---- the words ---------------------------------------------------------- */

/** One paragraph, with pasted addresses turned into links. */
function paragraphHtml(block: string): string {
  return splitLinks(block)
    .map((segment) => {
      const text = escapeEmailHtml(segment.text).replace(/\n/g, "<br>");
      const href = segment.url ? safeHref(segment.url) : "";
      return href ? `<a href="${href}" style="color:${GOLD_INK};text-decoration:underline;">${text}</a>` : text;
    })
    .join("");
}

function textBlockHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.65;color:${BODY_INK};">${paragraphHtml(para)}</p>`,
    )
    .join("");
}

/* ---- one block ---------------------------------------------------------- */

function blockHtml(block: BlastBlock, origin: string): string {
  switch (block.kind) {
    case "heading":
      return (
        `<h2 style="margin:6px 0 14px;font-family:${DISPLAY};font-weight:700;font-size:24px;line-height:1.25;color:${NAVY};">` +
        `${escapeEmailHtml(block.text.trim())}</h2>`
      );

    case "text":
      return textBlockHtml(block.text);

    case "image": {
      const src = absoluteUrl(block.url, origin);
      if (!src) return "";
      // width="100%" AND a style width, because Outlook reads the attribute and
      // everything else reads the style. Height auto keeps the aspect ratio;
      // display:block kills the stray baseline gap under images in Gmail.
      const img =
        `<img src="${escapeEmailHtml(src)}" alt="${escapeEmailHtml(block.alt.trim())}" width="${WIDTH - 80}" ` +
        `style="display:block;width:100%;max-width:${WIDTH - 80}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
      const href = safeHref(block.href);
      const wrapped = href ? `<a href="${href}" style="text-decoration:none;">${img}</a>` : img;
      const caption = block.caption.trim()
        ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:#8a8a86;">${escapeEmailHtml(block.caption.trim())}</p>`
        : "";
      return `<div style="margin:0 0 20px;">${wrapped}${caption}</div>`;
    }

    case "button": {
      const href = safeHref(block.href);
      if (!href || !block.label.trim()) return "";
      // A table, not a padded anchor. Outlook ignores padding on an <a>, and
      // the button arrives as a bare blue underlined word.
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;">` +
        `<tr><td align="center" bgcolor="${NAVY}" style="border-radius:2px;">` +
        `<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:13px;font-weight:bold;` +
        `letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">` +
        `${escapeEmailHtml(block.label.trim())}</a>` +
        `</td></tr></table>`
      );
    }

    case "divider":
      return `<div style="margin:8px 0 24px;border-top:1px solid ${GOLD_RULE};font-size:0;line-height:0;">&nbsp;</div>`;
  }
}

/* ---- the whole letter --------------------------------------------------- */

export type BlastRenderInput = {
  /** The message, as blocks. A pre-blocks draft is handled by blocksOf. */
  blast: { blocks?: BlastBlock[]; body?: string; subject?: string };
  /** This deployment's own address, for the crest and any uploaded picture. */
  origin: string;
  /** Why this person is getting it. Required — see the note at the top. */
  becauseLine: string;
  /** Where "stop these emails" goes. Required. */
  unsubscribeUrl: string;
};

export function renderBlastHtml(input: BlastRenderInput): string {
  const origin = input.origin.replace(/\/$/, "");
  const inner = blocksOf(input.blast)
    .filter(blockHasContent)
    .map((block) => blockHtml(block, origin))
    .join("");

  // NOT /logo.png: that artwork has "White Glove Itineraries" — the old name —
  // drawn into it, so every email was signed with a company that no longer
  // exists. The hand carries no words and the name is set as text below it.
  const crest = `${origin}/logo-hand-navy.png`;
  const unsubscribe = safeHref(input.unsubscribeUrl) || escapeEmailHtml(input.unsubscribeUrl);

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeEmailHtml(input.blast.subject ?? "White Glove Kosher Travel")}</title></head>` +
    `<body style="margin:0;padding:0;background:${CREAM};">` +
    // The outer table IS the page background. A background on <body> alone is
    // dropped by several clients, which is how an email ends up on white.
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">` +
    `<tr><td align="center" style="padding:28px 12px 40px;">` +
    `<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:${WIDTH}px;background:${SURFACE};border:1px solid ${GOLD_RULE};">` +

    // ---- the crest, and the name as words beside it ----
    // The artwork carries no name of its own, so the name is set as text — the
    // same lockup the site header and footer use. An email client that blocks
    // pictures then still shows who wrote.
    `<tr><td align="center" style="padding:30px 40px 0;">` +
    `<img src="${escapeEmailHtml(crest)}" alt="" width="54" ` +
    `style="display:block;width:54px;max-width:30%;height:auto;border:0;" /></td></tr>` +
    `<tr><td align="center" style="padding:10px 40px 0;">` +
    `<div style="font-family:${DISPLAY};font-size:24px;line-height:1.1;color:${NAVY};">White Glove</div>` +
    `<div style="font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${GOLD_INK};padding-top:6px;">` +
    `Kosher Travel</div></td></tr>` +
    `<tr><td align="center" style="padding:14px 40px 0;">` +
    `<div style="font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${GOLD_INK};">` +
    `Kosher travel, planned properly</div></td></tr>` +
    `<tr><td align="center" style="padding:18px 40px 0;">` +
    `<div style="width:120px;border-top:1.5px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</div></td></tr>` +

    // ---- the message ----
    `<tr><td style="padding:26px 40px 8px;">${inner}</td></tr>` +

    // ---- the footer ----
    `<tr><td style="padding:8px 40px 0;">` +
    `<div style="border-top:1px solid ${GOLD_RULE};font-size:0;line-height:0;">&nbsp;</div></td></tr>` +
    `<tr><td style="padding:18px 40px 30px;">` +
    `<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:#8a8a86;">` +
    `${escapeEmailHtml(input.becauseLine)} ` +
    `<a href="${unsubscribe}" style="color:${GOLD_INK};text-decoration:underline;">Stop these emails</a>.</p>` +
    `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:#8a8a86;">` +
    `<a href="${escapeEmailHtml(origin)}" style="color:${INK};text-decoration:none;">White Glove Kosher Travel</a>` +
    ` &middot; whiteglovekoshertravel.com</p>` +
    `</td></tr>` +

    `</table></td></tr></table></body></html>`
  );
}

/**
 * The same letter as plain words.
 *
 * NOT AN AFTERTHOUGHT. Every message goes out with both; a mail client that
 * shows the text part — and some corporate ones still do — gets a readable
 * message rather than a page of markup, and a message with no text part scores
 * worse with spam filters than one that has it.
 */
export function renderBlastText(input: BlastRenderInput): string {
  const lines: string[] = [];
  for (const block of blocksOf(input.blast).filter(blockHasContent)) {
    switch (block.kind) {
      case "heading":
        lines.push(block.text.trim().toUpperCase(), "");
        break;
      case "text":
        lines.push(
          block.text
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .join("\n\n"),
          "",
        );
        break;
      case "image": {
        const caption = block.caption.trim() || block.alt.trim();
        if (caption) lines.push(`[${caption}]`, "");
        break;
      }
      case "button":
        lines.push(`${block.label.trim()}: ${block.href.trim()}`, "");
        break;
      case "divider":
        lines.push("—", "");
        break;
    }
  }
  return (
    `${lines.join("\n").trim()}\n\n—\n` +
    `${input.becauseLine} Stop these emails: ${input.unsubscribeUrl}\n\n` +
    `White Glove Kosher Travel · whiteglovekoshertravel.com`
  );
}
