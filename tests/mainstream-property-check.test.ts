import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import nextConfig from '../next.config';
import { MAINSTREAM_CSP, MAINSTREAM_PATH, isMainstreamPath } from '../lib/mainstream-property-check';

test('the standalone entry keeps its URL and serves the packaged HTML', async () => {
  assert.deepEqual(await nextConfig.rewrites!(), [{source:MAINSTREAM_PATH,destination:`${MAINSTREAM_PATH}/index.html`}]);
  const html=readFileSync(`public${MAINSTREAM_PATH}/index.html`,'utf8');
  assert.ok(html.includes(`<base href="${MAINSTREAM_PATH}/">`));
  assert.ok(html.includes('noindex,nofollow,noarchive'));
  assert.ok(html.includes('<title>NYC Property Check | Mainstream</title>'));
});

test('the search policy and noindex headers apply only to the lookup', async () => {
  const rules=await nextConfig.headers!();
  const lookup=rules.find(rule=>rule.source===`${MAINSTREAM_PATH}/:path*`);
  assert.equal(lookup?.headers.find(h=>h.key==='X-Robots-Tag')?.value,'noindex, nofollow, noarchive');
  assert.equal(lookup?.headers.find(h=>h.key==='Content-Security-Policy')?.value,MAINSTREAM_CSP);
  const global=rules.find(rule=>rule.source==='/:path*');
  assert.ok(global);
  assert.notEqual(global.headers.find(h=>h.key==='Content-Security-Policy')?.value,MAINSTREAM_CSP);
  assert.ok(MAINSTREAM_CSP.includes("connect-src 'self' https://geosearch.planninglabs.nyc"));
});

test('the public exception cannot cover adjacent travel paths', () => {
  assert.ok(isMainstreamPath(MAINSTREAM_PATH));
  assert.ok(isMainstreamPath(`${MAINSTREAM_PATH}/data/100.json`));
  for(const path of ['/', '/account','/admin',`${MAINSTREAM_PATH}-other`]) assert.equal(isMainstreamPath(path),false);
});

test('the published dataset and modules are installed locally, without a Sites proxy', () => {
  const data=JSON.parse(readFileSync(`public${MAINSTREAM_PATH}/data/100.json`,'utf8'));
  assert.equal(data['1001026'][0],'104');
  assert.equal(data['1001026'][1],'BROADWAY');
  const script=readFileSync(`public${MAINSTREAM_PATH}/app.js`,'utf8');
  assert.ok(script.includes("from './lookup.js'"));
  assert.ok(!script.includes('chatgpt.site'));
});
