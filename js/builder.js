/* ============ TEAM BUILDER tab ============ */
const BUDGET=1000; // £100.0m in FPL tenths
const SQUAD={1:2,2:5,3:5,4:3}; // GKP,DEF,MID,FWD
const MAX_PER_CLUB=3;
let _bldPicks=[], _bldN=5, _bldPos=0, _bldQuery="", _bldFdr=null, _bldPredCache=null;
let _bldMaxPrice=150, _bldMaxOwn=100, _bldTeam=0, _bldSort="pred", _bldSortDir=-1, _bldRenderN=80;
let _bldPriceFloor=38, _bldPriceCeil=150;

async function initBuilder(){
  await loadBoot();
  if(!_bldFdr){
    const fixtures=await get(`/fixtures/`);
    const nextEv=boot.events.find(e=>e.is_next)||boot.events.find(e=>!e.finished)||boot.events[0];
    const startGw=nextEv?nextEv.id:1;
    _bldFdr={}; boot.teams.forEach(t=>_bldFdr[t.id]={});
    // per-gameweek FDR per team for up to 6 GWs
    const gws=[]; for(let g=startGw; g<startGw+6 && g<=38; g++) gws.push(g);
    fixtures.filter(f=>f.event&&gws.includes(f.event)).forEach(f=>{
      (_bldFdr[f.team_h][f.event]??=[]).push(f.team_h_difficulty);
      (_bldFdr[f.team_a][f.event]??=[]).push(f.team_a_difficulty);
    });
    _bldStartGw=startGw;
  }
  // restore saved draft
  try{ const s=JSON.parse(localStorage.getItem("fpl_draft")||"null"); if(s&&Array.isArray(s.picks)){ _bldPicks=s.picks; _bldN=s.n||5; } }catch{}
  // dynamic price slider bounds from actual data (prices drift through the season)
  const prices=boot.elements.map(e=>e.now_cost);
  const minCost=Math.min(...prices), maxCost=Math.max(...prices);
  _bldPriceFloor=minCost; _bldPriceCeil=maxCost;
  if(_bldMaxPrice>maxCost || _bldMaxPrice===150) _bldMaxPrice=maxCost;
  const ps=$("bldPrice");
  ps.min=minCost; ps.max=maxCost; ps.value=_bldMaxPrice;
  $("bldPriceVal").textContent="≤ "+money(_bldMaxPrice);
  $("bldRange").querySelectorAll("button").forEach(b=>b.classList.toggle("active",+b.dataset.n===_bldN));
  $("bldRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("bldRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _bldN=+x.dataset.n; _bldPredCache=null; renderBuilder();});
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
  // column-header sorting
  $("bldColhead").addEventListener("click",e=>{
    const h=e.target.closest(".ch-sort"); if(!h) return;
    const s=h.dataset.s;
    if(_bldSort===s) _bldSortDir*=-1; else { _bldSort=s; _bldSortDir=-1; }
    $("bldColhead").querySelectorAll(".ch-sort").forEach(x=>x.classList.toggle("active",x.dataset.s===_bldSort));
    $("bldColhead").querySelectorAll(".ch-ar").forEach(a=>a.textContent="");
    const ar=$("bldColhead").querySelector(`.ch-ar[data-for="${_bldSort}"]`); if(ar) ar.textContent=_bldSortDir<0?"↓":"↑";
    _bldRenderN=80; drawBldList();
  });
  $("bldReset").addEventListener("click",()=>{
    _bldMaxPrice=_bldPriceCeil;_bldMaxOwn=100;_bldTeam=0;_bldSort="pred";_bldSortDir=-1;_bldQuery="";_bldPos=0;_bldRenderN=80;
    $("bldPrice").value=_bldPriceCeil;$("bldPriceVal").textContent="≤ "+money(_bldPriceCeil);
    $("bldOwn").value=100;$("bldOwnVal").textContent="≤ 100%";
    $("bldTeam").value=0;$("bldSearch").value="";
    $("bldPos").querySelectorAll("button").forEach(y=>y.classList.toggle("active",+y.dataset.p===0));
    $("bldColhead").querySelectorAll(".ch-sort").forEach(x=>x.classList.toggle("active",x.dataset.s==="pred"));
    $("bldColhead").querySelectorAll(".ch-ar").forEach(a=>a.textContent=a.dataset.for==="pred"?"↓":"");
    drawBldList();
  });
  // infinite scroll: load more as you near the bottom
  $("bldList").addEventListener("scroll",()=>{
    const el=$("bldList");
    if(el.scrollTop+el.clientHeight >= el.scrollHeight-120){
      if(_bldRenderN < _bldFilteredCount){ _bldRenderN+=80; drawBldList(true); }
    }
  });
  $("bldClear").addEventListener("click",()=>{_bldPicks=[];saveDraft();renderBuilder();});
  renderBuilder();
}
let _bldStartGw=1;

/* --- heuristic predicted points for a player over the window ---
   Transparent formula: base scoring rate (points/game if available, else form)
   adjusted for how easy each of the next N fixtures is, and for availability. */
function predictPoints(e){
  const ppg=parseFloat(e.points_per_game)||0;
  const form=parseFloat(e.form)||0;
  // base per-game expectation: blend season PPG and recent form
  let base = seasonStarted() ? (ppg*0.6 + form*0.4) : (form>0?form: (e.total_points? e.total_points/38 : 2));
  // availability multiplier
  const chance=e.chance_of_playing_next_round;
  let avail=1;
  if(e.status && e.status!=="a") avail = (chance!=null? chance/100 : 0.25);
  else if(chance!=null && chance<100) avail = chance/100;
  // sum over next N gameweeks, each weighted by fixture ease (easy=+, hard=-)
  const gws=[]; for(let g=_bldStartGw; g<_bldStartGw+_bldN && g<=38; g++) gws.push(g);
  let total=0, played=0;
  gws.forEach(g=>{
    const fdrs=(_bldFdr[e.team]&&_bldFdr[e.team][g])||[];
    if(!fdrs.length){ // blank GW (no fixture)
      return;
    }
    fdrs.forEach(fdr=>{
      const ease=(3-fdr)/2*0.35+1; // fdr2→~1.175, fdr3→1, fdr4→~0.825
      total += base*ease*avail;
      played++;
    });
  });
  // if no fixtures found in window (data gap), fall back to base*N
  if(!played) total = base*avail*_bldN;
  return total;
}
function bldPred(id){
  if(!_bldPredCache){ _bldPredCache={}; boot.elements.forEach(e=>_bldPredCache[e.id]=predictPoints(e)); }
  return _bldPredCache[id]||0;
}

/* --- squad validation --- */
function bldState(){
  const b=boot; const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const picks=_bldPicks.map(id=>byId[id]).filter(Boolean);
  const cost=picks.reduce((s,e)=>s+e.now_cost,0);
  const posCount={1:0,2:0,3:0,4:0}; picks.forEach(e=>posCount[e.element_type]++);
  const clubCount={}; picks.forEach(e=>clubCount[e.team]=(clubCount[e.team]||0)+1);
  const overClub=Object.entries(clubCount).filter(([,n])=>n>MAX_PER_CLUB);
  const complete = picks.length===15 && [1,2,3,4].every(p=>posCount[p]===SQUAD[p]);
  const valid = complete && cost<=BUDGET && !overClub.length;
  return {picks,cost,posCount,clubCount,overClub,complete,valid,byId};
}

/* --- best starting XI from 15, captain doubled, over the window --- */
function scoreSquad(ids){
  const b=boot; const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const picks=ids.map(i=>byId[i]).filter(Boolean);
  // choose best legal XI: 1 GK, >=3 DEF, >=2 MID(? actually >=0), >=1 FWD, total 11
  const byPos={1:[],2:[],3:[],4:[]};
  picks.forEach(e=>byPos[e.element_type].push(e));
  Object.values(byPos).forEach(a=>a.sort((x,y)=>bldPred(y.id)-bldPred(x.id)));
  // formation minimums: GK1, DEF3, MID2, FWD1 (FPL rules), fill remaining 4 by best
  const xi=[];
  xi.push(...byPos[1].slice(0,1));
  xi.push(...byPos[2].slice(0,3));
  xi.push(...byPos[3].slice(0,2));
  xi.push(...byPos[4].slice(0,1));
  const used=new Set(xi.map(e=>e.id));
  const rest=[...byPos[2].slice(3),...byPos[3].slice(2),...byPos[4].slice(1)]
    .filter(e=>!used.has(e.id)).sort((x,y)=>bldPred(y.id)-bldPred(x.id));
  xi.push(...rest.slice(0,11-xi.length));
  const sum=xi.reduce((s,e)=>s+bldPred(e.id),0);
  const cap=xi.length?Math.max(...xi.map(e=>bldPred(e.id))):0;
  return sum+cap; // captain doubled
}

/* --- optimal squad (greedy + local swap) to benchmark against --- */
function optimalScore(){
  const b=boot;
  // greedy by pred/cost within constraints, then improve — a close approximation
  const pool=b.elements.filter(e=>e.status!=="u").map(e=>({e,pred:bldPred(e.id),eff:bldPred(e.id)/(e.now_cost/10)}));
  const chosen=[]; const pos={1:0,2:0,3:0,4:0}; const club={}; let cost=0;
  // fill by best predicted first that fits constraints & budget headroom
  const sorted=[...pool].sort((a,c)=>c.pred-a.pred);
  const needCheap=()=>15-chosen.length; // remaining slots
  for(const x of sorted){
    if(chosen.length>=15) break;
    const et=x.e.element_type;
    if(pos[et]>=SQUAD[et]) continue;
    if((club[x.e.team]||0)>=MAX_PER_CLUB) continue;
    // budget guard: leave ~£4.0 per remaining slot minimum
    const minLeft=(needCheap()-1)*40;
    if(cost+x.e.now_cost>BUDGET-minLeft) continue;
    chosen.push(x.e); pos[et]++; club[x.e.team]=(club[x.e.team]||0)+1; cost+=x.e.now_cost;
  }
  // if incomplete (budget), fill cheapest valid
  if(chosen.length<15){
    const cheap=[...pool].sort((a,c)=>a.e.now_cost-c.e.now_cost);
    for(const x of cheap){
      if(chosen.length>=15) break;
      const et=x.e.element_type;
      if(pos[et]>=SQUAD[et]) continue;
      if((club[x.e.team]||0)>=MAX_PER_CLUB) continue;
      if(chosen.find(e=>e.id===x.e.id)) continue;
      if(cost+x.e.now_cost>BUDGET) continue;
      chosen.push(x.e); pos[et]++; club[x.e.team]=(club[x.e.team]||0)+1; cost+=x.e.now_cost;
    }
  }
  return scoreSquad(chosen.map(e=>e.id));
}
let _optCache=null;
function getOptimal(){ if(_optCache&&_optCache.n===_bldN) return _optCache.v; const v=optimalScore(); _optCache={n:_bldN,v}; return v; }

function gradeFor(pct){
  if(pct>=97) return {g:"S",c:"#00e57a"};
  if(pct>=93) return {g:"A",c:"#4ade80"};
  if(pct>=86) return {g:"B",c:"#12d8e3"};
  if(pct>=72) return {g:"C",c:"#f59e0b"};
  if(pct>=55) return {g:"D",c:"#fb923c"};
  if(pct>=43) return {g:"E",c:"#ff8098"};
  return {g:"F",c:"#f43f5e"};
}

/* --- add/remove --- */
function bldToggle(id){
  id=+id;
  if(_bldPicks.includes(id)){ _bldPicks=_bldPicks.filter(x=>x!==id); }
  else{
    const e=boot.elements.find(x=>x.id===id); if(!e) return;
    const st=bldState();
    if(st.picks.length>=15){ toast("Squad full (15 players)"); return; }
    if(st.posCount[e.element_type]>=SQUAD[e.element_type]){ toast(`Max ${SQUAD[e.element_type]} ${POS[e.element_type]}`); return; }
    if((st.clubCount[e.team]||0)>=MAX_PER_CLUB){ toast(`Max 3 from one club`); return; }
    _bldPicks.push(id);
  }
  _optCache=null; saveDraft(); renderBuilder();
}
function saveDraft(){ try{localStorage.setItem("fpl_draft",JSON.stringify({picks:_bldPicks,n:_bldN}))}catch{} }

/* --- rendering --- */
function renderBuilder(){
  const st=bldState();
  $("bldPicked").textContent=`${st.picks.length}/15`;
  $("bldValue").textContent=money(st.cost);
  const bank=BUDGET-st.cost;
  $("bldBank").textContent=(bank<0?"-":"")+money(Math.abs(bank));
  $("bldBank").style.color=bank<0?"var(--bad)":"";
  // warnings
  let warn="";
  if(bank<0) warn=`£${(Math.abs(bank)/10).toFixed(1)}m over budget — swap someone cheaper.`;
  else if(st.overClub.length) warn=`Too many from one club (max 3).`;
  else if(!st.complete && st.picks.length===15) warn=`Wrong shape — need 2 GK, 5 DEF, 5 MID, 3 FWD.`;
  $("bldWarn").innerHTML=warn?`<span class="bld-warn-in">Warning: ${esc(warn)}</span>`:"";
  $("bldWarn").style.display=warn?"block":"none";
  // score
  if(st.valid){
    const mine=scoreSquad(_bldPicks), opt=getOptimal();
    const pct=Math.max(0,Math.min(99,Math.round(mine/opt*99)));
    const gr=gradeFor(mine/opt*100);
    $("bldGrade").textContent=gr.g; $("bldGrade").style.color=gr.c;
    $("bldNum").innerHTML=`${pct}<span>/99</span>`;
    $("bldGauge").style.borderColor=gr.c;
    $("bldGauge").style.background="var(--panel)";
    $("bldScoreTxt").innerHTML=`Grade <b style="color:${gr.c}">${gr.g}</b> · ${pct}% of the optimal squad over ${_bldN} GW${_bldN>1?"s":""}.`;
  }else{
    $("bldGrade").textContent="–"; $("bldGrade").style.color="var(--dim)";
    $("bldNum").innerHTML=`0<span>/99</span>`;
    $("bldGauge").style.borderColor="var(--line2)";
    $("bldGauge").style.background="var(--panel)";
    $("bldScoreTxt").textContent = st.picks.length<15?`Pick ${15-st.picks.length} more player${15-st.picks.length>1?"s":""} to see your score.`:"Fix the warnings above to score your squad.";
  }
  drawBldPitch(st);
  drawBldList();
}
function drawBldPitch(st){
  const b=boot;
  const rowFor=p=>st.picks.filter(e=>e.element_type===p).sort((a,c)=>bldPred(c.id)-bldPred(a.id));
  const slot=(e,pos)=>{
    if(!e) return `<div class="bld-slot empty" data-slotpos="${pos}" title="Add a ${POS[pos]}">+<div class="bld-slot-lbl">${POS[pos]}</div></div>`;
    const t=b.teams.find(z=>z.id===e.team)||{};
    return `<div class="bld-slot" data-rm="${e.id}" title="Remove ${esc(e.web_name)}">
      <div class="bld-kit-wrap">${teamKitImg(t,"bld-kit",`${e.web_name} ${t.name||"club"} kit`)}</div>
      <div class="bld-pl-nm">${esc(e.web_name)}</div>
      <div class="bld-pl-mt">${money(e.now_cost)} · ${bldPred(e.id).toFixed(1)}</div>
      <div class="bld-rm">✕</div>
    </div>`;
  };
  const line=(p)=>{
    const have=rowFor(p); const need=SQUAD[p];
    const cells=[]; for(let i=0;i<need;i++) cells.push(slot(have[i],p));
    return `<div class="prow">${cells.join("")}</div>`;
  };
  $("bldPitch").innerHTML=line(1)+line(2)+line(3)+line(4);
  $("bldPitch").querySelectorAll(".bld-slot[data-rm]").forEach(s=>s.onclick=()=>bldToggle(s.dataset.rm));
  $("bldPitch").querySelectorAll(".bld-slot.empty[data-slotpos]").forEach(s=>s.onclick=()=>{
    const pos=+s.dataset.slotpos;
    _bldPos=pos;
    $("bldPos").querySelectorAll("button").forEach(y=>y.classList.toggle("active",+y.dataset.p===pos));
    drawBldList();
    // focus the picker on mobile/stacked layouts
    $("bldList").scrollTop=0;
    const picker=document.querySelector(".bld-picker");
    if(picker && window.innerWidth<=860) picker.scrollIntoView({behavior:"smooth",block:"start"});
  });
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
  const sorters={
    pred:(a,c)=>bldPred(c.id)-bldPred(a.id),
    cost:(a,c)=>c.now_cost-a.now_cost,
    own:(a,c)=>num(c.selected_by_percent)-num(a.selected_by_percent),
    total:(a,c)=>c.total_points-a.total_points,
  };
  const baseSort=sorters[_bldSort]||sorters.pred; // base is descending
  list.sort((a,c)=> _bldSortDir<0 ? baseSort(a,c) : -baseSort(a,c));
  _bldFilteredCount=list.length;
  const shown=list.slice(0,_bldRenderN);
  const rowHtml=e=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    const picked=_bldPicks.includes(e.id);
    const full=st.picks.length>=15;
    const posFull=st.posCount[e.element_type]>=SQUAD[e.element_type];
    const clubFull=(st.clubCount[e.team]||0)>=MAX_PER_CLUB;
    const disabled=!picked && (full||posFull||clubFull);
    const flag=e.status&&e.status!=="a";
    return `<div class="bld-item ${picked?'picked':''} ${disabled?'disabled':''}" data-add="${e.id}" title="${esc(e.web_name)} · ${POS[e.element_type]} · ${esc(t.name||"")}${flag?' · flagged':''}">
      <span class="bi-player">${teamKitImg(t,"bld-list-kit",`${e.web_name} ${t.name||"club"} kit`)}<span class="bi-name"><b>${esc(e.web_name)}</b><em>${esc(t.short_name||"")} · ${POS[e.element_type]}${flag?' <span class="bi-flag">!</span>':''}</em></span></span>
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

