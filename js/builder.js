/* ============ TEAM BUILDER tab ============ */
const BUDGET=1000; // £100.0m in FPL tenths
const SQUAD={1:2,2:5,3:5,4:3}; // GKP,DEF,MID,FWD
const MAX_PER_CLUB=3;
let _bldPicks=[], _bldN=5, _bldPos=0, _bldQuery="", _bldFdr=null, _bldFixtures=null, _bldPredCache=null, _bldGwPredCache=null, _bldByIdCache=null, _bldPoolCache=null, _bldChip="none";
let _bldCaptain=0, _bldVice=0;
let _bldMaxPrice=150, _bldMaxOwn=100, _bldTeam=0, _bldSort="suggested", _bldSortDir=-1, _bldRenderN=80;
let _bldPriceFloor=38, _bldPriceCeil=150;
let _bldOptimizeBusy=false, _bldOptimizeToken=0;

async function initBuilder(){
  await loadBoot();
  if(!_bldFdr){
    const fixtures=await get(`/fixtures/`);
    const nextEv=boot.events.find(e=>e.is_next)||boot.events.find(e=>!e.finished)||boot.events[0];
    const startGw=nextEv?nextEv.id:1;
    _bldFdr={}; _bldFixtures={}; boot.teams.forEach(t=>{_bldFdr[t.id]={};_bldFixtures[t.id]={}});
    // Per-gameweek FDR plus opponent/home-away details for the Builder pitch.
    const gws=[]; for(let g=startGw; g<startGw+6 && g<=38; g++) gws.push(g);
    fixtures.filter(f=>f.event&&gws.includes(f.event)).forEach(f=>{
      (_bldFdr[f.team_h][f.event]??=[]).push(f.team_h_difficulty);
      (_bldFdr[f.team_a][f.event]??=[]).push(f.team_a_difficulty);
      (_bldFixtures[f.team_h][f.event]??=[]).push({opp:f.team_a,home:true,fdr:f.team_h_difficulty});
      (_bldFixtures[f.team_a][f.event]??=[]).push({opp:f.team_h,home:false,fdr:f.team_a_difficulty});
    });
    _bldStartGw=startGw;
  }
  // restore saved draft
  try{ const s=JSON.parse(localStorage.getItem("fpl_draft")||"null"); if(s&&Array.isArray(s.picks)){ _bldPicks=[...new Set(s.picks.map(Number).filter(Boolean))].slice(0,15); _bldN=s.n||5; _bldChip=s.chip||"none"; _bldCaptain=Number(s.captain)||0; _bldVice=Number(s.vice)||0; } }catch{}
  // dynamic price slider bounds from actual data (prices drift through the season)
  const prices=boot.elements.map(e=>e.now_cost);
  const minCost=Math.min(...prices), maxCost=Math.max(...prices);
  _bldPriceFloor=minCost; _bldPriceCeil=maxCost;
  if(_bldMaxPrice>maxCost || _bldMaxPrice===150) _bldMaxPrice=maxCost;
  const ps=$("bldPrice");
  ps.min=minCost; ps.max=maxCost; ps.value=_bldMaxPrice;
  $("bldPriceVal").textContent="≤ "+money(_bldMaxPrice);
  $("bldRange").querySelectorAll("button").forEach(b=>b.classList.toggle("active",+b.dataset.n===_bldN));
  if($("bldChip")) $("bldChip").value=_bldChip;
  const projOpt=$("bldSort")?.querySelector('option[value="projection"]'); if(projOpt) projOpt.textContent=`Projected: ${_bldN} GW${_bldN>1?"s":""}`;
  $("bldRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("bldRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _bldN=+x.dataset.n; _bldPredCache=null; _bldPoolCache=null; _optCache=null; bldCancelOptimalJob(); const projOpt=$("bldSort")?.querySelector('option[value="projection"]'); if(projOpt) projOpt.textContent=`Projected: ${_bldN} GW${_bldN>1?"s":""}`; saveDraft(); renderBuilder();});
  $("bldChip")?.addEventListener("change",e=>{_bldChip=e.target.value||"none";_optCache=null;bldCancelOptimalJob();saveDraft();renderBuilder();});
  $("bldPos").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("bldPos").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _bldPos=+x.dataset.p; _bldRenderN=80; drawBldList();});
  $("bldSearch").addEventListener("input",e=>{_bldQuery=e.target.value.toLowerCase();_bldRenderN=80;drawBldList();});
  // populate team dropdown
  const teamSel=$("bldTeam");
  boot.teams.slice().sort((a,c)=>a.name.localeCompare(c.name)).forEach(t=>{
    const o=document.createElement("option"); o.value=t.id; o.textContent=t.name; teamSel.appendChild(o);
  });
  // filter wiring
  $("bldPrice").addEventListener("input",e=>{_bldMaxPrice=+e.target.value;$("bldPriceVal").textContent="≤ "+money(_bldMaxPrice);_bldRenderN=80;drawBldList();});
  $("bldOwn").addEventListener("input",e=>{_bldMaxOwn=+e.target.value;$("bldOwnVal").textContent="≤ "+_bldMaxOwn+"%";_bldRenderN=80;drawBldList();});
  $("bldTeam").addEventListener("change",e=>{_bldTeam=+e.target.value;_bldRenderN=80;drawBldList();});
  $("bldSort")?.addEventListener("change",e=>{_bldSort=e.target.value||"suggested";_bldSortDir=-1;_bldRenderN=80;
    $("bldColhead").querySelectorAll(".ch-sort").forEach(x=>x.classList.toggle("active",x.dataset.s===_bldSort));
    $("bldColhead").querySelectorAll(".ch-ar").forEach(a=>a.textContent=a.dataset.for===_bldSort?"↓":"");drawBldList();});
  // column-header sorting
  $("bldColhead").addEventListener("click",e=>{
    const h=e.target.closest(".ch-sort"); if(!h) return;
    const s=h.dataset.s;
    if(_bldSort===s) _bldSortDir*=-1; else { _bldSort=s; _bldSortDir=-1; }
    if($("bldSort") && [...$("bldSort").options].some(o=>o.value===_bldSort)) $("bldSort").value=_bldSort;
    $("bldColhead").querySelectorAll(".ch-sort").forEach(x=>x.classList.toggle("active",x.dataset.s===_bldSort));
    $("bldColhead").querySelectorAll(".ch-ar").forEach(a=>a.textContent="");
    const ar=$("bldColhead").querySelector(`.ch-ar[data-for="${_bldSort}"]`); if(ar) ar.textContent=_bldSortDir<0?"↓":"↑";
    _bldRenderN=80; drawBldList();
  });
  $("bldReset").addEventListener("click",()=>{
    _bldMaxPrice=_bldPriceCeil;_bldMaxOwn=100;_bldTeam=0;_bldSort="suggested";_bldSortDir=-1;_bldQuery="";_bldPos=0;_bldRenderN=80;
    $("bldPrice").value=_bldPriceCeil;$("bldPriceVal").textContent="≤ "+money(_bldPriceCeil);
    $("bldOwn").value=100;$("bldOwnVal").textContent="≤ 100%";
    $("bldTeam").value=0;$("bldSearch").value="";if($("bldSort"))$("bldSort").value="suggested";
    $("bldPos").querySelectorAll("button").forEach(y=>y.classList.toggle("active",+y.dataset.p===0));
    $("bldColhead").querySelectorAll(".ch-sort").forEach(x=>x.classList.toggle("active",x.dataset.s==="projection"));
    $("bldColhead").querySelectorAll(".ch-ar").forEach(a=>a.textContent=a.dataset.for==="projection"?"↓":"");
    drawBldList();
  });
  // infinite scroll: load more as you near the bottom
  $("bldList").addEventListener("scroll",()=>{
    const el=$("bldList");
    if(el.scrollTop+el.clientHeight >= el.scrollHeight-120){
      if(_bldRenderN < _bldFilteredCount){ _bldRenderN+=80; drawBldList(true); }
    }
  });
  $("bldAutoPick")?.addEventListener("click",bldAutoPick);
  $("bldOptimize")?.addEventListener("click",bldOptimize);
  $("bldClear").addEventListener("click",()=>{_bldOptimizeToken++;_bldPicks=[];_bldCaptain=0;_bldVice=0;_optCache=null;bldCancelOptimalJob();saveDraft();renderBuilder();});
  renderBuilder();
}
let _bldStartGw=1;

/* --- heuristic predicted points for a player over the window ---
   The Builder keeps a per-GW estimate so chips can affect only the first
   Gameweek in the selected 1/3/5-GW window instead of multiplying every week. */
function bldBaseRate(e){
  const ppg=parseFloat(e.points_per_game)||0;
  const form=parseFloat(e.form)||0;
  return seasonStarted() ? (ppg*0.6 + form*0.4) : (form>0?form: (e.total_points? e.total_points/38 : 2));
}
function bldAvailability(e){
  const chance=e.chance_of_playing_next_round;
  if(e.status && e.status!=="a") return chance!=null?chance/100:0.25;
  if(chance!=null && chance<100) return chance/100;
  return 1;
}
function predictGwPoints(e,g){
  if(!_bldGwPredCache)_bldGwPredCache=new Map();
  const key=`${e.id}:${g}`;if(_bldGwPredCache.has(key))return _bldGwPredCache.get(key);
  const fdrs=(_bldFdr?.[e.team]?.[g])||[];
  if(!fdrs.length){_bldGwPredCache.set(key,0);return 0} // true Blank Gameweek in the fixture feed
  const base=bldBaseRate(e),avail=bldAvailability(e);
  const value=fdrs.reduce((total,fdr)=>{
    const ease=(3-fdr)/2*0.35+1; // FDR2 ~ +17.5%, FDR4 ~ -17.5%
    return total + base*ease*avail;
  },0);
  _bldGwPredCache.set(key,value);return value;
}
function predictPoints(e){
  let total=0;
  for(let g=_bldStartGw;g<_bldStartGw+_bldN&&g<=38;g++) total+=predictGwPoints(e,g);
  return total;
}
function bldPred(id){
  if(!_bldPredCache){ _bldPredCache={}; boot.elements.forEach(e=>_bldPredCache[e.id]=predictPoints(e)); }
  return _bldPredCache[id]||0;
}
function bldById(){
  if(!_bldByIdCache)_bldByIdCache=Object.fromEntries(boot.elements.map(e=>[e.id,e]));
  return _bldByIdCache;
}
function bldYield(){return new Promise(resolve=>{if(typeof requestAnimationFrame==="function")requestAnimationFrame(()=>resolve());else setTimeout(resolve,0)})}
function bldWindowGws(){const a=[];for(let g=_bldStartGw;g<_bldStartGw+_bldN&&g<=38;g++)a.push(g);return a}
/* --- squad validation --- */
function bldState(){
  const b=boot; const byId=bldById();
  const picks=_bldPicks.map(id=>byId[id]).filter(Boolean);
  const cost=picks.reduce((s,e)=>s+e.now_cost,0);
  const posCount={1:0,2:0,3:0,4:0}; picks.forEach(e=>posCount[e.element_type]++);
  const clubCount={}; picks.forEach(e=>clubCount[e.team]=(clubCount[e.team]||0)+1);
  const overClub=Object.entries(clubCount).filter(([,n])=>n>MAX_PER_CLUB);
  const complete = picks.length===15 && [1,2,3,4].every(p=>posCount[p]===SQUAD[p]);
  const valid = complete && cost<=BUDGET && !overClub.length;
  return {picks,cost,posCount,clubCount,overClub,complete,valid,byId};
}

/* --- starting XI, bench and chip-aware projected scoring --- */
function bldBestFormationFor(picks,metric){
  const counts={1:0,2:0,3:0,4:0};picks.forEach(e=>counts[e.element_type]++);
  let best=null;
  for(let d=3;d<=5;d++)for(let m=2;m<=5;m++)for(let f=1;f<=3;f++){
    if(d+m+f!==10)continue;
    const shape={1:1,2:d,3:m,4:f};
    const used=Math.min(counts[1],1)+Math.min(counts[2],d)+Math.min(counts[3],m)+Math.min(counts[4],f);
    let q=0;
    for(const pos of [1,2,3,4]){
      q+=picks.filter(e=>e.element_type===pos).sort((a,b)=>metric(b)-metric(a)).slice(0,shape[pos]).reduce((n,e)=>n+metric(e),0);
    }
    if(!best||used>best.used||(used===best.used&&q>best.q))best={shape,used,q};
  }
  return best?.shape||{1:1,2:3,3:4,4:3};
}
function bldLineupFromPicks(picks,metric){
  const shape=bldBestFormationFor(picks,metric),xi=[];
  for(const pos of [1,2,3,4]){
    const row=picks.filter(e=>e.element_type===pos).sort((a,b)=>metric(b)-metric(a));
    xi.push(...row.slice(0,shape[pos]));
  }
  const xiSet=new Set(xi.map(e=>e.id));
  const bench=picks.filter(e=>!xiSet.has(e.id)).sort((a,b)=>a.element_type-b.element_type||metric(b)-metric(a));
  return {xi,bench,shape};
}
function bldFormationText(shape){return `${shape?.[2]||0}-${shape?.[3]||0}-${shape?.[4]||0}`}
function bldDisplayLineup(ids){
  const byId=bldById(),picks=ids.map(id=>byId[id]).filter(Boolean);
  // Captaincy is a single-Gameweek decision: always rank captain and vice by the
  // first Gameweek in the Builder window, even when the squad is optimized over 3/5 GWs.
  const capMetric=e=>predictGwPoints(e,_bldStartGw);
  const lineup=bldLineupFromPicks(picks,e=>bldPred(e.id));
  const xiIds=new Set(lineup.xi.map(e=>e.id));
  const ranked=lineup.xi.slice().sort((a,b)=>capMetric(b)-capMetric(a));
  const manualCap=xiIds.has(+_bldCaptain)?byId[_bldCaptain]:null;
  const manualVice=xiIds.has(+_bldVice)&&+_bldVice!==+(manualCap?.id||0)?byId[_bldVice]:null;
  lineup.captain=manualCap||ranked[0]||null;
  lineup.vice=manualVice||ranked.find(e=>e.id!==lineup.captain?.id)||null;
  return lineup;
}
function bldGameweekPlan(ids,g){
  const byId=bldById(),picks=ids.map(id=>byId[id]).filter(Boolean);
  const metric=e=>predictGwPoints(e,g),lineup=bldLineupFromPicks(picks,metric);
  const xiIds=new Set(lineup.xi.map(e=>e.id));
  const manual=(g===_bldStartGw&&xiIds.has(+_bldCaptain))?byId[_bldCaptain]:null;
  const captain=manual||lineup.xi.slice().sort((a,b)=>metric(b)-metric(a))[0]||null;
  return {...lineup,captain};
}
function scoreSquad(ids,chip=_bldChip){
  let total=0;const first=_bldStartGw;
  for(const g of bldWindowGws()){
    const plan=bldGameweekPlan(ids,g);
    let gw=plan.xi.reduce((n,e)=>n+predictGwPoints(e,g),0);
    const cap=plan.captain?predictGwPoints(plan.captain,g):0;
    gw+=cap; // normal captain doubling
    if(g===first&&chip==="triple_captain")gw+=cap; // third copy
    if(g===first&&chip==="bench_boost")gw+=plan.bench.reduce((n,e)=>n+predictGwPoints(e,g),0);
    total+=gw;
  }
  return total;
}
function bldChipLabel(){return ({none:"No chip",triple_captain:"Triple Captain",bench_boost:"Bench Boost",wildcard:"Wildcard",free_hit:"Free Hit"})[_bldChip]||"No chip"}

/* --- believable squad rating: quality, not just closeness to our own benchmark --- */
function bldAvgFixtureScore(players){
  if(!players.length)return 0;
  let total=0,count=0;
  const map={1:100,2:85,3:65,4:40,5:20};
  for(const e of players){
    for(const g of bldWindowGws()){
      const fdrs=(_bldFdr?.[e.team]?.[g])||[];
      if(!fdrs.length){total+=10;count++;continue}
      fdrs.forEach(f=>{total+=map[f]??60;count++});
    }
  }
  return count?total/count:0;
}
function bldBudgetScore(cost){
  const bank=Math.max(0,(BUDGET-cost)/10);
  if(bank<=2)return 100;
  if(bank<=5)return 100-(bank-2)*(25/3);
  if(bank<=10)return 75-(bank-5)*6;
  return Math.max(5,45-(bank-10)*3.2);
}
function bldMinutesScore(players){
  if(!players.length)return 0;
  return players.reduce((sum,e)=>{
    const avail=bldAvailability(e)*100;
    const starts=Number(e.starts)||0,mins=Number(e.minutes)||0;
    const role=starts?Math.min(100,(mins/Math.max(1,starts*90))*100):55;
    return sum+(avail*.72+role*.28);
  },0)/players.length;
}
function bldRatingBreakdown(ids,opt){
  const byId=bldById(),picks=ids.map(id=>byId[id]).filter(Boolean),cost=picks.reduce((n,e)=>n+e.now_cost,0);
  if(picks.length!==15)return {rating:0,reasons:[]};
  const display=bldDisplayLineup(ids),projected=scoreSquad(ids),projRatio=opt?Math.min(1.05,projected/Math.max(1,opt)):0.75;
  const projectedScore=Math.max(0,Math.min(100,projRatio*100));
  const pool=bldCandidatePool();
  const bestCap=Math.max(1,...pool.map(e=>predictGwPoints(e,_bldStartGw)));
  const cap=display.captain?predictGwPoints(display.captain,_bldStartGw):0;
  const captainScore=Math.max(0,Math.min(100,(cap/bestCap)*100));
  const fixtureScore=bldAvgFixtureScore(display.xi);
  const minutesScore=bldMinutesScore(display.xi);
  const budgetScore=bldBudgetScore(cost);
  const xiAvg=display.xi.length?display.xi.reduce((n,e)=>n+bldPred(e.id),0)/display.xi.length:0;
  const benchAvg=display.bench.length?display.bench.reduce((n,e)=>n+bldPred(e.id),0)/display.bench.length:0;
  const benchScore=xiAvg?Math.min(100,(benchAvg/(xiAvg*.52))*100):0;
  const clubCounts={};picks.forEach(e=>clubCounts[e.team]=(clubCounts[e.team]||0)+1);
  const spread=Object.keys(clubCounts).length;
  const balanceScore=Math.max(55,Math.min(100,65+(spread-6)*5));
  let rating=Math.round(
    projectedScore*.35 + captainScore*.15 + fixtureScore*.15 + minutesScore*.10 +
    budgetScore*.10 + benchScore*.05 + balanceScore*.10
  );
  const bank=(BUDGET-cost)/10,reasons=[];
  // A squad leaving a huge budget unused cannot be an elite build even if the same model
  // also produced the benchmark. This is the failure mode the old 99/99 score allowed.
  if(bank>15)rating=Math.min(rating,72);
  else if(bank>10)rating=Math.min(rating,78);
  else if(bank>7)rating=Math.min(rating,84);
  else if(bank>5)rating=Math.min(rating,88);
  if(bank>7)reasons.push(`£${bank.toFixed(1)}m is unused`); else if(bank>3)reasons.push(`£${bank.toFixed(1)}m remains in the bank`);
  if(captainScore<62)reasons.push("captaincy can be stronger");
  if(minutesScore<75)reasons.push("some starters have minutes risk");
  if(fixtureScore<58)reasons.push("upcoming fixtures are difficult");
  if(projectedScore<82)reasons.push("starting XI projection trails the best builds");
  if(!reasons.length)reasons.push("strong projected XI with good squad balance");
  return {rating:Math.max(0,Math.min(100,rating)),reasons,components:{projectedScore,captainScore,fixtureScore,minutesScore,budgetScore,benchScore,balanceScore}};
}
function bldAutoObjective(ids){
  const byId=bldById(),players=ids.map(id=>byId[id]).filter(Boolean);
  if(players.length!==15)return -1e9;
  const projected=scoreSquad(ids),cost=players.reduce((n,e)=>n+e.now_cost,0),bank=Math.max(0,(BUDGET-cost)/10);
  // Leaving a little money is fine; leaving a huge bank while starting weak cheap players is not.
  const unusedPenalty=Math.max(0,bank-2)*0.8*Math.max(1,_bldN);
  return projected-unusedPenalty;
}

/* --- stronger benchmark: multi-start legal build + repeated same-position swaps --- */
function bldCandidatePool(){
  const key=`${_bldStartGw}:${_bldN}`;if(_bldPoolCache?.key===key)return _bldPoolCache.rows;
  const all=boot.elements.filter(e=>e.status!=="u");
  const keep=new Map();
  for(const pos of [1,2,3,4]){
    const rows=all.filter(e=>e.element_type===pos);
    const top=[...rows].sort((a,b)=>bldPred(b.id)-bldPred(a.id)).slice(0,45);
    const value=[...rows].sort((a,b)=>(bldPred(b.id)/(b.now_cost||1))-(bldPred(a.id)/(a.now_cost||1))).slice(0,30);
    const cheap=[...rows].sort((a,b)=>a.now_cost-b.now_cost).slice(0,15);
    [...top,...value,...cheap].forEach(e=>keep.set(e.id,e));
  }
  const rows=[...keep.values()];_bldPoolCache={key,rows};return rows;
}
function bldRankedPoolByPos(pool){
  const out={};for(const pos of [1,2,3,4])out[pos]=pool.filter(e=>e.element_type===pos).sort((a,b)=>bldPred(b.id)-bldPred(a.id));
  return out;
}
function bldCanUseSquad(picks){
  if(picks.length!==15)return false;
  const pos={1:0,2:0,3:0,4:0},clubs={};let cost=0;
  for(const e of picks){pos[e.element_type]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost}
  return cost<=BUDGET&&Object.values(clubs).every(n=>n<=MAX_PER_CLUB)&&[1,2,3,4].every(p=>pos[p]===SQUAD[p]);
}
function bldSeedSquad(pool,mode){
  const chosen=[],pos={1:0,2:0,3:0,4:0},clubs={};let cost=0;
  const minByPos={};for(const p of [1,2,3,4])minByPos[p]=Math.min(...pool.filter(e=>e.element_type===p).map(e=>e.now_cost));
  const score=e=>{
    const pred=bldPred(e.id),eff=pred/Math.max(3.5,e.now_cost/10),price=e.now_cost/10;
    if(mode===0)return pred;if(mode===1)return pred*.82+eff*2.2;if(mode===2)return pred*.68+eff*3.5;if(mode===3)return pred*.9-price*.18;return pred*.76+eff*2.7-price*.07;
  };
  const sorted=[...pool].sort((a,b)=>score(b)-score(a));
  const minRemaining=()=>[1,2,3,4].reduce((n,p)=>n+Math.max(0,SQUAD[p]-pos[p])*minByPos[p],0);
  for(const e of sorted){
    if(chosen.length>=15)break;const p=e.element_type;
    if(pos[p]>=SQUAD[p]||(clubs[e.team]||0)>=MAX_PER_CLUB)continue;
    pos[p]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost;
    const feasible=cost+minRemaining()<=BUDGET;
    if(feasible)chosen.push(e);else{pos[p]--;clubs[e.team]--;cost-=e.now_cost}
  }
  if(chosen.length<15){
    const cheap=[...pool].sort((a,b)=>a.now_cost-b.now_cost||bldPred(b.id)-bldPred(a.id));
    for(const e of cheap){if(chosen.length>=15)break;const p=e.element_type;if(chosen.some(x=>x.id===e.id)||pos[p]>=SQUAD[p]||(clubs[e.team]||0)>=3||cost+e.now_cost>BUDGET)continue;chosen.push(e);pos[p]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost}
  }
  return bldCanUseSquad(chosen)?chosen:[];
}
function bldScoreCached(ids,cache,chip=_bldChip){
  const key=ids.slice().sort((a,b)=>a-b).join(",");
  if(cache.has(key))return cache.get(key);
  const value=scoreSquad(ids,chip);cache.set(key,value);return value;
}
async function bldImproveSquad(seed,pool,rankedByPos=bldRankedPoolByPos(pool),scoreCache=new Map()){
  let squad=seed.slice(),best=bldScoreCached(squad.map(e=>e.id),scoreCache);
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(let i=0;i<squad.length;i++){
      const old=squad[i],used=new Set(squad.map(x=>x.id));
      const cands=(rankedByPos[old.element_type]||[]).filter(e=>!used.has(e.id)).slice(0,45);
      for(const e of cands){
        const trial=squad.slice();trial[i]=e;if(!bldCanUseSquad(trial))continue;
        const sc=bldScoreCached(trial.map(x=>x.id),scoreCache);if(sc>best+.001){squad=trial;best=sc;changed=true;break}
      }
      if(i%3===2)await bldYield();
    }
    if(!changed)break;
    await bldYield();
  }
  return {squad,score:best};
}

/* --- Builder AutoPick: preserve current choices when possible, then optimize unlocked slots --- */
function bldFixedState(players){
  const pos={1:0,2:0,3:0,4:0},clubs={};let cost=0;
  for(const e of players){
    if(!e||!SQUAD[e.element_type])return null;
    pos[e.element_type]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost;
    if(pos[e.element_type]>SQUAD[e.element_type]||clubs[e.team]>MAX_PER_CLUB||cost>BUDGET)return null;
  }
  return {pos,clubs,cost};
}
function bldAutoPickSeed(pool,fixed,mode){
  const state=bldFixedState(fixed);if(!state)return [];
  const chosen=fixed.slice(),used=new Set(chosen.map(e=>e.id)),pos={...state.pos},clubs={...state.clubs};let cost=state.cost;
  const minByPos={};
  for(const p of [1,2,3,4]){
    const costs=pool.filter(e=>e.element_type===p&&!used.has(e.id)).map(e=>e.now_cost);
    minByPos[p]=costs.length?Math.min(...costs):9999;
  }
  const score=e=>{
    const pred=bldPred(e.id),price=Math.max(3.5,e.now_cost/10),value=pred/price,own=parseFloat(e.selected_by_percent)||0,ppg=parseFloat(e.points_per_game)||0,form=parseFloat(e.form)||0;
    if(mode===0)return pred;
    if(mode===1)return pred*.82+value*2.2;
    if(mode===2)return pred*.7+value*3.2+ppg*.2;
    if(mode===3)return pred*.84+value*2.1+Math.min(own,40)*.015;
    return pred*.78+value*2.7+form*.18;
  };
  const minRemaining=()=>[1,2,3,4].reduce((n,p)=>n+Math.max(0,SQUAD[p]-(pos[p]||0))*minByPos[p],0);
  const ranked=pool.filter(e=>!used.has(e.id)).sort((a,b)=>score(b)-score(a));
  for(const e of ranked){
    if(chosen.length>=15)break;const p=e.element_type;
    if(pos[p]>=SQUAD[p]||(clubs[e.team]||0)>=MAX_PER_CLUB)continue;
    pos[p]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost;
    if(cost+minRemaining()<=BUDGET){chosen.push(e);used.add(e.id)}
    else{pos[p]--;clubs[e.team]--;cost-=e.now_cost}
  }
  if(chosen.length<15){
    const cheap=pool.filter(e=>!used.has(e.id)).sort((a,b)=>a.now_cost-b.now_cost||bldPred(b.id)-bldPred(a.id));
    for(const e of cheap){
      if(chosen.length>=15)break;const p=e.element_type;
      if(used.has(e.id)||pos[p]>=SQUAD[p]||(clubs[e.team]||0)>=MAX_PER_CLUB||cost+e.now_cost>BUDGET)continue;
      chosen.push(e);used.add(e.id);pos[p]++;clubs[e.team]=(clubs[e.team]||0)+1;cost+=e.now_cost;
    }
  }
  return bldCanUseSquad(chosen)?chosen:[];
}
async function bldImproveAutoPick(seed,pool,fixedIds,rankedByPos=bldRankedPoolByPos(pool),scoreCache=new Map()){
  const locked=new Set(fixedIds);let current=seed.slice();
  let bestProjected=bldScoreCached(current.map(e=>e.id),scoreCache),bestObjective=bldAutoObjective(current.map(e=>e.id));
  // Choose the best legal upgrade in each pass instead of the first tiny improvement.
  for(let pass=0;pass<8;pass++){
    let bestSwap=null,checks=0;
    for(let i=0;i<current.length;i++){
      const old=current[i];if(locked.has(old.id))continue;
      const used=new Set(current.map(x=>x.id));
      const cands=(rankedByPos[old.element_type]||[]).filter(e=>!used.has(e.id)).slice(0,55);
      for(const e of cands){
        const trial=current.slice();trial[i]=e;if(!bldCanUseSquad(trial))continue;
        const ids=trial.map(x=>x.id),objective=bldAutoObjective(ids),projected=bldScoreCached(ids,scoreCache);
        if(objective>bestObjective+.01 && (!bestSwap||objective>bestSwap.objective+.01))bestSwap={trial,objective,projected};
        if(++checks%100===0)await bldYield();
      }
    }
    if(!bestSwap)break;
    current=bestSwap.trial;bestObjective=bestSwap.objective;bestProjected=bestSwap.projected;
    await bldYield();
  }
  return {squad:current,score:bestProjected,objective:bestObjective};
}
async function bldAutoPickBuild(fixedIds=[]){
  const byId=bldById(),fixed=[...new Set(fixedIds)].map(id=>byId[+id]).filter(Boolean);
  if(!bldFixedState(fixed))return null;
  const pool=bldCandidatePool(),rankedByPos=bldRankedPoolByPos(pool),scoreCache=new Map();let best=null;
  for(let mode=0;mode<5;mode++){
    const seed=bldAutoPickSeed(pool,fixed,mode);if(!seed.length)continue;
    const result=await bldImproveAutoPick(seed,pool,fixed.map(e=>e.id),rankedByPos,scoreCache);
    if(!best||result.objective>best.objective)best=result;
    await bldYield();
  }
  return best;
}
function bldSetAutoPickBusy(busy){
  const btn=$("bldAutoPick");if(btn){btn.disabled=busy;btn.setAttribute("aria-busy",busy?"true":"false");if(busy)btn.textContent="⏳ Building squad…";}
  const optimize=$("bldOptimize");if(optimize)optimize.disabled=busy||_bldOptimizeBusy||!bldState().valid;
}
async function bldAutoPick(){
  const current=_bldPicks.slice();let fixed=current.length<15?current:[];
  if(current.length===15){
    const ok=await fplConfirm("Replace your current 15-player Builder squad with a new AutoPick squad?",{title:"Rebuild with AutoPick?",confirmText:"AutoPick squad"});
    if(!ok)return;
  }
  bldCancelOptimalJob();bldSetAutoPickBusy(true);await bldYield();
  try{
    let result=await bldAutoPickBuild(fixed);
    if(!result&&fixed.length){
      bldSetAutoPickBusy(false);
      const ok=await fplConfirm("Your current picks do not leave a legal £100m completion. Let AutoPick replace them and build a fresh squad?",{title:"Build a fresh AutoPick squad?",confirmText:"Replace and AutoPick"});
      if(!ok)return;fixed=[];bldSetAutoPickBusy(true);await bldYield();result=await bldAutoPickBuild([]);
    }
    if(!result){toast("AutoPick could not build a legal squad from the current player data");return}
    _bldPicks=result.squad.map(e=>e.id);
    const key=bldOptimalKey();
    // A fresh AutoPick already ran the same multi-start search family, so reuse it immediately.
    // Partial AutoPick keeps user choices locked; its rating benchmark is calculated after the UI repaints.
    _optCache=fixed.length?null:{key,v:result.score};
    saveDraft();renderBuilder();
    const kept=fixed.length;toast(kept?`AutoPick kept ${kept} pick${kept===1?"":"s"} and completed the squad`:`AutoPick built a stronger 15-player squad with useful budget allocation`);
  }finally{
    bldSetAutoPickBusy(false);
    const st=bldState(),btn=$("bldAutoPick");if(btn){const count=st.picks.length;btn.textContent=count===0?"✨ AutoPick squad":count<15?`✨ AutoPick ${15-count} remaining`:"✨ Rebuild with AutoPick"}
  }
}
function bldSetOptimizeBusy(busy){
  _bldOptimizeBusy=!!busy;
  const btn=$("bldOptimize"),valid=bldState().valid;
  if(btn){btn.disabled=busy||!valid;btn.setAttribute("aria-busy",busy?"true":"false");btn.textContent=busy?"⚡ Optimizing…":"⚡ Optimize squad";}
  const auto=$("bldAutoPick");if(auto)auto.disabled=busy;
}
function bldEnsureOptimizeLayer(){
  let root=document.getElementById("bldOptimizeLayer");
  if(root)return root;
  root=document.createElement("div");root.id="bldOptimizeLayer";root.className="bld-opt-layer";root.hidden=true;document.body.appendChild(root);return root;
}
function bldShowOptimizeLoader({title="Optimizing your squad",stage="Reading your squad",detail="Checking the current XI, bench, captain and budget.",progress=10}={}){
  const root=bldEnsureOptimizeLayer();
  root.innerHTML=`<div class="bld-opt-backdrop"></div><section class="bld-opt-card bld-opt-loader" role="dialog" aria-modal="true" aria-labelledby="bldOptTitle">
    <div class="bld-opt-brand"><span class="bld-opt-brandmark">⚡</span><span>FPL Peek Optimizer</span></div>
    <div class="bld-opt-visual" aria-hidden="true"><span></span><span></span><span></span><b>OPT</b></div>
    <h3 id="bldOptTitle">${esc(title)}</h3>
    <p class="bld-opt-stage" data-bld-opt-stage>${esc(stage)}</p>
    <p class="bld-opt-detail" data-bld-opt-detail>${esc(detail)}</p>
    <div class="bld-opt-progress" aria-label="Optimization progress"><i data-bld-opt-progress style="width:${Math.max(4,Math.min(100,progress))}%"></i></div>
    <div class="bld-opt-status"><span>Legal FPL rules</span><span>Current ${_bldN}-GW window</span><span>${esc(bldChipLabel())}</span></div>
    <button class="secondary-action bld-opt-cancel" type="button" data-bld-opt-cancel>Cancel optimization</button>
  </section>`;
  root.hidden=false;
  root.querySelector("[data-bld-opt-cancel]")?.addEventListener("click",()=>{_bldOptimizeToken++;bldHideOptimizeLayer();bldSetOptimizeBusy(false);toast("Optimization cancelled")});
  return root;
}
function bldUpdateOptimizeLoader(stage,detail,progress){
  const root=document.getElementById("bldOptimizeLayer");if(!root||root.hidden)return;
  const st=root.querySelector("[data-bld-opt-stage]"),dt=root.querySelector("[data-bld-opt-detail]"),bar=root.querySelector("[data-bld-opt-progress]");
  if(st)st.textContent=stage;if(dt)dt.textContent=detail;if(bar)bar.style.width=`${Math.max(4,Math.min(100,progress))}%`;
}
function bldHideOptimizeLayer(){const root=document.getElementById("bldOptimizeLayer");if(root){root.hidden=true;root.innerHTML=""}}
function bldOptimizationGrade(score,opt,ids=_bldPicks){const rating=bldRatingBreakdown(ids,Math.max(opt||score,score)).rating;return {rating,...gradeForScore(rating)}}
async function bldOptimizeCurrentSquad(ids,token){
  const byId=bldById(),pool=bldCandidatePool(),rankedByPos=bldRankedPoolByPos(pool),scoreCache=new Map();
  let current=ids.map(id=>byId[+id]).filter(Boolean);if(!bldCanUseSquad(current))return null;
  let currentScore=bldScoreCached(current.map(e=>e.id),scoreCache),startScore=currentScore;
  const changes=[],maxChanges=5,minGain=Math.max(.25,_bldN*.18);
  for(let round=0;round<maxChanges;round++){
    if(token!==_bldOptimizeToken)return null;
    const pct=42+round*10;bldUpdateOptimizeLoader(`Testing meaningful upgrade ${round+1} of ${maxChanges}`,`Comparing legal same-position swaps without breaking your £100m budget or club limits.`,pct);
    const used=new Set(current.map(e=>e.id));let best=null,checks=0;
    for(let i=0;i<current.length;i++){
      const old=current[i],cands=(rankedByPos[old.element_type]||[]).filter(e=>!used.has(e.id)&&e.status!=="u").slice(0,50);
      for(const e of cands){
        const trial=current.slice();trial[i]=e;if(!bldCanUseSquad(trial))continue;
        const trialIds=trial.map(x=>x.id),score=bldScoreCached(trialIds,scoreCache),gain=score-currentScore;
        if(!best||gain>best.gain+.0001)best={index:i,out:old,inn:e,trial,score,gain};
        checks++;if(checks%70===0){await bldYield();if(token!==_bldOptimizeToken)return null;}
      }
    }
    if(!best||best.gain<minGain)break;
    current=best.trial;currentScore=best.score;changes.push({out:best.out,inn:best.inn,gain:best.gain});
    await bldYield();
  }
  return {ids:current.map(e=>e.id),score:currentScore,startScore,changes,gain:currentScore-startScore,minGain};
}
function bldShowOptimizeReview(result,benchmark,currentScore){
  return new Promise(resolve=>{
    const root=bldEnsureOptimizeLayer(),before=bldOptimizationGrade(currentScore,benchmark,_bldPicks),after=bldOptimizationGrade(result.score,benchmark,result.ids||_bldPicks),n=result.changes.length;
    const rows=result.changes.map((ch,i)=>{
      const ot=boot.teams.find(t=>t.id===ch.out.team)||{},it=boot.teams.find(t=>t.id===ch.inn.team)||{};
      return `<div class="bld-opt-change"><span class="bld-opt-change-num">${i+1}</span><div class="bld-opt-player">${teamKitImg(ot,"bld-opt-kit",`${ch.out.web_name} kit`)}<span><small>OUT</small><b>${esc(ch.out.web_name)}</b><em>${money(ch.out.now_cost)}</em></span></div><span class="bld-opt-arrow">→</span><div class="bld-opt-player">${teamKitImg(it,"bld-opt-kit",`${ch.inn.web_name} kit`)}<span><small>IN</small><b>${esc(ch.inn.web_name)}</b><em>${money(ch.inn.now_cost)}</em></span></div><strong>+${ch.gain.toFixed(1)}</strong></div>`;
    }).join("");
    root.innerHTML=`<div class="bld-opt-backdrop"></div><section class="bld-opt-card bld-opt-review" role="dialog" aria-modal="true" aria-labelledby="bldOptReviewTitle">
      <div class="bld-opt-brand"><span class="bld-opt-brandmark">⚡</span><span>FPL Peek Optimizer</span></div>
      <h3 id="bldOptReviewTitle">${n?"Optimization found":"Your squad is already efficient"}</h3>
      <p class="bld-opt-review-copy">${n?`Found ${n} meaningful legal change${n===1?"":"s"} for the current ${_bldN}-GW window. Nothing changes until you apply them.`:`No meaningful same-position upgrade cleared the minimum gain threshold. AutoPick can still do a full rebuild if you want a different squad structure.`}</p>
      <div class="bld-opt-scorecompare"><div><small>Current</small><b style="color:${before.c}">${before.g} <span>${before.rating}/100</span></b><em>${currentScore.toFixed(1)} projected</em></div><span>→</span><div><small>Optimized</small><b style="color:${after.c}">${after.g} <span>${after.rating}/100</span></b><em>${result.score.toFixed(1)} projected</em></div><div class="bld-opt-gain"><small>Projected gain</small><b>+${result.gain.toFixed(1)}</b></div></div>
      ${n?`<div class="bld-opt-changes">${rows}</div>`:`<div class="bld-opt-none"><b>No forced changes</b><span>The quick optimizer deliberately ignores tiny sideways moves.</span></div>`}
      <p class="bld-opt-footnote">Optimize keeps your squad structure intact and only suggests meaningful legal swaps. It recalculates the suggested XI, bench and captain after the changes.</p>
      <div class="bld-opt-actions"><button class="secondary-action" type="button" data-bld-opt-keep>${n?"Keep current squad":"Done"}</button>${n?`<button class="primary-action" type="button" data-bld-opt-apply>Apply ${n} change${n===1?"":"s"}</button>`:""}</div>
    </section>`;
    root.hidden=false;
    const finish=v=>{bldHideOptimizeLayer();resolve(v)};
    root.querySelector("[data-bld-opt-keep]")?.addEventListener("click",()=>finish(false));root.querySelector("[data-bld-opt-apply]")?.addEventListener("click",()=>finish(true));
    root.querySelector(".bld-opt-backdrop")?.addEventListener("click",()=>finish(false));
  });
}
async function bldOptimize(){
  const st=bldState();if(!st.valid)return toast("Complete a valid 15-player squad before optimizing");
  const startIds=_bldPicks.slice(),configKey=bldOptimalKey(),currentScore=scoreSquad(startIds),token=++_bldOptimizeToken;
  bldCancelOptimalJob();bldSetOptimizeBusy(true);bldShowOptimizeLoader();await bldYield();
  try{
    let benchmark=_optCache?.key===configKey?_optCache.v:null;
    if(!benchmark){
      bldUpdateOptimizeLoader("Calibrating your grade","Building the comparison benchmark once so we can show the grade improvement accurately.",24);await bldYield();
      benchmark=await optimalScoreAsync(token,(mode,total)=>bldUpdateOptimizeLoader("Calibrating your grade",`Benchmark search ${mode+1} of ${total} · comparing several legal squad shapes.`,24+((mode+1)/total)*12));if(token!==_bldOptimizeToken||!benchmark)return;
      _optCache={key:configKey,v:benchmark};
    }
    bldUpdateOptimizeLoader("Searching for upgrades","Testing legal replacements while preserving your 15-player squad structure.",38);await bldYield();
    const result=await bldOptimizeCurrentSquad(startIds,token);if(token!==_bldOptimizeToken||!result)return;
    bldUpdateOptimizeLoader("Rebuilding XI and captain","Checking the improved squad's best formation, bench order and captain for the selected window.",92);await bldYield();
    bldUpdateOptimizeLoader("Optimization ready","Preparing your before-and-after review.",100);await new Promise(r=>setTimeout(r,140));if(token!==_bldOptimizeToken)return;
    const apply=await bldShowOptimizeReview(result,benchmark,currentScore);if(token!==_bldOptimizeToken)return;
    if(apply&&result.changes.length){
      _bldPicks=result.ids;_optCache={key:configKey,v:Math.max(benchmark,result.score)};saveDraft();renderBuilder();toast(`Applied ${result.changes.length} optimization${result.changes.length===1?"":"s"} · +${result.gain.toFixed(1)} projected points`);
    }
  }finally{
    if(token===_bldOptimizeToken){bldHideOptimizeLayer();bldSetOptimizeBusy(false);renderBuilder();}
  }
}

async function optimalScoreAsync(cancelToken=null,onProgress=null){
  const pool=bldCandidatePool(),rankedByPos=bldRankedPoolByPos(pool),scoreCache=new Map();let best=0;
  for(let mode=0;mode<5;mode++){
    if(cancelToken!=null&&cancelToken!==_bldOptimizeToken)return null;
    if(onProgress)onProgress(mode,5);
    const seed=bldSeedSquad(pool,mode);if(!seed.length)continue;
    const improved=await bldImproveSquad(seed,pool,rankedByPos,scoreCache);best=Math.max(best,improved.score);
    await bldYield();
  }
  return best||1;
}
let _optCache=null,_optJobToken=0,_optPendingKey=null;
function bldOptimalKey(){return `${_bldStartGw}:${_bldN}:${_bldChip}`}
function bldCancelOptimalJob(){_optJobToken++;_optPendingKey=null}
function bldScheduleOptimal(){
  const key=bldOptimalKey();if(_optCache?.key===key||_optPendingKey===key)return;
  const token=++_optJobToken;_optPendingKey=key;
  const run=async()=>{
    await bldYield();
    const v=await optimalScoreAsync();
    if(token!==_optJobToken||key!==bldOptimalKey())return;
    _optCache={key,v};_optPendingKey=null;
    const st=bldState();if(st.valid)renderBuilder();
  };
  if(typeof requestIdleCallback==="function")requestIdleCallback(()=>run(),{timeout:250});else setTimeout(run,0);
}

function calibratedScore(mine,opt){
  if(!opt||mine<=0)return 0;
  const gap=Math.max(0,(opt-mine)/opt*100);
  return Math.max(0,Math.min(99,Math.round(99-gap*4.1)));
}
function gradeForScore(score){
  if(score>=92)return {g:"S",c:"#00a66f"};
  if(score>=84)return {g:"A",c:"#22a06b"};
  if(score>=76)return {g:"B",c:"#0f8fa6"};
  if(score>=66)return {g:"C",c:"#d38b00"};
  if(score>=56)return {g:"D",c:"#e57a24"};
  if(score>=45)return {g:"E",c:"#dd5b72"};
  return {g:"F",c:"#d64545"};
}
/* --- add/remove --- */
function bldToggle(id){
  id=+id;
  if(_bldPicks.includes(id)){ _bldPicks=_bldPicks.filter(x=>x!==id); if(_bldCaptain===id)_bldCaptain=0; if(_bldVice===id)_bldVice=0; }
  else{
    const e=boot.elements.find(x=>x.id===id); if(!e) return;
    const st=bldState();
    if(st.picks.length>=15){ toast("Squad full (15 players)"); return; }
    if(st.posCount[e.element_type]>=SQUAD[e.element_type]){ toast(`Max ${SQUAD[e.element_type]} ${POS[e.element_type]}`); return; }
    if((st.clubCount[e.team]||0)>=MAX_PER_CLUB){ toast(`Max 3 from one club`); return; }
    _bldPicks.push(id);
  }
  _optCache=null;bldCancelOptimalJob(); saveDraft(); renderBuilder();
}
function saveDraft(){ try{localStorage.setItem("fpl_draft",JSON.stringify({picks:_bldPicks,n:_bldN,chip:_bldChip,captain:_bldCaptain,vice:_bldVice}))}catch{} }

function bldClosePlayerActions(){ document.getElementById("bldPlayerActions")?.remove(); }
function bldSetRole(id,role){
  id=+id; const display=bldDisplayLineup(_bldPicks),xiIds=new Set(display.xi.map(e=>e.id));
  if(!xiIds.has(id)){ toast("Captain and vice-captain must be in the suggested starting XI"); return; }
  if(role==="captain"){
    if(_bldVice===id)_bldVice=_bldCaptain||0;
    _bldCaptain=id;
  }else{
    if(_bldCaptain===id){ toast("Captain and vice-captain must be different players"); return; }
    _bldVice=id;
  }
  saveDraft(); bldClosePlayerActions(); renderBuilder();
}
function bldPlayerActions(id){
  id=+id; const e=bldById()[id]; if(!e)return;
  bldClosePlayerActions();
  const st=bldState(),display=bldDisplayLineup(_bldPicks),xiIds=new Set(display.xi.map(x=>x.id)),isXi=st.complete&&xiIds.has(id);
  const t=(boot.teams||[]).find(x=>x.id===e.team)||{};
  const wrap=document.createElement("div"); wrap.id="bldPlayerActions"; wrap.className="bld-action-layer";
  wrap.innerHTML=`<div class="bld-action-backdrop" data-bld-close></div><div class="bld-action-sheet" role="dialog" aria-modal="true" aria-label="${esc(e.web_name)} options">
    <div class="bld-action-head">${teamKitImg(t,"bld-action-kit",`${e.web_name} kit`)}<div><b>${esc(e.web_name)}</b><small>${esc(t.name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small></div><button type="button" data-bld-close aria-label="Close">×</button></div>
    <div class="bld-action-buttons">
      <button type="button" data-bld-role="captain" ${!isXi?'disabled':''}><span class="bld-role-dot">C</span><span><b>Make captain</b><small>${isXi?'Use as captain for the first Builder Gameweek':'Only starting XI players can be captain'}</small></span></button>
      <button type="button" data-bld-role="vice" ${!isXi?'disabled':''}><span class="bld-role-dot vice">V</span><span><b>Make vice-captain</b><small>${isXi?'Use as vice-captain':'Only starting XI players can be vice-captain'}</small></span></button>
      <button type="button" class="danger" data-bld-remove-action><span class="bld-role-dot remove">−</span><span><b>Remove player</b><small>Remove from the 15-player squad</small></span></button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-bld-close]').forEach(x=>x.onclick=bldClosePlayerActions);
  wrap.querySelector('[data-bld-role="captain"]')?.addEventListener('click',()=>bldSetRole(id,'captain'));
  wrap.querySelector('[data-bld-role="vice"]')?.addEventListener('click',()=>bldSetRole(id,'vice'));
  wrap.querySelector('[data-bld-remove-action]')?.addEventListener('click',()=>{bldClosePlayerActions();bldToggle(id)});
}

/* --- rendering --- */
function renderBuilder(){
  const st=bldState();
  $("bldPicked").textContent=`${st.picks.length}/15`;
  $("bldValue").textContent=money(st.cost);
  const bank=BUDGET-st.cost;
  $("bldBank").textContent=(bank<0?"-":"")+money(Math.abs(bank));
  $("bldBank").style.color=bank<0?"var(--bad)":"";
  const count=st.picks.length,avg=(fn)=>count?st.picks.reduce((sum,e)=>sum+fn(e),0)/count:null;
  const autoBtn=$("bldAutoPick");if(autoBtn){autoBtn.textContent=count===0?"✨ AutoPick squad":count<15?`✨ AutoPick ${15-count} remaining`:"✨ Rebuild with AutoPick";autoBtn.title=count<15?"Keep your current picks where possible and complete a legal squad":"Replace this squad with an optimized AutoPick squad";}
  const optimizeBtn=$("bldOptimize");if(optimizeBtn){optimizeBtn.disabled=_bldOptimizeBusy||!st.valid;optimizeBtn.textContent=_bldOptimizeBusy?"⚡ Optimizing…":"⚡ Optimize squad";optimizeBtn.title=st.valid?"Improve this squad with a small set of meaningful legal swaps":"Complete a valid 15-player squad to optimize";}
  const display=bldDisplayLineup(_bldPicks),formation=st.complete?bldFormationText(display.shape):"—",projectedScore=st.valid?scoreSquad(_bldPicks):0;
  $("bldSquadProj").textContent=st.valid?projectedScore.toFixed(1):"—";
  $("bldXiProj").textContent=formation;
  $("bldAvgOwn").textContent=count?`${avg(e=>parseFloat(e.selected_by_percent)||0).toFixed(1)}%`:"—";
  $("bldAvgForm").textContent=st.complete&&display.captain?display.captain.web_name:"—";
  $("bldAvgPpg").textContent=count?avg(e=>parseFloat(e.points_per_game)||0).toFixed(1):"—";
  $("bldClubSpread").textContent=String(Object.keys(st.clubCount).length);
  if($("bldChipState")) $("bldChipState").textContent=bldChipLabel();
  let warn="";
  if(bank<0) warn=`£${(Math.abs(bank)/10).toFixed(1)}m over budget — swap someone cheaper.`;
  else if(st.overClub.length) warn=`Too many from one club (max 3).`;
  else if(!st.complete && st.picks.length===15) warn=`Wrong shape — need 2 GK, 5 DEF, 5 MID, 3 FWD.`;
  $("bldWarn").innerHTML=warn?`<span class="bld-warn-in">Warning: ${esc(warn)}</span>`:"";
  $("bldWarn").style.display=warn?"block":"none";
  if(st.valid){
    const key=bldOptimalKey(),opt=_optCache?.key===key?_optCache.v:null;
    if(opt){
      const ratingData=bldRatingBreakdown(_bldPicks,opt),score=ratingData.rating,gr=gradeForScore(score);
      $("bldGrade").textContent=gr.g;$("bldGrade").style.color=gr.c;
      $("bldNum").innerHTML=`${score}<span>/100</span>`;
      $("bldGauge").style.borderColor=gr.c;$("bldGauge").style.background="var(--panel)";
      const chipTxt=_bldChip!=="none"?` · ${bldChipLabel()} planned for GW${_bldStartGw}`:"";
      const reason=ratingData.reasons.slice(0,2).join("; ");
      $("bldScoreTxt").innerHTML=`Squad Rating <b style="color:${gr.c}">${score}/100 · ${gr.g}</b>${chipTxt} · ${esc(reason)}.`;
    }else{
      $("bldGrade").textContent="…";$("bldGrade").style.color="var(--dim)";
      $("bldNum").innerHTML=`…<span>/100</span>`;$("bldGauge").style.borderColor="var(--line2)";$("bldGauge").style.background="var(--panel)";
      $("bldScoreTxt").textContent="Squad ready · calculating the optimized rating benchmark…";
      bldScheduleOptimal();
    }
  }else{
    $("bldGrade").textContent="–";$("bldGrade").style.color="var(--dim)";
    $("bldNum").innerHTML=`0<span>/100</span>`;$("bldGauge").style.borderColor="var(--line2)";$("bldGauge").style.background="var(--panel)";
    $("bldScoreTxt").textContent=st.picks.length<15?`Pick ${15-st.picks.length} more player${15-st.picks.length>1?"s":""} to see your score.`:"Fix the warnings above to score your squad.";
  }
  drawBldPitch(st);drawBldList();
}

function bldPitchFixtureRun(e){
  const teams=boot.teams||[],chips=[];
  for(let g=_bldStartGw; g<_bldStartGw+_bldN && g<=38; g++){
    const fx=(_bldFixtures?.[e.team]?.[g])||[];
    if(!fx.length){chips.push(`<span class="bld-fx blank" title="GW${g}: Blank Gameweek">—</span>`);continue;}
    if(fx.length===1){
      const f=fx[0],opp=teams.find(t=>t.id===f.opp)||{},code=String(opp.short_name||"-");
      const label=f.home?code:code.toLowerCase();
      chips.push(`<span class="bld-fx fdr${f.fdr}" title="GW${g}: ${esc(opp.name||code)} ${f.home?"H":"A"} · FDR ${f.fdr}">${esc(label)}</span>`);
      continue;
    }
    const avg=Math.max(1,Math.min(5,Math.round(fx.reduce((n,f)=>n+(+f.fdr||3),0)/fx.length)));
    const detail=fx.map(f=>{const o=teams.find(t=>t.id===f.opp)||{};return `${o.short_name||"-"} ${f.home?"H":"A"} FDR ${f.fdr}`}).join(" + ");
    chips.push(`<span class="bld-fx fdr${avg} double" title="GW${g}: ${esc(detail)}">2x</span>`);
  }
  return `<div class="bld-fx-run" style="--bld-fx-count:${Math.max(1,_bldN)}">${chips.join("")}</div>`;
}
function drawBldPitch(st){
  const b=boot,display=bldDisplayLineup(_bldPicks),shape=display.shape||{1:1,2:3,3:4,4:3},captainId=display.captain?.id||0,viceId=display.vice?.id||0;
  const label=document.querySelector(".bld-xi-label");

  const slot=(e,pos,{bench=false,allowRole=true}={})=>{
    if(!e)return `<div class="bld-slot empty ${bench?'bench-empty':''}" data-slotpos="${pos}" title="Add a ${POS[pos]}">+<div class="bld-slot-lbl">${bench?`BENCH ${POS[pos]}`:POS[pos]}</div></div>`;
    const t=b.teams.find(z=>z.id===e.team)||{},cap=allowRole&&e.id===captainId&&!bench,vice=allowRole&&e.id===viceId&&!bench;
    return `<div class="bld-slot ${bench?'on-bench':''}" data-player="${e.id}" title="Open ${esc(e.web_name)} options">
      <div class="bld-price-badge">${money(e.now_cost)}</div>
      <div class="bld-kit-wrap">${teamKitImg(t,"bld-kit",`${e.web_name} ${t.name||"club"} kit`)}</div>
      <div class="bld-pl-nm">${esc(e.web_name)}${cap?'<span class="bld-cap">C</span>':vice?'<span class="bld-cap vice">V</span>':''}</div>
      ${bldPitchFixtureRun(e)}<button class="bld-rm" type="button" data-bld-remove="${e.id}" title="Remove ${esc(e.web_name)}" aria-label="Remove ${esc(e.web_name)}">✕</button>
    </div>`;
  };

  const wire=root=>{
    root?.querySelectorAll(".bld-slot[data-player]").forEach(s=>s.onclick=e=>{if(e.target.closest("[data-bld-remove]"))return;bldPlayerActions(s.dataset.player)});
    root?.querySelectorAll("[data-bld-remove]").forEach(btn=>btn.onclick=e=>{e.stopPropagation();bldToggle(btn.dataset.bldRemove)});
    root?.querySelectorAll(".bld-slot.empty[data-slotpos]").forEach(s=>s.onclick=()=>{
      const pos=+s.dataset.slotpos;_bldPos=pos;
      $("bldPos")?.querySelectorAll("button").forEach(y=>y.classList.toggle("active",+y.dataset.p===pos));
      drawBldList();if($("bldList"))$("bldList").scrollTop=0;
    });
  };

  // Incomplete squads always use a stable blank 4-3-3 pitch. This keeps the
  // Builder visually consistent before and after refresh instead of switching
  // to a completely different progress-card layout.
  if(!st.complete){
    const blankShape={1:1,2:4,3:3,4:3};
    if(label) label.innerHTML=`<span>Build your squad · 4-3-3 template</span><small>${st.picks.length}/15 selected · fill the empty slots or use AutoPick. The final suggested XI is calculated at 15/15.</small>`;

    const byPos={1:[],2:[],3:[],4:[]};
    st.picks.forEach(e=>byPos[e.element_type]?.push(e));
    const used=new Set(),xiByPos={1:[],2:[],3:[],4:[]};
    for(const pos of [1,2,3,4]){
      xiByPos[pos]=byPos[pos].slice(0,blankShape[pos]);
      xiByPos[pos].forEach(e=>used.add(e.id));
    }
    const benchPlayers=st.picks.filter(e=>!used.has(e.id));

    const line=pos=>{
      const cells=[];for(let i=0;i<blankShape[pos];i++)cells.push(slot(xiByPos[pos][i],pos,{allowRole:false}));
      return `<div class="prow">${cells.join("")}</div>`;
    };
    $("bldPitch").innerHTML=line(1)+line(2)+line(3)+line(4);

    // Bench capacity follows the real 15-player squad: 1 GK + 3 outfield slots.
    const benchSlots=[];
    benchPlayers.slice(0,4).forEach(e=>benchSlots.push(slot(e,e.element_type,{bench:true,allowRole:false})));
    const missingBench=4-benchSlots.length;
    for(let i=0;i<missingBench;i++){
      // Prefer a useful required-position hint for the next empty bench slot.
      let pos=2;
      if((st.posCount[1]||0)<SQUAD[1]) pos=1;
      else if((st.posCount[2]||0)<SQUAD[2]) pos=2;
      else if((st.posCount[3]||0)<SQUAD[3]) pos=3;
      else if((st.posCount[4]||0)<SQUAD[4]) pos=4;
      benchSlots.push(slot(null,pos,{bench:true,allowRole:false}));
    }
    if($("bldBench")){
      $("bldBench").style.display="block";
      $("bldBench").innerHTML=`<div class="bld-bench-head"><span>Substitutes</span><small>${15-st.picks.length} player${15-st.picks.length===1?'':'s'} still required</small></div><div class="bld-bench-row">${benchSlots.join("")}</div>`;
    }
    wire($("bldPitch"));wire($("bldBench"));
    return;
  }

  if(label) label.innerHTML=`<span>Suggested starting XI</span><small>Automatically optimized from your complete 15-player squad · ${bldFormationText(shape)}</small>`;
  if($("bldBench")) $("bldBench").style.display="block";
  const xiByPos={1:[],2:[],3:[],4:[]},benchByPos={1:[],2:[],3:[],4:[]};
  display.xi.forEach(e=>xiByPos[e.element_type].push(e));display.bench.forEach(e=>benchByPos[e.element_type].push(e));
  const line=pos=>{
    const need=shape[pos]||0,row=xiByPos[pos]||[],cells=[];
    for(let i=0;i<need;i++)cells.push(slot(row[i],pos));
    return `<div class="prow">${cells.join("")}</div>`;
  };
  $("bldPitch").innerHTML=line(1)+line(2)+line(3)+line(4);
  const benchNeeds={1:SQUAD[1]-(shape[1]||0),2:SQUAD[2]-(shape[2]||0),3:SQUAD[3]-(shape[3]||0),4:SQUAD[4]-(shape[4]||0)},benchCells=[];
  for(const pos of [1,2,3,4])for(let i=0;i<benchNeeds[pos];i++)benchCells.push(slot((benchByPos[pos]||[])[i],pos,{bench:true}));
  if($("bldBench")) $("bldBench").innerHTML=`<div class="bld-bench-head"><span>Substitutes</span><small>Suggested bench · ${bldChipLabel()}</small></div><div class="bld-bench-row">${benchCells.join("")}</div>`;
  wire($("bldPitch"));wire($("bldBench"));
}

let _bldFilteredCount=0;
function drawBldList(append){
  const b=boot; const st=bldState();
  let list=b.elements.filter(e=>e.element_type>0);
  if(_bldPos) list=list.filter(e=>e.element_type===_bldPos);
  if(_bldTeam) list=list.filter(e=>e.team===_bldTeam);
  if(_bldQuery) list=list.filter(e=>e.web_name.toLowerCase().includes(_bldQuery));
  list=list.filter(e=>e.now_cost<=_bldMaxPrice && parseFloat(e.selected_by_percent)<=_bldMaxOwn);
  const num=v=>typeof v==="string"?parseFloat(v)||0:(v||0);
  const metric=(e,key)=>{
    const price=Math.max(.1,(Number(e.now_cost)||0)/10),total=Number(e.total_points)||0;
    if(key==="suggested"||key==="projection")return bldPred(e.id);
    if(key==="ownership")return num(e.selected_by_percent);
    if(key==="points")return total;
    if(key==="ppg")return num(e.points_per_game);
    if(key==="form")return num(e.form);
    if(key==="value")return total/price;
    if(key==="priceHigh"||key==="priceLow")return Number(e.now_cost)||0;
    if(key==="minutes")return Number(e.minutes)||0;
    return bldPred(e.id);
  };
  list.sort((a,c)=>{
    const av=metric(a,_bldSort),cv=metric(c,_bldSort);
    let d=_bldSort==="priceLow"?av-cv:cv-av;
    if(_bldSortDir>0)d=-d;
    return d||bldPred(c.id)-bldPred(a.id)||String(a.web_name||"").localeCompare(String(c.web_name||""));
  });
  _bldFilteredCount=list.length;
  const shown=list.slice(0,_bldRenderN);
  const rowHtml=e=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    const picked=_bldPicks.includes(e.id);
    const full=st.picks.length>=15;
    const posFull=st.posCount[e.element_type]>=SQUAD[e.element_type];
    const clubFull=(st.clubCount[e.team]||0)>=MAX_PER_CLUB;
    const disabled=!picked && (full||posFull||clubFull);
    const flag=e.status&&e.status!=="a",ppg=num(e.points_per_game).toFixed(1),form=num(e.form).toFixed(1),pts=Number(e.total_points)||0,mins=Number(e.minutes)||0;
    return `<div class="bld-item ${picked?'picked':''} ${disabled?'disabled':''}" data-add="${e.id}" title="${esc(e.web_name)} · ${POS[e.element_type]} · ${esc(t.name||"")} · ${pts} pts · ${ppg} PPG · form ${form} · ${mins} mins${flag?' · flagged':''}">
      <span class="bi-player">${teamKitImg(t,"bld-list-kit",`${e.web_name} ${t.name||"club"} kit`)}<span class="bi-name"><b>${esc(e.web_name)}</b><em>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${ppg} PPG · form ${form}${flag?' <span class="bi-flag">!</span>':''}</em></span></span>
      <span class="bi-cost">${money(e.now_cost)}</span>
      <span class="bi-own">${(+e.selected_by_percent).toFixed(1)}</span>
      <span class="bi-pred">${bldPred(e.id).toFixed(1)}</span>
      <span class="bi-add">${picked?'✓':'+'}</span>
    </div>`;
  };
  const html=shown.map(rowHtml).join("")||`<div class="tab-status">No players match these filters.</div>`;
  const hint = _bldFilteredCount>shown.length
    ? `<div class="bld-list-hint">Showing ${shown.length} of ${_bldFilteredCount} — scroll for more</div>`
    : (_bldFilteredCount?`<div class="bld-list-hint">${_bldFilteredCount} player${_bldFilteredCount>1?"s":""}</div>`:"");
  // preserve scroll position when appending more (infinite scroll)
  const prevTop=$("bldList").scrollTop;
  $("bldList").innerHTML=html+hint;
  if(append) $("bldList").scrollTop=prevTop;
  $("bldList").querySelectorAll(".bld-item").forEach(it=>it.onclick=()=>bldToggle(it.dataset.add));
}

let _toastT=null;
function toast(msg){
  let t=document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add("show");
  clearTimeout(_toastT); _toastT=setTimeout(()=>t.classList.remove("show"),1800);
}

