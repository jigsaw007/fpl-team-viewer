/* ============ RANKINGS tab ============ */
let _rankView="country", _rankReady=false;

async function initRankings(){
  await loadBoot();
  if(!_rankReady){
    _rankReady=true;
    $("rankView").addEventListener("click",e=>{
      const b=e.target.closest("button"); if(!b) return;
      $("rankView").querySelectorAll("button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      _rankView=b.dataset.v;
      drawRankings();
    });
  }
  drawRankings();
}

function drawRankings(){
  if(_rankView==="captains") return drawCaptainPicks();
  drawCountryRankings();
}

function flagEmoji(code){
  code=String(code||"").toUpperCase();
  if(!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
}

function drawCountryRankings(){
  const st=savedTeam();
  const value=st&&st.id?esc(st.id):"";
  $("rankBody").innerHTML=`
    <div class="rank-intro">
      <div>
        <div class="rank-kicker">Country leaderboard</div>
        <h3>See the best managers in your FPL country</h3>
        <p>Enter any FPL Team ID. FPL Peek detects the manager's registered country and opens that official country league.</p>
      </div>
      <div class="rank-search">
        <input id="rankTeamId" type="number" inputmode="numeric" placeholder="FPL Team ID" value="${value}">
        <button id="rankCountryGo">Load country</button>
      </div>
    </div>
    <div id="countryRankResult" class="rank-result"><div class="rank-empty">Country standings will appear here.</div></div>`;
  const run=()=>loadCountryRankings(String($("rankTeamId").value||"").trim());
  $("rankCountryGo").onclick=run;
  $("rankTeamId").addEventListener("keydown",e=>{if(e.key==="Enter")run();});
}

async function loadCountryRankings(id){
  const out=$("countryRankResult");
  if(!/^\d+$/.test(id)){ out.innerHTML=`<div class="rank-empty bad">Enter a valid numeric Team ID.</div>`; return; }
  out.innerHTML=`<div class="rank-loading">Loading manager and country league…</div>`;
  try{
    const entry=await get(`/entry/${id}/`);
    const classics=(entry.leagues&&entry.leagues.classic)||[];
    const region=classics.find(l=>String(l.short_name||"").startsWith("region-")) || classics.find(l=>l.name===entry.player_region_name);
    if(!region) throw new Error("No country league found for this manager.");
    const data=await get(`/leagues-classic/${region.id}/standings/?page_standings=1`);
    const rows=(data.standings&&data.standings.results)||[];
    const rank=region.entry_rank||region.rank||null;
    const country=entry.player_region_name||region.name||"Country";
    const iso=entry.player_region_iso_code_short||"";
    const summary=`${flagEmoji(iso)} ${esc(country)}`;
    const managerName=[entry.player_first_name,entry.player_last_name].filter(Boolean).join(" ") || entry.name || `Team ${id}`;
    if(!rows.length){
      out.innerHTML=`<div class="rank-country-head"><div><div class="rank-country-name">${summary}</div><div class="rank-country-sub">${esc(managerName)}${rank?` · country rank ${short(rank)}`:""}</div></div></div>${gwStartNotice(`${country} rankings`)}`;
      return;
    }
    out.innerHTML=`
      <div class="rank-country-head">
        <div><div class="rank-country-name">${summary}</div><div class="rank-country-sub">${esc(managerName)}${rank?` · your country rank <b>${short(rank)}</b>`:""}</div></div>
        <div class="rank-country-count">Top ${rows.length}</div>
      </div>
      <div class="rank-board">
        <div class="rank-row rank-row-head"><span>#</span><span>Manager</span><span>Team</span><span>GW</span><span>Total</span></div>
        ${rows.map(r=>`<div class="rank-row ${String(r.entry)===id?"me":""}">
          <span class="rank-pos">${r.rank||"—"}</span>
          <span class="rank-manager">${esc(r.player_name||"—")}</span>
          <span class="rank-team">${esc(r.entry_name||"—")}</span>
          <span class="rank-num">${r.event_total==null?"—":r.event_total}</span>
          <span class="rank-num strong">${r.total==null?"—":short(r.total)}</span>
        </div>`).join("")}
      </div>`;
  }catch(e){
    out.innerHTML=`<div class="rank-empty bad">Couldn’t load that country leaderboard. ${esc(e.message||"")}</div>`;
  }
}

async function drawCaptainPicks(){
  const out=$("rankBody");
  if(!seasonStarted()){
    out.innerHTML=`<div class="rank-captain-head"><div class="rank-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Once GW1 is locked, this will aggregate captain selections from the top-ranked overall managers.</p></div>${gwStartNotice("Captain picks")}`;
    return;
  }
  out.innerHTML=`<div class="rank-captain-head"><div class="rank-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Aggregating captain choices from a sample of the current top overall FPL managers.</p></div><div class="rank-loading">Analysing captain selections…</div>`;
  try{
    const r=await fetch("/.netlify/functions/captains",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    if(data.status==="waiting"){
      out.innerHTML=`<div class="rank-captain-head"><div class="rank-kicker">Captain watch</div><h3>Top managers' captain picks</h3><p>Captain data becomes available after a gameweek deadline.</p></div>${gwStartNotice("Captain picks")}`;
      return;
    }
    const teams=Object.fromEntries((boot.teams||[]).map(t=>[t.id,t]));
    const els=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
    const rows=(data.captains||[]).map(x=>({...x,e:els[x.element]})).filter(x=>x.e).slice(0,15);
    out.innerHTML=`
      <div class="rank-captain-head">
        <div><div class="rank-kicker">GW${data.gw} captain watch</div><h3>Top managers' captain picks</h3><p>Based on ${data.sample_size||0} successfully read teams from the top ${data.requested_sample||50} overall managers. This is a top-manager sample, not every FPL manager.</p></div>
        <button class="rank-refresh" id="rankCapRefresh">↻ Refresh</button>
      </div>
      <div class="captain-grid">
        ${rows.map((x,i)=>{const e=x.e,t=teams[e.team]||{};return `<div class="captain-card">
          <div class="captain-rank">${i+1}</div>${teamKitImg(t,"captain-kit")}
          <div class="captain-info"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small><div class="captain-bar"><i style="width:${Math.max(2,Math.min(100,x.percent||0))}%"></i></div></div>
          <div class="captain-share"><b>${(+x.percent||0).toFixed(1)}%</b><small>${x.count} captains${x.triple_count?` · ${x.triple_count} TC`:""}</small></div>
        </div>`}).join("") || `<div class="rank-empty">No captain selections were available yet.</div>`}
      </div>
      <div class="rank-footnote">The official FPL API exposes individual manager picks, but not one all-manager captain percentage. FPL Peek samples the leading overall managers so it stays fast and avoids millions of API requests.</div>`;
    $("rankCapRefresh").onclick=()=>drawCaptainPicks();
  }catch(e){
    out.innerHTML=`<div class="rank-captain-head"><div class="rank-kicker">Captain watch</div><h3>Top managers' captain picks</h3></div><div class="rank-empty bad">Couldn’t build the captain sample right now. Try again shortly.</div>`;
  }
}
