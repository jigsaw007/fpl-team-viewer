/* ============ FIXTURES / RESULTS / TABLE tab ============ */
let _fxN=5, _fxSort="team", _allFixtures=null, _fxGw=1, _fxView="matches", _fxMatchFilter="all";

async function initFixtures(){
  $("fxMatches").innerHTML=`<div class="tab-status"><div class="spinner"></div>Loading fixtures…</div>`;
  const b=await loadBoot();
  _allFixtures=await get(`/fixtures/`);
  const initial=b.events.find(e=>e.is_current) || b.events.find(e=>e.is_next) || b.events.find(e=>!e.finished) || b.events[0];
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
  $("fxRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxN=+x.dataset.n; drawFixtures();});
  $("fxSort").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxSort").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxSort=x.dataset.s; drawFixtures();});

  setFixturesView("matches");
  drawFixtures();
  drawLeagueTable();
}

function setFixturesView(view){
  _fxView=view;
  $("fxView").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.v===view));
  $("fxMatchesPanel").hidden=view!=="matches";
  $("fxFdrPanel").hidden=view!=="fdr";
  $("fxTablePanel").hidden=view!=="table";
  if(view==="matches") drawMatchCentre();
  if(view==="fdr") drawFixtures();
  if(view==="table") drawLeagueTable();
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
  if(f.started) return {label:"LIVE",cls:"live"};
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
  const status=ev.finished?"Completed":ev.is_current?"Current gameweek":ev.is_next?"Up next":_fxGw===1&&!seasonStarted()?"Season opener":"Scheduled";
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
  return `<article class="fx-match-row ${st.cls}">
    <div class="fx-match-team home">
      <div class="fx-match-team-copy"><b>${esc(home.name||"")}</b><small>${esc(mobileHome)}</small></div>
      ${teamKitImg(home,"fx-match-kit",`${home.name||"Home"} kit`)}
    </div>
    <div class="fx-match-centre">${centre}<span class="fx-status ${st.cls}">${esc(st.label)}</span></div>
    <div class="fx-match-team away">
      ${teamKitImg(away,"fx-match-kit",`${away.name||"Away"} kit`)}
      <div class="fx-match-team-copy"><b>${esc(away.name||"")}</b><small>${esc(mobileAway)}</small></div>
    </div>
  </article>`;
}

function drawFixtures(){
  if(!_allFixtures||!boot) return;
  const b=boot;
  const curEvent=b.events.find(e=>e.is_current);
  const nextEvent=b.events.find(e=>e.is_next);
  const fromGw=(curEvent||nextEvent||b.events.find(e=>!e.finished)||b.events[0]).id;
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
