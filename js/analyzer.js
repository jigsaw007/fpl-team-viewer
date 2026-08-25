/* ============ TEAM ANALYZER / TEAM RATING 2.0 ============ */
let _analyzerBound=false;

async function initAnalyzer(){
  await loadBoot();
  const head=document.querySelector("#tab-analyzer .thead h2");
  if(head && !head.parentElement.querySelector(".beta-badge-lg")){
    const wrap=document.createElement("div");wrap.className="title-with-badge";head.parentNode.insertBefore(wrap,head);wrap.appendChild(head);wrap.insertAdjacentHTML("beforeend",'<span class="beta-badge beta-badge-lg">BETA</span>');
  }
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
function clampRating(v){return Math.max(0,Math.min(100,Math.round(v)));}
function ratingTone(v){return v>=82?"excellent":v>=70?"good":v>=58?"fair":"watch";}
function ratingBreakdownRow(label,value,detail){
  const v=clampRating(value);
  return `<div class="rating-row"><div class="rating-row-copy"><b>${esc(label)}</b><small>${esc(detail)}</small></div><div class="rating-track"><i style="width:${v}%"></i></div><strong>${v}</strong></div>`;
}
async function runTeamAnalyzer(rawId){
  const id=String(rawId||"").trim(),out=$("analyzerBody");
  if(!/^\d+$/.test(id)){out.innerHTML=`<div class="tool-empty bad">Enter a valid numeric Team ID.</div>`;return;}
  out.innerHTML=`<div class="tool-loading">Rating team ${esc(id)}...</div>`;
  try{
    const [b,entry,history,fixtures]=await Promise.all([loadBoot(),get(`/entry/${id}/`),get(`/entry/${id}/history/`).catch(()=>null),get("/fixtures/")]);
    const publicPicks=await latestPublicPicks(id);
    const last=(history&&history.current&&history.current.length)?history.current[history.current.length-1]:null;
    if(!publicPicks){
      const best=(history&&history.past||[]).slice().sort((a,c)=>(c.total_points||0)-(a.total_points||0))[0];
      out.innerHTML=`<div class="analysis-manager-head"><div><span class="analysis-eyebrow">Team Rating</span><h3>${esc(entry.name||`Team ${id}`)}</h3></div><span class="analysis-id">ID ${esc(id)}</span></div>
        <div class="analysis-summary-grid">${analyzerCard("Overall rank",entry.summary_overall_rank?short(entry.summary_overall_rank):"-","Current season")}${analyzerCard("Best season",best?String(best.total_points):"-",best?best.season_name:"No history")}${analyzerCard("Team value",last&&last.value?`£${(last.value/10).toFixed(1)}m`:"-","Latest public value")}</div>
        ${gwStartNotice("Team Rating needs the first public squad after the deadline")}`;return;
    }
    const {gw,data:picks}=publicPicks,teams=b.teams||[],byId=Object.fromEntries((b.elements||[]).map(e=>[e.id,e]));
    const squad=(picks.picks||[]).map(pk=>({pick:pk,e:byId[pk.element]})).filter(x=>x.e);
    const start=(activeGameweekEvent(b.events)||b.events[0]||{}).id||gw;
    const fmap=buildFixtureMap(fixtures,start);
    const enriched=squad.map(x=>({...x,proj:fplPeekProjectedPoints(x.e,fmap,1),proj5:fplPeekProjectedPoints(x.e,fmap,5),fdr:fixtureAverageForTeam(x.e.team,fmap,5)}));
    const xi=enriched.filter(x=>Number(x.pick.position)<=11),bench=enriched.filter(x=>Number(x.pick.position)>11);
    const flagged=enriched.filter(x=>x.e.status!=="a");
    const xiProj=xi.reduce((a,x)=>a+x.proj,0),benchProj=bench.reduce((a,x)=>a+x.proj,0);
    const avgFdrVals=enriched.map(x=>x.fdr).filter(v=>v!=null),avgFdr=avgFdrVals.length?avgFdrVals.reduce((a,v)=>a+v,0)/avgFdrVals.length:3;
    const captain=[...xi].sort((a,c)=>c.proj-a.proj)[0];
    const avgXi=xi.length?xiProj/xi.length:0,avgBench=bench.length?benchProj/bench.length:0;
    const startScore=clampRating(42+avgXi*8.0);
    const benchScore=clampRating(42+avgBench*9.5);
    const fixtureScore=clampRating(96-(avgFdr-2)*23);
    const captainScore=clampRating(35+(captain?captain.proj:0)*8.5);
    const availabilityScore=clampRating(100-flagged.length*16-enriched.reduce((a,x)=>a+(x.e.status!=="a"&&x.e.chance_of_playing_next_round===0?8:0),0));
    const clubCounts={};enriched.forEach(x=>clubCounts[x.e.team]=(clubCounts[x.e.team]||0)+1);
    const maxClub=Math.max(0,...Object.values(clubCounts));
    const balanceScore=clampRating(88-(maxClub>=3?6:0)-Math.max(0,benchProj<10?8:0));
    const overall=clampRating(startScore*.30+benchScore*.10+fixtureScore*.18+captainScore*.18+availabilityScore*.14+balanceScore*.10);
    const tone=ratingTone(overall);
    const bank=(picks.entry_history&&Number(picks.entry_history.bank))||0,value=(picks.entry_history&&Number(picks.entry_history.value))||0;
    const scored=[...enriched].sort((a,c)=>c.proj5-a.proj5);
    const squadIds=new Set(enriched.map(x=>x.e.id));
    const weak=[...enriched].sort((a,c)=>a.proj5-c.proj5).slice(0,5),upgradeIdeas=[];
    for(const cur of weak){
      const maxCost=cur.e.now_cost+bank;
      const candidates=(b.elements||[]).filter(e=>e.element_type===cur.e.element_type&&!squadIds.has(e.id)&&e.status==="a"&&e.now_cost<=maxCost&&(clubCounts[e.team]||0)<3)
        .map(e=>({e,score:fplPeekProjectedPoints(e,fmap,5)})).filter(x=>x.score>cur.proj5+1.5).sort((a,c)=>c.score-a.score);
      if(candidates[0]) upgradeIdeas.push({from:cur,to:candidates[0],delta:candidates[0].score-cur.proj5});
      if(upgradeIdeas.length>=3) break;
    }
    const concerns=[];
    flagged.slice(0,4).forEach(x=>concerns.push(analyzerConcernRow(x.e.web_name,x.e.news||`${x.e.chance_of_playing_next_round??"?"}% chance of playing`,"bad")));
    scored.filter(x=>x.fdr!=null&&x.fdr>=3.5).slice(0,3).forEach(x=>concerns.push(analyzerConcernRow(x.e.web_name,`Tough next-five run: ${x.fdr.toFixed(2)} average FDR`,"warn")));
    if(!concerns.length) concerns.push(analyzerConcernRow("No obvious red flags","Availability and upcoming fixtures look reasonably healthy.","good"));
    const capRows=scored.slice(0,3).map((x,i)=>{const t=teams.find(z=>z.id===x.e.team)||{};return `<div class="analysis-player-row">${teamKitImg(t,"analysis-kit")}<span class="analysis-rank">${i+1}</span><div><b>${esc(x.e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[x.e.element_type]} · ${money(x.e.now_cost)}</small></div><div class="analysis-right"><b>${x.proj.toFixed(1)}</b><small>projected GW pts</small></div></div>`;}).join("");
    const upgrades=upgradeIdeas.length?upgradeIdeas.map(u=>{const ft=teams.find(t=>t.id===u.from.e.team)||{},tt=teams.find(t=>t.id===u.to.e.team)||{};return `<div class="upgrade-row"><div class="upgrade-player">${teamKitImg(ft,"analysis-kit")}<span><small>Current</small><b>${esc(u.from.e.web_name)}</b><em>${money(u.from.e.now_cost)}</em></span></div><span class="upgrade-arrow">&rsaquo;</span><div class="upgrade-player">${teamKitImg(tt,"analysis-kit")}<span><small>Shortlist</small><b>${esc(u.to.e.web_name)}</b><em>${money(u.to.e.now_cost)}</em></span></div><div class="upgrade-delta">+${u.delta.toFixed(1)}</div></div>`;}).join(""):`<div class="tool-empty compact">No clear same-position upgrade stood out within the current bank and club limits.</div>`;
    out.innerHTML=`
      <div class="rating-hero ${tone}">
        <div class="rating-score"><span>FPL Peek rating</span><strong>${overall}</strong><em>/100</em></div>
        <div class="rating-hero-copy"><span class="analysis-eyebrow">GW${gw} · Team Rating</span><h3>${esc(entry.name)}</h3><p>${esc(entry.player_first_name||"")} ${esc(entry.player_last_name||"")} · Projected XI ${xiProj.toFixed(1)} pts</p></div>
        <div class="rating-verdict"><b>${overall>=82?"Excellent setup":overall>=70?"Strong squad":overall>=58?"Competitive with a few checks":"Needs attention"}</b><small>Rule-based rating using current public FPL data.</small></div>
      </div>
      <div class="rating-breakdown">
        ${ratingBreakdownRow("Starting XI",startScore,`${xiProj.toFixed(1)} projected GW points`)}
        ${ratingBreakdownRow("Bench",benchScore,`${benchProj.toFixed(1)} projected bench points`)}
        ${ratingBreakdownRow("Fixtures",fixtureScore,`${avgFdr.toFixed(2)} next-five average FDR`)}
        ${ratingBreakdownRow("Captaincy",captainScore,captain?`${captain.e.web_name} leads at ${captain.proj.toFixed(1)} projected pts`:"No lead option")}
        ${ratingBreakdownRow("Availability",availabilityScore,flagged.length?`${flagged.length} flagged player${flagged.length===1?"":"s"}`:"No flagged squad players")}
        ${ratingBreakdownRow("Squad balance",balanceScore,`Depth, club spread and usable bench`) }
      </div>
      <div class="analysis-summary-grid">${analyzerCard("Projected XI",xiProj.toFixed(1),"FPL Peek GW projection")}${analyzerCard("Projected bench",benchProj.toFixed(1),"If all four were needed")}${analyzerCard("Captain lead",captain?captain.e.web_name:"-",captain?`${captain.proj.toFixed(1)} projected pts`:"")}${analyzerCard("Squad value",value?`£${(value/10).toFixed(1)}m`:"-",`Bank ${money(bank)}`)}</div>
      <div class="analysis-two-col"><section class="analysis-panel"><div class="analysis-panel-head"><div><span>Priority checks</span><h4>What needs attention</h4></div></div><div class="analysis-list">${concerns.join("")}</div></section><section class="analysis-panel"><div class="analysis-panel-head"><div><span>Captain shortlist</span><h4>Best projected profiles</h4></div></div>${capRows}</section></div>
      <section class="analysis-panel"><div class="analysis-panel-head"><div><span>Upgrade radar</span><h4>Possible areas to improve</h4><p>Uses current prices, bank, availability, fixtures and FPL Peek projected points. Treat it as a shortlist, not a transfer instruction.</p></div></div><div class="upgrade-list">${upgrades}</div></section>`;
  }catch(e){out.innerHTML=`<div class="tool-empty bad">Could not analyze that team. ${esc(e.message)}</div>`;}
}
