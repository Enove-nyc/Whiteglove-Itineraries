// Click-through of the ADMIN, signed in, on the local app. Opens every admin
// route the nav and the pages link to, at desktop and phone width, and presses
// every visible control that does not write — tabs, filters, sorts, Edit,
// Cancel, Close, Preview, menus, pagination. Save / Delete / Approve / Publish /
// Import / Upload / Restore are deliberately NOT pressed here; those are
// exercised by the scripted CRUD run instead, one at a time, with reload checks.
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";

const ORIGIN = process.argv[2];
const OUT = process.argv[3];
const STATE = JSON.parse(readFileSync(new URL("./auth-state.json", import.meta.url), "utf8"));
const WRITES = /save|delete|remove|approve|reject|accept|publish|unpublish|restore|import|upload|send|submit|create|add |^add$|\+ add|confirm|run setup|re-?import|reset|clear|sign out|log out|logout|revoke|disable|enable|toggle|mark|resolve|dismiss|archive|move|purge|sweep|rotate|generate|invite|refund|charge|pay/i;

const findings = [];
const visited = new Set();
const queue = ["/admin"];
const note = (page, kind, detail) => findings.push({ page, kind, detail });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--no-sandbox"] });

async function audit(path, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 500, hasTouch: width < 500, storageState: STATE });
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], badRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on("response", (r) => { const u = r.url(); if (u.startsWith(ORIGIN) && r.status() >= 400 && !/\/_next\//.test(u)) badRequests.push(`${r.status()} ${u.replace(ORIGIN, "")}`); });
  const tag = `${path} @${width}`;
  let resp;
  try { resp = await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 30000 }); }
  catch (e) { note(tag, "load-failed", String(e).split("\n")[0].slice(0, 160)); await ctx.close(); return []; }
  const status = resp?.status();
  if (status && status >= 400) note(tag, "http-error", `status ${status}`);
  const finalPath = new URL(page.url()).pathname;
  if (finalPath.startsWith("/admin/login")) { note(tag, "kicked-to-login", `${path} sent a signed-in admin to the login page`); await ctx.close(); return []; }
  if (finalPath !== path && width === 1280) note(tag, "redirect", `→ ${finalPath}`);

  const stuck = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && /^\s*Loading(…|\.\.\.)?\s*$/.test(el.textContent || "")).length);
  if (stuck) note(tag, "stuck-loading", `${stuck} element(s) still say "Loading" after networkidle`);
  const spinners = await page.locator('[class*="animate-spin"]:visible').count();
  if (spinners) note(tag, "spinner", `${spinners} spinner(s) still visible after networkidle`);
  if (width < 500) {
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (over.sw > over.iw + 2) {
      const culprits = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2 && el.getBoundingClientRect().width > 40 && el.children.length < 3).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")}`));
      note(tag, "mobile-overflow", `scrollWidth ${over.sw} > ${over.iw}; ${culprits.join(" | ")}`);
    }
    // Controls hidden under a fixed bottom bar.
    const hidden = await page.evaluate(() => {
      const bars = Array.from(document.querySelectorAll("*")).filter((el) => { const cs = getComputedStyle(el); return cs.position === "fixed" && el.getBoundingClientRect().bottom >= window.innerHeight - 1 && el.getBoundingClientRect().height > 30 && el.getBoundingClientRect().height < 200; });
      if (!bars.length) return 0;
      const top = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
      return Array.from(document.querySelectorAll("button, a[href], input, select")).filter((c) => { const r = c.getBoundingClientRect(); return r.height > 0 && r.top >= top && r.top < window.innerHeight && !bars.some((b) => b.contains(c)); }).length;
    });
    if (hidden) note(tag, "control-under-bottom-bar", `${hidden} control(s) sit under the fixed bottom bar at first paint`);
  }
  const mainText = await page.evaluate(() => (document.querySelector("main") || document.body).innerText.trim().length);
  if (mainText < 60) note(tag, "near-empty-page", `main has ${mainText} chars`);

  const links = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 40) })));
  for (const l of links) if (l.href === "#" || l.href === "") note(tag, "dead-link", `"${l.text}" → href="${l.href}"`);
  const next = links.map((l) => l.href).filter((h) => h && h.startsWith("/admin") && !h.includes("logout")).map((h) => h.split("#")[0].split("?")[0]);

  if (width === 1280) {
    const buttons = page.locator("button:visible, [role=tab]:visible, summary:visible");
    const n = Math.min(await buttons.count(), 45);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      let label = "";
      try { label = ((await b.innerText()) || (await b.getAttribute("aria-label")) || "").trim().slice(0, 40); } catch { continue; }
      if (!label || WRITES.test(label)) continue;
      if ((await b.getAttribute("type")) === "submit") continue;
      const before = await page.evaluate(() => ({ html: document.body.innerHTML.length, url: location.href, exp: Array.from(document.querySelectorAll("[aria-expanded],[aria-selected],[open]")).map((e) => (e.getAttribute("aria-expanded") ?? "") + (e.getAttribute("aria-selected") ?? "") + (e.hasAttribute("open") ? "o" : "")).join(","), dialogs: document.querySelectorAll('[role="dialog"]').length }));
      try { await b.click({ timeout: 2000 }); } catch { note(tag, "button-unclickable", `"${label}" could not be clicked (covered or off-screen)`); continue; }
      await page.waitForTimeout(450);
      const after = await page.evaluate(() => ({ html: document.body.innerHTML.length, url: location.href, exp: Array.from(document.querySelectorAll("[aria-expanded],[aria-selected],[open]")).map((e) => (e.getAttribute("aria-expanded") ?? "") + (e.getAttribute("aria-selected") ?? "") + (e.hasAttribute("open") ? "o" : "")).join(","), dialogs: document.querySelectorAll('[role="dialog"]').length }));
      if (before.html === after.html && before.url === after.url && before.exp === after.exp && before.dialogs === after.dialogs) note(tag, "button-no-effect", `"${label}" — clicking changed nothing visible`);
      if (after.dialogs > before.dialogs) {
        // Dialog opened: does Escape close it, and does a backdrop click close it while a field has text?
        await page.keyboard.press("Escape"); await page.waitForTimeout(250);
        const stillOpen = await page.locator('[role="dialog"]:visible').count();
        if (stillOpen) note(tag, "dialog-ignores-escape", `"${label}" opened a dialog that Escape does not close`);
        for (let k = 0; k < stillOpen; k++) { const c = page.locator('[role="dialog"]:visible button').filter({ hasText: /close|cancel|done|back/i }).first(); if (await c.count()) { try { await c.click({ timeout: 1000 }); } catch {} } }
      }
      if (before.url !== after.url) { try { await page.goBack({ waitUntil: "networkidle", timeout: 15000 }); } catch {} if (!page.url().startsWith(ORIGIN + path)) { try { await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 20000 }); } catch {} } }
    }
  }
  for (const e of pageErrors) note(tag, "js-error", e);
  for (const e of consoleErrors.slice(0, 3)) note(tag, "console-error", e);
  for (const r of badRequests.slice(0, 5)) note(tag, "failed-request", r);
  await ctx.close();
  return next;
}

while (queue.length && visited.size < 90) {
  const path = queue.shift();
  if (visited.has(path)) continue;
  visited.add(path);
  const next = await audit(path, 1280);
  await audit(path, 390);
  for (const p of next) if (!visited.has(p) && !queue.includes(p)) queue.push(p);
  process.stderr.write(`${visited.size} ${path}\n`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, pages: [...visited], findings }, null, 2));
console.log(`admin pages=${visited.size} findings=${findings.length}`);
