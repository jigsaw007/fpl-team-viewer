/* ============ SCOUT tab ============ */
let _scoutView="buy", _scoutFdr=null;
async function initScout(){
  await loadBoot();
  const fixtures=await get(`/fixtures/`);
  const fromGw=(activeGameweekEvent(boot.events)||boot.events[0]).id;
  // avg FDR over next 5 for each team
  _scoutFdr={};
  boot.teams.forEach(t=>_scoutFdr[t.id]={sum:0,n:0});
  const gws=[]; for(let g=fromGw; g<fromGw+5 && g<=38; g++) gws.push(g);
  fixtures.filter(f=>f.event&&gws.includes(f.event)).forEach(f=>{
    _scoutFdr[f.team_h].sum+=f.team_h_difficulty; _scoutFdr[f.team_h].n++;
    _scoutFdr[f.team_a].sum+=f.team_a_difficulty; _scoutFdr[f.team_a].n++;
  });
  for(const t in _scoutFdr){ const x=_scoutFdr[t]; x.avg=x.n?x.sum/x.n:3; }
  $("scoutView").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("scoutView").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _scoutView=x.dataset.v; drawScout();});
  drawScout();
}
function teamFdr(teamId){ return _scoutFdr&&_scoutFdr[teamId]?_scoutFdr[teamId].avg:3; }
function drawScout(){
  if(_scoutView==="buy") return scoutBuy();
  if(_scoutView==="trends") return scoutTrends();
  if(_scoutView==="template") return scoutTemplate();
  if(_scoutView==="value") return scoutValue();
}
function playable(e){ return e.status==="a" && e.minutes>0; }
function scoutBuy(){
  const b=boot;
  const started=seasonStarted();
  // base rating: in-season use form; pre-season fall back to last-season points (per-38) so it's not empty
  const rate=e=>{
    const f=parseFloat(e.form)||0;
    if(started) return f;
    return f>0 ? f : (e.total_points ? e.total_points/38 : 0);
  };
  const scored=b.elements.filter(e=>rate(e)>0 && e.status!=="u").map(e=>{
    const fdr=teamFdr(e.team);
    const fixtureBoost=(6-fdr)/5;           // 1=easy .. 0.2=hard
    const score=rate(e)*(0.6+0.4*fixtureBoost*2); // blend
    return {e, fdr, score, rated:rate(e)};
  }).sort((a,c)=>c.score-a.score).slice(0,20);
  const noteExtra = started ? "" : " Pre-season, form is estimated from last season until GW1.";
  const rows=scored.map((x,i)=>{
    const e=x.e, t=b.teams.find(z=>z.id===e.team)||{};
    return `<div class="scout-row">
      <div class="scout-rank">${i+1}</div>
      ${teamKitImg(t,"scout-kit")}
      <div class="scout-main"><div class="scout-nm">${esc(e.web_name)} <span class="scout-meta">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</span></div>
        <div class="scout-bars"><span class="mini-lbl">${started?"Form "+(+e.form).toFixed(1):"Last szn "+e.total_points}</span><span class="mini-lbl">Own ${(+e.selected_by_percent).toFixed(1)}%</span><span class="mini-lbl fdr-chip fdr${Math.round(x.fdr)}">FDR ${x.fdr.toFixed(1)}</span></div>
      </div>
      <div class="scout-score">${x.score.toFixed(1)}</div>
    </div>`;
  }).join("");
  $("scoutBody").innerHTML=`<div class="scout-note">Ranked by ${started?"current form":"last-season output"} weighted toward easier upcoming fixtures (next 5 GWs). A guide, not a guarantee.${noteExtra}</div>${rows||'<div class="tab-status">No data yet.</div>'}`;
}
function scoutTrends(){
  const b=boot;
  const maxIn=Math.max(0,...b.elements.map(e=>e.transfers_in_event||0));
  const maxOut=Math.max(0,...b.elements.map(e=>e.transfers_out_event||0));
  if(!seasonStarted() || (maxIn===0 && maxOut===0)){
    $("scoutBody").innerHTML=`<div class="captain-empty"><b>Transfer trends are not available yet.</b><br><span style="display:inline-block;margin-top:5px">FPL is currently reporting zero gameweek transfers. This view will populate automatically once transfer activity is published.</span></div>`;
    return;
  }
  const inN=b.elements.slice().sort((a,c)=>(c.transfers_in_event||0)-(a.transfers_in_event||0)).slice(0,15);
  const outN=b.elements.slice().sort((a,c)=>(c.transfers_out_event||0)-(a.transfers_out_event||0)).slice(0,15);
  const row=(e,val,dir)=>{const t=b.teams.find(z=>z.id===e.team)||{};
    return `<div class="pr-row">${teamKitImg(t,"pr-kit")}<div class="l"><div class="nm">${esc(e.web_name)}</div>
      <div class="mt">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</div></div>
      <div class="pc ${dir}">${dir==="up"?"+":"-"}${short(val)}</div></div>`;};
  $("scoutBody").innerHTML=`<div class="scout-note">Most-transferred players this gameweek across all managers.</div>
    <div class="two-col">
      <div><div class="col-h up">▲ Most bought</div>${inN.map(e=>row(e,e.transfers_in_event||0,"up")).join("")}</div>
      <div><div class="col-h down">▼ Most sold</div>${outN.map(e=>row(e,e.transfers_out_event||0,"down")).join("")}</div>
    </div>`;
}
function scoutTemplate(){
  const b=boot;
  const top=b.elements.slice().sort((a,c)=>parseFloat(c.selected_by_percent)-parseFloat(a.selected_by_percent)).slice(0,15);
  const byPos=p=>top.filter(e=>e.element_type===p);
  const card=e=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    return `<div class="tmpl-card">
      <div class="tmpl-face-wrap">${faceImg(e,"tmpl-face")}<span class="tmpl-own">${(+e.selected_by_percent).toFixed(0)}%</span></div>
      <div class="tmpl-nm">${esc(e.web_name)}</div>
      <div class="tmpl-mt">${esc(t.short_name||"")} · ${money(e.now_cost)}</div>
    </div>`;
  };
  const line=arr=>arr.length?`<div class="tmpl-line">${arr.map(card).join("")}</div>`:"";
  $("scoutBody").innerHTML=`<div class="scout-note">The 15 most-owned players right now — the "template" most top managers converge on. The % is how many managers own them. Compare against your own squad.</div>
    <div class="tmpl-pitch">
      ${line(byPos(1))}
      ${line(byPos(2))}
      ${line(byPos(3))}
      ${line(byPos(4))}
    </div>`;
}
function scoutValue(){
  const b=boot;
  const scored=b.elements.filter(e=>e.total_points>0).map(e=>({e, ppm:e.total_points/(e.now_cost/10)}))
    .sort((a,c)=>c.ppm-a.ppm).slice(0,20);
  $("scoutBody").innerHTML=`<div class="scout-note">Points per million — who's given the most return for their price this season.</div>
    <div class="tbl-scroll"><table class="dt"><thead><tr><th class="left">Player</th><th class="left">Team</th><th>£</th><th>Pts</th><th>Pts / £m</th></tr></thead>
    <tbody>${scored.map(x=>{const e=x.e,t=b.teams.find(z=>z.id===e.team)||{};
      return `<tr><td class="left"><div class="value-player">${teamKitImg(t,"value-kit")}<div><span class="pl-name">${esc(e.web_name)}</span> <span class="pl-meta">${POS[e.element_type]}</span></div></div></td>
      <td class="left">${esc(t.short_name||"")}</td><td>${money(e.now_cost)}</td><td>${e.total_points}</td><td style="color:var(--mint);font-weight:700">${x.ppm.toFixed(1)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

