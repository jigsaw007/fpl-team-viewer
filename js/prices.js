/* ============ PRICE WATCH + PRICE CHANGE ESTIMATE ============ */
let _prMode="season";
let _ppRisePage=1,_ppFallPage=1,_ppRows=null,_ppTimer=null;
const PP_PAGE_SIZE=10;

async function initPrices(){
  await loadBoot();
  const mode=$("prMode");
  if(mode&&!mode.dataset.bound){
    mode.dataset.bound="1";
    mode.addEventListener("click",e=>{
      const x=e.target.closest("button");if(!x)return;
      mode.querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
      _prMode=x.dataset.m;drawPrices();
    });
  }
  drawPrices();
}

function pricePlayerRow(e,dir,main,sub){
  const b=boot,t=b.teams.find(z=>z.id===e.team)||{};
  return `<div class="pr-row"><div class="pr-player">${teamKitImg(t,"pr-kit",`${t.name||"Club"} kit`)}<div class="l">
    <div class="nm">${esc(e.web_name)}</div>
    <div class="mt">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}${sub?` · ${sub}`:""}</div>
  </div></div><div class="pc ${dir||""}">${main}</div></div>`;
}

function priceMarketEvent(){
  const events=boot.events||[];
  const next=events.find(e=>e.is_next);
  if(next)return next;
  const unfinished=events.find(e=>!e.finished&&!e.data_checked);
  if(unfinished)return unfinished;
  return events.find(e=>e.is_current)||events[events.length-1]||{};
}
function pricePreviousEvent(){
  const target=Number(priceMarketEvent().id)||1;
  return (boot.events||[]).filter(e=>Number(e.id)<target&&(e.finished||e.data_checked)).sort((a,b)=>Number(b.id)-Number(a.id))[0]||null;
}

function drawPrices(){
  const b=boot;
  const started=seasonStarted();
  const field=_prMode==="season"?"cost_change_start":"cost_change_event";
  const withChange=(b.elements||[]).filter(e=>Number(e[field]||0)!==0);
  const risers=withChange.filter(e=>Number(e[field])>0).sort((a,c)=>Number(c[field])-Number(a[field])||Number(c.transfers_in_event||0)-Number(a.transfers_in_event||0)).slice(0,25);
  const fallers=withChange.filter(e=>Number(e[field])<0).sort((a,c)=>Number(a[field])-Number(c[field])||Number(c.transfers_out_event||0)-Number(a.transfers_out_event||0)).slice(0,25);
  const label=_prMode==="season"?"since season start":"this Gameweek";
  const changeText=e=>{const ch=Number(e[field]||0)/10;return `${ch>0?"+":""}£${ch.toFixed(1)}m`;};

  const status=$("prStatus");
  if(status){
    const marketEvent=priceMarketEvent();
    const marketGw=Number(marketEvent.id)||1;
    const prevEvent=pricePreviousEvent();
    const modeLabel=_prMode==="season"?"Season movement":`GW${marketGw} movement`;
    if(!started){
      status.innerHTML=`<div class="price-status-card compact"><div><small>MARKET STATUS</small><b>Waiting for the season to start</b></div><span class="price-status-pill">PRE-SEASON</span></div>`;
    }else if(!withChange.length){
      status.innerHTML=`<div class="price-status-card compact live"><div><small>MARKET STATUS</small><b>No official price changes yet</b></div><span class="price-status-pill">GW${marketGw} MARKET</span></div>`;
    }else{
      status.innerHTML=`<div class="price-status-card compact live"><div><small>${modeLabel.toUpperCase()}</small><b>${withChange.length} official price change${withChange.length===1?"":"s"}</b></div><span class="price-status-pill">${prevEvent?`AFTER GW${prevEvent.id}`:`GW${marketGw}`}</span></div>`;
    }
  }

  $("prUp").innerHTML=risers.length?risers.map(e=>pricePlayerRow(e,"up",changeText(e),`${Number(e.transfers_in_event||0).toLocaleString()} in GW`)).join(""):`<div class="price-empty compact"><b>No official risers yet</b><small>Waiting for FPL's next price update.</small></div>`;
  $("prDown").innerHTML=fallers.length?fallers.map(e=>pricePlayerRow(e,"down",changeText(e),`${Number(e.transfers_out_event||0).toLocaleString()} out GW`)).join(""):`<div class="price-empty compact"><b>No official fallers yet</b><small>Waiting for FPL's next price update.</small></div>`;

  const elements=(b.elements||[]).filter(e=>e.status!=="u");
  const incoming=[...elements].filter(e=>Number(e.transfers_in_event||0)>0).sort((a,c)=>Number(c.transfers_in_event||0)-Number(a.transfers_in_event||0)).slice(0,12);
  const outgoing=[...elements].filter(e=>Number(e.transfers_out_event||0)>0).sort((a,c)=>Number(c.transfers_out_event||0)-Number(a.transfers_out_event||0)).slice(0,12);
  const net=e=>Number(e.transfers_in_event||0)-Number(e.transfers_out_event||0);
  $("prIn").innerHTML=incoming.length?incoming.map(e=>pricePlayerRow(e,"up",`+${Number(e.transfers_in_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-in data yet.</b></div>`;
  $("prOut").innerHTML=outgoing.length?outgoing.map(e=>pricePlayerRow(e,"down",`−${Number(e.transfers_out_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-out data yet.</b></div>`;
}

/*
 * FPL Peek estimated price-change progress.
 * This is deliberately a transparent heuristic, not an official FPL probability.
 * Rise: valid positive net transfers vs a season-adjusted absolute threshold.
 * Fall: valid negative net transfers vs an ownership-based threshold, adjusted by availability.
 */
function ppClamp(v,min=0,max=Infinity){return Math.max(min,Math.min(max,v));}
function ppCurrentEvent(){
  const evs=boot.events||[];
  return evs.find(e=>e.is_current)||evs.find(e=>e.is_next)||evs.find(e=>e.id===1)||{};
}
function ppEstimatedValidFactor(e){
  // We cannot see which public transfers came from Wildcard/Free Hit teams.
  // Use a conservative deduction rather than pretending all transfers count.
  const gw=Number(ppCurrentEvent().id)||1;
  const status=String(e.status||"a");
  let factor=gw<=3?.92:gw<=8?.88:gw<=20?.84:.80;
  if(status==="i"||status==="s"||status==="u") factor-=.03;
  return ppClamp(factor,.72,.94);
}
function ppRiseThreshold(){
  const total=Math.max(1,Number(boot.total_players)||1);
  const gw=Math.max(1,Number(ppCurrentEvent().id)||1);
  // Around 1.85% of active managers early in the season, gradually lower later.
  const seasonDecay=Math.max(.66,1-(gw-1)*.0105);
  return Math.max(50000,total*.0185*seasonDecay);
}
function ppFallThreshold(e){
  const total=Math.max(1,Number(boot.total_players)||1);
  const ownPct=Math.max(.1,Number(e.selected_by_percent)||0);
  const owners=Math.max(3500,total*(ownPct/100));
  const status=String(e.status||"a");
  // Calibrated against the official 2026/27 FPL Price Change Predictor.
  // The earlier fallback made fall pressure roughly 7-8x too strong (for example
  // Pedro Porro appeared near -100% while official FPL showed roughly -14%).
  // Falling thresholds are therefore much wider than rising thresholds.
  let pct=.75;
  if(status==="d") pct=.64;
  else if(status==="i"||status==="s"||status==="u") pct=.45;
  return Math.max(9000,owners*pct);
}
function ppProgress(e,direction){
  const tin=Number(e.transfers_in_event)||0,tout=Number(e.transfers_out_event)||0;
  const net=tin-tout;
  const validFactor=ppEstimatedValidFactor(e);
  const validNet=Math.abs(net)*validFactor;
  let threshold=direction==="rise"?ppRiseThreshold():ppFallThreshold(e);
  let progress=threshold>0?(validNet/threshold)*100:0;

  // A previous same-direction move this GW normally means the next move is harder.
  const moved=Number(e.cost_change_event)||0;
  const sameMove=(direction==="rise"&&moved>0)||(direction==="fall"&&moved<0);
  if(sameMove) progress*=.72;

  if(direction==="rise"&&net<=0) progress=0;
  if(direction==="fall"&&net>=0) progress=0;
  progress=ppClamp(progress,0,250);
  return {progress,tin,tout,net,validNet,threshold,validFactor,ownPct:Math.max(.1,Number(e.selected_by_percent)||0),moved,direction};
}
function ppProgressLabel(progress,direction){
  const rise=direction==="rise";
  if(progress>=100)return rise?"Very Likely to Rise":"Very Likely to Drop";
  if(progress>=70)return rise?"Likely to Rise":"Likely to Drop";
  return "Unlikely to change";
}

/*
 * FPL's 2026/27 site now exposes a Price Change Predictor. The exact API field
 * is not part of the long-standing bootstrap schema, so prefer an official
 * value whenever FPL adds one to the player payload and otherwise fall back to
 * FPL Peek's transparent transfer/ownership estimate.
 */
function ppOfficialSignal(e){
  const candidates=[
    e.price_change_progress,
    e.price_change_predicted_progress,
    e.predicted_price_change_progress,
    e.price_change_prediction_progress,
    e.price_change_prediction
  ];
  for(const raw of candidates){
    if(raw===null||raw===undefined||raw==="")continue;
    if(typeof raw==="number"&&Number.isFinite(raw))return {progress:raw,official:true};
    if(typeof raw==="string"&&raw.trim()!==""&&Number.isFinite(Number(raw)))return {progress:Number(raw),official:true};
    if(typeof raw==="object"){
      const val=raw.predicted_progress ?? raw.progress ?? raw.current_progress ?? raw.percentage;
      if(Number.isFinite(Number(val)))return {progress:Number(val),official:true,status:raw.status||raw.label||""};
    }
  }
  return null;
}
function ppBuildRows(){
  const players=(boot.elements||[]).filter(e=>e&&e.id&&e.status!=="u");
  const rises=[],falls=[];
  players.forEach(e=>{
    const r=ppProgress(e,"rise"),f=ppProgress(e,"fall");
    const official=ppOfficialSignal(e);
    if(official){
      const raw=Number(official.progress)||0;
      const status=String(official.status||"").toLowerCase();
      const isFall=raw<0||/drop|fall/.test(status);
      const isRise=raw>0||/rise/.test(status);
      if(isFall)falls.push({e,...f,official,displayProgress:Math.abs(raw)});
      else if(isRise)rises.push({e,...r,official,displayProgress:Math.abs(raw)});
      else if(r.net>0)rises.push({e,...r,official,displayProgress:Math.abs(raw)});
      else if(f.net<0)falls.push({e,...f,official,displayProgress:Math.abs(raw)});
      return;
    }
    if(r.net>0&&r.tin>0) rises.push({e,...r,displayProgress:r.progress});
    if(f.net<0&&f.tout>0) falls.push({e,...f,displayProgress:f.progress});
  });
  rises.sort((a,b)=>b.displayProgress-a.displayProgress||b.net-a.net||b.tin-a.tin);
  falls.sort((a,b)=>b.displayProgress-a.displayProgress||a.net-b.net||b.tout-a.tout);
  return {rises,falls};
}
function ppPlayerRow(x){
  const e=x.e,t=(boot.teams||[]).find(z=>z.id===e.team)||{};
  const rise=x.direction==="rise";
  const official=x.official||ppOfficialSignal(e);
  const rawProgress=official?Number(official.progress):Number(x.progress);
  const progress=Math.abs(rawProgress);
  const signedProgress=(rise?"+":"−")+progress.toFixed(1)+"%";
  const label=ppProgressLabel(progress,x.direction);
  const trend=rise?"Up":"Down";
  const trendArrow=rise?"↗":"↘";
  const statusClass=label.toLowerCase().replace(/\s+/g,"-");
  return `<article class="pressure-row official-style ${x.direction}">
    <div class="pressure-player">${teamKitImg(t,"pressure-kit",`${t.name||"Club"} kit`)}<div><b>${esc(e.web_name)}</b><small>${POS[e.element_type]} ${money(e.now_cost)}</small></div></div>
    <div class="pp-status-cell"><span class="pp-status-badge ${statusClass}">${esc(label)}</span></div>
    <div class="pp-progress-cell"><b class="pp-progress-number">${signedProgress}</b><div class="pp-progress-track"><span style="width:${Math.min(progress,100).toFixed(1)}%"></span></div></div>
    <div class="pp-trend-cell ${x.direction}"><span>${trendArrow}</span><b>${trend}</b></div>
  </article>`;
}

function ppLondonParts(date=new Date()){
  const f=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZoneName:"shortOffset"});
  return Object.fromEntries(f.formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
}
function ppOffsetMinutes(parts){
  const z=String(parts.timeZoneName||"GMT");
  const m=z.match(/GMT(?:(\+|-)(\d{1,2})(?::?(\d{2}))?)?/);
  if(!m||!m[1])return 0;
  const n=(Number(m[2]||0)*60+Number(m[3]||0))*(m[1]==="-"?-1:1);
  return n;
}
function ppNextLondonMidnight(now=new Date()){
  const p=ppLondonParts(now);
  const dayUTC=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+1,0,0,0);
  const probe=new Date(dayUTC);
  const off=ppOffsetMinutes(ppLondonParts(probe));
  return new Date(dayUTC-off*60000);
}
function ppUpdateCountdown(){
  const el=$("ppCountdown");if(!el)return;
  const now=new Date(),target=ppNextLondonMidnight(now);
  let s=Math.max(0,Math.floor((target-now)/1000));
  const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60),sec=s%60;
  el.textContent=`${h} hr ${m} min ${sec} sec`;
}
function ppStartCountdown(){
  if(_ppTimer)clearInterval(_ppTimer);
  ppUpdateCountdown();
  _ppTimer=setInterval(ppUpdateCountdown,1000);
}

function ppPageSlice(rows,page){
  const pages=Math.max(1,Math.ceil(rows.length/PP_PAGE_SIZE));
  const safePage=Math.max(1,Math.min(page,pages));
  const start=(safePage-1)*PP_PAGE_SIZE;
  return {items:rows.slice(start,start+PP_PAGE_SIZE),page:safePage,pages,start};
}
function ppSetPager(prefix,rows,page){
  const info=ppPageSlice(rows,page);
  const count=$(prefix+"Count"),label=$(prefix+"Page"),prev=$(prefix+"Prev"),next=$(prefix+"Next");
  if(count){
    const from=rows.length?info.start+1:0,to=Math.min(info.start+PP_PAGE_SIZE,rows.length);
    count.textContent=`${from}–${to} of ${rows.length}`;
  }
  if(label)label.textContent=`Page ${info.page} of ${info.pages}`;
  if(prev)prev.disabled=info.page<=1;
  if(next)next.disabled=info.page>=info.pages;
  return info;
}
function ppRender(){
  if(!_ppRows) _ppRows=ppBuildRows();
  const {rises,falls}=_ppRows;
  const riseInfo=ppSetPager("ppRise",rises,_ppRisePage);
  const fallInfo=ppSetPager("ppFall",falls,_ppFallPage);
  _ppRisePage=riseInfo.page;_ppFallPage=fallInfo.page;
  $("ppRisers").innerHTML=riseInfo.items.length?riseInfo.items.map(ppPlayerRow).join(""):`<div class="price-empty"><b>No rise movement yet.</b><span>Positive transfer activity will appear here once managers start making moves.</span></div>`;
  $("ppFallers").innerHTML=fallInfo.items.length?fallInfo.items.map(ppPlayerRow).join(""):`<div class="price-empty"><b>No fall movement yet.</b><span>Negative transfer activity will appear here once managers start making moves.</span></div>`;
  const ev=ppCurrentEvent();
  $("ppSummary").innerHTML=`<div><b>GW${ev.id||"—"}</b><span>Current market</span></div><div><b>${Number(boot.total_players||0).toLocaleString()}</b><span>FPL managers</span></div><div><b>100%+</b><span>Very likely zone</span></div>`;
}
async function initPricePrediction(){
  await loadBoot();
  _ppRisePage=1;_ppFallPage=1;_ppRows=ppBuildRows();
  const bindings=[
    ["ppRisePrev",()=>{if(_ppRisePage>1){_ppRisePage--;ppRender();$("ppRisers")?.scrollIntoView({behavior:"smooth",block:"nearest"});}}],
    ["ppRiseNext",()=>{const max=Math.max(1,Math.ceil(_ppRows.rises.length/PP_PAGE_SIZE));if(_ppRisePage<max){_ppRisePage++;ppRender();$("ppRisers")?.scrollIntoView({behavior:"smooth",block:"nearest"});}}],
    ["ppFallPrev",()=>{if(_ppFallPage>1){_ppFallPage--;ppRender();$("ppFallers")?.scrollIntoView({behavior:"smooth",block:"nearest"});}}],
    ["ppFallNext",()=>{const max=Math.max(1,Math.ceil(_ppRows.falls.length/PP_PAGE_SIZE));if(_ppFallPage<max){_ppFallPage++;ppRender();$("ppFallers")?.scrollIntoView({behavior:"smooth",block:"nearest"});}}]
  ];
  bindings.forEach(([id,fn])=>{const el=$(id);if(el&&!el.dataset.bound){el.dataset.bound="1";el.addEventListener("click",fn);}});
  ppRender();
  ppStartCountdown();
}
