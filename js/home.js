/* ============ home dashboard ============ */
let _homeReady=false, _homeLiveTimer=null;

function homeLoadingMarkup(label="Loading FPL data…"){
  return `<div class="home-loading-state" role="status" aria-live="polite">
    <img class="home-soccer-loader" src="/assets/fpl-soccer-loader.svg" alt="" aria-hidden="true">
    <span>${esc(label)}</span>
  </div>`;
}

function setHomeLoadingStates(){
  if($("homeGameweek")) $("homeGameweek").innerHTML=`<div class="home-card-label">Gameweek</div>${homeLoadingMarkup("Checking Gameweek status…")}`;
  if($("homeFixtures")) $("homeFixtures").innerHTML=homeLoadingMarkup("Loading upcoming fixtures…");
}

async function initHome(){
  bindHomeActions();
  renderHomeRecent();
  renderHomeSavedTeam();
  if(_homeReady) return;
  _homeReady=true;
  setHomeLoadingStates();

  try{
    // Bootstrap is the critical request. Fixture data is useful, but a fixture
    // request failure should not prevent Gameweek status or Home insights from rendering.
    const b=await loadBoot();
    let fixtures=[];
    let fixtureError=null;
    try{
      fixtures=await get("/fixtures/");
    }catch(err){
      fixtureError=err;
      console.warn("Home fixtures request failed", err);
    }

    renderHomeGameweek(b,fixtures);
    renderHomeInsights(b);

    if(fixtureError){
      renderHomeLiveMatches(b,[]);
      if($("homeFixtures")) $("homeFixtures").innerHTML=`<div class="home-empty">Couldn’t load fixture data right now. <button class="home-inline-btn" onclick="_homeReady=false;initHome()">Try again</button></div>`;
    }else{
      renderHomeLiveMatches(b,fixtures);
      renderHomeBestFixtures(b,fixtures);
      startHomeLivePolling();
    }

    await enrichHomeSavedTeam();
  }catch(e){
    console.error("Home bootstrap failed", e);
    const msg=`<div class="home-empty">Couldn’t load live FPL data right now. <button class="home-inline-btn" onclick="_homeReady=false;initHome()">Try again</button></div>`;
    if($("homeGameweek")) $("homeGameweek").innerHTML=`<div class="home-card-label">Gameweek</div>${msg}`;
    if($("homeInsights")) $("homeInsights").innerHTML=msg;
    if($("homeFixtures")) $("homeFixtures").innerHTML=msg;
  }
}

function bindHomeActions(){
  if(!$("homeGo") || $("homeGo").dataset.bound) return;
  $("homeGo").dataset.bound="1";
  const openTeam=()=>{
    const id=String($("homeTeamId").value||"").trim();
    if(!id) return;
    $("tid").value=id;
    switchTab("team");
    view(id);
  };
  $("homeGo").onclick=openTeam;
  $("homeTeamId").addEventListener("keydown",e=>{ if(e.key==="Enter") openTeam(); });
  document.querySelectorAll("[data-home-tab]").forEach(btn=>{
    btn.onclick=()=>switchTab(btn.dataset.homeTab);
  });
}

function renderHomeRecent(){
  const el=$("homeRecent"); if(!el) return;
  const rows=recentIds().slice(0,4);
  if(!rows.length){ el.innerHTML=`<span class="home-recent-hint">Tip: your Team ID is the number after <b>/entry/</b> in your FPL URL.</span>`; return; }
  el.innerHTML=`<span class="home-recent-label">Recent</span>${rows.map(r=>`<button class="home-recent-chip" data-id="${esc(r.id)}">${esc(r.name||r.id)}</button>`).join("")}`;
  el.querySelectorAll(".home-recent-chip").forEach(btn=>btn.onclick=()=>{
    $("homeTeamId").value=btn.dataset.id;
    $("tid").value=btn.dataset.id;
    switchTab("team"); view(btn.dataset.id);
  });
}

function renderHomeSavedTeam(){
  const el=$("homeSavedTeam"); if(!el) return;
  const st=savedTeam();
  if(!st||!st.id){
    el.innerHTML=`<div class="home-card-label">Your team</div><div class="home-card-value small">Not linked yet</div><div class="home-card-sub">Enter your Team ID above to save it on this device.</div>`;
    return;
  }
  el.innerHTML=`<div class="home-card-label">Your team</div><div class="home-card-value small">${esc(st.name||`Team ${st.id}`)}</div><div class="home-card-sub">Team ID ${esc(st.id)}</div><div class="home-card-actions"><button class="home-card-action" id="homeSavedOpen">View team</button><button class="home-card-action secondary" id="homeSavedAnalyze">Analyze</button></div>`;
  $("homeSavedOpen").onclick=()=>{ $("tid").value=st.id; switchTab("team"); view(st.id); };
  $("homeSavedAnalyze").onclick=()=>{ switchTab("analyzer"); $("anTeamId").value=st.id; runTeamAnalyzer(st.id); };
}

async function enrichHomeSavedTeam(){
  const st=savedTeam(); if(!st||!st.id||!$("homeSavedTeam")) return;
  try{
    const [entry, history]=await Promise.all([
      get(`/entry/${st.id}/`),
      get(`/entry/${st.id}/history/`).catch(()=>null)
    ]);
    const pts=entry.summary_overall_points||0;
    const rank=entry.summary_overall_rank;
    const past=(history&&history.past)||[];
    const careerPts=past.reduce((sum,row)=>sum+(row.total_points||0),0);
    const best=past.length?past.reduce((a,row)=>(row.total_points||0)>(a.total_points||0)?row:a):null;
    const manager=[entry.player_first_name,entry.player_last_name].filter(Boolean).join(" ");
    const currentLine=(pts||rank)?`<div class="home-current-season"><span>This season</span><b>${pts?short(pts):"—"} pts</b><b>${rank?short(rank):"—"} rank</b></div>`:"";
    const careerGrid=past.length?`<div class="home-career-grid">
        <div><span>Career pts</span><b>${short(careerPts)}</b></div>
        <div><span>Best season</span><b>${best?short(best.total_points):"—"}</b><small>${best?esc(best.season_name):""}</small></div>
        <div><span>Best rank</span><b>${best&&best.rank?short(best.rank):"—"}</b></div>
        <div><span>Seasons</span><b>${past.length}</b></div>
      </div>`:"";
    $("homeSavedTeam").innerHTML=`
      <div class="home-card-label">Your team</div>
      <div class="home-card-value small">${esc(entry.name||st.name||`Team ${st.id}`)}</div>
      ${manager?`<div class="home-manager-name">${esc(manager)}${entry.player_region_name?` · ${esc(entry.player_region_name)}`:""}</div>`:""}
      ${currentLine}
      ${careerGrid}
      <div class="home-card-actions"><button class="home-card-action" id="homeSavedOpen">View team</button><button class="home-card-action secondary" id="homeSavedAnalyze">Analyze</button></div>`;
    $("homeSavedOpen").onclick=()=>{ $("tid").value=st.id; switchTab("team"); view(st.id); };
    $("homeSavedAnalyze").onclick=()=>{ switchTab("analyzer"); $("anTeamId").value=st.id; runTeamAnalyzer(st.id); };
  }catch(_){ /* saved-team shell is still useful */ }
}

function renderHomeGameweek(b,fixtures=[]){
  const el=$("homeGameweek"); if(!el) return;
  const events=b.events||[];
  const current=events.find(e=>e.is_current);
  const next=events.find(e=>e.is_next);
  const previous=[...events].reverse().find(e=>eventComplete(e));
  const total=b.total_players?short(b.total_players):"—";

  // Before GW1 starts, avoid showing an empty-looking statistics card.
  if(!current && next && !previous){
    el.innerHTML=`
      <div class="home-card-label">Gameweek status</div>
      <div class="home-gw-status-row"><div class="home-card-value small">GW${next.id} is next</div><span class="home-gw-pill">Pre-season</span></div>
      <div class="home-card-sub">The season hasn’t started yet.</div>
      <div class="home-gw-note">Average score, highest score and live Gameweek stats will appear here after the first deadline.</div>
      <div class="home-gw-meta">${total} managers registered</div>`;
    return;
  }

  const currentFixtures=(fixtures||[]).filter(f=>f.event===current?.id);
  const currentDone=!!(current&&(eventComplete(current)||(currentFixtures.length&&currentFixtures.every(f=>f.finished||f.finished_provisional))));
  const ev=(current&&!currentDone)?current:(next||current||previous||events[0]);
  if(!ev){
    el.innerHTML=`<div class="home-card-label">Gameweek status</div><div class="home-card-value small">Season setup</div><div class="home-card-sub">Gameweek data is not available yet.</div>`;
    return;
  }

  const live=!!(current&&!currentDone&&ev.id===current.id);
  const avg=Number(ev.average_entry_score||0);
  const high=Number(ev.highest_score||0);
  const status=live?"Live":eventComplete(ev)?"Final":ev.is_next?"Up next":"Gameweek";
  el.innerHTML=`
    <div class="home-card-label">Gameweek status</div>
    <div class="home-gw-status-row"><div class="home-card-value small">GW${ev.id}</div><span class="home-gw-pill${live?" live":""}">${status}</span></div>
    <div class="home-gw-stats">
      <div><span>Average</span><b>${avg?avg:"—"}</b></div>
      <div><span>Highest</span><b>${high?high:"—"}</b></div>
      <div><span>Managers</span><b>${total}</b></div>
    </div>
    ${!avg&&!high?`<div class="home-gw-note">Scores will populate once Gameweek data is available.</div>`:""}`;
}

function homeInsightCard(kind, title, e, t, value, sub){
  if(!e) return `<div class="home-insight"><div class="home-insight-type">${esc(kind)}</div><div class="home-insight-name">No data yet</div><div class="home-insight-sub">Check back after the market starts moving.</div></div>`;
  return `<div class="home-insight">
    <div class="home-insight-type">${esc(kind)}</div>
    <div class="home-insight-player">${teamKitImg(t,"home-kit",`${t.name||"Club"} kit`)}<div><div class="home-insight-name">${esc(e.web_name)}</div><div class="home-insight-meta">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</div></div></div>
    <div class="home-insight-value">${esc(value)}</div>
    <div class="home-insight-sub">${esc(sub)}</div>
  </div>`;
}

function renderHomeInsights(b){
  const el=$("homeInsights"); if(!el) return;
  const teams=Object.fromEntries((b.teams||[]).map(t=>[t.id,t]));
  const players=b.elements||[];
  const available=players.filter(e=>e.status==="a");
  const transferCandidate=[...available].sort((a,c)=>(c.transfers_in_event||0)-(a.transfers_in_event||0))[0];
  const transfer=(transferCandidate && (transferCandidate.transfers_in_event||0)>0)?transferCandidate:null;
  const popular=[...available].sort((a,c)=>parseFloat(c.selected_by_percent||0)-parseFloat(a.selected_by_percent||0))[0];
  let riser=[...players].filter(e=>(e.cost_change_event||0)>0).sort((a,c)=>(c.cost_change_event||0)-(a.cost_change_event||0))[0];
  let priceSub="Price rise this gameweek";
  if(!riser){ riser=[...players].filter(e=>(e.cost_change_start||0)>0).sort((a,c)=>(c.cost_change_start||0)-(a.cost_change_start||0))[0]; priceSub="Up since season launch"; }
  const transferVal=transfer?`+${short(transfer.transfers_in_event||0)}`:"—";
  const popularVal=popular?`${popular.selected_by_percent}%`:"—";
  const riseVal=riser?`+£${((riser.cost_change_event||riser.cost_change_start||0)/10).toFixed(1)}`:"—";
  el.innerHTML=[
    homeInsightCard("Transfer trend","Most bought",transfer,transfer&&teams[transfer.team],transferVal,transfer?"transfers in this GW":"Starts after GW transfer activity"),
    homeInsightCard("Template watch","Most owned",popular,popular&&teams[popular.team],popularVal,"selected by managers"),
    homeInsightCard("Price watch","Riser",riser,riser&&teams[riser.team],riseVal,priceSub)
  ].join("");
}

function renderHomeBestFixtures(b, fixtures){
  const el=$("homeFixtures"); if(!el) return;
  const events=b.events||[];
  const cur=events.find(e=>e.is_current), active=(cur&&!eventComplete(cur))?cur:(events.find(e=>e.is_next)||cur);
  const start=(active||events[0]||{}).id||1;
  const map=buildFixtureMap(fixtures,start);
  const rows=(b.teams||[]).map(t=>{
    const fx=(map[t.id]||[]).slice(0,3);
    const avg=fx.length?fx.reduce((a,f)=>a+(f.fdr||3),0)/fx.length:99;
    return {t,fx,avg};
  }).filter(x=>x.fx.length).sort((a,c)=>a.avg-c.avg).slice(0,4);
  if(!rows.length){ el.innerHTML=`<div class="home-empty">Fixture data will appear here once the schedule is available.</div>`; return; }
  el.innerHTML=rows.map(({t,fx,avg},i)=>`<div class="home-fixture-row">
      <div class="home-fixture-rank">${i+1}</div>
      ${teamKitImg(t,"home-fixture-kit")}
      <div class="home-fixture-team"><b>${esc(t.name)}</b><small>${esc(t.short_name)}</small></div>
      <div class="home-fixture-run">${fx.map(f=>{ const opp=(b.teams||[]).find(z=>z.id===f.opp)||{}; const code=f.home?(opp.short_name||""):(opp.short_name||"").toLowerCase(); return `<span class="fdr${f.fdr}" title="GW${f.gw} · ${esc(opp.name||"")}">${esc(code)}</span>`; }).join("")}</div>
      <div class="home-fixture-avg"><b>${avg.toFixed(2)}</b><small>avg FDR</small></div>
    </div>`).join("");
}


function homeLiveStatus(f){
  const minute=Number(f.minutes||0);
  return minute>0?`LIVE · ${minute}'`:'LIVE';
}

function homeFixtureStat(f, identifier){
  return ((f&&f.stats)||[]).find(s=>s.identifier===identifier)||{h:[],a:[]};
}

function homeLiveEventNames(rows, playerMap){
  return (rows||[]).map(row=>{
    const player=playerMap[row.element];
    if(!player) return '';
    const qty=Number(row.value||0);
    return `${player.web_name}${qty>1?` ×${qty}`:''}`;
  }).filter(Boolean);
}

function homeLiveSideInfo(f, side, playerMap){
  const goals=homeFixtureStat(f,'goals_scored')[side]||[];
  const reds=homeFixtureStat(f,'red_cards')[side]||[];
  const yellows=homeFixtureStat(f,'yellow_cards')[side]||[];
  return {
    scorerNames:homeLiveEventNames(goals,playerMap),
    redNames:homeLiveEventNames(reds,playerMap),
    yellowNames:homeLiveEventNames(yellows,playerMap)
  };
}

function homeLiveCompactNames(names,max=1){
  if(!names.length) return '';
  const visible=names.slice(0,max);
  const more=names.length-visible.length;
  return `${visible.join(', ')}${more?` +${more}`:''}`;
}

function homeLiveScorers(names){
  if(!names.length) return '';
  const label=homeLiveCompactNames(names,2);
  return `<small class="home-live-scorers" title="${esc(names.join(', '))}"><i class="fa-solid fa-futbol"></i><span>${esc(label)}</span></small>`;
}

function homeLiveDiscipline(yellows,reds){
  if(!yellows.length&&!reds.length) return '';
  const y=yellows.join(', '),r=reds.join(', ');
  return `<small class="home-live-discipline">${yellows.length?`<span class="home-live-card home-live-card-yellow" title="Yellow: ${esc(y)}"><i aria-hidden="true"></i><b>${esc(y)}</b></span>`:''}${reds.length?`<span class="home-live-card home-live-card-red" title="Red: ${esc(r)}"><i aria-hidden="true"></i><b>${esc(r)}</b></span>`:''}</small>`;
}

function setupHomeLiveCarousel(el, count){
  if(count<4) return;
  const tape=el.querySelector('.home-live-tape');
  const prev=el.querySelector('[data-live-prev]');
  const next=el.querySelector('[data-live-next]');
  if(!tape||!prev||!next) return;
  const step=()=>Math.max(260,Math.min(420,tape.clientWidth/3));
  const move=dir=>tape.scrollBy({left:dir*step(),behavior:'smooth'});
  prev.onclick=e=>{e.stopPropagation();move(-1)};
  next.onclick=e=>{e.stopPropagation();move(1)};
  let paused=false;
  let timer=null;
  const start=()=>{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if(timer) clearInterval(timer);
    timer=setInterval(()=>{
      if(paused||document.hidden) return;
      const nearEnd=tape.scrollLeft+tape.clientWidth>=tape.scrollWidth-10;
      tape.scrollTo({left:nearEnd?0:tape.scrollLeft+step(),behavior:'smooth'});
    },5500);
  };
  const stop=()=>{if(timer){clearInterval(timer);timer=null}};
  tape.addEventListener('mouseenter',()=>paused=true);
  tape.addEventListener('mouseleave',()=>paused=false);
  tape.addEventListener('pointerdown',()=>paused=true,{passive:true});
  tape.addEventListener('pointerup',()=>{paused=false},{passive:true});
  start();
  el._liveCarouselCleanup=stop;
}

function renderHomeLiveMatches(b, fixtures){
  const el=$("homeLiveMatches"); if(!el) return;
  if(el._liveCarouselCleanup){el._liveCarouselCleanup();el._liveCarouselCleanup=null;}
  const teams=Object.fromEntries((b.teams||[]).map(t=>[t.id,t]));
  const playerMap=Object.fromEntries((b.elements||[]).map(p=>[p.id,p]));
  const live=(fixtures||[]).filter(f=>f.started && !f.finished && !f.finished_provisional);
  if(!live.length){el.hidden=true;el.innerHTML='';return;}
  const carousel=live.length>=4;
  el.hidden=false;
  el.innerHTML=`<div class="home-live-head">
      <div class="home-live-title"><span class="home-live-dot" aria-hidden="true"></span><b>LIVE NOW</b><span class="home-live-headline">Premier League matchday</span></div>
      <div class="home-live-head-actions">${carousel?`<button type="button" class="home-live-nav" data-live-prev aria-label="Previous live matches"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="home-live-nav" data-live-next aria-label="Next live matches"><i class="fa-solid fa-chevron-right"></i></button>`:''}<small>${live.length} match${live.length===1?'':'es'} in progress</small></div>
    </div>
    <div class="home-live-tape${carousel?' is-carousel':''}">${live.map(f=>{
      const h=teams[f.team_h]||{},a=teams[f.team_a]||{};
      const hs=homeLiveSideInfo(f,'h',playerMap),as=homeLiveSideInfo(f,'a',playerMap);
      return `<button class="home-live-match" data-live-gw="${f.event||1}">
        <div class="home-live-match-top"><span class="home-live-minute"><i class="fa-solid fa-circle"></i>${esc(homeLiveStatus(f))}</span><span class="home-live-details">Match centre <i class="fa-solid fa-arrow-right"></i></span></div>
        <div class="home-live-scoreboard">
          <div class="home-live-side home-live-side-home">${teamKitImg(h,'home-live-kit',`${h.name||'Home'} kit`)}<span class="home-live-teammeta"><b>${esc(h.short_name||h.name||'HOME')}</b>${homeLiveScorers(hs.scorerNames)}${homeLiveDiscipline(hs.yellowNames,hs.redNames)}</span></div>
          <div class="home-live-score"><strong>${f.team_h_score??0}</strong><span>–</span><strong>${f.team_a_score??0}</strong></div>
          <div class="home-live-side home-live-side-away"><span class="home-live-teammeta"><b>${esc(a.short_name||a.name||'AWAY')}</b>${homeLiveScorers(as.scorerNames)}${homeLiveDiscipline(as.yellowNames,as.redNames)}</span>${teamKitImg(a,'home-live-kit',`${a.name||'Away'} kit`)}</div>
        </div>
      </button>`
    }).join('')}</div>`;
  el.querySelectorAll('[data-live-gw]').forEach(btn=>btn.onclick=()=>{
    const gw=Number(btn.dataset.liveGw)||1;
    switchTab('fixtures');
    setTimeout(()=>{if(typeof setFixtureGw==='function') setFixtureGw(gw);},0);
  });
  setupHomeLiveCarousel(el,live.length);
}

async function refreshHomeLiveMatches(){
  if(document.hidden || !$("homeLiveMatches")) return;
  try{
    const b=await loadBoot();
    const fixtures=await get('/fixtures/');
    renderHomeLiveMatches(b,fixtures);
  }catch(_){ }
}

function startHomeLivePolling(){
  if(_homeLiveTimer) return;
  _homeLiveTimer=setInterval(refreshHomeLiveMatches,45000);
}
