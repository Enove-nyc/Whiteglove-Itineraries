import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../components/ServiceWorkerRegister.tsx', import.meta.url), 'utf8');
function setup(controlled, pathname = '/app') {
  const navigator = { serviceWorker: { controller: controlled ? {} : null } };
  let reloads = 0;
  const context = { navigator, window: { location: { pathname, reload: () => reloads++ } } };
  const start = source.indexOf('    let hadController');
  const end = source.indexOf('    navigator.serviceWorker.addEventListener', start);
  assert.ok(start >= 0 && end > start);
  runInNewContext(source.slice(start, end) + '\nglobalThis.change = onControllerChange;', context);
  return { change() { navigator.serviceWorker.controller = {}; context.change(); }, reloads: () => reloads };
}
test('first install keeps the active screen, later replacement reloads once', () => {
  const page = setup(false);
  page.change(); assert.equal(page.reloads(), 0);
  page.change(); assert.equal(page.reloads(), 1);
  page.change(); assert.equal(page.reloads(), 1);
});
test('an existing controller is replaced with one reload', () => {
  const page = setup(true);
  page.change(); page.change(); assert.equal(page.reloads(), 1);
});
test('an update does not discard the invitation fragment flow', () => {
  const page = setup(true, '/join/private-invitation');
  page.change(); assert.equal(page.reloads(), 0);
});
