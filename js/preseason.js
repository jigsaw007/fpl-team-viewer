/* ============ PRE-SEASON tab ============ */
let _psView="openers", _psN=3, _psFixtures=null;
async function initPreseason(){
  await loadBoot();
  if(!_psFixtures) _psFixtures=await get(`/fixtures/`);
  $("psView").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("psView").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _psView=x.dataset.v;
    $("psRange").style.display=_psView==="openers"?"":"none";
    drawPreseason();});
  $("psRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("psRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _psN=+x.dataset.n; drawPreseason();});
  drawPreseason();
}
function drawPreseason(){
  if(_psView==="openers") return psOpeners();
  return psLastSeason();
}
function psOpeners(){
  const b=boot;
  // first N gameweeks of the season (1..N) — or from next event if mid-season
  const nextEv=b.events.find(e=>e.is_next)||b.events.find(e=>!e.finished)||b.events[0];
  const startGw=nextEv?nextEv.id:1;
  const gws=[]; for(let g=startGw; g<startGw+_psN && g<=38; g++) gws.push(g);
  const per={}; b.teams.forEach(t=>per[t.id]={fx:[],sum:0});
  _psFixtures.filter(f=>f.event&&gws.includes(f.event)).forEach(f=>{
    per[f.team_h].fx.push({opp:f.team_a,home:true,fdr:f.team_h_difficulty,gw:f.event}); per[f.team_h].sum+=f.team_h_difficulty;
    per[f.team_a].fx.push({opp:f.team_h,home:false,fdr:f.team_a_difficulty,gw:f.event}); per[f.team_a].sum+=f.team_a_difficulty;
  });
  const ranked=b.teams.map(t=>({t, ...per[t.id], avg:per[t.id].fx.length?per[t.id].sum/per[t.id].fx.length:3}))
    .sort((a,c)=>a.avg-c.avg);
  const rows=ranked.map((r,i)=>{
    const chips=r.fx.sort((a,c)=>a.gw-c.gw).map(x=>{const o=b.teams.find(z=>z.id===x.opp)||{};
      const code=x.home?(o.short_name||"").toUpperCase():(o.short_name||"").toLowerCase();
      return `<span class="fdr${x.fdr}" title="GW${x.gw}">${esc(code)}</span>`;}).join("");
    return `<div class="ps-row">
      <div class="ps-rank ${i<5?'good':i>=ranked.length-5?'bad':''}">${i+1}</div>
      <div class="ps-team">${teamKitImg(r.t,"ps-kit")}${esc(r.t.name)}</div>
      <div class="ps-fx">${chips}</div>
      <div class="ps-avg">${r.avg.toFixed(2)}</div>
    </div>`;
  }).join("");
  $("psBody").innerHTML=`<div class="scout-note">Clubs ranked by average fixture difficulty over the first ${_psN} gameweeks (GW${gws[0]}–${gws[gws.length-1]}). Target players from the top clubs for your opening squad. Uppercase = home, lowercase = away.</div>
    <div class="ps-head"><span>#</span><span>Club</span><span>Opening run</span><span>Avg</span></div>${rows}`;
}
function psLastSeason(){
  const b=boot;
  // bootstrap sometimes carries no per-player last-season totals; use what's present.
  // Rank by total_points if season not started (that field carries prior form early), else note.
  const started=seasonStarted();
  if(started){
    $("psBody").innerHTML=`<div class="scout-note">The season's underway — see the <b>Players</b> tab (sort by Points) for this season's top scorers. Last-season archives aren't exposed per-player by the API once the new season starts.</div>`;
    return;
  }
  // pre-season: bootstrap total_points is last season's carryover for returning players until GW1
  const ranked=b.elements.filter(e=>e.total_points>0)
    .sort((a,c)=>c.total_points-a.total_points).slice(0,30);
  if(!ranked.length){
    $("psBody").innerHTML=`<div class="scout-note">Last-season totals aren't available from the API yet. They'll populate as the new season data loads.</div>`;
    return;
  }
  const rows=ranked.map((e,i)=>{const t=b.teams.find(z=>z.id===e.team)||{};
    return `<div class="ps-row">
      <div class="ps-rank ${i<3?'good':''}">${i+1}</div>
      <div class="ps-team">${teamKitImg(t,"ps-kit",`${e.web_name} ${t.name||"club"} kit`)}
        <div><div style="font-weight:700">${esc(e.web_name)}</div><div class="ps-meta">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</div></div></div>
      <div class="ps-pts">${e.total_points}<span class="ps-pts-lbl">pts</span></div>
    </div>`;}).join("");
  $("psBody").innerHTML=`<div class="scout-note">Top scorers carried over from last season (returning players only). A useful starting point for premium picks — new signings appear once they've played. Prices shown are current.</div>
    ${rows}`;
}

