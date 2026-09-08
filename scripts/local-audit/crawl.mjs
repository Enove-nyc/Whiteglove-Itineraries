// Click-through audit of a live site: every same-origin link, every visible
// button, at desktop and phone width. Writes a JSON report.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const ORIGIN = process.argv[2];
const OUT = process.argv[3];
const MAX_PAGES = Number(process.argv[4] ?? 70);
const DESTRUCTIVE = /delete|remove|sign out|log out|logout|unsubscribe|forget|reset|clear|cancel plan|pay|checkout|subscribe|send|submit|save|report|confirm/i;

const findings = [];
const visited = new Set();
const queue = ["/"];
const note = (page, kind, detail) => findings.push({ page, kind, detail });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });

async function dismissNotice(page) {
  // The site-wide notice is a full-screen popup; find its dismiss control.
  for (const sel of ['[role="dialog"] button', 'button:has-text("Continue")', 'button:has-text("Got it")', 'button:has-text("Close")', 'button[aria-label*="lose"]']) {
    const b = page.locator(sel).first();
    if (await b.count()) { try { await b.click({ timeout: 1500 }); await page.waitForTimeout(300); return true; } catch {} }
  }
  return false;
}

async function audit(path, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500 });
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], badRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on("response", (r) => { const u = r.url(); if (u.startsWith(ORIGIN) && r.status() >= 400 && !/\/_next\//.test(u)) badRequests.push(`${r.status()} ${u.replace(ORIGIN, "")}`); });
  const tag = `${path} @${width}`;
  let resp;
  try {
    resp = await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) { note(tag, "load-failed", String(e).slice(0, 160)); await ctx.close(); return []; }
  const status = resp?.status();
  if (status && status >= 400) note(tag, "http-error", `status ${status}`);
  const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
  if (finalPath !== path && width === 1280) note(tag, "redirect", `→ ${finalPath}`);
  await dismissNotice(page);

  // Stuck loading text after the network has settled.
  const stuck = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && /^\s*(Loading|Loading…|Loading\.\.\.)\s*$/.test(el.textContent || "")).length);
  if (stuck) note(tag, "stuck-loading", `${stuck} element(s) still say "Loading" after networkidle`);
  const spinners = await page.locator('[class*="animate-spin"]:visible').count();
  if (spinners) note(tag, "spinner", `${spinners} spinner(s) still visible after networkidle`);

  // Horizontal overflow on phone.
  if (width < 500) {
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (over.sw > over.iw + 2) {
      const culprits = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2 && el.getBoundingClientRect().width > 40).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`));
      note(tag, "mobile-overflow", `scrollWidth ${over.sw} > viewport ${over.iw}; e.g. ${culprits.join(", ")}`);
    }
  }

  // Empty-looking main.
  const mainText = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.trim().length);
  if (mainText < 80) note(tag, "near-empty-page", `main has ${mainText} chars of text`);

  // Links: collect same-origin hrefs for the crawl; flag obvious dead ones.
  const links = await page.evaluate((origin) => Array.from(document.querySelectorAll("a[href]")).map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 40), visible: !!(a.offsetWidth || a.offsetHeight) })).filter((l) => l.href && (l.href.startsWith("/") || l.href.startsWith(origin))), ORIGIN);
  for (const l of links) {
    if (l.href === "#" || l.href === "") note(tag, "dead-link", `"${l.text}" → href="${l.href}"`);
  }
  const nextPaths = links.map((l) => l.href.replace(ORIGIN, "")).filter((h) => h.startsWith("/") && !h.startsWith("/_next") && !/\.(png|jpg|svg|pdf|ico|xml|txt)$/i.test(h) && !h.startsWith("/api/") && !h.startsWith("/admin"));

  // Buttons: click each visible non-destructive one and see whether anything happened.
  if (width === 1280) {
    const buttons = page.locator("button:visible");
    const n = Math.min(await buttons.count(), 40);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      let label = "";
      try { label = ((await b.innerText()) || (await b.getAttribute("aria-label")) || "").trim().slice(0, 40); } catch { continue; }
      if (!label || DESTRUCTIVE.test(label)) continue;
      const type = await b.getAttribute("type");
      if (type === "submit") continue;
      const before = await page.evaluate(() => ({ html: document.body.innerHTML.length, url: location.href, expanded: Array.from(document.querySelectorAll("[aria-expanded]")).map((e) => e.getAttribute("aria-expanded")).join(","), open: document.querySelectorAll('[role="dialog"], [open]').length }));
      try { await b.click({ timeout: 2000, trial: false }); } catch { note(tag, "button-unclickable", `"${label}" could not be clicked (covered or off-screen)`); continue; }
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ html: document.body.innerHTML.length, url: location.href, expanded: Array.from(document.querySelectorAll("[aria-expanded]")).map((e) => e.getAttribute("aria-expanded")).join(","), open: document.querySelectorAll('[role="dialog"], [open]').length }));
      const changed = before.html !== after.html || before.url !== after.url || before.expanded !== after.expanded || before.open !== after.open;
      if (!changed) note(tag, "button-no-effect", `"${label}" — clicking changed nothing visible`);
      if (before.url !== after.url) { try { await page.goBack({ waitUntil: "networkidle", timeout: 15000 }); await dismissNotice(page); } catch {} }
      else if (after.open > before.open) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
    }
  }

  for (const e of pageErrors) note(tag, "js-error", e);
  for (const e of consoleErrors.slice(0, 3)) note(tag, "console-error", e);
  for (const r of badRequests.slice(0, 5)) note(tag, "failed-request", r);
  await ctx.close();
  return nextPaths;
}

while (queue.length && visited.size < MAX_PAGES) {
  const path = queue.shift();
  const clean = path.split("#")[0];
  if (visited.has(clean)) continue;
  visited.add(clean);
  const next = await audit(clean, 1280);
  await audit(clean, 390);
  for (const p of next) if (!visited.has(p.split("#")[0]) && !queue.includes(p)) queue.push(p);
  process.stderr.write(`${visited.size}/${MAX_PAGES} ${clean}\n`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, pages: [...visited], findings }, null, 2));
console.log(`pages=${visited.size} findings=${findings.length}`);
