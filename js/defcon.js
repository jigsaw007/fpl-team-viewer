/* ============ DEFCON TRACKER tab ============ */
let _dcPos="all", _dcTeam="all", _dcQuery="", _dcFixtureMap={}, _dcPage=1;
const DC_PAGE_SIZE=15;

async function initDefcon(){
  await loadBoot();
  const teamSel=$("dcTeam");
  if(teamSel && teamSel.options.length<=1){
    boot.teams.forEach(t=>teamSel.insertAdjacentHTML("beforeend",`<option value="${t.id}">${esc(t.name)}</option>`));
  }
  $("dcPos")?.addEventListener("click",e=>{
    const btn=e.target.closest("button"); if(!btn) return;
    _dcPos=btn.dataset.p;
    _dcPage=1;
    $("dcPos").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn));
    drawDefcon();
  });
  teamSel?.addEventListener("change",()=>{_dcTeam=teamSel.value;_dcPage=1;drawDefcon();});
  $("dcSearch")?.addEventListener("input",()=>{_dcQuery=$("dcSearch").value.trim().toLowerCase();_dcPage=1;drawDefcon();});
  try{
    const fixtures=await get("/fixtures/");
    const next=(boot.events||[]).find(e=>e.is_next)||nextDeadlineEvent();
    _dcFixtureMap=buildFixtureMap(fixtures,next?next.id:1);
  }catch(_){ _dcFixtureMap={}; }
  drawDefcon();
}

function dcNextFixture(e){
  const f=(_dcFixtureMap[e.team]||[])[0];
  if(!f) return `<span class="defcon-next none">—</span>`;
  const opp=boot.teams.find(t=>t.id===f.opp)||{};
  return `<span class="defcon-next fdr${f.fdr}" title="GW${f.gw} · FDR ${f.fdr}">${esc(opp.short_name||"")} ${f.home?"H":"A"}</span>`;
}

function dcPlayerRow(e,rank){
  const t=boot.teams.find(x=>x.id===e.team)||{};
  const pts=defconPoints(e), hits=defconHitsFromPoints(e), starts=Number(e.starts)||0;
  const rate=starts?Math.min(100,(hits/starts)*100):null;
  const threshold=defconThreshold(e.element_type);
  return `<button class="defcon-row" type="button" data-player="${e.id}" aria-label="Open ${esc(e.web_name)} player details">
    <span class="defcon-rank">${rank}</span>
    <span class="defcon-player">${faceImg(e,"defcon-face")}<span>${teamKitImg(t,"defcon-kit")}<b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small></span></span>
    <span class="defcon-metric"><b>${pts}</b><small>points</small></span>
    <span class="defcon-metric"><b>${hits}</b><small>hits</small></span>
    <span class="defcon-metric"><b>${rate==null?"—":rate.toFixed(0)+"%"}</b><small>per start</small></span>
    <span class="defcon-metric"><b>${Number(e.minutes)||0}</b><small>minutes</small></span>
    <span class="defcon-threshold"><b>${threshold||"—"}</b><small>actions</small></span>
    <span>${dcNextFixture(e)}</span>
  </button>`;
}

function drawDefcon(){
  if(!boot) return;
  const eligible=boot.elements.filter(e=>[2,3,4].includes(Number(e.element_type)));
  const hasField=eligible.some(e=>e.defensive_contribution!=null);
  const seasonHasData=eligible.some(e=>defconPoints(e)>0);
  const filtered=eligible.filter(e=>{
    if(_dcPos!=="all"&&String(e.element_type)!==String(_dcPos)) return false;
    if(_dcTeam!=="all"&&String(e.team)!==String(_dcTeam)) return false;
    if(_dcQuery){
      const t=boot.teams.find(x=>x.id===e.team)||{};
      if(!`${e.web_name} ${e.first_name||""} ${e.second_name||""} ${t.name||""}`.toLowerCase().includes(_dcQuery)) return false;
    }
    return true;
  }).sort((a,b)=>{
    const dp=defconPoints(b)-defconPoints(a); if(dp) return dp;
    const hr=(x)=>{const st=Number(x.starts)||0;return st?defconHitsFromPoints(x)/st:0;};
    return hr(b)-hr(a) || (Number(b.minutes)||0)-(Number(a.minutes)||0);
  });

  if(!hasField){
    $("dcSummary").innerHTML="";
    $("dcBody").innerHTML=`<div class="banner" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>DEFCON totals are not exposed in the current bootstrap feed yet.</b><small>FPL Peek will begin ranking players as soon as the official FPL data includes defensive contribution points.</small></div></div>`;
    return;
  }
  if(!seasonHasData){
    $("dcSummary").innerHTML=`<article><span>Season status</span><b>Waiting for GW1</b><small>Current-season defensive contribution points will populate after matches begin.</small></article><article><span>DEF threshold</span><b>10 actions</b><small>CBIT in a single match</small></article><article><span>MID / FWD threshold</span><b>12 actions</b><small>CBIRT in a single match</small></article>`;
    $("dcBody").innerHTML=`<div class="defcon-empty"><b>No 2026/27 DEFCON points yet.</b><p>The tracker is ready. Once the Gameweek starts, official FPL defensive contribution points will appear here and the leaderboard will update with the latest public data.</p></div>`;
    return;
  }

  const leaders=eligible.slice().sort((a,b)=>defconPoints(b)-defconPoints(a));
  const leader=leaders[0];
  const totalPts=eligible.reduce((n,e)=>n+defconPoints(e),0);
  const totalHits=eligible.reduce((n,e)=>n+defconHitsFromPoints(e),0);
  const ratePool=eligible.filter(e=>Number(e.starts)>=2&&defconHitsFromPoints(e)>0).sort((a,b)=>(defconHitsFromPoints(b)/Number(b.starts))-(defconHitsFromPoints(a)/Number(a.starts)));
  const rateLeader=ratePool[0];
  $("dcSummary").innerHTML=`
    <article><span>DEFCON leader</span><b>${leader?esc(leader.web_name):"—"}</b><small>${leader?defconPoints(leader)+" points · "+defconHitsFromPoints(leader)+" hits":"No data"}</small></article>
    <article><span>Threshold hits</span><b>${totalHits}</b><small>${totalPts} defensive contribution points awarded</small></article>
    <article><span>Best hit rate</span><b>${rateLeader?esc(rateLeader.web_name):"—"}</b><small>${rateLeader?((defconHitsFromPoints(rateLeader)/Number(rateLeader.starts))*100).toFixed(0)+"% of starts":"Needs 2+ starts"}</small></article>`;

  if(!filtered.length){
    $("dcBody").innerHTML=`<div class="defcon-empty"><b>No players match these filters.</b><p>Try another club, position or search term.</p></div>`;
    return;
  }
  const pageCount=Math.max(1,Math.ceil(filtered.length/DC_PAGE_SIZE));
  _dcPage=Math.min(Math.max(1,_dcPage),pageCount);
  const start=(_dcPage-1)*DC_PAGE_SIZE;
  const visible=filtered.slice(start,start+DC_PAGE_SIZE);
  const from=start+1, to=Math.min(start+visible.length,filtered.length);
  $("dcBody").innerHTML=`<div class="defcon-table-head"><span>#</span><span>Player</span><span>DEFCON</span><span>Hits</span><span>Hit rate</span><span>Minutes</span><span>Threshold</span><span>Next</span></div><div class="defcon-list">${visible.map((e,i)=>dcPlayerRow(e,start+i+1)).join("")}</div>
    <div class="defcon-pager" aria-label="DEFCON leaderboard pages">
      <span class="defcon-page-count">Showing ${from}–${to} of ${filtered.length}</span>
      <div class="defcon-page-actions">
        <button type="button" class="btn secondary defcon-page-btn" data-dc-page="prev" ${_dcPage<=1?"disabled":""} aria-label="Previous DEFCON page">&larr; Previous</button>
        <span class="defcon-page-number">Page ${_dcPage} of ${pageCount}</span>
        <button type="button" class="btn secondary defcon-page-btn" data-dc-page="next" ${_dcPage>=pageCount?"disabled":""} aria-label="Next DEFCON page">Next &rarr;</button>
      </div>
    </div>`;
  $("dcBody").querySelectorAll(".defcon-row").forEach(row=>row.addEventListener("click",()=>openPlayer(row.dataset.player)));
  $("dcBody").querySelectorAll("[data-dc-page]").forEach(btn=>btn.addEventListener("click",()=>{
    if(btn.disabled) return;
    _dcPage += btn.dataset.dcPage==="next" ? 1 : -1;
    drawDefcon();
    $("dcBody")?.scrollIntoView({behavior:"smooth",block:"start"});
  }));
}
