/* ============ FPL Market Terminal ============ */
let _marketBooted=false;
const _marketState={metric:"points",mover:"in",playerId:null,historyCache:new Map(),position:0,search:"",fixtures:null,tableSort:"net",tableDir:-1};

function marketN(v){const n=Number(v)||0;return Math.abs(n)>=1e6?(n/1e6).toFixed(2)+"M":Math.abs(n)>=1e3?(n/1e3).toFixed(1)+"k":String(Math.round(n));}
function marketSigned(v){const n=Number(v)||0;return `${n>0?"+":n<0?"−":""}${marketN(Math.abs(n))}`;}
function marketTeam(e){return (boot.teams||[]).find(t=>t.id===e.team)||{};}
function marketNet(e){return (Number(e.transfers_in_event)||0)-(Number(e.transfers_out_event)||0);}
function marketCurrentEvent(){return (boot.events||[]).find(e=>e.is_current)||(boot.events||[]).find(e=>e.is_next)||(boot.events||[])[0]||{id:1};}
function marketPlayers(){return (boot.elements||[]).filter(p=>(_marketState.position===0||p.element_type===_marketState.position)&&(!_marketState.search||`${p.web_name} ${marketTeam(p).name||""}`.toLowerCase().includes(_marketState.search)));}
function marketPct(n,d){return d?Math.round((n/d)*100):0;}
function marketPosName(id){return id?({1:"Goalkeepers",2:"Defenders",3:"Midfielders",4:"Forwards"}[id]||"Players"):"All positions";}
function marketTeamFdr(teamId){const fx=Array.isArray(_marketState.fixtures)?_marketState.fixtures:[];const ev=marketCurrentEvent().id;const next=fx.filter(f=>!f.finished&&f.event>=ev&&(f.team_h===teamId||f.team_a===teamId)).sort((a,b)=>a.event-b.event).slice(0,5);const vals=next.map(f=>f.team_h===teamId?Number(f.team_h_difficulty||3):Number(f.team_a_difficulty||3));return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function marketOwners(p){const total=Number(boot.total_players)||0;return total?total*(parseFloat(p.selected_by_percent||0)/100):0;}
function marketVelocity(p){const owners=marketOwners(p);return owners?marketNet(p)/owners*100:0;}
function marketChurn(p){const owners=marketOwners(p);return owners?(Number(p.transfers_in_event||0)+Number(p.transfers_out_event||0))/owners*100:0;}
function marketValue(p){const price=Math.max(.1,Number(p.now_cost||0)/10);return Number(p.total_points||0)/price;}


async function initFplMarket(){
  if(_marketBooted) return;
  _marketBooted=true;
  const root=$("marketBody");
  try{
    root.innerHTML='<div class="market-loading"><div><i class="fa-solid fa-circle-notch fa-spin"></i> Loading live FPL market…</div></div>';
    await loadBoot();
    try{_marketState.fixtures=await get('/fixtures/');}catch(_e){_marketState.fixtures=[];}
    renderMarketShell();
  }catch(e){root.innerHTML=`<div class="market-loading">Unable to load FPL market data (${esc(e.message)}).</div>`;}
}

function renderMarketShell(){
  const root=$("marketBody");
  const all=(boot.elements||[]).slice();
  const active=all.filter(p=>Number(p.minutes)>0||Number(p.transfers_in_event)>0||Number(p.transfers_out_event)>0);
  const ev=marketCurrentEvent();
  if(!_marketState.playerId){const first=active.slice().sort((a,b)=>marketNet(b)-marketNet(a))[0]||active[0];_marketState.playerId=first?.id||null;}

  root.innerHTML=`<div class="market-terminal">
    <header class="market-topbar">
      <div class="market-brandline"><button class="market-exit" id="marketExit" type="button"><i class="fa-solid fa-arrow-left"></i><span>FPL Peek</span></button><div class="market-divider"></div><div><div class="market-kicker"><span class="market-live-dot"></span>Live terminal · GW${ev.id}</div><h2>FPL Market</h2></div></div>
      <div class="market-top-actions"><label class="market-search"><i class="fa-solid fa-magnifying-glass"></i><input id="marketSearch" placeholder="Search player or club" autocomplete="off"></label><div class="market-clock" id="marketClock">LIVE DATA</div></div>
    </header>
    <div class="market-filterbar"><span>Market scope</span><div class="market-pos-tabs" id="marketPosTabs"><button data-pos="0" class="active">All</button><button data-pos="1">GK</button><button data-pos="2">DEF</button><button data-pos="3">MID</button><button data-pos="4">FWD</button></div><div class="market-scope-label" id="marketScopeLabel">All positions</div></div>
    <div class="market-ticker" id="marketTicker"></div>
    <main class="market-body" id="marketDashboard"></main>
  </div>`;

  $("marketExit").addEventListener("click",()=>switchTab("home"));
  $("marketSearch").addEventListener("input",e=>{_marketState.search=e.target.value.trim().toLowerCase();renderMarketDashboard();});
  $("marketPosTabs").addEventListener("click",e=>{const b=e.target.closest("button[data-pos]");if(!b)return;_marketState.position=Number(b.dataset.pos);$("marketPosTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));$("marketScopeLabel").textContent=marketPosName(_marketState.position);renderMarketDashboard();});
  renderMarketDashboard();
  marketClockTick();
}

function renderMarketDashboard(){
  const box=$("marketDashboard");if(!box)return;
  const players=marketPlayers();
  const all=(boot.elements||[]).slice();
  const byNet=players.slice().sort((a,b)=>marketNet(b)-marketNet(a));
  const byOut=players.slice().sort((a,b)=>marketNet(a)-marketNet(b));
  const byOwn=players.slice().sort((a,b)=>parseFloat(b.selected_by_percent||0)-parseFloat(a.selected_by_percent||0));
  const volume=players.reduce((s,p)=>s+Number(p.transfers_in_event||0)+Number(p.transfers_out_event||0),0);
  const ins=players.reduce((s,p)=>s+Number(p.transfers_in_event||0),0),outs=players.reduce((s,p)=>s+Number(p.transfers_out_event||0),0);
  const positive=players.filter(p=>marketNet(p)>0).length,negative=players.filter(p=>marketNet(p)<0).length;
  const priceMoves=players.filter(p=>Number(p.cost_change_event)!==0).length;
  const avgOwn=players.length?players.reduce((s,p)=>s+parseFloat(p.selected_by_percent||0),0)/players.length:0;
  const avgPrice=players.length?players.reduce((s,p)=>s+Number(p.now_cost||0),0)/players.length/10:0;
  const top10Share=volume?byNet.slice(0,10).reduce((s,p)=>s+Math.abs(marketNet(p)),0)/volume*100:0;

  renderMarketTicker([...byNet.slice(0,6),...byOut.slice(0,6)]);
  box.innerHTML=`
    <section class="market-kpis">
      ${marketKpi("fa-arrow-right-arrow-left","Transfer volume",marketN(volume),`${marketN(ins)} in · ${marketN(outs)} out`)}
      ${marketKpi("fa-arrow-trend-up","Top buy",byNet[0]?esc(byNet[0].web_name):"—",byNet[0]?`${marketSigned(marketNet(byNet[0]))} net`:"No data","up")}
      ${marketKpi("fa-arrow-trend-down","Top sell",byOut[0]?esc(byOut[0].web_name):"—",byOut[0]?`${marketSigned(marketNet(byOut[0]))} net`:"No data","down")}
      ${marketKpi("fa-users","Ownership leader",byOwn[0]?esc(byOwn[0].web_name):"—",byOwn[0]?`${parseFloat(byOwn[0].selected_by_percent||0).toFixed(1)}% selected`:"No data")}
      ${marketKpi("fa-sterling-sign","Price movers",String(priceMoves),"Changed price this GW")}
      ${marketKpi("fa-scale-balanced","Market breadth",`${positive} / ${negative}`,"Net risers / fallers")}
      ${marketKpi("fa-chart-pie","Avg ownership",`${avgOwn.toFixed(1)}%`,`${players.length} players in scope`)}
      ${marketKpi("fa-tag","Avg price",`£${avgPrice.toFixed(1)}m`,`${top10Share.toFixed(0)}% flow concentration`)}
    </section>

    <section class="market-main-grid">
      <div class="market-panel market-player-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Player market chart</b><span>Official Gameweek history</span></div><select id="marketPlayerSelect" class="market-player-select">${marketSelectOptions(all)}</select></div><div class="market-chart-controls" id="marketMetricButtons"><button data-metric="points" class="${_marketState.metric==='points'?'active':''}">Points</button><button data-metric="price" class="${_marketState.metric==='price'?'active':''}">Price</button><button data-metric="selected" class="${_marketState.metric==='selected'?'active':''}">Ownership</button><button data-metric="net" class="${_marketState.metric==='net'?'active':''}">Net transfers</button></div><div id="marketChart" class="market-chart-wrap"></div></div>
      <div class="market-panel market-movers-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Market movers</b><span>Current Gameweek</span></div><div class="market-mover-tabs" id="marketMoverTabs"><button data-mover="in" class="${_marketState.mover==='in'?'active':''}">Risers</button><button data-mover="out" class="${_marketState.mover==='out'?'active':''}">Fallers</button></div></div><div id="marketMovers" class="market-movers"></div></div>
    </section>

    <section class="market-secondary-grid">
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Transfer flow by position</b><span>Buys vs sells this GW</span></div></div><div id="marketPositionFlow" class="market-chart-box"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Club momentum</b><span>Net transfer pressure</span></div></div><div id="marketClubMomentum" class="market-chart-box"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Market breadth</b><span>How broad is the move?</span></div></div><div id="marketBreadth" class="market-chart-box"></div></div>
    </section>

    <section class="market-analysis-grid">
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Value map</b><span>Price vs season points · click a dot</span></div></div><div id="marketScatter" class="market-scatter-wrap"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Ownership vs form</b><span>Find emerging differentials</span></div></div><div id="marketFormScatter" class="market-scatter-wrap"></div></div>
    </section>

    <section class="market-bottom-grid">
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Ownership board</b><span>Most selected players</span></div></div><div id="marketOwnership" class="market-bars-wrap"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Price-band efficiency</b><span>Average season points by price</span></div></div><div id="marketPriceBands" class="market-chart-box"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Fixture runway</b><span>Best average FDR over next 5</span></div></div><div id="marketFixtureRunway" class="market-bars-wrap"></div></div>
    </section>

    <section class="market-heavy-grid">
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Position dashboard</b><span>Points, form, ownership and flow by position</span></div></div><div id="marketPositionStats" class="market-table-wrap"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Differential radar</b><span>≤10% owned · positive market momentum</span></div></div><div id="marketDifferentials" class="market-radar-list"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Transfer velocity</b><span>Net transfers relative to estimated owner base</span></div></div><div id="marketVelocity" class="market-bars-wrap"></div></div>
      <div class="market-panel"><div class="market-panel-head"><div class="market-panel-title"><b>Opportunity board</b><span>Current GW return + next-five FDR</span></div></div><div id="marketOpportunity" class="market-radar-list"></div></div>
    </section>

    <section class="market-panel market-tape-panel">
      <div class="market-panel-head"><div class="market-panel-title"><b>Live player tape</b><span>Sortable market table · click a player to open chart</span></div><div class="market-tape-hint"><i class="fa-solid fa-arrow-pointer"></i> Interactive</div></div>
      <div id="marketTape" class="market-tape"></div>
    </section>
    <div class="market-footer-note">Live market figures come from public FPL data. Historical player charts use official Gameweek history. Transfer velocity is net GW transfers divided by an estimated current owner base; it is a momentum indicator, not a price-change prediction.</div>`;

  const sel=$("marketPlayerSelect");if(sel){sel.value=String(_marketState.playerId||"");sel.addEventListener("change",e=>{_marketState.playerId=Number(e.target.value);renderMarketPlayerChart();});}
  $("marketMetricButtons")?.addEventListener("click",e=>{const b=e.target.closest("button[data-metric]");if(!b)return;_marketState.metric=b.dataset.metric;$("marketMetricButtons").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));renderMarketPlayerChart();});
  $("marketMoverTabs")?.addEventListener("click",e=>{const b=e.target.closest("button[data-mover]");if(!b)return;_marketState.mover=b.dataset.mover;$("marketMoverTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));renderMarketMovers();});

  renderMarketMovers();renderMarketPositionFlow(players);renderMarketClubMomentum(players);renderMarketBreadth(players);renderMarketScatter(players);renderMarketFormScatter(players);renderMarketOwnership(byOwn);renderMarketPriceBands(players);renderMarketFixtureRunway();renderMarketPositionStats(players);renderMarketDifferentials(players);renderMarketVelocity(players);renderMarketOpportunity(players);renderMarketTape(players);renderMarketPlayerChart();
}

function renderMarketTicker(rows){const el=$("marketTicker");if(!el)return;const unique=rows.filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).slice(0,14);const items=unique.map(p=>{const n=marketNet(p),t=marketTeam(p);return `<button class="market-tick" data-id="${p.id}" type="button"><b>${esc(p.web_name)}</b><span>${money(p.now_cost)}</span><span class="${n>0?'market-up':n<0?'market-down':'market-flat'}">${n>0?'▲':n<0?'▼':'•'} ${marketSigned(n)}</span><span>${esc(t.short_name||'')}</span></button>`}).join("");el.innerHTML=`<div class="market-ticker-track">${items}${items}</div>`;el.querySelectorAll(".market-tick").forEach(x=>x.addEventListener("click",()=>marketSelectPlayer(Number(x.dataset.id),false)));}
function marketKpi(icon,label,value,sub,tone=""){return `<div class="market-kpi"><div class="market-kpi-label"><i class="fa-solid ${icon}"></i>${label}</div><div class="market-kpi-value ${tone?`market-${tone}`:""}">${value}</div><div class="market-kpi-sub">${sub}</div></div>`;}
function marketSelectOptions(players){return players.slice().sort((a,b)=>String(a.web_name).localeCompare(String(b.web_name))).map(p=>`<option value="${p.id}">${esc(p.web_name)} · ${marketTeam(p).short_name||''} · ${money(p.now_cost)}</option>`).join("");}
function marketClockTick(){const el=$("marketClock");if(!el)return;const d=new Date();el.textContent=`LIVE · ${d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;setTimeout(marketClockTick,1000);}
function marketSelectPlayer(id,scroll=true){_marketState.playerId=id;const s=$("marketPlayerSelect");if(s&&[...s.options].some(o=>Number(o.value)===id))s.value=String(id);renderMarketPlayerChart();if(scroll)$("marketChart")?.scrollIntoView({behavior:"smooth",block:"center"});}

function renderMarketMovers(){const el=$("marketMovers");if(!el)return;const arr=marketPlayers().slice().sort((a,b)=>_marketState.mover==="in"?marketNet(b)-marketNet(a):marketNet(a)-marketNet(b)).slice(0,14);el.innerHTML=arr.map((p,i)=>{const n=marketNet(p),t=marketTeam(p);return `<button class="market-mover" data-id="${p.id}" type="button"><div class="market-mover-rank">${String(i+1).padStart(2,"0")}</div><div><div class="market-mover-name">${esc(p.web_name)}</div><div class="market-mover-meta">${esc(t.short_name||"")} · ${POS[p.element_type]||""} · ${parseFloat(p.selected_by_percent||0).toFixed(1)}% owned</div></div><div><div class="market-mover-num ${n>=0?"market-up":"market-down"}">${n>=0?"▲":"▼"} ${marketSigned(n)}</div><div class="market-mover-price">${money(p.now_cost)}</div></div></button>`}).join("");el.querySelectorAll(".market-mover").forEach(r=>r.addEventListener("click",()=>marketSelectPlayer(Number(r.dataset.id))));}

async function renderMarketPlayerChart(){
  const box=$("marketChart");
  if(!box)return;
  const p=(boot.elements||[]).find(x=>x.id===_marketState.playerId);
  if(!p){box.innerHTML='<div class="market-chart-empty">Choose a player.</div>';return;}
  box.innerHTML='<div class="market-chart-empty"><i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Loading player market data…</div>';
  try{
    let data=_marketState.historyCache.get(p.id);
    if(!data){data=await get(`/element-summary/${p.id}/`);_marketState.historyCache.set(p.id,data);}
    const rows=(data.history||[]).map(h=>({gw:h.round,points:Number(h.total_points)||0,price:(Number(h.value)||p.now_cost)/10,selected:Number(h.selected)||0,net:(Number(h.transfers_in)||0)-(Number(h.transfers_out)||0),tin:Number(h.transfers_in)||0,tout:Number(h.transfers_out)||0}));
    const t=marketTeam(p),n=marketNet(p),ev=marketCurrentEvent();
    const meta=`<div class="market-chart-meta"><div><div class="market-chart-name">${esc(p.web_name)} <span>${esc(t.short_name||"")} · ${POS[p.element_type]||""}</span></div><div class="market-chart-tags"><span>${money(p.now_cost)}</span><span>${p.total_points||0} season pts</span><span>${parseFloat(p.selected_by_percent||0).toFixed(1)}% owned</span><span>Form ${p.form||'0'}</span></div></div><div><div class="market-chart-price">${money(p.now_cost)}</div><div class="market-chart-change ${n>=0?'market-up':'market-down'}">${n>=0?'▲':'▼'} ${marketSigned(n)} net GW transfers</div></div></div>`;
    if(rows.length<=1){
      box.innerHTML=meta+marketCurrentSnapshot(p,data,ev);
      const controls=$("marketMetricButtons");
      if(controls){controls.classList.add("snapshot-mode");controls.querySelectorAll("button").forEach(b=>b.disabled=true);}
    }else{
      const controls=$("marketMetricButtons");
      if(controls){controls.classList.remove("snapshot-mode");controls.querySelectorAll("button").forEach(b=>b.disabled=false);}
      box.innerHTML=meta+`<div class="market-history-note"><i class="fa-solid fa-chart-line"></i> ${rows.length} Gameweeks of official history available</div>`+marketLineSvg(rows,_marketState.metric);
    }
  }catch(e){box.innerHTML=`<div class="market-chart-empty">Player market data unavailable (${esc(e.message)}).</div>`;}
}

function marketCurrentSnapshot(p,data,ev){
  const team=marketTeam(p),net=marketNet(p),price=Number(p.now_cost||0)/10;
  const tin=Number(p.transfers_in_event||0),tout=Number(p.transfers_out_event||0),volume=tin+tout;
  const gwPts=Number(p.event_points||0),form=Number(p.form||0),minutes=Number(p.minutes||0),own=parseFloat(p.selected_by_percent||0)||0;
  const value=marketValue(p),velocity=marketVelocity(p),churn=marketChurn(p);
  const posPeers=(boot.elements||[]).filter(x=>x.element_type===p.element_type&&Number(x.minutes||0)>=0);
  const posAvgPts=posPeers.length?posPeers.reduce((s,x)=>s+Number(x.event_points||0),0)/posPeers.length:0;
  const posAvgPrice=posPeers.length?posPeers.reduce((s,x)=>s+Number(x.now_cost||0)/10,0)/posPeers.length:0;
  const posAvgOwn=posPeers.length?posPeers.reduce((s,x)=>s+(parseFloat(x.selected_by_percent||0)||0),0)/posPeers.length:0;
  const fixtures=marketPlayerNextFixtures(p.team,5);
  const maxTransfer=Math.max(1,tin,tout);
  const scoreMax=Math.max(15,gwPts,posAvgPts,1);
  const ownMax=Math.max(own,posAvgOwn,1);
  const priceMove=Number(p.cost_change_event||0)/10;
  return `<div class="market-snapshot-banner"><div><span>GW${ev.id} LIVE SNAPSHOT</span><b>History chart unlocks as more Gameweeks are played</b></div><p>With only ${Math.max(1,(data.history||[]).length)} Gameweek of history, a line chart is not meaningful yet. This panel uses live current-season data instead.</p></div>
  <div class="market-snapshot-grid">
    ${marketSnapshotCard('GW points',gwPts,'Current Gameweek return','fa-bolt',gwPts>=posAvgPts?'up':'')}
    ${marketSnapshotCard('Net transfers',marketSigned(net),`${marketN(tin)} in · ${marketN(tout)} out`,'fa-arrow-right-arrow-left',net>=0?'up':'down')}
    ${marketSnapshotCard('Ownership',`${own.toFixed(1)}%`,`Position avg ${posAvgOwn.toFixed(1)}%`,'fa-users','')}
    ${marketSnapshotCard('Price',`£${price.toFixed(1)}m`,`${priceMove===0?'No change':`${priceMove>0?'+':''}£${priceMove.toFixed(1)}m this GW`}`,'fa-sterling-sign',priceMove>0?'up':priceMove<0?'down':'')}
    ${marketSnapshotCard('Form',form.toFixed(1),`${minutes} season minutes`,'fa-wave-square','')}
    ${marketSnapshotCard('Value',value.toFixed(2),'Season points per £1m','fa-scale-balanced','')}
  </div>
  <div class="market-snapshot-charts">
    <div class="market-snapshot-panel"><div class="market-snapshot-title"><b>Transfer pressure</b><span>${volume?`${marketN(volume)} total moves`:'No transfer volume yet'}</span></div>
      <div class="market-transfer-compare"><div><span>Transfers in</span><b class="market-up">${marketN(tin)}</b><i class="up" style="width:${tin/maxTransfer*100}%"></i></div><div><span>Transfers out</span><b class="market-down">${marketN(tout)}</b><i class="down" style="width:${tout/maxTransfer*100}%"></i></div></div>
      <div class="market-snapshot-mini"><span>Transfer velocity <b class="${velocity>=0?'market-up':'market-down'}">${velocity>=0?'+':''}${velocity.toFixed(1)}%</b></span><span>Owner churn <b>${churn.toFixed(1)}%</b></span></div>
    </div>
    <div class="market-snapshot-panel"><div class="market-snapshot-title"><b>Position comparison</b><span>${POS[p.element_type]||'Position'} market</span></div>
      ${marketCompareBar('GW points',gwPts,posAvgPts,scoreMax,'pts')}
      ${marketCompareBar('Ownership',own,posAvgOwn,ownMax,'%')}
      ${marketCompareBar('Price',price,posAvgPrice,Math.max(price,posAvgPrice,1),'£m')}
    </div>
  </div>
  <div class="market-fixture-strip"><div class="market-snapshot-title"><b>Next 5 fixture runway</b><span>Upcoming FDR</span></div><div class="market-fixture-cards">${fixtures.length?fixtures.map(marketFixtureCard).join(''):'<div class="market-chart-empty small">Upcoming fixtures unavailable.</div>'}</div></div>`;
}

function marketSnapshotCard(label,value,sub,icon,tone){return `<div class="market-snapshot-card ${tone?`is-${tone}`:''}"><div class="market-snapshot-icon"><i class="fa-solid ${icon}"></i></div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`;}
function marketCompareBar(label,value,avg,max,suffix){const a=Math.max(0,Math.min(100,(Number(value)||0)/Math.max(.01,max)*100)),b=Math.max(0,Math.min(100,(Number(avg)||0)/Math.max(.01,max)*100));const fmt=v=>suffix==='£m'?`£${Number(v).toFixed(1)}m`:suffix==='%'?`${Number(v).toFixed(1)}%`:`${Number(v).toFixed(1)} ${suffix}`;return `<div class="market-compare-row"><div><span>${label}</span><small>You ${fmt(value)} · ${POS[((boot.elements||[]).find(x=>x.id===_marketState.playerId)||{}).element_type]||'Pos'} avg ${fmt(avg)}</small></div><div class="market-compare-bars"><i class="you" style="width:${a}%"></i><i class="avg" style="width:${b}%"></i></div></div>`;}
function marketPlayerNextFixtures(teamId,limit=5){const fx=Array.isArray(_marketState.fixtures)?_marketState.fixtures:[];const ev=marketCurrentEvent().id;return fx.filter(f=>!f.finished&&f.event>=ev&&(f.team_h===teamId||f.team_a===teamId)).sort((a,b)=>(a.event||99)-(b.event||99)).slice(0,limit).map(f=>{const home=f.team_h===teamId,oppId=home?f.team_a:f.team_h,opp=(boot.teams||[]).find(t=>t.id===oppId)||{};return {gw:f.event,opp:opp.short_name||opp.name||'—',venue:home?'H':'A',fdr:Number(home?f.team_h_difficulty:f.team_a_difficulty)||3};});}
function marketFixtureCard(f){return `<div class="market-fixture-card fdr-${Math.max(1,Math.min(5,f.fdr))}"><span>GW${f.gw}</span><b>${esc(f.opp)}</b><small>${f.venue} · FDR ${f.fdr}</small></div>`;}

function marketLineSvg(rows,key){if(!rows.length)return '<div class="market-chart-empty">No completed Gameweek history yet.</div>';const W=900,H=330,L=42,R=15,T=18,B=55,vals=rows.map(r=>Number(r[key])||0),min=Math.min(...vals),max=Math.max(...vals),spread=Math.max(1,max-min),x=i=>L+i*(W-L-R)/Math.max(1,rows.length-1),y=v=>T+(max-v)*(H-T-B)/spread,pts=rows.map((r,i)=>`${x(i)},${y(Number(r[key])||0)}`).join(" "),area=`${L},${H-B} ${pts} ${x(rows.length-1)},${H-B}`;const grids=[0,.25,.5,.75,1].map(q=>`<line class="market-gridline" x1="${L}" y1="${T+q*(H-T-B)}" x2="${W-R}" y2="${T+q*(H-T-B)}"/>`).join("");const labels=rows.map((r,i)=>`<text class="market-axis-label" x="${x(i)}" y="${H-34}" text-anchor="middle">GW${r.gw}</text>`).join("");const dots=rows.map((r,i)=>`<circle class="market-point" cx="${x(i)}" cy="${y(Number(r[key])||0)}" r="4"><title>GW${r.gw}: ${marketMetricValue(key,r[key])}</title></circle>`).join("");const maxVol=Math.max(1,...rows.map(r=>Math.max(r.tin,r.tout))),barW=Math.min(18,(W-L-R)/Math.max(1,rows.length)*.45),bars=rows.map((r,i)=>{const h1=(r.tin/maxVol)*34,h2=(r.tout/maxVol)*34;return `<rect class="market-volume-in" x="${x(i)-barW-1}" y="${H-8-h1}" width="${barW}" height="${h1}"/><rect class="market-volume-out" x="${x(i)+1}" y="${H-8-h2}" width="${barW}" height="${h2}"/>`;}).join("");return `<svg class="market-svg" viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="marketAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#17e69a" stop-opacity=".25"/><stop offset="100%" stop-color="#17e69a" stop-opacity="0"/></linearGradient></defs>${grids}<polygon class="market-area" points="${area}"/><polyline class="market-line" points="${pts}"/>${dots}${labels}${bars}<text class="market-axis-label" x="${L}" y="${H-4}">Volume bars: green transfers in · red transfers out</text></svg>`;}
function marketMetricValue(k,v){if(k==="price")return `£${Number(v).toFixed(1)}m`;if(k==="selected")return marketN(v)+" managers";if(k==="net")return marketSigned(v);return `${v} pts`;}

function renderMarketPositionFlow(players){const el=$("marketPositionFlow");if(!el)return;const rows=[1,2,3,4].map(id=>{const ps=players.filter(p=>p.element_type===id);return {name:({1:"GK",2:"DEF",3:"MID",4:"FWD"})[id],ins:ps.reduce((s,p)=>s+Number(p.transfers_in_event||0),0),outs:ps.reduce((s,p)=>s+Number(p.transfers_out_event||0),0)};});const max=Math.max(1,...rows.flatMap(r=>[r.ins,r.outs]));el.innerHTML=`<div class="market-dual-bars">${rows.map(r=>`<div class="market-dual-row"><b>${r.name}</b><div><div class="market-dual-line"><span class="in" style="width:${r.ins/max*100}%"></span></div><small>${marketN(r.ins)} in</small></div><div><div class="market-dual-line"><span class="out" style="width:${r.outs/max*100}%"></span></div><small>${marketN(r.outs)} out</small></div></div>`).join("")}</div>`;}
function renderMarketClubMomentum(players){const el=$("marketClubMomentum");if(!el)return;const rows=(boot.teams||[]).map(t=>({t,net:players.filter(p=>p.team===t.id).reduce((s,p)=>s+marketNet(p),0)})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,8);const max=Math.max(1,...rows.map(r=>Math.abs(r.net)));el.innerHTML=rows.map(r=>`<div class="market-club-row"><span>${esc(r.t.short_name||r.t.name)}</span><div class="market-zero-track"><i class="${r.net>=0?'up':'down'}" style="width:${Math.abs(r.net)/max*50}%;${r.net>=0?'left:50%':'right:50%'}"></i></div><b class="${r.net>=0?'market-up':'market-down'}">${marketSigned(r.net)}</b></div>`).join("");}
function renderMarketBreadth(players){const el=$("marketBreadth");if(!el)return;const up=players.filter(p=>marketNet(p)>0).length,down=players.filter(p=>marketNet(p)<0).length,flat=Math.max(0,players.length-up-down),total=Math.max(1,players.length);el.innerHTML=`<div class="market-breadth-big"><div><strong>${marketPct(up,total)}%</strong><span>net buying</span></div><div><strong>${marketPct(down,total)}%</strong><span>net selling</span></div></div><div class="market-breadth-bar"><i class="up" style="width:${marketPct(up,total)}%"></i><i class="flat" style="width:${marketPct(flat,total)}%"></i><i class="down" style="width:${marketPct(down,total)}%"></i></div><div class="market-breadth-legend"><span><i class="up"></i>${up} risers</span><span><i class="flat"></i>${flat} flat</span><span><i class="down"></i>${down} fallers</span></div>`;}

function scatterSvg(rows,xGet,yGet,xLabel,yLabel){if(!rows.length)return '<div class="market-chart-empty small">No data yet.</div>';const W=720,H=300,L=44,R=12,T=14,B=34,xs=rows.map(xGet),ys=rows.map(yGet),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),x=v=>L+(v-minX)*(W-L-R)/Math.max(.1,maxX-minX),y=v=>T+(maxY-v)*(H-T-B)/Math.max(.1,maxY-minY),grid=[0,.25,.5,.75,1].map(q=>`<line class="market-gridline" x1="${L}" y1="${T+q*(H-T-B)}" x2="${W-R}" y2="${T+q*(H-T-B)}"/>`).join("");return `<svg class="market-scatter" viewBox="0 0 ${W} ${H}">${grid}${rows.map(p=>`<circle class="market-dot" data-id="${p.id}" cx="${x(xGet(p))}" cy="${y(yGet(p))}" r="${Math.max(3,Math.min(8,2+parseFloat(p.selected_by_percent||0)/8))}"><title>${esc(p.web_name)} · ${xLabel} ${xGet(p).toFixed?.(1)||xGet(p)} · ${yLabel} ${yGet(p).toFixed?.(1)||yGet(p)}</title></circle>`).join("")}<text class="market-scatter-label" x="${L}" y="${H-5}">${xLabel} →</text><text class="market-scatter-label" x="${L}" y="11">${yLabel} ↑</text></svg>`;}
function bindScatter(el){el?.querySelectorAll(".market-dot").forEach(d=>d.addEventListener("click",()=>marketSelectPlayer(Number(d.dataset.id))));}
function renderMarketScatter(players){const el=$("marketScatter");if(!el)return;const rows=players.filter(p=>Number(p.minutes)>0&&Number(p.now_cost)>0).sort((a,b)=>Number(b.total_points)-Number(a.total_points)).slice(0,180);el.innerHTML=scatterSvg(rows,p=>p.now_cost/10,p=>Number(p.total_points)||0,"Price (£m)","Points");bindScatter(el);}
function renderMarketFormScatter(players){const el=$("marketFormScatter");if(!el)return;const rows=players.filter(p=>Number(p.minutes)>0&&Number(p.form)>=0).sort((a,b)=>Number(b.form)-Number(a.form)).slice(0,180);el.innerHTML=scatterSvg(rows,p=>parseFloat(p.selected_by_percent||0),p=>Number(p.form)||0,"Ownership %","Form");bindScatter(el);}
function renderMarketOwnership(rows){const el=$("marketOwnership");if(!el)return;const top=rows.slice(0,14);el.innerHTML=top.map(p=>{const own=parseFloat(p.selected_by_percent||0)||0;return `<button class="market-bar-row" data-id="${p.id}" type="button"><div class="market-bar-name">${esc(p.web_name)}</div><div class="market-bar-track"><div class="market-bar-fill" style="width:${Math.min(100,own)}%"></div></div><div class="market-bar-val">${own.toFixed(1)}%</div></button>`}).join("");el.querySelectorAll(".market-bar-row").forEach(r=>r.addEventListener("click",()=>marketSelectPlayer(Number(r.dataset.id))));}
function renderMarketPriceBands(players){const el=$("marketPriceBands");if(!el)return;const bands=[[0,5,"≤£5.0"],[5,6,"£5–6"],[6,7.5,"£6–7.5"],[7.5,9,"£7.5–9"],[9,99,"£9+"]].map(([a,b,label])=>{const ps=players.filter(p=>p.now_cost/10>a&&p.now_cost/10<=b);return {label,avg:ps.length?ps.reduce((s,p)=>s+Number(p.total_points||0),0)/ps.length:0,count:ps.length};});const max=Math.max(1,...bands.map(x=>x.avg));el.innerHTML=`<div class="market-price-bands">${bands.map(x=>`<div class="market-price-band"><div><b>${x.label}</b><span>${x.count} players</span></div><div class="market-price-track"><i style="width:${x.avg/max*100}%"></i></div><strong>${x.avg.toFixed(1)} pts</strong></div>`).join("")}</div>`;}
function renderMarketFixtureRunway(){const el=$("marketFixtureRunway");if(!el)return;const fx=Array.isArray(_marketState.fixtures)?_marketState.fixtures:[];if(!fx.length){el.innerHTML='<div class="market-chart-empty small">Fixture data unavailable.</div>';return;}const ev=marketCurrentEvent().id;const rows=(boot.teams||[]).map(t=>{const next=fx.filter(f=>!f.finished&&f.event>=ev&&(f.team_h===t.id||f.team_a===t.id)).sort((a,b)=>a.event-b.event).slice(0,5);const vals=next.map(f=>f.team_h===t.id?Number(f.team_h_difficulty||3):Number(f.team_a_difficulty||3));return {t,avg:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:9,n:vals.length};}).filter(x=>x.n).sort((a,b)=>a.avg-b.avg).slice(0,10);el.innerHTML=rows.map(r=>`<div class="market-runway-row"><span>${esc(r.t.short_name||r.t.name)}</span><div class="market-fdr-track"><i style="width:${Math.max(10,(6-r.avg)/5*100)}%"></i></div><b>${r.avg.toFixed(2)}</b></div>`).join("");}


function renderMarketPositionStats(players){const el=$("marketPositionStats");if(!el)return;const labels={1:"GK",2:"DEF",3:"MID",4:"FWD"};const rows=[1,2,3,4].map(id=>{const ps=players.filter(p=>p.element_type===id);const n=Math.max(1,ps.length);return {id,name:labels[id],count:ps.length,pts:ps.reduce((s,p)=>s+Number(p.total_points||0),0)/n,form:ps.reduce((s,p)=>s+Number(p.form||0),0)/n,own:ps.reduce((s,p)=>s+parseFloat(p.selected_by_percent||0),0)/n,net:ps.reduce((s,p)=>s+marketNet(p),0)};});el.innerHTML=`<table class="market-mini-table"><thead><tr><th>Pos</th><th>Players</th><th>Avg pts</th><th>Avg form</th><th>Avg own</th><th>Net flow</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.name}</b></td><td>${r.count}</td><td>${r.pts.toFixed(1)}</td><td>${r.form.toFixed(1)}</td><td>${r.own.toFixed(1)}%</td><td class="${r.net>=0?'market-up':'market-down'}">${marketSigned(r.net)}</td></tr>`).join('')}</tbody></table>`;}
function renderMarketDifferentials(players){const el=$("marketDifferentials");if(!el)return;const rows=players.filter(p=>parseFloat(p.selected_by_percent||0)<=10&&marketNet(p)>0&&Number(p.minutes||0)>0).sort((a,b)=>(Number(b.event_points||0)*3+Number(b.form||0)+marketVelocity(b))-(Number(a.event_points||0)*3+Number(a.form||0)+marketVelocity(a))).slice(0,10);el.innerHTML=rows.length?rows.map(p=>marketRadarRow(p,`${Number(p.event_points||0)} GW pts · form ${Number(p.form||0).toFixed(1)}`,`${parseFloat(p.selected_by_percent||0).toFixed(1)}% own`,marketNet(p))).join(''):'<div class="market-chart-empty small">No qualifying differentials in this scope.</div>';bindMarketRadar(el);}
function renderMarketVelocity(players){const el=$("marketVelocity");if(!el)return;const rows=players.filter(p=>Math.abs(marketNet(p))>0&&marketOwners(p)>0).sort((a,b)=>Math.abs(marketVelocity(b))-Math.abs(marketVelocity(a))).slice(0,12);const max=Math.max(.01,...rows.map(p=>Math.abs(marketVelocity(p))));el.innerHTML=rows.map(p=>{const v=marketVelocity(p);return `<button class="market-velocity-row" data-id="${p.id}" type="button"><span>${esc(p.web_name)}</span><div class="market-velocity-track"><i class="${v>=0?'up':'down'}" style="width:${Math.min(100,Math.abs(v)/max*100)}%"></i></div><b class="${v>=0?'market-up':'market-down'}">${v>=0?'+':''}${v.toFixed(1)}%</b></button>`}).join('');el.querySelectorAll('.market-velocity-row').forEach(r=>r.addEventListener('click',()=>marketSelectPlayer(Number(r.dataset.id))));}
function renderMarketOpportunity(players){const el=$("marketOpportunity");if(!el)return;const rows=players.map(p=>{const fdr=marketTeamFdr(p.team);const score=(Number(p.event_points||0)*5)+(Number(p.form||0)*2)+(fdr!=null?(6-fdr)*3:0)+Math.max(-5,Math.min(5,marketVelocity(p)));return {p,fdr,score};}).filter(x=>x.fdr!=null&&Number(x.p.event_points||0)>0).sort((a,b)=>b.score-a.score).slice(0,10);el.innerHTML=rows.map(x=>marketRadarRow(x.p,`${Number(x.p.event_points||0)} GW pts · next5 FDR ${x.fdr.toFixed(2)}`,`${money(x.p.now_cost)} · ${parseFloat(x.p.selected_by_percent||0).toFixed(1)}% own`,marketNet(x.p))).join('');bindMarketRadar(el);}
function marketRadarRow(p,left,right,net){const t=marketTeam(p);return `<button class="market-radar-row" data-id="${p.id}" type="button"><div><b>${esc(p.web_name)}</b><small>${esc(t.short_name||'')} · ${POS[p.element_type]||''} · ${left}</small></div><div><span>${right}</span><strong class="${net>=0?'market-up':'market-down'}">${net>=0?'▲':'▼'} ${marketSigned(net)}</strong></div></button>`;}
function bindMarketRadar(el){el.querySelectorAll('.market-radar-row').forEach(r=>r.addEventListener('click',()=>marketSelectPlayer(Number(r.dataset.id))));}
function marketTapeSortValue(p,key){if(key==='player')return String(p.web_name||'').toLowerCase();if(key==='price')return Number(p.now_cost||0);if(key==='gw')return Number(p.event_points||0);if(key==='form')return Number(p.form||0);if(key==='own')return parseFloat(p.selected_by_percent||0);if(key==='in')return Number(p.transfers_in_event||0);if(key==='out')return Number(p.transfers_out_event||0);if(key==='velocity')return marketVelocity(p);if(key==='fdr')return marketTeamFdr(p.team)??9;if(key==='value')return marketValue(p);return marketNet(p);}
function renderMarketTape(players){const el=$("marketTape");if(!el)return;const key=_marketState.tableSort,dir=_marketState.tableDir;const rows=players.slice().sort((a,b)=>{const av=marketTapeSortValue(a,key),bv=marketTapeSortValue(b,key);return typeof av==='string'?av.localeCompare(bv)*dir:(av-bv)*dir;}).slice(0,50);const heads=[['player','Player'],['price','Price'],['gw','GW pts'],['form','Form'],['own','Owned'],['in','In'],['out','Out'],['net','Net'],['velocity','Velocity'],['fdr','Next5 FDR'],['value','Pts/£m']];el.innerHTML=`<div class="market-tape-scroll"><table class="market-data-table"><thead><tr>${heads.map(([k,l])=>`<th><button type="button" data-sort="${k}">${l}${key===k?` <span>${dir<0?'▼':'▲'}</span>`:''}</button></th>`).join('')}</tr></thead><tbody>${rows.map(p=>{const t=marketTeam(p),net=marketNet(p),fdr=marketTeamFdr(p.team);return `<tr data-id="${p.id}"><td><b>${esc(p.web_name)}</b><small>${esc(t.short_name||'')} · ${POS[p.element_type]||''}</small></td><td>${money(p.now_cost)}</td><td>${Number(p.event_points||0)}</td><td>${Number(p.form||0).toFixed(1)}</td><td>${parseFloat(p.selected_by_percent||0).toFixed(1)}%</td><td class="market-up">${marketN(p.transfers_in_event||0)}</td><td class="market-down">${marketN(p.transfers_out_event||0)}</td><td class="${net>=0?'market-up':'market-down'}">${marketSigned(net)}</td><td class="${marketVelocity(p)>=0?'market-up':'market-down'}">${marketVelocity(p)>=0?'+':''}${marketVelocity(p).toFixed(1)}%</td><td>${fdr==null?'—':fdr.toFixed(2)}</td><td>${marketValue(p).toFixed(2)}</td></tr>`}).join('')}</tbody></table></div>`;el.querySelectorAll('th button').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.sort;if(_marketState.tableSort===k)_marketState.tableDir*=-1;else{_marketState.tableSort=k;_marketState.tableDir=(k==='player'||k==='fdr')?1:-1;}renderMarketTape(players);}));el.querySelectorAll('tbody tr[data-id]').forEach(r=>r.addEventListener('click',()=>marketSelectPlayer(Number(r.dataset.id))));}
