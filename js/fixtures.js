/* ============ FIXTURES / RESULTS / TABLE tab ============ */
let _fxN=5, _fxSort="team", _allFixtures=null, _fxGw=1, _fxView="matches", _fxMatchFilter="all", _rotN=5, _fxLiveTimer=null;

async function initFixtures(){
  $("fxMatches").innerHTML=`<div class="tab-status"><div class="spinner"></div>Loading fixtures…</div>`;
  const b=await loadBoot();
  _allFixtures=await get(`/fixtures/`);
  const initial=activeGameweekEvent(b.events) || b.events[0];
  _fxGw=initial ? initial.id : 1;

  $("fxGwSelect").innerHTML=b.events.map(e=>`<option value="${e.id}">GW${e.id}</option>`).join("");
  $("fxGwSelect").value=String(_fxGw);

  $("fxView").addEventListener("click",e=>{
    const btn=e.target.closest("button[data-v]"); if(!btn) return;
    setFixturesView(btn.dataset.v);
  });
  $("fxPrev").addEventListener("click",()=>setFixtureGw(_fxGw-1));
  $("fxNext").addEventListener("click",()=>setFixtureGw(_fxGw+1));
  $("fxGwSelect").addEventListener("change",()=>setFixtureGw(+(""+$("fxGwSelect").value)));
  $("fxMatchFilter").addEventListener("click",e=>{
    const btn=e.target.closest("button[data-f]"); if(!btn) return;
    _fxMatchFilter=btn.dataset.f;
    $("fxMatchFilter").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn));
    drawMatchCentre();
  });
  $("fxMatches").addEventListener("click",e=>{
    const row=e.target.closest(".fx-match-row[data-fixture-id]"); if(!row) return;
    toggleFixtureDetails(row.dataset.fixtureId);
  });
  $("fxMatches").addEventListener("click",e=>{
    const tab=e.target.closest("[data-fx-detail-tab]"); if(!tab) return;
    e.stopPropagation();
    const details=tab.closest(".fx-match-details"); if(!details) return;
    const key=tab.dataset.fxDetailTab;
    details.querySelectorAll("[data-fx-detail-tab]").forEach(btn=>{
      const active=btn===tab; btn.classList.toggle("active",active); btn.setAttribute("aria-selected",String(active));
    });
    details.querySelectorAll("[data-fx-detail-panel]").forEach(panel=>{
      const active=panel.dataset.fxDetailPanel===key; panel.classList.toggle("active",active); panel.hidden=!active;
    });
  });
  $("fxMatches").addEventListener("keydown",e=>{
    if(e.key!=="Enter"&&e.key!==" ") return;
    const row=e.target.closest(".fx-match-row[data-fixture-id]"); if(!row) return;
    e.preventDefault(); toggleFixtureDetails(row.dataset.fixtureId);
  });
  $("fxRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxN=+x.dataset.n; drawFixtures();});
  $("rotRange").addEventListener("click",e=>{const x=e.target.closest("button[data-n]");if(!x)return;$("rotRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");_rotN=+x.dataset.n;drawRotationPlanner();});
  $("rotTeamA").addEventListener("change",drawRotationPlanner);
  $("rotTeamB").addEventListener("change",drawRotationPlanner);
  const rotOpts=b.teams.slice().sort((a,c)=>a.name.localeCompare(c.name)).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("");
  $("rotTeamA").innerHTML=rotOpts;$("rotTeamB").innerHTML=rotOpts;
  if(b.teams[0]) $("rotTeamA").value=String(b.teams[0].id);if(b.teams[1]) $("rotTeamB").value=String(b.teams[1].id);
  $("fxSort").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxSort").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxSort=x.dataset.s; drawFixtures();});

  setFixturesView("matches");
  drawFixtures();
  drawLeagueTable();
  startFixtureLivePolling();
}

function setFixturesView(view){
  _fxView=view;
  $("fxView").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.v===view));
  $("fxMatchesPanel").hidden=view!=="matches";
  $("fxFdrPanel").hidden=view!=="fdr";
  $("fxTablePanel").hidden=view!=="table";
  $("fxRotationPanel").hidden=view!=="rotation";
  if(view==="matches") drawMatchCentre();
  if(view==="fdr") drawFixtures();
  if(view==="table") drawLeagueTable();
  if(view==="rotation") drawRotationPlanner();
}

function setFixtureGw(gw){
  const max=(boot&&boot.events&&boot.events.length)||38;
  _fxGw=Math.max(1,Math.min(max,Number(gw)||1));
  $("fxGwSelect").value=String(_fxGw);
  drawMatchCentre();
}

function fixtureEventMeta(gw){
  return (boot.events||[]).find(e=>e.id===gw)||{};
}

function fixtureStatus(f){
  if(f.finished || f.finished_provisional) return {label:"FT",cls:"finished"};
  if(f.started){ const m=Number(f.minutes||0); return {label:m>0?`LIVE ${m}'`:"LIVE",cls:"live"}; }
  if(!f.kickoff_time) return {label:"TBC",cls:"tbc"};
  const d=new Date(f.kickoff_time);
  return {label:d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}),cls:"scheduled"};
}

function fixtureDayLabel(f){
  if(!f.kickoff_time) return "Date to be confirmed";
  return new Date(f.kickoff_time).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"short"});
}

function drawMatchCentre(){
  if(!_allFixtures||!boot) return;
  $("fxPrev").disabled=_fxGw<=1;
  $("fxNext").disabled=_fxGw>=38;
  $("fxGwSelect").value=String(_fxGw);
  const ev=fixtureEventMeta(_fxGw);
  const status=eventComplete(ev)?"Completed":ev.is_current?"Current gameweek":ev.is_next?"Up next":_fxGw===1&&!seasonStarted()?"Season opener":"Scheduled";
  $("fxGwStatus").textContent=status;

  let games=_allFixtures.filter(f=>Number(f.event)===_fxGw).sort((a,b)=>String(a.kickoff_time||"").localeCompare(String(b.kickoff_time||"")));
  if(_fxMatchFilter==="fixtures") games=games.filter(f=>!f.finished&&!f.finished_provisional);
  if(_fxMatchFilter==="results") games=games.filter(f=>f.finished||f.finished_provisional);
  if(!games.length){
    const msg=_fxMatchFilter==="results"?"No completed results in this gameweek yet.":_fxMatchFilter==="fixtures"?"No remaining fixtures in this gameweek.":"No fixtures are currently scheduled for this gameweek.";
    $("fxMatches").innerHTML=`<div class="fx-empty"><b>${esc(msg)}</b><span>Use the arrows or Gameweek selector to browse another round.</span></div>`;
    return;
  }

  const groups=[];
  games.forEach(f=>{
    const day=fixtureDayLabel(f);
    let g=groups.find(x=>x.day===day);
    if(!g){g={day,games:[]};groups.push(g);}
    g.games.push(f);
  });
  $("fxMatches").innerHTML=groups.map(group=>`<div class="fx-day-group">
    <div class="fx-day-label">${esc(group.day)}</div>
    <div class="fx-day-games">${group.games.map(matchRowHtml).join("")}</div>
  </div>`).join("");
}

function fixtureStatRows(f, identifier){
  const stat=(f.stats||[]).find(x=>x.identifier===identifier);
  if(!stat) return [];
  return ['h','a'].flatMap(side=>(stat[side]||[]).map(x=>({side,element:Number(x.element),value:Number(x.value)||0})));
}

function fixturePlayerName(id){
  const p=(boot.elements||[]).find(x=>x.id===Number(id));
  return p?p.web_name:`Player ${id}`;
}

function fixtureDetailIcon(identifier){
  const icons={
    goals_scored:'<i class="fa-solid fa-futbol" aria-hidden="true"></i>',
    assists:'<i class="fa-solid fa-handshake-angle" aria-hidden="true"></i>',
    own_goals:'<i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>',
    penalties_saved:'<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>',
    penalties_missed:'<i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>',
    yellow_cards:'<i class="fa-solid fa-square fx-card-icon yellow" aria-hidden="true"></i>',
    red_cards:'<i class="fa-solid fa-square fx-card-icon red" aria-hidden="true"></i>',
    saves:'<i class="fa-solid fa-hand" aria-hidden="true"></i>',
    bonus:'<i class="fa-solid fa-star" aria-hidden="true"></i>',
    bps:'<i class="fa-solid fa-chart-simple" aria-hidden="true"></i>'
  };
  return icons[identifier]||'<i class="fa-solid fa-circle-info" aria-hidden="true"></i>';
}

function fixtureTeamForSide(f,side){
  const teamId=side==='h'?f.team_h:f.team_a;
  return (boot.teams||[]).find(t=>Number(t.id)===Number(teamId))||{};
}

function fixtureDetailTeamColumn(f,side,rows,opts={}){
  const team=fixtureTeamForSide(f,side);
  const sideRows=rows.filter(x=>x.side===side);
  const items=sideRows.map(x=>{
    const name=esc(fixturePlayerName(x.element));
    const value=opts.showValue?` <em>(${x.value})</em>`:(x.value>1?` <em>(${x.value})</em>`:'');
    return `<span class="fx-detail-player">${name}${value}</span>`;
  }).join('');
  return `<div class="fx-detail-team-col ${side==='h'?'home':'away'}">
    <div class="fx-detail-team-name">${teamKitImg(team,'fx-detail-team-kit',`${team.name||''} kit`)}<b>${esc(team.name||team.short_name||'')}</b></div>
    <div class="fx-detail-team-players">${items||'<span class="fx-detail-none">—</span>'}</div>
  </div>`;
}

function fixtureDetailGroup(f, identifier, label, opts={}){
  let rows=fixtureStatRows(f,identifier).filter(x=>opts.includeZero?x.value>=0:x.value>0);
  if(opts.sort!==false) rows=rows.sort((a,b)=>b.value-a.value || fixturePlayerName(a.element).localeCompare(fixturePlayerName(b.element)));
  if(opts.topPerSide){
    rows=['h','a'].flatMap(side=>rows.filter(x=>x.side===side).slice(0,opts.topPerSide));
  } else if(opts.top) rows=rows.slice(0,opts.top);
  if(!rows.length) return '';
  return `<section class="fx-detail-section fx-event-${identifier}">
    <div class="fx-detail-section-title">${fixtureDetailIcon(identifier)}<strong>${esc(label)}</strong></div>
    <div class="fx-detail-team-grid">
      ${fixtureDetailTeamColumn(f,'h',rows,opts)}
      ${fixtureDetailTeamColumn(f,'a',rows,opts)}
    </div>
  </section>`;
}

function fixtureDefconGroup(f){
  // 2025/26+ FPL fixture payload uses defensive_contribution. Keep aliases
  // so older cached/proxied payloads do not silently hide the stat.
  const identifiers=['defensive_contribution','defensive_contributions','defcon'];
  const available=(f.stats||[]).map(x=>String(x.identifier||''));
  const exact=identifiers.find(id=>available.includes(id));
  if(exact) return fixtureDetailGroup(f,exact,'Defensive Contribution',{showValue:true});
  const fuzzy=available.find(id=>id.toLowerCase().includes('defensive')&&id.toLowerCase().includes('contribution'));
  return fuzzy?fixtureDetailGroup(f,fuzzy,'Defensive Contribution',{showValue:true}):'';
}

function fixturePlayerStatsHtml(f){
  // Keep this tab useful without duplicating the match-event view. It lists
  // the core FPL ranking metrics by club when they are available.
  const groups=[
    fixtureDetailGroup(f,'bps','Bonus Points System',{showValue:true}),
    fixtureDefconGroup(f)
  ].filter(Boolean).join('');
  return groups||'<div class="fx-detail-empty">No additional player-stat data are available yet.</div>';
}

function fixtureDetailsHtml(f){
  if(!(f.started||f.finished||f.finished_provisional)) return '';
  // Match details mirrors the official FPL expansion: all event categories,
  // followed by BPS and Defensive Contribution, grouped by home/away club.
  const matchGroups=[
    fixtureDetailGroup(f,'goals_scored','Goals scored'),
    fixtureDetailGroup(f,'assists','Assists'),
    fixtureDetailGroup(f,'own_goals','Own goals'),
    fixtureDetailGroup(f,'yellow_cards','Yellow cards'),
    fixtureDetailGroup(f,'red_cards','Red cards'),
    fixtureDetailGroup(f,'saves','Saves'),
    fixtureDetailGroup(f,'penalties_saved','Penalty saves'),
    fixtureDetailGroup(f,'penalties_missed','Penalties missed'),
    fixtureDetailGroup(f,'bonus','Bonus',{showValue:true}),
    fixtureDetailGroup(f,'bps','Bonus Points System',{showValue:true}),
    fixtureDefconGroup(f)
  ].filter(Boolean).join('');
  const playerGroups=fixturePlayerStatsHtml(f);
  return `<div class="fx-match-details" id="fxDetails-${f.id}" hidden>
    <div class="fx-detail-tabs" role="tablist" aria-label="Fixture details">
      <button type="button" class="active" data-fx-detail-tab="match" role="tab" aria-selected="true">Match details</button>
      <button type="button" data-fx-detail-tab="players" role="tab" aria-selected="false">Player stats</button>
    </div>
    <div class="fx-detail-panel active" data-fx-detail-panel="match">${matchGroups||'<div class="fx-detail-empty">No FPL match events are available yet.</div>'}</div>
    <div class="fx-detail-panel" data-fx-detail-panel="players" hidden>${playerGroups}</div>
  </div>`;
}
function toggleFixtureDetails(id){
  const details=document.getElementById(`fxDetails-${id}`);
  const row=document.querySelector(`.fx-match-row[data-fixture-id="${id}"]`);
  if(!details||!row) return;
  const open=details.hidden;
  details.hidden=!open;
  row.classList.toggle('open',open);
  row.setAttribute('aria-expanded',String(open));
}

function matchRowHtml(f){
  const home=boot.teams.find(t=>t.id===f.team_h)||{};
  const away=boot.teams.find(t=>t.id===f.team_a)||{};
  const st=fixtureStatus(f);
  const hasScore=f.team_h_score!=null&&f.team_a_score!=null;
  const centre=hasScore && (f.finished||f.finished_provisional||f.started)
    ? `<div class="fx-score"><b>${f.team_h_score}</b><span>–</span><b>${f.team_a_score}</b></div>`
    : `<div class="fx-kickoff">${esc(st.label)}</div>`;
  const mobileHome=home.short_name||home.name||"";
  const mobileAway=away.short_name||away.name||"";
  const expandable=f.started||f.finished||f.finished_provisional;
  return `<div class="fx-match-item"><article class="fx-match-row ${st.cls}${expandable?' expandable':''}" ${expandable?`data-fixture-id="${f.id}" role="button" tabindex="0" aria-expanded="false"`:''}>
    <div class="fx-match-team home">
      <div class="fx-match-team-copy"><b>${esc(home.name||"")}</b><small>${esc(mobileHome)}</small></div>
      ${teamKitImg(home,"fx-match-kit",`${home.name||"Home"} kit`)}
    </div>
    <div class="fx-match-centre">${centre}<span class="fx-status ${st.cls}">${esc(st.label)}</span>${expandable?'<span class="fx-expand-hint">Details <i>⌄</i></span>':''}</div>
    <div class="fx-match-team away">
      ${teamKitImg(away,"fx-match-kit",`${away.name||"Away"} kit`)}
      <div class="fx-match-team-copy"><b>${esc(away.name||"")}</b><small>${esc(mobileAway)}</small></div>
    </div>
  </article>${fixtureDetailsHtml(f)}</div>`;
}

function drawFixtures(){
  if(!_allFixtures||!boot) return;
  const b=boot;
  // FDR is forward-looking: start from the first Gameweek that still has
  // at least one unfinished fixture. This avoids showing a completed GW
  // when FPL has not yet flipped its event-level is_current/data_checked flags.
  const unfinishedGws=[...new Set((_allFixtures||[])
    .filter(f=>f.event && !(f.finished || f.finished_provisional))
    .map(f=>Number(f.event))
    .filter(Number.isFinite))].sort((a,c)=>a-c);
  const fallbackEvent=activeGameweekEvent(b.events)||b.events[0]||{id:1};
  const fromGw=unfinishedGws[0] || Number(fallbackEvent.id) || 1;
  const gws=[]; for(let g=fromGw; g<fromGw+_fxN && g<=38; g++) gws.push(g);
  const perTeam={};
  b.teams.forEach(t=>perTeam[t.id]={});
  _allFixtures.filter(f=>f.event && gws.includes(f.event)).forEach(f=>{
    (perTeam[f.team_h][f.event]??=[]).push({opp:f.team_a,home:true,fdr:f.team_h_difficulty});
    (perTeam[f.team_a][f.event]??=[]).push({opp:f.team_h,home:false,fdr:f.team_a_difficulty});
  });
  let teams=b.teams.slice();
  const avg=t=>{let s=0,n=0;gws.forEach(g=>(perTeam[t.id][g]||[]).forEach(x=>{s+=x.fdr;n++;}));return n?s/n:3;};
  if(_fxSort==="easy") teams.sort((a,c)=>avg(a)-avg(c));
  else teams.sort((a,c)=>a.name.localeCompare(c.name));
  const head=`<tr><th class="club">Club</th>${gws.map(g=>`<th>GW${g}</th>`).join("")}<th>Avg</th></tr>`;
  const body=teams.map(t=>{
    const cells=gws.map(g=>{
      const fx=perTeam[t.id][g]||[];
      if(!fx.length) return `<td><div class="cell blank">–</div></td>`;
      return `<td>${fx.map(x=>{const o=b.teams.find(z=>z.id===x.opp)||{};
        return `<div class="cell fdr${x.fdr}">${esc((o.short_name||"").toUpperCase())}<small>${x.home?"H":"A"}</small></div>`;}).join("")}</td>`;
    }).join("");
    const a=avg(t).toFixed(2);
    return `<tr><td class="club"><span class="fx-club-cell">${teamKitImg(t,"fx-grid-kit",`${t.name} kit`)}<b>${esc(t.name)}</b></span></td>${cells}<td><span class="agg">${a}</span></td></tr>`;
  }).join("");
  $("fxGrid").innerHTML=`<table class="fxg"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function rotationFixturesFor(teamId,gws){
  const rows={};gws.forEach(g=>rows[g]=[]);
  (_allFixtures||[]).filter(f=>f.event&&gws.includes(f.event)&&(f.team_h===teamId||f.team_a===teamId)).forEach(f=>{
    const home=f.team_h===teamId;
    rows[f.event].push({opp:home?f.team_a:f.team_h,home,fdr:home?f.team_h_difficulty:f.team_a_difficulty});
  });
  return rows;
}
function drawRotationPlanner(){
  if(!_allFixtures||!boot||!$("rotTeamA")||!$("rotTeamB")) return;
  const a=Number($("rotTeamA").value),b=Number($("rotTeamB").value);
  const start=(activeGameweekEvent(boot.events||[])||boot.events[0]||{id:1}).id;
  const gws=[];for(let g=start;g<start+_rotN&&g<=38;g++)gws.push(g);
  const ra=rotationFixturesFor(a,gws),rb=rotationFixturesFor(b,gws),ta=boot.teams.find(t=>t.id===a)||{},tb=boot.teams.find(t=>t.id===b)||{};
  let quality=0,count=0;
  const cells=gws.map(g=>{
    const aa=ra[g][0],bb=rb[g][0];
    const av=aa?Number(aa.fdr)||3:5,bv=bb?Number(bb.fdr)||3:5;
    const best=av<=bv?{x:aa,t:ta}:{x:bb,t:tb};
    if(best.x){quality+=Math.max(0,6-best.x.fdr);count++;}
    const one=(x,t)=>x?`<div class="rotation-fixture fdr${x.fdr}">${teamKitImg(t,"rotation-kit")}<span><b>${esc(t.short_name||"")}</b><small>${esc((boot.teams.find(z=>z.id===x.opp)||{}).short_name||"")} ${x.home?"H":"A"}</small></span><em>${x.fdr}</em></div>`:`<div class="rotation-fixture blank">No fixture</div>`;
    return `<div class="rotation-gw"><div class="rotation-gw-label">GW${g}</div>${one(aa,ta)}${one(bb,tb)}<div class="rotation-best">Start: <b>${esc(best.t.short_name||"-")}</b></div></div>`;
  }).join("");
  const score=count?Math.max(0,Math.min(10,quality/count*2)).toFixed(1):"-";
  const verdict=score==="-"?"Waiting for fixtures":Number(score)>=8?"Excellent pairing":Number(score)>=6.5?"Useful pairing":Number(score)>=5?"Mixed pairing":"Weak rotation";
  $("rotationBody").innerHTML=`<div class="rotation-explainer"><div class="rotation-explainer-icon">A/B</div><div><b>How to use this</b><p>Choose two clubs if you plan to own a goalkeeper or defender from each. For every Gameweek, FPL Peek compares their official fixture difficulty and tells you which one has the easier fixture to start. It does not mean you should transfer between the clubs each week.</p></div></div><div class="rotation-summary"><div><span>Rotation score</span><strong>${score}<small>/10</small></strong><em>${verdict}</em></div><p><b>8-10:</b> excellent rotation - <b>6.5-7.9:</b> useful - <b>5-6.4:</b> mixed. The score uses official FDR only; player quality still matters.</p></div><div class="rotation-legend"><span>Each GW shows Club A</span><span>Club B</span><span><b>Start</b> = easier fixture</span></div><div class="rotation-grid">${cells}</div>`;
}

function buildLeagueRows(){
  const rows=new Map((boot.teams||[]).map(t=>[t.id,{team:t,p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0}]));
  (_allFixtures||[]).filter(f=>(f.finished||f.finished_provisional)&&f.team_h_score!=null&&f.team_a_score!=null).forEach(f=>{
    const h=rows.get(f.team_h),a=rows.get(f.team_a); if(!h||!a) return;
    const hs=Number(f.team_h_score),as=Number(f.team_a_score);
    h.p++;a.p++;h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
    if(hs>as){h.w++;a.l++;h.pts+=3;}else if(hs<as){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
  });
  for(const r of rows.values()) r.gd=r.gf-r.ga;
  return [...rows.values()].sort((a,b)=>b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || a.team.name.localeCompare(b.team.name));
}

function drawLeagueTable(){
  if(!_allFixtures||!boot) return;
  const rows=buildLeagueRows();
  const played=rows.reduce((s,r)=>s+r.p,0)/2;
  $("fxTableMeta").textContent=played?`Updated from ${played} completed ${played===1?"match":"matches"}.`:`No results yet — standings will update after the first completed match.`;
  $("fxTable").innerHTML=`<thead><tr>
    <th class="pos">#</th><th class="club">Club</th><th>P</th><th class="optional">W</th><th class="optional">D</th><th class="optional">L</th><th class="optional-wide">GF</th><th class="optional-wide">GA</th><th>GD</th><th class="pts">Pts</th>
  </tr></thead><tbody>${rows.map((r,i)=>`<tr>
    <td class="pos">${i+1}</td>
    <td class="club"><span class="fx-table-club">${teamKitImg(r.team,"fx-table-kit",`${r.team.name} kit`)}<span><b>${esc(r.team.name)}</b><small>${esc(r.team.short_name||"")}</small></span></span></td>
    <td>${r.p}</td><td class="optional">${r.w}</td><td class="optional">${r.d}</td><td class="optional">${r.l}</td><td class="optional-wide">${r.gf}</td><td class="optional-wide">${r.ga}</td><td>${r.gd>0?"+":""}${r.gd}</td><td class="pts"><b>${r.pts}</b></td>
  </tr>`).join("")}</tbody>`;
}


async function refreshFixtureLiveData(){
  if(document.hidden || _fxView!=="matches") return;
  try{
    const fresh=await get('/fixtures/');
    _allFixtures=fresh;
    drawMatchCentre();
    drawLeagueTable();
  }catch(_){ }
}

function startFixtureLivePolling(){
  if(_fxLiveTimer) return;
  _fxLiveTimer=setInterval(refreshFixtureLiveData,30000);
}
