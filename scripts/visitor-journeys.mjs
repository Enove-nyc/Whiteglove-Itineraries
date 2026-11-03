import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
const isolated=process.env.AUDIT_ISOLATED==='1';
const brand=process.env.AUDIT_BRAND||'itineraries';
const origin=isolated?'http://127.0.0.1:3002':brand==='travel'?'https://www.whiteglovekoshertravel.com':'https://www.whitegloveitineraries.com';
if(isolated&&new URL(origin).hostname!=='127.0.0.1')throw Error('Fixture writes require loopback');
const out=`journey-results/${brand}-${isolated?'isolated':'live'}`;mkdirSync(out,{recursive:true});
const report={origin,brand,isolated,startedAt:new Date().toISOString(),scenarios:[],accessibility:[],errors:[],coverageNotes:isolated?['Disposable local Postgres and Redis; no provider credentials. Email verification fixture supplied directly; delivery and real payments untested.']:['Anonymous production browsing. Analytics suppressed with synthetic responses; non-read feature requests blocked. No account or customer-data writes.']};
const browser=await chromium.launch();
let page;
async function scenario(name,fn){try{await fn();report.scenarios.push({name,status:'passed'});}catch(e){const shot=name.replace(/[^a-z0-9]+/gi,'-')+'.jpg';await page?.screenshot({path:out+'/'+shot,fullPage:false}).catch(()=>{});report.scenarios.push({name,status:'failed',error:String(e).slice(0,700),screenshot:shot});}console.log('JOURNEY',name,report.scenarios.at(-1).status);}
async function context(width){const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,extraHTTPHeaders:{'x-wg-brand':brand==='itineraries'?'itineraries':'kosher'}});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(req.url().startsWith(origin+'/api/analytics'))return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});if(isolated&&!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(!isolated&&!['GET','HEAD','OPTIONS'].includes(req.method()))return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Audit blocked this write"}'});return route.continue();});return ctx;}
async function go(path){await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(800);await page.evaluate(()=>scrollTo(0,680));await page.waitForTimeout(150);const close=page.getByRole('dialog').getByRole('button',{name:/close/i});if(await close.isVisible().catch(()=>false))await close.click();else await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));}
async function scan(path,width){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();report.accessibility.push({path,width,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,5).map(n=>n.html)}))});}
for(const width of [1280,390]){
 const ctx=await context(width);page=await ctx.newPage();page.on('pageerror',e=>report.errors.push({width,url:page.url(),error:String(e)}));
 await scenario(`home audience and primary links ${width}`,async()=>{await go('/');if(brand==='itineraries'){await page.getByRole('radio',{name:'Planning my own trip'}).check({force:true});assert.match(await page.locator('main').innerText(),/trip/i);}assert(await page.getByRole('link',{name:/build a trip|itinerary planner/i}).count()>0||brand==='travel');await scan('/',width);});
 if(width===390)await scenario('mobile menu opens and closes',async()=>{await go('/');const open=page.getByRole('button',{name:'Open menu',exact:true});await open.click();await page.locator('#mobile-menu').waitFor({state:'visible'});await scan('/?menu=open',width);await page.getByRole('button',{name:'Close menu',exact:true}).click();await page.locator('#mobile-menu').waitFor({state:'hidden'});});
 await scenario(`sample itinerary switches all views ${width}`,async()=>{await go('/sample-itinerary');for(const [label,text] of [['In the app','What the traveller opens'],['Printed','The document, as it comes out'],['On the site','The trip as the planner']]){await page.getByRole('radio',{name:label,exact:true}).check({force:true});assert((await page.locator('main').innerText()).includes(text));}await scan('/sample-itinerary',width);});
 await scenario(`client app preview ${width}`,async()=>{await go('/app');await page.getByRole('link',{name:'Open a sample trip',exact:true}).click();await page.waitForURL('**/app/preview');await page.waitForTimeout(900);const text=await page.locator('body').innerText();assert(text.length>200);assert(!/application error/i.test(text));});
 await scenario(`signup password visibility ${width}`,async()=>{await go('/login');await page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await page.locator('input[autocomplete="new-password"]').getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();await scan('/login',width);});
 await scenario(`booking tabs ${width}`,async()=>{await go('/book');for(const name of ['FLIGHTS','CARS','WHERE TO STAY']){await page.getByRole('button',{name:new RegExp('^'+name+'$','i')}).click();assert(await page.locator('input:visible').count()>0);}await scan('/book',width);});
 for(const path of ['/pricing','/packing','/offline'])await scenario(`accessibility ${path} ${width}`,async()=>{await go(path);await scan(path,width);});
 await ctx.close();
}
if(isolated){
 const ctx=await context(1280);page=await ctx.newPage();
 const email='owner@audit.local',password='Audit-local-pass-1!';
 const api=async(path,body)=>{const r=await ctx.request.fetch(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},data:body});return {status:r.status(),json:await r.json()};};
 const redis=async(args)=>(await(await fetch('http://127.0.0.1:6380',{method:'POST',body:JSON.stringify(args)})).json()).result;
 await scenario('register and login through customer form',async()=>{
  await go('/login?next=%2Fitinerary');await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('Choose a password').fill(password);await page.locator('input[name="new-account-name"]').fill('Audit Owner');await page.getByRole('checkbox').check();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/account/register'));await page.getByRole('button',{name:/^create account$/i}).click();const r=await response;assert.equal(r.status(),200,await r.text());
  // No email is sent from this environment. Only disposable fixture verification.
  const key='white-glove:account:'+email;const record=JSON.parse(await redis(['GET',key]));record.verifiedAt=new Date().toISOString();delete record.verificationCodeHash;delete record.verificationCodeExpiresAt;await redis(['SET',key,JSON.stringify(record)]);
  await go('/login?next=%2Fitinerary');await page.getByRole('button',{name:/^log in$/i}).click();await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('Your password').fill(password);const login=page.waitForResponse(r=>r.url().endsWith('/api/account/login'));await page.locator('button[type="submit"]').click();const logged=await login;assert.equal(logged.status(),200,await logged.text());
  // Secure cookies require HTTPS in production. Fixture transport is HTTP-only.
  const cookies=logged.headers()['set-cookie']||'';for(const m of cookies.matchAll(/(?:^|,\s*)([\w-]+)=([^;]+)/g)){if(m[1].includes('white')||m[1].includes('wg'))await ctx.addCookies([{name:m[1],value:m[2],domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}]);}
 });
 let tripId,shared;
 await scenario('trip create rename reload and duplicate persistence',async()=>{
  const made=await api('/api/account/trips',{action:'create',name:'Visitor test Rome'});assert.equal(made.status,200,JSON.stringify(made.json));let trips=(await api('/api/account/trips')).json.trips;tripId=trips.find(t=>t.name==='Visitor test Rome')?.id;assert(tripId);
  assert.equal((await api('/api/account/trips',{action:'rename',id:tripId,name:'Saved Rome journey'})).status,200);
  await go('/itinerary');assert(!(new URL(page.url()).pathname==='/login'));await page.getByText('Saved Rome journey',{exact:true}).first().waitFor({timeout:15000});
  assert.equal((await api('/api/account/trips',{action:'duplicate',id:tripId})).status,200);trips=(await api('/api/account/trips')).json.trips;assert(trips.length>=2);
 });
 await scenario('adviser shares trip and anonymous traveller opens it',async()=>{assert(tripId);const r=await api('/api/account/trips',{action:'share',id:tripId});assert.equal(r.status,200,JSON.stringify(r.json));const trips=(await api('/api/account/trips')).json.trips;shared=trips.find(t=>t.id===tripId)?.shareId;assert(shared);const guest=await context(390);const p=await guest.newPage();const response=await p.goto(origin+'/i/'+shared+'/app');assert.equal(response.status(),200);assert(!/Please log in|SIGN IN OR CREATE AN ACCOUNT/.test(await p.locator('body').innerText()));await guest.close();});
 await scenario('second account cannot rename first account trip',async()=>{assert(tripId);const guest=await context(390);const r=await guest.request.post(origin+'/api/account/trips',{headers:{origin},data:{action:'rename',id:tripId,name:'Unauthorized'}});assert.equal(r.status(),401);await guest.close();});
 await scenario('revoke share and delete trip persist',async()=>{assert(tripId&&shared);assert.equal((await api('/api/account/trips',{action:'unshare',id:tripId})).status,200);const guest=await context(390);const r=await guest.request.get(origin+'/i/'+shared+'/app');assert(r.status()>=400||!/Saved Rome journey/.test(await r.text()));await guest.close();assert.equal((await api('/api/account/trips',{action:'delete',id:tripId})).status,200);assert(!(await api('/api/account/trips')).json.trips.some(t=>t.id===tripId));});
 await ctx.close();
}
await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('JOURNEY_REPORT_B64|'+brand+'|'+Buffer.from(JSON.stringify(report)).toString('base64'));console.log('JOURNEY_SUMMARY',JSON.stringify({brand,isolated,passed:report.scenarios.filter(s=>s.status==='passed').length,failed:report.scenarios.filter(s=>s.status==='failed').length,accessibility:report.accessibility.reduce((n,p)=>n+p.violations.length,0)}));
