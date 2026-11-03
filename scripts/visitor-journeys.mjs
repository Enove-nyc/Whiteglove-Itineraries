import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const isolated=process.env.AUDIT_ISOLATED==='1';
const brand=process.env.AUDIT_BRAND||'itineraries';
const origin=isolated?'http://127.0.0.1:3002':brand==='travel'?'https://www.whiteglovekoshertravel.com':'https://www.whitegloveitineraries.com';
if(isolated&&new URL(origin).hostname!=='127.0.0.1')throw Error('Fixture writes require loopback');
const out=`journey-results/${brand}-${isolated?'isolated':'live'}`;mkdirSync(out,{recursive:true});
const report={origin,brand,isolated,startedAt:new Date().toISOString(),scenarios:[],accessibility:[],errors:[],coverageNotes:isolated?['Disposable local Postgres and Redis; no provider credentials. Email verification fixture supplied directly; delivery and real payments untested.']:['Anonymous production browsing. Analytics suppressed with synthetic responses; non-read feature requests blocked. No account or customer-data writes.']};
const browser=await chromium.launch();
let page;
let fixtureClient=0;
function fixture(action,identity){
 if(!isolated)throw Error('Fixture setup requires isolation');
 return JSON.parse(execFileSync(process.execPath,['--import','tsx','scripts/invite-audit-fixture.ts',action],{encoding:'utf8',env:{...process.env,INVITE_AUDIT_IDENTITY:identity}}).trim());
}
async function adoptCookies(ctx,response){
 for(const m of (response.headers()['set-cookie']||'').matchAll(/(?:^|,\s*)([\w-]+)=([^;]*)/g))if(m[1].includes('white')||m[1].includes('wg'))await ctx.addCookies([{name:m[1],value:m[2],domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax',...(m[2]?{}:{expires:0})}]);
}
async function scenario(name,fn){try{await fn();report.scenarios.push({name,status:'passed'});}catch(e){const shot=name.replace(/[^a-z0-9]+/gi,'-')+'.jpg';const failureImage=await page?.screenshot({path:out+'/'+shot,fullPage:false,type:'jpeg',quality:65}).catch(()=>null);if(failureImage)console.log('SITE_PREVIEW_IMAGE|'+brand+'|'+shot+'|'+failureImage.toString('base64'));report.scenarios.push({name,status:'failed',error:String(e).slice(0,700),screenshot:shot});}console.log('JOURNEY',name,report.scenarios.at(-1).status);}
async function context(width){const clientIp='192.0.2.'+(++fixtureClient);const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,extraHTTPHeaders:{'x-wg-brand':brand==='itineraries'?'itineraries':'kosher',...(isolated?{'cf-connecting-ip':clientIp,'x-forwarded-for':clientIp}:{})}});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(req.url().startsWith(origin+'/api/analytics'))return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});if(isolated&&!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(!isolated&&!['GET','HEAD','OPTIONS'].includes(req.method()))return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Audit blocked this write"}'});return route.continue();});ctx.on('page',p=>p.on('pageerror',e=>report.errors.push({width,url:p.url(),error:String(e)})));return ctx;}
async function go(path){const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});assert(response.status()<400,path+' HTTP '+response.status());await page.waitForTimeout(800);await page.evaluate(()=>scrollTo(0,680));await page.waitForTimeout(150);const close=page.getByRole('dialog').getByRole('button',{name:/close/i});if(await close.isVisible().catch(()=>false))await close.click();else await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));}
async function scan(path,width){await page.waitForTimeout(350);const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();report.accessibility.push({path,width,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,5).map(n=>n.html)}))});}
for(const width of [1280,390]){
 const ctx=await context(width);page=await ctx.newPage();page.on('pageerror',e=>report.errors.push({width,url:page.url(),error:String(e)}));
 await scenario(`home audience and primary links ${width}`,async()=>{await go('/');if(brand==='itineraries'){await page.getByRole('radio',{name:'Planning my own trip'}).check({force:true});assert.match(await page.locator('main').first().innerText(),/trip/i);}assert(await page.locator('a[href="/sample-itinerary"]').count()>0||brand==='travel');assert.equal(await page.getByRole('complementary',{name:'Development status'}).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Demo ·|in development|not open for business/i);await scan('/',width);});

 if(brand==='travel'&&isolated)await scenario(`six real homepage photos load and carry immutable caching ${width}`,async()=>{await go('/');const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Featured',exact:true})});const photos=section.locator('img');assert.equal(await photos.count(),6);for(const img of await photos.all()){await img.scrollIntoViewIfNeeded();await img.evaluate(img=>img.decode());assert((await img.evaluate(img=>img.naturalWidth))>0);}const src=await photos.first().getAttribute('src');assert.match(src,/\/_next\/static\/media\//);const asset=await ctx.request.get(origin+src);assert.match(asset.headers()['cache-control']||'',/immutable/);await section.getByRole('link',{name:'Photo credits',exact:true}).click();await page.locator('#photography').waitFor();assert.equal(await page.locator('#photography a').count(),12);});
 if(width===390)await scenario('mobile menu opens and closes',async()=>{await go('/');const open=page.getByRole('button',{name:'Open menu',exact:true});await open.click();await page.locator('#mobile-menu').waitFor({state:'visible'});await scan('/?menu=open',width);await page.getByRole('button',{name:'Close menu',exact:true}).click();await page.locator('#mobile-menu').waitFor({state:'hidden'});});
 if(brand==='travel'&&!isolated)await scenario(`destination search ${width}`,async()=>{await go('/');const input=page.getByPlaceholder('Search destinations',{exact:true});await input.fill('Rome');await page.waitForTimeout(700);await input.press('Enter');await page.waitForURL(url=>url.pathname!=='/',{timeout:15000});assert.match(await page.locator('body').innerText(),/Rome/i);});
 await scenario(`sample itinerary switches all views ${width}`,async()=>{await go('/sample-itinerary');for(const [label,text] of [['In the app','Companion app.'],['Printed','Print layout.'],['On the site','Day-by-day itinerary.']]){await page.locator('label').filter({hasText:new RegExp('^'+label+'$')}).click();assert(await page.getByRole('radio',{name:label,exact:true}).isChecked());assert((await page.locator('main').first().innerText()).includes(text));}await scan('/sample-itinerary',width);});
 await scenario(`client app preview ${width}`,async()=>{await go('/app');await page.getByRole('link',{name:'Open a sample trip',exact:true}).click();await page.waitForURL('**/app/preview');await page.waitForTimeout(900);const text=await page.locator('body').innerText();assert(text.length>200);assert(!/application error/i.test(text));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const phone=page.locator('.wg-phone').first();const box=await phone.boundingBox();assert(box&&box.width<=width);const shot=await phone.screenshot({path:out+'/app-'+width+'.jpg',type:'jpeg',quality:65});console.log('SITE_PREVIEW_IMAGE|'+brand+'|app-'+width+'.jpg|'+shot.toString('base64'));});
 await scenario(`public login has no signup and password visibility works ${width}`,async()=>{await go('/login');assert.equal(await page.getByRole('button',{name:/sign up|create account/i}).count(),0);assert.equal(await page.getByRole('link',{name:/sign up|create account/i}).count(),0);await page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await page.locator('input[autocomplete="current-password"]').getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();await scan('/login',width);});
 await scenario(`join without an invitation offers login only ${width}`,async()=>{await go('/join');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:/create account/i}).count(),0);assert(await page.getByRole('link',{name:'Log in',exact:true}).count()>0);});
 await scenario(`booking tabs ${width}`,async()=>{await go('/book');for(const name of ['FLIGHTS','CARS','WHERE TO STAY']){await page.getByRole('button',{name:new RegExp('^'+name+'$','i')}).click();assert(await page.locator('input:visible').count()>0);}await scan('/book',width);});
 for(const path of ['/pricing','/packing','/offline'])await scenario(`accessibility ${path} ${width}`,async()=>{await go(path);await scan(path,width);});
 await go('/');await page.waitForTimeout(350);const homeImage=await page.screenshot({path:out+'/home-'+width+'.jpg',type:'jpeg',quality:60,fullPage:true});console.log('SITE_PREVIEW_IMAGE|'+brand+'|home-'+width+'.jpg|'+homeImage.toString('base64'));
 await ctx.close();
}
{
 const ctx=await context(320);page=await ctx.newPage();
 await scenario('narrow phone sample tabs remain reachable',async()=>{
  await go('/sample-itinerary');
  for(const label of ['In the app','Printed','On the site']){
   await page.locator('label').filter({hasText:new RegExp('^'+label+'$')}).click();
   assert(await page.getByRole('radio',{name:label,exact:true}).isChecked());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
 });
 await ctx.close();
}
if(isolated){
 const ctx=await context(1280);page=await ctx.newPage();
 const email='owner@audit.local',password='Audit-local-pass-1!';
 const api=async(path,body)=>{const r=await ctx.request.fetch(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},data:body});await adoptCookies(ctx,r);return {status:r.status(),json:await r.json()};};
 const redis=async(args)=>(await(await fetch('http://127.0.0.1:6380',{method:'POST',body:JSON.stringify(args)})).json()).result;
 const issue=async identity=>{
  if(brand==='itineraries')return fixture('invitation',identity);
  const result=await api('/api/admin/account-invitations',{action:'create',identity,brand:'kosher'});assert.equal(result.status,200,JSON.stringify(result.json));const link=new URL(result.json.link);assert.equal(link.pathname,'/join');assert.equal(link.search,'');return {token:new URLSearchParams(link.hash.slice(1)).get('invite'),id:result.json.invitation.id};
 };
 const verifyFixture=async identity=>{const key='white-glove:account:'+identity,record=JSON.parse(await redis(['GET',key]));assert(record);record.verifiedAt=new Date().toISOString();delete record.verificationCodeHash;delete record.verificationCodeExpiresAt;await redis(['SET',key,JSON.stringify(record)]);};
 await scenario('pricing uses normal product language with no public purchase',async()=>{await go('/pricing');const text=await page.locator('body').innerText();assert.match(text,/by invitation/);assert.doesNotMatch(text,/in development|not open for business/i);assert.match(text,/Trip Pass/);assert.equal(await page.getByRole('button',{name:/buy|subscribe|checkout/i}).count(),0);});
 await scenario('public registration API is closed without an invitation',async()=>{const result=await api('/api/account/register',{email:'uninvited@audit.local',password,name:'Not invited'});assert.equal(result.status,403);assert.equal(await redis(['GET','white-glove:account:uninvited@audit.local']),null);});
 await scenario('existing owner logs in through the public customer form',async()=>{
  fixture('owner',email);await verifyFixture(email);
  await go('/login?next=%2Fitinerary');await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('Your password').fill(password);const response=page.waitForResponse(r=>r.url().endsWith('/api/account/login'));await page.locator('button[type="submit"]').click();const logged=await response;assert.equal(logged.status(),200,await logged.text());await adoptCookies(ctx,logged);
  if(brand==='travel'){const admin=await api('/api/admin/session',{});assert.equal(admin.status,200,JSON.stringify(admin.json));}
 });
 await scenario('invited traveller creates an account then logs in on a phone',async()=>{
  const invited='invited-member@audit.local',invitation=await issue(invited),guest=await context(390),ownerPage=page;page=await guest.newPage();
  try{
   await go('/join#invite='+invitation.token);await page.getByRole('button',{name:'Create account',exact:true}).waitFor({timeout:15000});
   assert.equal(new URL(page.url()).hash,'');assert.equal(await page.getByPlaceholder('you@example.com').inputValue(),invited);assert(await page.getByPlaceholder('you@example.com').getAttribute('readonly')!==null);
   await page.locator('input[name="new-account-name"]').fill('Invited member');await page.getByPlaceholder('Choose a password').fill(password);await page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await page.locator('input[autocomplete="new-password"]').getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();await page.getByRole('checkbox').check();await page.getByPlaceholder('Choose a password').fill('short');await page.getByRole('button',{name:'Create account',exact:true}).click();if(await page.getByPlaceholder('Choose a password').getAttribute('minlength'))assert.equal(await page.getByPlaceholder('Choose a password').evaluate(input=>input.checkValidity()),false);else await page.getByText('Choose a password with at least 8 characters.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Create account',exact:true}).isEnabled());await page.getByPlaceholder('Choose a password').fill(password);await scan('/join-invited',390);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/account/register'));await page.getByRole('button',{name:'Create account',exact:true}).click();const registered=await response;assert.equal(registered.status(),200,await registered.text());
   const duplicate=await guest.request.post(origin+'/api/account/register',{headers:{origin},data:{email:invited,password,invitationToken:invitation.token}});assert.equal(duplicate.status(),403);
   await verifyFixture(invited);await go('/login');await page.getByPlaceholder('you@example.com').fill(invited);await page.getByPlaceholder('Your password').fill(password);const login=page.waitForResponse(r=>r.url().endsWith('/api/account/login'));await page.getByRole('button',{name:'Log in',exact:true}).click();const logged=await login;assert.equal(logged.status(),200,await logged.text());await adoptCookies(guest,logged);const me=await guest.request.get(origin+'/api/account/me');assert((await me.json()).signedIn);
  }finally{await guest.close();page=ownerPage;}
 });
 if(brand==='travel')await scenario('owner creates and revokes an invitation through the account panel',async()=>{
  await go('/admin/accounts');const panel=page.locator('section[aria-labelledby="account-invitations-heading"]');await panel.getByLabel('Email or phone number',{exact:true}).fill('revoked@audit.local');await panel.getByLabel('Invitation website',{exact:true}).selectOption('itineraries');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/account-invitations')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Generate invitation link',exact:true}).click();const created=await response;assert.equal(created.status(),200,await created.text());const data=await created.json();const link=new URL(await panel.getByLabel('Invitation link',{exact:true}).inputValue());assert.equal(link.origin,'https://www.whitegloveitineraries.com');assert.equal(link.search,'');const token=new URLSearchParams(link.hash.slice(1)).get('invite');assert(token);
  const revoked=page.waitForResponse(r=>r.url().endsWith('/api/admin/account-invitations')&&r.request().method()==='POST'&&r.request().postDataJSON().action==='revoke');await panel.getByRole('button',{name:/Revoke invitation for revoked@audit.local/}).click();assert.equal((await revoked).status(),200);
  const guest=await context(390),ownerPage=page;page=await guest.newPage();try{await go('/join#invite='+token);await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).count(),0);assert.equal(await redis(['GET','white-glove:account:revoked@audit.local']),null);}finally{await guest.close();page=ownerPage;}
  const denied=await ctx.request.post(origin+'/api/admin/account-invitations',{headers:{origin:'https://other.example'},data:{action:'create',identity:'csrf@audit.local',brand:'kosher'}});assert.equal(denied.status(),403);
 });
 if(brand==='travel')await scenario('another admin cannot issue invitations by removing their who cookie',async()=>{
  const other='limited-admin@audit.local',invitation=await issue(other),guest=await context(390);const previousTeam=await redis(['GET','white-glove:team']);
  try{
   const registered=await guest.request.post(origin+'/api/account/register',{headers:{origin},data:{email:other,password,invitationToken:invitation.token}});assert.equal(registered.status(),200);await verifyFixture(other);await redis(['SET','white-glove:team',JSON.stringify([{email:other,admin:true,siteAccess:false,areas:['access']}])]);
   const login=await guest.request.post(origin+'/api/account/login',{headers:{origin},data:{email:other,password}});assert.equal(login.status(),200);await adoptCookies(guest,login);const opened=await guest.request.post(origin+'/api/admin/session',{headers:{origin},data:{}});assert.equal(opened.status(),200);await adoptCookies(guest,opened);
   assert.equal((await guest.request.get(origin+'/api/admin/account-invitations')).status(),403);await guest.clearCookies({name:'white_glove_admin_who'});
   const refused=await guest.request.post(origin+'/api/admin/account-invitations',{headers:{origin},data:{action:'create',identity:'forbidden@audit.local',brand:'kosher'}});assert.equal(refused.status(),403);
  }finally{if(previousTeam===null)await redis(['DEL','white-glove:team']);else await redis(['SET','white-glove:team',previousTeam]);await guest.close();}
 });

 await scenario('new purchases stay closed even with a stored open offering',async()=>{await redis(['SET','white-glove:plan-offering',JSON.stringify({open:true,how:'stripe',plans:{one_trip:true,starter:true,pro:true},pricing:{one_trip:{monthlyPriceId:'price_fixture',yearlyPriceId:'',askingLine:''},starter:{monthlyPriceId:'price_starter',yearlyPriceId:'',askingLine:''},pro:{monthlyPriceId:'price_pro',yearlyPriceId:'',askingLine:''}}})]);const r=await api('/api/account/billing/checkout',{plan:'one_trip',period:'monthly'});assert.equal(r.status,409,JSON.stringify(r.json));assert.match(r.json.error,/purchases.*not available/i);await redis(['DEL','white-glove:plan-offering']);});
 let tripId,shared;
 await scenario('trip create rename reload and duplicate persistence',async()=>{
  const made=await api('/api/account/trips',{action:'create',name:'Visitor test Rome'});assert.equal(made.status,200,JSON.stringify(made.json));let trips=(await api('/api/account/trips')).json.trips;tripId=trips.find(t=>t.name==='Visitor test Rome')?.id;assert(tripId);
  assert.equal((await api('/api/account/trips',{action:'rename',id:tripId,name:'Saved Rome journey'})).status,200);
  await go('/itinerary');assert(!(new URL(page.url()).pathname==='/login'));await page.getByText('Saved Rome journey',{exact:true}).first().waitFor({timeout:15000});
  assert.equal((await api('/api/account/trips',{action:'duplicate',id:tripId})).status,200);trips=(await api('/api/account/trips')).json.trips;assert(trips.length>=2);
 });
 await scenario('adviser shares trip and anonymous traveller opens it',async()=>{assert(tripId);const r=await api('/api/account/trips',{action:'share',id:tripId});assert.equal(r.status,200,JSON.stringify(r.json));const trips=(await api('/api/account/trips')).json.trips;shared=trips.find(t=>t.id===tripId)?.shareId;assert(shared);const guest=await context(390);const p=await guest.newPage();const response=await p.goto(origin+'/i/'+shared+'/app');assert.equal(response.status(),200);assert(!/Please log in|SIGN IN OR CREATE AN ACCOUNT/.test(await p.locator('body').innerText()));await guest.close();});
 await scenario('different signed-in account cannot rename owner trip',async()=>{assert(tripId);const guest=await context(390);const other='other@audit.local',invitation=await issue(other);const registered=await guest.request.post(origin+'/api/account/register',{headers:{origin},data:{email:other,password,name:'Other user',invitationToken:invitation.token}});assert.equal(registered.status(),200);const key='white-glove:account:'+other;const record=JSON.parse(await redis(['GET',key]));record.verifiedAt=new Date().toISOString();await redis(['SET',key,JSON.stringify(record)]);const logged=await guest.request.post(origin+'/api/account/login',{headers:{origin},data:{email:other,password}});assert.equal(logged.status(),200);const cookies=logged.headers()['set-cookie']||'';for(const m of cookies.matchAll(/(?:^|,\s*)([\w-]+)=([^;]+)/g)){if(m[1].includes('white')||m[1].includes('wg'))await guest.addCookies([{name:m[1],value:m[2],domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}]);}const r=await guest.request.post(origin+'/api/account/trips',{headers:{origin},data:{action:'rename',id:tripId,name:'Unauthorized'}});assert(r.status()>=400);assert((await api('/api/account/trips')).json.trips.some(t=>t.id===tripId&&t.name==='Saved Rome journey'));await guest.close();});
 await scenario('revoke share and delete trip persist',async()=>{assert(tripId&&shared);assert.equal((await api('/api/account/trips',{action:'unshare',id:tripId})).status,200);const guest=await context(390);const r=await guest.request.get(origin+'/i/'+shared+'/app');assert(r.status()>=400||!/Saved Rome journey/.test(await r.text()));await guest.close();assert.equal((await api('/api/account/trips',{action:'delete',id:tripId})).status,200);assert(!(await api('/api/account/trips')).json.trips.some(t=>t.id===tripId));});
 await scenario('owner account and adviser screens load without server error',async()=>{for(const path of (brand==='travel'?['/account','/app','/agency','/clients','/payments','/pipeline','/forms','/library','/itinerary','/proposal','/command-center']:['/account','/app','/advisor','/agency','/clients','/payments','/pipeline','/forms','/library','/itinerary','/history','/proposal','/command-center'])){await go(path);assert(!new URL(page.url()).pathname.startsWith('/login'),path+' redirected to login');assert(!/application error|internal server error/i.test(await page.title()),path);}});
 if(brand==='itineraries')await scenario('duplicate admin API stays closed on Itineraries',async()=>{const r=await ctx.request.post(origin+'/api/admin/session',{headers:{origin},data:{}});assert.equal(r.status(),404);const entry=await ctx.request.get(origin+'/admin',{maxRedirects:0});assert.equal(entry.status(),307);assert.equal(new URL(entry.headers().location).hostname,'www.whiteglovekoshertravel.com');});
 else await scenario('owner admin screens are reachable',async()=>{const opened=await api('/api/admin/session',{});assert.equal(opened.status,200,JSON.stringify(opened.json));for(const path of ['/admin','/admin/accounts','/admin/data-health','/admin/messages','/admin/content','/admin/pages','/admin/settings','/admin/settings/plans','/admin/settings/connections','/admin/settings/website','/admin/reports','/admin/finances']){await go(path);assert(!new URL(page.url()).pathname.endsWith('/login'),path+' redirected to login');}});
 if(brand==='travel') await scenario('ordinary traveller builds saves edits and prints on a phone',async()=>{
  const guest=await context(390), ownerPage=page;page=await guest.newPage();
  try {
   const email='traveller@audit.local',invitation=await issue(email);
   assert.equal((await guest.request.post(origin+'/api/account/register',{headers:{origin},data:{email,password,name:'Traveller',invitationToken:invitation.token}})).status(),200);
   const key='white-glove:account:'+email,record=JSON.parse(await redis(['GET',key]));record.verifiedAt=new Date().toISOString();await redis(['SET',key,JSON.stringify(record)]);
   const login=await guest.request.post(origin+'/api/account/login',{headers:{origin},data:{email,password}});assert.equal(login.status(),200);
   for(const m of (login.headers()['set-cookie']||'').matchAll(/(?:^|,\s*)([\w-]+)=([^;]+)/g))if(m[1].includes('white')||m[1].includes('wg'))await guest.addCookies([{name:m[1],value:m[2],domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}]);
   const itinerary={title:'Independent Rome trip',travelerName:'',travelers:[],startDate:'2026-12-01',endDate:'2026-12-03',flights:[],lodging:[],activities:[{id:'walk',name:'Morning walk in Rome',date:'2026-12-01',startTime:'09:00',durationMins:60}],notes:''};
   const saved=await guest.request.post(origin+'/api/account/itinerary',{headers:{origin},data:{itinerary}});assert.equal(saved.status(),200,await saved.text());
   await go('/itinerary');
   assert.equal(await page.locator('a[href*="whitegloveitineraries.com"]').count(),0);
   await page.locator('summary').filter({hasText:/Trip details/}).first().click();
   const response=page.waitForResponse(r=>r.url().endsWith('/api/account/itinerary')&&r.request().method()==='POST');
   await page.getByLabel('Your notes').fill('Meet at the hotel lobby at 08:45.');assert.equal((await response).status(),200);
   await page.reload();await page.waitForTimeout(800);
   await page.locator('summary').filter({hasText:/Trip details/}).first().click();
   assert.equal(await page.getByLabel('Your notes').inputValue(),'Meet at the hotel lobby at 08:45.');
   const persisted=await guest.request.get(origin+'/api/account/itinerary');const data=await persisted.json();assert.equal(data.itinerary.activities[0].name,'Morning walk in Rome');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const screenshot=await page.screenshot({path:out+'/planner-390.jpg',type:'jpeg',quality:60,fullPage:true});console.log('SITE_PREVIEW_IMAGE|'+brand+'|planner-390.jpg|'+screenshot.toString('base64'));
   const printPage=await guest.newPage();const print=await printPage.goto(origin+'/itinerary/print');assert.equal(print.status(),200);await printPage.getByText('Morning walk in Rome',{exact:true}).first().waitFor({timeout:15000});await printPage.close();
  }finally{await guest.close();page=ownerPage;}
 });
 await scenario('logout invalidates account session',async()=>{assert.equal((await api('/api/account/logout',{})).status,200);const me=await api('/api/account/me');assert(!me.json.signedIn&&!me.json.account?.email);});
 await ctx.close();
}
await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('JOURNEY_REPORT_B64|'+brand+'|'+Buffer.from(JSON.stringify(report)).toString('base64'));console.log('JOURNEY_SUMMARY',JSON.stringify({brand,isolated,passed:report.scenarios.filter(s=>s.status==='passed').length,failed:report.scenarios.filter(s=>s.status==='failed').length,accessibility:report.accessibility.reduce((n,p)=>n+p.violations.length,0)}));

if(isolated && (report.errors.length || report.scenarios.some(s=>s.status==='failed') || report.accessibility.some(p=>p.violations.some(v=>v.impact==='serious'||v.impact==='critical')))) process.exitCode=1;



