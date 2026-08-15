/* ============ TOP CAPTAIN PICKS ============ */
let _captainsReady=false;

async function initCaptains(){
  await loadBoot();
  if(_captainsReady) return;
  _captainsReady=true;
  drawCaptainPicks();
}

async function drawCaptainPicks(){
  const out=$("captainBody");
  if(!seasonStarted()){
    out.innerHTML=`<div class="captain-head"><div class="captain-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Once GW1 is locked, this will aggregate captain selections from the top-ranked overall managers.</p></div>${gwStartNotice("Captain picks")}`;
    return;
  }
  out.innerHTML=`<div class="captain-head"><div class="captain-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Aggregating captain choices from a sample of the current top overall FPL managers.</p></div><div class="captain-loading">Analysing captain selections…</div>`;
  try{
    const r=await fetch("/.netlify/functions/captains",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    if(data.status==="waiting"){
      out.innerHTML=`<div class="captain-head"><div class="captain-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Captain data becomes available after a gameweek deadline.</p></div>${gwStartNotice("Captain picks")}`;
      return;
    }
    const teams=Object.fromEntries((boot.teams||[]).map(t=>[t.id,t]));
    const els=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
    const rows=(data.captains||[]).map(x=>({...x,e:els[x.element]})).filter(x=>x.e).slice(0,15);
    out.innerHTML=`
      <div class="captain-head">
        <div><div class="captain-kicker">GW${data.gw} captain watch</div><h3>Top managers' captain picks</h3><p>Based on ${data.sample_size||0} successfully read teams from the top ${data.requested_sample||50} overall managers. This is a top-manager sample, not every FPL manager.</p></div>
        <button class="captain-refresh" id="captainRefresh">↻ Refresh</button>
      </div>
      <div class="captain-grid">
        ${rows.map((x,i)=>{const e=x.e,t=teams[e.team]||{};return `<div class="captain-card">
          <div class="captain-rank">${i+1}</div>${teamKitImg(t,"captain-kit")}
          <div class="captain-info"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small><div class="captain-bar"><i style="width:${Math.max(2,Math.min(100,x.percent||0))}%"></i></div></div>
          <div class="captain-share"><b>${(+x.percent||0).toFixed(1)}%</b><small>${x.count} captains${x.triple_count?` · ${x.triple_count} TC`:""}</small></div>
        </div>`}).join("") || `<div class="captain-empty">No captain selections were available yet.</div>`}
      </div>
      <div class="captain-footnote">The official FPL API exposes individual manager picks, but not one all-manager captain percentage. FPL Peek samples the leading overall managers so it stays fast and avoids millions of API requests.</div>`;
    $("captainRefresh").onclick=()=>drawCaptainPicks();
  }catch(e){
    out.innerHTML=`<div class="captain-head"><div class="captain-kicker">Captain watch</div><h3>Top managers' captain picks</h3></div><div class="captain-empty bad">Couldn’t build the captain sample right now. Try again shortly.</div>`;
  }
}
