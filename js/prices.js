/* ============ PRICE WATCH + PRICE PRESSURE ============ */
let _prMode="season";
let _ppRiseVisible=20,_ppFallVisible=20,_ppRows=null;

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
    if(!started){
      status.innerHTML=`<div class="price-status-card"><b>Waiting for Gameweek 1</b><span>Official price changes and Gameweek transfer activity become meaningful once the season starts.</span></div>`;
    }else if(!withChange.length){
      status.innerHTML=`<div class="price-status-card live"><b>GW1 is live — no official price changes recorded yet</b><span>FPL has not changed any player prices for ${label} yet. Transfer activity is already available below and will update as managers buy and sell players.</span></div>`;
    }else{
      status.innerHTML=`<div class="price-status-card live"><b>${withChange.length} official price change${withChange.length===1?"":"s"} recorded ${label}</b><span>These values come from FPL's current player price and price-change fields.</span></div>`;
    }
  }

  $("prUp").innerHTML=risers.length?risers.map(e=>pricePlayerRow(e,"up",changeText(e),`${Number(e.transfers_in_event||0).toLocaleString()} in GW`)).join(""):`<div class="price-empty"><b>No official risers yet.</b><span>Prices only appear here after FPL actually applies a price increase.</span></div>`;
  $("prDown").innerHTML=fallers.length?fallers.map(e=>pricePlayerRow(e,"down",changeText(e),`${Number(e.transfers_out_event||0).toLocaleString()} out GW`)).join(""):`<div class="price-empty"><b>No official fallers yet.</b><span>Prices only appear here after FPL actually applies a price decrease.</span></div>`;

  const elements=(b.elements||[]).filter(e=>e.status!=="u");
  const incoming=[...elements].filter(e=>Number(e.transfers_in_event||0)>0).sort((a,c)=>Number(c.transfers_in_event||0)-Number(a.transfers_in_event||0)).slice(0,12);
  const outgoing=[...elements].filter(e=>Number(e.transfers_out_event||0)>0).sort((a,c)=>Number(c.transfers_out_event||0)-Number(a.transfers_out_event||0)).slice(0,12);
  const net=e=>Number(e.transfers_in_event||0)-Number(e.transfers_out_event||0);
  $("prIn").innerHTML=incoming.length?incoming.map(e=>pricePlayerRow(e,"up",`+${Number(e.transfers_in_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-in data yet.</b></div>`;
  $("prOut").innerHTML=outgoing.length?outgoing.map(e=>pricePlayerRow(e,"down",`−${Number(e.transfers_out_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-out data yet.</b></div>`;
}

function ppClamp(v,min=0,max=100){return Math.max(min,Math.min(max,v));}
function ppCurrentEvent(){
  const evs=boot.events||[];
  return evs.find(e=>e.is_current)||evs.find(e=>e.is_next)||evs.find(e=>e.id===1)||{};
}
function ppAvailability(e,direction){
  const status=String(e.status||"a");
  if(direction==="rise"){
    if(status==="a") return 100;
    if(status==="d") return 70;
    if(status==="i"||status==="s") return 35;
    return 45;
  }
  if(status==="a") return 68;
  if(status==="d") return 88;
  if(status==="i"||status==="s"||status==="u") return 100;
  return 78;
}
function ppVolumeCap(absNet){
  if(absNet<250) return 15;
  if(absNet<1000) return 30;
  if(absNet<3000) return 45;
  if(absNet<7500) return 60;
  if(absNet<15000) return 75;
  return 100;
}
function ppPressure(e,direction){
  const tin=Number(e.transfers_in_event)||0,tout=Number(e.transfers_out_event)||0;
  const net=tin-tout,absNet=Math.abs(net),turnover=tin+tout;
  const total=Math.max(1,Number(boot.total_players)||1);
  const ownPct=Math.max(.1,Number(e.selected_by_percent)||0);
  const owners=Math.max(5000,total*(ownPct/100));
  const relative=absNet/owners;
  // Absolute movement carries the most weight. Ownership-relative movement helps,
  // but is capped so tiny ownership values cannot create absurdly high scores.
  const absoluteScore=ppClamp(Math.sqrt(absNet/40000)*100);
  const relativeScore=ppClamp(Math.sqrt(Math.min(relative,.04)/.025)*100);
  const purityScore=turnover?ppClamp(absNet/turnover*100):0;
  const mainVolume=direction==="rise"?tin:tout;
  const volumeScore=ppClamp(Math.sqrt(mainVolume/40000)*100);
  const availability=ppAvailability(e,direction);
  const moved=Number(e.cost_change_event)||0;
  const sameMove=(direction==="rise"&&moved>0)||(direction==="fall"&&moved<0);
  const repeatMoveScore=sameMove?35:75;
  let score=absoluteScore*.50+relativeScore*.15+purityScore*.15+volumeScore*.10+availability*.05+repeatMoveScore*.05;
  if(direction==="rise"&&net<=0) score=0;
  if(direction==="fall"&&net>=0) score=0;
  score=Math.min(score,ppVolumeCap(absNet));
  return {score:Math.round(ppClamp(score)),tin,tout,net,ownPct,relative,moved,volumeCap:ppVolumeCap(absNet)};
}
function ppLabel(score){
  if(score>=85)return "Very high";
  if(score>=70)return "High";
  if(score>=55)return "Moderate";
  if(score>=40)return "Watch";
  return "Low";
}
function ppBuildRows(){
  const players=(boot.elements||[]).filter(e=>e&&e.id);
  const rises=[],falls=[];
  players.forEach(e=>{
    const r=ppPressure(e,"rise"),f=ppPressure(e,"fall");
    if(r.net>0&&r.tin>0) rises.push({e,...r,direction:"rise"});
    if(f.net<0&&f.tout>0) falls.push({e,...f,direction:"fall"});
  });
  rises.sort((a,b)=>b.score-a.score||b.net-a.net||b.tin-a.tin);
  falls.sort((a,b)=>b.score-a.score||a.net-b.net||b.tout-a.tout);
  return {rises,falls};
}
function ppPlayerRow(x){
  const e=x.e,t=(boot.teams||[]).find(z=>z.id===e.team)||{};
  const arrow=x.direction==="rise"?"↑":"↓",sign=x.net>=0?"+":"−";
  const netAbs=Math.abs(x.net).toLocaleString();
  const transferMain=x.direction==="rise"?`${x.tin.toLocaleString()} in`:`${x.tout.toLocaleString()} out`;
  const changed=Number(e.cost_change_event||0);
  const changedText=changed?` · ${changed>0?"+":""}£${(changed/10).toFixed(1)}m this GW`:"";
  const nextMove=x.direction==="rise"?"+£0.1m":"−£0.1m";
  return `<article class="pressure-row ${x.direction}">
    <div class="pressure-player">${teamKitImg(t,"pressure-kit",`${t.name||"Club"} kit`)}<div><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)} · ${x.ownPct.toFixed(1)}% owned</small></div></div>
    <div class="pressure-signals"><span><b>${transferMain}</b><small>Net ${sign}${netAbs}${changedText} · Potential next move ${nextMove}</small></span></div>
    <div class="pressure-score"><span class="pressure-score-arrow">${arrow}</span><div><b>${x.score}<em>/100</em></b><small>${ppLabel(x.score)} pressure · ${nextMove}</small></div></div>
  </article>`;
}
function ppRender(){
  if(!_ppRows) _ppRows=ppBuildRows();
  const {rises,falls}=_ppRows;
  const riseShown=rises.slice(0,_ppRiseVisible),fallShown=falls.slice(0,_ppFallVisible);
  $("ppRisers").innerHTML=riseShown.length?riseShown.map(ppPlayerRow).join(""):`<div class="price-empty"><b>No rise pressure yet.</b><span>Positive transfer activity will appear here once managers start making moves.</span></div>`;
  $("ppFallers").innerHTML=fallShown.length?fallShown.map(ppPlayerRow).join(""):`<div class="price-empty"><b>No fall pressure yet.</b><span>Negative transfer activity will appear here once managers start making moves.</span></div>`;
  $("ppRiseCount").textContent=`${Math.min(_ppRiseVisible,rises.length)} of ${rises.length}`;
  $("ppFallCount").textContent=`${Math.min(_ppFallVisible,falls.length)} of ${falls.length}`;
  const mr=$("ppMoreRise"),mf=$("ppMoreFall");
  if(mr){mr.style.display=_ppRiseVisible<rises.length?"inline-flex":"none";mr.textContent=`Show 20 more (${Math.max(0,rises.length-_ppRiseVisible)} remaining)`;}
  if(mf){mf.style.display=_ppFallVisible<falls.length?"inline-flex":"none";mf.textContent=`Show 20 more (${Math.max(0,falls.length-_ppFallVisible)} remaining)`;}
  const ev=ppCurrentEvent();
  $("ppSummary").innerHTML=`<div><b>GW${ev.id||"—"}</b><span>Market window</span></div><div><b>${Number(boot.total_players||0).toLocaleString()}</b><span>FPL managers</span></div><div><b>+£0.1m</b><span>Potential next rise</span></div><div><b>−£0.1m</b><span>Potential next fall</span></div>`;
}
async function initPricePrediction(){
  await loadBoot();
  _ppRiseVisible=20;_ppFallVisible=20;_ppRows=ppBuildRows();
  const mr=$("ppMoreRise"),mf=$("ppMoreFall");
  if(mr&&!mr.dataset.bound){mr.dataset.bound="1";mr.addEventListener("click",()=>{_ppRiseVisible+=20;ppRender();});}
  if(mf&&!mf.dataset.bound){mf.dataset.bound="1";mf.addEventListener("click",()=>{_ppFallVisible+=20;ppRender();});}
  ppRender();
}
