/* ============ LIVE tab ============ */
let _liveView="bonus", _liveGw=null, _liveData=null;
async function initLive(){
  $("liveBody").innerHTML=`<div class="tab-status"><div class="spinner"></div>Loading live data…</div>`;
  const b=await loadBoot();
  const cur=b.events.find(e=>e.is_current);
  if(!cur){ $("liveBody").innerHTML=gwStartNotice("Live scores and bonus points");
    $("liveSub").textContent="No gameweek currently in progress."; return; }
  _liveGw=cur.id;
  $("liveSub").innerHTML=`<span class="live-dot"></span>Gameweek ${_liveGw} · ${cur.finished?"finished":"in progress"}`;
  $("liveView").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("liveView").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _liveView=x.dataset.v; drawLive();});
  $("liveRefresh").addEventListener("click",async()=>{ await fetchLive(); drawLive(); });
  await fetchLive();
  drawLive();
}
async function fetchLive(){
  _liveData=await get(`/event/${_liveGw}/live/`);
}
function drawLive(){
  const b=boot;
  const els=(_liveData&&_liveData.elements)||[];
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const metric=_liveView==="bonus"?"bps":"total_points";
  const rows=els.map(e=>({id:e.id, v:(e.stats&&e.stats[metric])||0, pts:(e.stats&&e.stats.total_points)||0, bps:(e.stats&&e.stats.bps)||0}))
    .filter(r=>r.v>0).sort((a,c)=>c.v-a.v).slice(0,30);
  if(!rows.length){ $("liveBody").innerHTML=`<div class="tab-status">No points recorded yet this gameweek.</div>`; return; }
  $("liveBody").innerHTML=rows.map((r,i)=>{
    const e=byId[r.id]||{}; const t=b.teams.find(z=>z.id===e.team)||{};
    let bonusTag="";
    if(_liveView==="bonus"){
      // provisional bonus: top 3 bps get 3/2/1 (ties simplified)
      const rank=i; const cls=rank===0?"b3":rank===1?"b2":rank===2?"b1":"";
      const prov=rank===0?3:rank===1?2:rank===2?1:0;
      bonusTag=`<div class="live-bonus"><span class="live-b ${cls}">${r.bps} BPS</span>${prov?`<span class="live-b ${cls}">+${prov}</span>`:""}</div>`;
    }
    return `<div class="live-row">
      <div class="live-rank ${i<3?'top':''}">${i+1}</div>
      <div class="live-info"><div class="live-nm">${esc(e.web_name||"?")}</div>
        <div class="live-mt">${esc(t.short_name||"")} · ${POS[e.element_type]||""} · ${r.pts} pts</div></div>
      ${_liveView==="bonus"?bonusTag:`<div class="live-val">${r.v}</div>`}
    </div>`;
  }).join("");
}

