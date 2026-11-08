import { scheduleFor, candidatesFrom } from './lookup.js';
const $ = id => document.getElementById(id);
const input = $('address'), list = $('suggestions'), status = $('search-status'), submit = $('search-button');
const initialCards = $('cards').innerHTML;
let options = [], active = -1, timer, controller, generation = 0, selecting = 0;
const shards = new Map();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = kind => kind === 'gas' ? '<path d="M5 21V5h14v16M3 21h18M9 5V2h6v3M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2"/>' : '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>';
function top(kind) {return `<div class="card-top"><span class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icon(kind)}</svg></span><span class="category">${kind==='gas'?'GAS PIPING':'WATER PROTECTION'}</span><span class="tag">${kind==='gas'?'Local Law 152':'Backflow testing'}</span></div>`;}
function field(label, value) {return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;}
function closeList() {list.hidden = true; input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant'); active=-1;}
function resetResults() {
  selecting++;
  $('cards').innerHTML=initialCards;$('property-summary').hidden=true;$('share-button').hidden=true;
  $('section-title').textContent='Two requirements. One clear view.';$('section-description').textContent='Official city information, with the details that matter.';$('results-eyebrow').textContent='KNOW YOUR PROPERTY';
  if(location.search)history.replaceState(null,'',location.pathname);
}
function showOptions(items) {
  options=items;active=-1;
  list.innerHTML=items.map((p,i)=>`<li id="option-${i}" role="option" aria-selected="false" data-index="${i}">${esc(p.address)}<small>${esc(p.borough)}${p.zip ? ' · '+esc(p.zip):''} · BIN ${esc(p.bin)}</small></li>`).join('');
  list.hidden=!items.length;input.setAttribute('aria-expanded',String(!!items.length));
}
async function search() {
  clearTimeout(timer);controller?.abort();const ticket=++generation;
  const q=input.value.trim();
  closeList();options=[];
  if(q.length<4){status.textContent=q?'Enter at least 4 characters to search.':'Enter an NYC address to begin.';return;}
  if(/^[1-5]\d{6}$/.test(q)){await selectProperty({bin:q,address:'BIN '+q,borough:'New York City'});return;}
  controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  status.textContent='Finding matching NYC properties…';
  try {
    const r=await fetch('https://geosearch.planninglabs.nyc/v2/search?'+new URLSearchParams({text:q,size:'10'}),{signal:controller.signal});
    if(!r.ok)throw new Error('Address service unavailable');
    const data=await r.json();if(ticket!==generation)return;
    const items=candidatesFrom(data);showOptions(items);
    status.textContent=items.length?'Select your building from the matches above.':'No matching building found. Include the borough, or enter a 7-digit building identification number (BIN).';
  }catch(e){if(ticket===generation)status.textContent='NYC address search is temporarily unavailable. Try again, enter a 7-digit BIN, or use the example address below.';}
  finally{clearTimeout(timeout);}
}
async function readRecord(bin) {
  const key=bin.slice(0,3);
  if(!shards.has(key)) {
    const r=await fetch(`data/${key}.json`,{signal:AbortSignal.timeout(12000)});
    if(r.status===404)return null;
    if(!r.ok)throw new Error('Data unavailable');
    const data=await r.json();if(!data || Array.isArray(data))throw new Error('Invalid data');shards.set(key,data);
  }
  return shards.get(key)[bin] || null;
}
async function selectProperty(p) {
  clearTimeout(timer);controller?.abort();generation++;const ticket=++selecting;
  closeList();status.textContent='Looking up the city property record…';submit.disabled=true;
  input.value=p.address==='BIN '+p.bin?p.bin:p.address+', '+p.borough;
  try {
    const r=await readRecord(p.bin);if(ticket!==selecting)return;
    const address=r ? `${r[0]} ${r[1]}`:p.address;
    $('section-title').textContent=address;$('section-description').textContent=(r?r[3]:p.borough)+(r?.[2]?' · '+r[2]:'');
    $('results-eyebrow').textContent='YOUR PROPERTY OVERVIEW';
    const summary=$('property-summary');summary.hidden=false;
    summary.innerHTML=`<span>BUILDING ID<strong>${esc(p.bin)}</strong></span>`+(r?`<span>COMMUNITY DISTRICT<strong>${esc(r[8])}</strong></span><span>BUILDING CLASS<strong>${esc(r[6])}</strong></span>`:'')+`<span>DATA UPDATED<strong>JUL 27, 2026</strong></span>`;
    let gas;
    if(r) {
      const schedule=scheduleFor(r);
      gas=`${top('gas')}<span class="result-status">On NYC’s covered-property list</span><h3 class="result-title">${schedule?.currentYear?'Scheduled this year':'Next scheduled window'}</h3><p class="result-description">${schedule ? 'Published inspection schedule for this building’s community district.':'The city record does not provide a readable deadline for this building.'}</p><dl class="result-fields">${field('Scheduled deadline',schedule?.deadline||'Not available')}${field('Inspection sub-cycle',r[9])}${field('Published Cycle 2 deadline',r[10])}${field('Inspection / filing status','Not verified')}</dl><div class="result-note">This is a scheduled deadline, not confirmation that a test is outstanding. Completed filings, extensions, no-gas certifications and new-building deferrals are not verified here.</div><a class="result-source" href="https://www.nyc.gov/site/buildings/property-or-business-owner/gas-piping-inspections.page" target="_blank" rel="noopener noreferrer">Source: NYC Department of Buildings ↗</a>`;
    } else {
      gas=`${top('gas')}<span class="result-status neutral">No matching covered-property record</span><h3 class="result-title">Coverage not confirmed</h3><p class="result-description">This building’s BIN was not found in the July 27, 2026 city covered-property list.</p><dl class="result-fields">${field('Scheduled deadline','Not confirmed')}${field('Inspection / filing status','Not verified')}</dl><div class="result-note">An absent record does not establish an exemption or confirm compliance. The list may not reflect recent property changes or every building on the same lot.</div><a class="result-source" href="https://www.nyc.gov/site/buildings/property-or-business-owner/gas-piping-inspections.page" target="_blank" rel="noopener noreferrer">Source: NYC Department of Buildings ↗</a>`;
    }
    const water=`${top('water')}<span class="result-status neutral">Property test history unavailable</span><h3 class="result-title">Annual testing requirement</h3><p class="result-description">DEP requires installed backflow prevention devices to be tested every 12 months after installation and initial testing.</p><dl class="result-fields">${field('Testing frequency','Every 12 months')}${field('Device presence','Not verified')}${field('Last test date','Not available')}${field('Exact property due date','Not confirmed')}</dl><div class="result-note">No public citywide device test-history source has been identified for this lookup. Building type alone does not establish device presence or a due date. Properties can have multiple devices.</div><a class="result-source" href="https://www.nyc.gov/site/dep/about/cross-connection-controls.page" target="_blank" rel="noopener noreferrer">Source: NYC Environmental Protection ↗</a>`;
    $('cards').innerHTML=`<article class="service-card">${gas}</article><article class="service-card">${water}</article>`;
    const url=new URL(location.href);url.search='';url.searchParams.set('bin',p.bin);history.replaceState(null,'',url);
    $('share-button').hidden=false;status.textContent='Property record ready. See the overview below.';
    $('property-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }catch(e){if(ticket===selecting)status.textContent='We couldn’t load the property data. Please try again. No compliance status has been determined.';}
  finally{submit.disabled=false;}
}
input.addEventListener('input',()=>{controller?.abort();generation++;resetResults();closeList();options=[];status.textContent='';clearTimeout(timer);if(input.value.trim().length>=4)timer=setTimeout(search,400);});
$('search-form').addEventListener('submit',e=>{e.preventDefault();if(active>=0&&options[active]&&!list.hidden)selectProperty(options[active]);else search();});
input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeList();return;}
  if(list.hidden||!options.length)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
    [...list.children].forEach((li,i)=>li.setAttribute('aria-selected',String(i===active)));
    input.setAttribute('aria-activedescendant','option-'+active);list.children[active].scrollIntoView({block:'nearest'});
  }
});
list.addEventListener('click',e=>{const li=e.target.closest('[data-index]');if(li)selectProperty(options[Number(li.dataset.index)]);});
document.addEventListener('click',e=>{if(!e.target.closest('.search-box'))closeList();});
$('example-button').addEventListener('click',()=>selectProperty({bin:'1001026',address:'120 Broadway',borough:'Manhattan'}));
$('share-button').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(location.href);$('share-button').textContent='Link copied ✓';setTimeout(()=>{$('share-button').textContent='Copy result link ↗';},2200);}
  catch{status.textContent='To share this property, copy the link from your browser’s address bar.';input.focus();}
});
window.addEventListener('pageshow',()=>{submit.disabled=false;});
const bin=new URLSearchParams(location.search).get('bin');
if(bin&&/^[1-5]\d{6}$/.test(bin))selectProperty({bin,address:'BIN '+bin,borough:'New York City'});
