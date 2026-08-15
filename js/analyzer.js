/* ============ TEAM ANALYZER ============ */
let _analyzerBound=false;

async function initAnalyzer(){
  await loadBoot();
  if(!_analyzerBound){
    _analyzerBound=true;
    const st=savedTeam();
    if(st&&st.id) $("anTeamId").value=st.id;
    $("anRun").onclick=()=>runTeamAnalyzer($("anTeamId").value);
    $("anTeamId").addEventListener("keydown",e=>{if(e.key==="Enter") runTeamAnalyzer($("anTeamId").value);});
  }
}

function analyzerCard(label,value,sub,tone=""){
  return `<div class="analysis-stat ${tone}"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(sub||"")}</small></div>`;
}

function analyzerConcernRow(title,detail,kind="neutral"){
  return `<div class="analysis-list-row ${kind}"><div><b>${esc(title)}</b><small>${esc(detail)}</small></div></div>`;
}

async function runTeamAnalyzer(rawId){
  const id=String(rawId||"").trim();
  const out=$("analyzerBody");
  if(!/^\d+$/.test(id)){ out.innerHTML=`<div class="tool-empty bad">Enter a valid numeric Team ID.</div>`; return; }
  out.innerHTML=`<div class="tool-loading">Analyzing team ${esc(id)}...</div>`;
  try{
    const [b,entry,history,fixtures]=await Promise.all([loadBoot(),get(`/entry/${id}/`),get(`/entry/${id}/history/`).catch(()=>null),get("/fixtures/")]);
    const publicPicks=await latestPublicPicks(id);
    const last=(history&&history.current&&history.current.length)?history.current[history.current.length-1]:null;
    if(!publicPicks){
      const best=(history&&history.past||[]).slice().sort((a,c)=>(c.total_points||0)-(a.total_points||0))[0];
      out.innerHTML=`<div class="analysis-manager-head"><div><span class="analysis-eyebrow">${esc(entry.player_first_name||"")} ${esc(entry.player_last_name||"")}</span><h3>${esc(entry.name||`Team ${id}`)}</h3></div><span class="analysis-id">ID ${esc(id)}</span></div>
        <div class="analysis-summary-grid">${analyzerCard("Overall rank",entry.summary_overall_rank?short(entry.summary_overall_rank):"-","Current season")}${analyzerCard("Best season",best?String(best.total_points):"-",best?best.season_name:"No history")}${analyzerCard("Team value",last&&last.value?`£${(last.value/10).toFixed(1)}m`:"-","Latest public value")}</div>
        ${gwStartNotice("Full squad analysis")}`;
      return;
    }
    const {gw,data:picks}=publicPicks;
    const teams=b.teams||[];
    const byId=Object.fromEntries((b.elements||[]).map(e=>[e.id,e]));
    const squad=(picks.picks||[]).map(p=>({pick:p,e:byId[p.element]})).filter(x=>x.e);
    const start=(b.events.find(e=>e.is_current)||b.events.find(e=>e.is_next)||b.events[0]||{}).id||gw;
    const fmap=buildFixtureMap(fixtures,start);
    const flagged=squad.filter(x=>x.e.status!=="a");
    const avgFdrVals=squad.map(x=>fixtureAverageForTeam(x.e.team,fmap,5)).filter(v=>v!=null);
    const avgFdr=avgFdrVals.length?avgFdrVals.reduce((a,v)=>a+v,0)/avgFdrVals.length:null;
    const scored=squad.map(x=>({...x,score:playerWindowScore(x.e,fmap,5),fdr:fixtureAverageForTeam(x.e.team,fmap,5)})).sort((a,c)=>c.score-a.score);
    const captain=scored[0];
    const bank=(picks.entry_history&&Number(picks.entry_history.bank))||0;
    const value=(picks.entry_history&&Number(picks.entry_history.value))||0;
    const clubCounts={}; squad.forEach(x=>clubCounts[x.e.team]=(clubCounts[x.e.team]||0)+1);
    const squadIds=new Set(squad.map(x=>x.e.id));
    const weak=[...scored].sort((a,c)=>a.score-c.score).slice(0,5);
    const upgradeIdeas=[];
    for(const cur of weak){
      const maxCost=cur.e.now_cost+bank;
      const candidates=(b.elements||[]).filter(e=>e.element_type===cur.e.element_type && !squadIds.has(e.id) && e.status==="a" && e.now_cost<=maxCost && (clubCounts[e.team]||0)<3)
        .map(e=>({e,score:playerWindowScore(e,fmap,5)})).filter(x=>x.score>cur.score+1.25).sort((a,c)=>c.score-a.score);
      if(candidates[0]) upgradeIdeas.push({from:cur,to:candidates[0],delta:candidates[0].score-cur.score});
      if(upgradeIdeas.length>=3) break;
    }
    const concerns=[];
    flagged.slice(0,4).forEach(x=>concerns.push(analyzerConcernRow(x.e.web_name,x.e.news||`${x.e.chance_of_playing_next_round??"?"}% chance of playing`,"bad")));
    scored.filter(x=>x.fdr!=null&&x.fdr>=3.5).slice(0,3).forEach(x=>concerns.push(analyzerConcernRow(x.e.web_name,`Tough next-five run: ${x.fdr.toFixed(2)} average FDR`,"warn")));
    if(!concerns.length) concerns.push(analyzerConcernRow("No obvious red flags","Availability and upcoming fixtures look reasonably healthy.","good"));
    const capRows=scored.slice(0,3).map((x,i)=>{const t=teams.find(z=>z.id===x.e.team)||{};return `<div class="analysis-player-row">${teamKitImg(t,"analysis-kit")}<span class="analysis-rank">${i+1}</span><div><b>${esc(x.e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[x.e.element_type]} · ${money(x.e.now_cost)}</small></div><div class="analysis-right"><b>${x.score.toFixed(1)}</b><small>5-GW profile</small></div></div>`;}).join("");
    const upgrades=upgradeIdeas.length?upgradeIdeas.map(u=>{const ft=teams.find(t=>t.id===u.from.e.team)||{},tt=teams.find(t=>t.id===u.to.e.team)||{};return `<div class="upgrade-row"><div class="upgrade-player">${teamKitImg(ft,"analysis-kit")}<span><small>Current</small><b>${esc(u.from.e.web_name)}</b><em>${money(u.from.e.now_cost)}</em></span></div><span class="upgrade-arrow">&rsaquo;</span><div class="upgrade-player">${teamKitImg(tt,"analysis-kit")}<span><small>Shortlist</small><b>${esc(u.to.e.web_name)}</b><em>${money(u.to.e.now_cost)}</em></span></div><div class="upgrade-delta">+${u.delta.toFixed(1)}</div></div>`;}).join(""):`<div class="tool-empty compact">No clear same-position upgrade stood out within the current bank and club limits.</div>`;
    out.innerHTML=`
      <div class="analysis-manager-head"><div><span class="analysis-eyebrow">GW${gw} squad check</span><h3>${esc(entry.name)}</h3><p>${esc(entry.player_first_name||"")} ${esc(entry.player_last_name||"")}</p></div><span class="analysis-id">ID ${esc(id)}</span></div>
      <div class="analysis-summary-grid">
        ${analyzerCard("Availability",flagged.length?`${flagged.length} flagged`:"All clear",flagged.length?"Players need attention":"No flagged squad players",flagged.length?"warn":"good")}
        ${analyzerCard("Next 5 fixtures",avgFdr?avgFdr.toFixed(2):"-","Average squad FDR")}
        ${analyzerCard("Captain lead",captain?captain.e.web_name:"-",captain?`${captain.score.toFixed(1)} short-term profile`:"")}
        ${analyzerCard("Squad value",value?`£${(value/10).toFixed(1)}m`:"-",`Bank ${money(bank)}`)}
      </div>
      <div class="analysis-two-col">
        <section class="analysis-panel"><div class="analysis-panel-head"><div><span>Priority checks</span><h4>What needs attention</h4></div></div><div class="analysis-list">${concerns.join("")}</div></section>
        <section class="analysis-panel"><div class="analysis-panel-head"><div><span>Captain shortlist</span><h4>Best current profiles</h4></div></div>${capRows}</section>
      </div>
      <section class="analysis-panel"><div class="analysis-panel-head"><div><span>Upgrade radar</span><h4>Possible areas to improve</h4><p>Uses current list prices, your reported bank, availability and the next five fixtures. Treat this as a shortlist, not a transfer instruction.</p></div></div><div class="upgrade-list">${upgrades}</div></section>`;
  }catch(e){
    out.innerHTML=`<div class="tool-empty bad">Could not analyze that team. ${esc(e.message)}</div>`;
  }
}
