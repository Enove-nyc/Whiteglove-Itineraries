import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
// Run against a disposable Next.js instance and scripts/visitor-redis.mjs.
const base = process.env.COMPANION_TEST_URL || 'http://127.0.0.1:3003';
const redis = process.env.COMPANION_TEST_REDIS_URL || 'http://127.0.0.1:6380';
for (const target of [base, redis]) assert.equal(new URL(target).hostname, '127.0.0.1', 'Use disposable local services');
const stamp = randomBytes(5).toString('hex');
const organizer = `organizer-${stamp}@example.test`;
const traveler = `traveler-${stamp}@example.test`;
const second = `second-${stamp}@example.test`;
async function seed(...args) {
  const response = await fetch(redis, {method:'POST',body:JSON.stringify(args)});
  assert.ok(response.ok, await response.text());
}
const browser = await chromium.launch({...(process.env.COMPANION_CHROMIUM ? {executablePath:process.env.COMPANION_CHROMIUM} : {}),args:['--no-sandbox']});
const headers = {'x-wg-brand':'itineraries', Origin:base};
async function contextFor(email) {
  const context = await browser.newContext({viewport:{width:390,height:844}, extraHTTPHeaders:headers});
  await context.addInitScript(() => { localStorage.setItem('whiteGloveBetaNotice', '6'); localStorage.setItem('whiteGloveBetaNoticeShown', '6'); });
  if (email) {
    const now = new Date().toISOString();
    await seed('SET', `white-glove:account:${email}`, JSON.stringify({email,name:email.split('-')[0],salt:'fixture',passwordHash:'fixture',verifiedAt:now,createdAt:now}));
    const signature = createHmac('sha256','isolated-companion-test-secret').update(email).digest('base64url');
    await context.addCookies([{name:'white_glove_account',value:`${encodeURIComponent(email)}.${signature}`,url:base}]);
  }
  return context;
}
async function post(context, path, data, status = 200) {
  const r = await context.request.post(base+path, {data});
  const body = await r.json();
  assert.equal(r.status(),status,JSON.stringify(body));
  return body;
}
try {
  const guest = await contextFor();
  const page = await guest.newPage();
  await page.goto(base);
  await page.getByRole('link',{name:'Start an itinerary',exact:true}).waitFor();
  await page.goto(base+'/app/preview');
  await page.getByRole('link',{name:'Copy this trip'}).click();
  await page.getByRole('button',{name:'Copy sample',exact:true}).click();
  const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('wg-itinerary-guest-draft')));
  assert.equal(copy.startDate,''); assert.equal(copy.activities.length,3);
  await page.reload();
  await page.getByText('Guest draft · stored in this browser').waitFor();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal((await page.pdf({format:'A4'})).subarray(0, 4).toString(), '%PDF');
  await page.goto(base+'/itinerary?start=import');
  await page.getByRole('button',{name:'Import a booking',exact:true}).click();
  await page.getByRole('heading',{name:'Sign in to import a booking'}).waitFor();
  assert.equal(await page.evaluate(() => !!localStorage.getItem('wg-itinerary-guest-draft')),true);
  console.log('PASS guest sample, reload, printable preview, preserved draft during import sign-in');
  const owner = await contextFor(organizer);
  const one = await contextFor(traveler);
  const two = await contextFor(second);
  const itinerary = {
    ...copy, title:'Fictional Lake Como trip', startDate:'2027-05-17',endDate:'2027-05-19',
    flights:[{id:'sample-flight',from:'FCO',to:'MXP',date:'2027-05-17',departTime:'07:00',arriveTime:'08:15'}],
    activities:copy.activities.map((a,i)=>({...a,date:`2027-05-${17+i}`})),
    travelers:[{id:'first',name:'Jamie',email:traveler},{id:'second',name:'Morgan',email:second}],
  };
  const {activeId:tripId} = await post(owner,'/api/account/trips',{action:'import',itinerary});
  const invite = async (travelerId) => (await post(owner,'/api/account/traveler-share',{tripId,travelerId})).shareId;
  const code = await invite('first');
  const codeTwo = await invite('second');
  assert.notEqual(code,codeTwo);
  const tripPage = await one.newPage();
  const url = base+'/t/'+code+'/app';
  await tripPage.goto(url);
  for (const name of ['Itinerary','Chat','Wallet','Updates']) await tripPage.getByRole('button',{name,exact:true}).waitFor();
  const wrong = await two.newPage();
  await wrong.goto(url);
  await wrong.getByRole('heading',{name:'Trip invite unavailable'}).waitFor();
  const chat = '/api/companion/chat';
  await post(two,chat,{share:code,text:'Wrong person'},404);
  await post(one,chat,{share:code,text:'Where should we meet?'});
  await post(owner,chat,{share:code,text:'Meet in the main square.'});
  await tripPage.goto(url+'?screen=messages');
  await tripPage.getByText('Meet in the main square.',{exact:true}).waitFor();
  const appPage = await one.newPage();
  await appPage.goto(base+'/app?enter=1');
  await appPage.getByRole('link',{name:'Fictional Lake Como trip',exact:true}).waitFor();
  const inbox = await owner.newPage();
  await inbox.goto(base+'/itinerary/inbox');
  await inbox.getByRole('link',{name:/Jamie/}).waitFor();
  const ownThread = await (await one.request.get(base+chat+'?share='+code)).json();
  assert.deepEqual(ownThread.messages.map(m=>[m.from,m.text]),[['client','Where should we meet?'],['advisor','Meet in the main square.']]);
  assert.equal((await (await two.request.get(base+chat+'?share='+codeTwo)).json()).messages.length,0);
  console.log('PASS signed-in invite, four tabs, two-way chat, wrong-account and second-conversation isolation');
  const boardingPass = await owner.newPage();
  await boardingPass.setContent(`<h1>Sample boarding pass</h1><p>Fictional test document · Jamie · FCO to MXP</p><div style="width:220px;height:40px;background:repeating-linear-gradient(90deg,black 0 2px,white 2px 5px,black 5px 6px,white 6px 10px)"></div>`);
  const pdf = await boardingPass.pdf({format:'A5',printBackground:true});
  await boardingPass.close();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+vmioAAAAASUVORK5CYII=';
  const pass = await post(owner,'/api/account/attachments',{kind:'boarding-pass',name:'Sample boarding pass.pdf',dataUrl:'data:application/pdf;base64,'+pdf.toString('base64')});
  const ticket = await post(owner,'/api/account/attachments',{kind:'ticket',name:'Sample ticket.png',dataUrl:'data:image/png;base64,'+png});
  const file = (code,id)=>base+'/api/trip-file/'+code+'?id='+id;
  itinerary.flights[0].attachments = [{...pass.attachment,travelerId:'first'}];
  itinerary.activities[0].attachments = [{...ticket.attachment,travelerId:'first'}];
  itinerary.activities[0].name = 'Revised meeting point';
  await post(owner,'/api/account/itinerary',{itinerary,tripId});
  assert.equal((await one.request.get(file(code,pass.attachment.id))).status(),404);
  await post(owner,'/api/account/traveler-share',{action:'publish',tripId});
  assert.equal((await one.request.get(file(code,pass.attachment.id))).status(),200);
  assert.equal((await one.request.get(file(code,ticket.attachment.id))).status(),200);
  assert.equal((await two.request.get(file(codeTwo,pass.attachment.id))).status(),404);
  await tripPage.goto(url+'?screen=alerts');
  await tripPage.getByText('Last synced',{exact:false}).waitFor();
  if (process.env.COMPANION_TEST_DENIED === '1') {
    const session = await tripPage.context().newCDPSession(tripPage);
    const {targetInfo} = await session.send('Target.getTargetInfo');
    await session.send('Browser.setPermission', {permission:{name:'notifications'},setting:'denied',origin:base,browserContextId:targetInfo.browserContextId});
    await tripPage.reload();
    await tripPage.getByText("Notifications are blocked in your browser's settings.").waitFor();
    console.log('PASS denied Chromium notification permission leaves Updates available');
  }
  await tripPage.getByRole('button',{name:'Open itinerary',exact:true}).first().waitFor();
  await tripPage.getByRole('button',{name:'Wallet',exact:true}).click();
  await tripPage.getByRole('link',{name:'Sample boarding pass.pdf · Jamie',exact:false}).click();
  await tripPage.getByRole('dialog').waitFor();
  await tripPage.getByLabel('Document page 1').waitFor();
  await tripPage.getByRole('button',{name:'View larger'}).click();
  await tripPage.getByRole('button',{name:'Close document'}).click();
  await tripPage.getByRole('button',{name:'Save for offline',exact:true}).first().click();
  await tripPage.getByText('Available offline',{exact:true}).first().waitFor();
  await tripPage.evaluate(() => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller)));
  await one.setOffline(true);
  await tripPage.reload();
  await tripPage.getByRole('button',{name:'Wallet',exact:true}).click();
  await tripPage.getByRole('link',{name:'Sample boarding pass.pdf · Jamie',exact:false}).click();
  await tripPage.getByRole('dialog').waitFor();
  await tripPage.getByRole('button',{name:'Close document'}).click();
  await tripPage.getByRole('button',{name:'Remove offline copy',exact:true}).first().click();
  await tripPage.getByRole('button',{name:'Save for offline',exact:true}).first().waitFor();
  await one.setOffline(false);
  console.log('PASS explicit publish, wallet privacy, opening originals, offline copy and removal in Chromium');
  await post(owner,'/api/account/traveler-share',{action:'revoke',tripId,travelerId:'first'});
  assert.equal((await one.request.get(file(code,pass.attachment.id))).status(),404);
  await post(one,chat,{share:code,text:'Revoked'},404);
  await tripPage.goto(url);
  await tripPage.getByRole('heading',{name:'Trip invite unavailable'}).waitFor();
  console.log('PASS revocation blocks itinerary, chat and future downloads');
} finally {await browser.close();}
