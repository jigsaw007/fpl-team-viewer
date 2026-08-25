/* ============ CAPTAIN PICKS + CAPTAINCY MATRIX ============ */
let _captainsReady=false,_capFixtureMap={};
async function initCaptains(){
  if(_captainsReady) return;_captainsReady=true;
  const [b,fixtures]=await Promise.all([loadBoot(),get("/fixtures/").catch(()=>[])]);
  const start=(activeGameweekEvent(b.events)||b.events[0]||{}).id||1;
  _capFixtureMap=buildFixtureMap(fixtures,start);drawCaptainPicks();
}
function capStars(v,max=10){const n=Math.max(1,Math.min(5,Math.round((v/max)*5)));return `<span class="matrix-stars" aria-label="${n} out of 5">${"★".repeat(n)}${"☆".repeat(5-n)}</span>`;}
function captainHeroCard(label,x,tone="safe"){
  if(!x)return "";const t=(boot.teams||[]).find(z=>z.id===x.e.team)||{},fx=(_capFixtureMap[x.e.team]||[])[0],opp=fx?(boot.teams||[]).find(z=>z.id===fx.opp)||{}:{};
  return `<article class="captain-hero-card ${tone}">${teamKitImg(t,"captain-hero-kit")}<div class="captain-hero-copy"><span>${esc(label)}</span><h4>${esc(x.e.web_name)}</h4><small>${esc(t.short_name||"")} · ${money(x.e.now_cost)} · ${x.own.toFixed(1)}% owned</small><div class="captain-hero-meta"><b>${x.proj.toFixed(1)} projected</b>${fx?`<em class="matrix-fdr fdr${fx.fdr}">${esc(opp.short_name||"")} ${fx.home?"H":"A"} · FDR ${fx.fdr}</em>`:""}</div></div></article>`;
}
function captainMatrixHtml(){
  const teams=boot.teams||[],pre=!seasonStarted();
  let pool=(boot.elements||[]).filter(e=>e.status!=="u"&&(e.element_type===3||e.element_type===4));
  if(pre){
    const eligible=pool.filter(e=>Number(e.now_cost)>=80 || (parseFloat(e.selected_by_percent||0)||0)>=10);
    if(eligible.length>=5) pool=eligible;
  }
  const candidates=pool.map(e=>{
    const proj=fplPeekProjectedPoints(e,_capFixtureMap,1),fx=fixtureAverageForTeam(e.team,_capFixtureMap,1)||3,own=parseFloat(e.selected_by_percent||0)||0,sec=minutesSecurity(e);
    const price=(Number(e.now_cost)||50)/10;
    let safety,upside;
    if(pre){
      const first=(_capFixtureMap[e.team]||[])[0]||null;
      const home=first?.home?.55:0,fixtureEase=({1:2.0,2:1.45,3:.78,4:.25,5:-.25})[first?.fdr||Math.round(fx)]??.78;
      const premium=Math.max(0,price-8)*.16,pens=(Number(e.penalties_order)>0&&Number(e.penalties_order)<=2)?.92:0;
      const ppg=parseFloat(e.points_per_game||0)||0,xgi=parseFloat(e.expected_goal_involvements_per_90||0)||0,xg=parseFloat(e.expected_goals_per_90||0)||0,xa=parseFloat(e.expected_assists_per_90||0)||0;
      const ep=Math.min(9,parseFloat(e.ep_next||0)||0),goalCeiling=Math.min(2.6,xg*1.35+xgi*.82+xa*.18);
      const model=(ppg*.56+own*.009+premium+pens+fixtureEase+home+goalCeiling+ep*.20)*(Math.max(.55,Math.min(1.04,sec.score/100)));
      safety=model+Math.min(.45,own/120)+sec.score/240;
      upside=model+goalCeiling*.28+premium*.35+Math.max(0,16-own)*.012;
    }else{
      safety=proj*.58+(6-fx)*.65+Math.min(2.8,own/25)+sec.score/110;
      upside=proj*.78+(6-fx)*.82+Math.max(0,2.2-own/28);
    }
    return {e,proj,fx,own,sec,safety,upside};
  }).sort((a,b)=>Math.max(b.safety,b.upside)-Math.max(a.safety,a.upside)).slice(0,10);
  const safe=[...candidates].sort((a,b)=>b.safety-a.safety)[0],up=[...candidates].sort((a,b)=>b.upside-a.upside)[0];
  const differential=[...candidates].filter(x=>x.own<=10).sort((a,b)=>b.upside-a.upside)[0]||[...candidates].sort((a,b)=>a.own-b.own)[0];
  const projectionHead="Projected pts";
  const intro=pre?"Before GW1, the model leans on proven FPL output, attacking involvement, penalties, expected minutes, price/ceiling, ownership and the opening fixture. It is still an estimate until current-season evidence arrives.":"Compare FPL Peek projected points, fixture difficulty, minutes security, attacking role and ownership. The matrix is a shortlist, not a certainty.";
  return `<div class="captain-intro-strip"><span class="section-kicker">Captain picks</span><p><b>Safe</b> prioritises minutes, projection and ownership. <b>Upside</b> leans into ceiling and fixture quality. <b>Differential</b> highlights a lower-owned alternative.</p></div><div class="captain-hero-grid">${captainHeroCard("Safe pick",safe,"safe")}${captainHeroCard("Upside pick",up,"upside")}${captainHeroCard("Differential",differential,"diff")}</div><section class="captain-matrix"><div class="captain-matrix-head"><div><span class="section-kicker">Captaincy matrix</span><h3>${pre?"Early captain watch":"Safety vs upside"}</h3><p>${intro}</p></div><div class="captain-matrix-picks"><span>${pre?"Safer profile":"Safer"} <b>${safe?esc(safe.e.web_name):"-"}</b></span><span>${pre?"Upside profile":"Upside"} <b>${up?esc(up.e.web_name):"-"}</b></span></div></div><div class="matrix-scroll"><table class="matrix-table"><thead><tr><th>Player</th><th>Fixture</th><th>${projectionHead}</th><th>${pre?"Context":"Minutes"}</th><th>Ownership</th><th>Profile</th></tr></thead><tbody>${candidates.map(x=>{const t=teams.find(z=>z.id===x.e.team)||{},fx=(_capFixtureMap[x.e.team]||[])[0],opp=fx?teams.find(z=>z.id===fx.opp)||{}:{};return `<tr><td><span class="matrix-player">${teamKitImg(t,"matrix-kit")}<span><b>${esc(x.e.web_name)}</b><small>${esc(t.short_name||"")} - ${money(x.e.now_cost)}</small></span></span></td><td>${fx?`<span class="matrix-fixture"><span>${esc(opp.short_name||"")} ${fx.home?"H":"A"}</span><span class="matrix-fdr fdr${fx.fdr}">FDR ${fx.fdr}</span></span>`:"-"}</td><td><b>${x.proj.toFixed(1)}</b><small class="matrix-projection-note"> projected</small></td><td>${pre?"Pre-season":esc(x.sec.label)}</td><td>${x.own.toFixed(1)}%</td><td>${capStars(Math.max(x.safety,x.upside),pre?10:11)}</td></tr>`;}).join("")}</tbody></table></div></section>`;
}
async function drawCaptainPicks(){
  const out=$("captainBody"),matrix=captainMatrixHtml();
  if(!seasonStarted()){out.innerHTML=matrix+`<div class="captain-head captain-sample-head"><div class="captain-kicker">Top-manager sample</div><h3>Available after the first deadline</h3><p>The matrix above works before GW1. Actual captain selections from top-ranked managers appear once public picks are available.</p></div>`;return;}
  out.innerHTML=matrix+`<div class="captain-loading">Loading top-manager captain selections…</div>`;
  try{
    const r=await fetch("/.netlify/functions/captains",{headers:{Accept:"application/json"}});if(!r.ok) throw new Error(`HTTP ${r.status}`);const data=await r.json();
    if(data.status==="waiting"){out.innerHTML=matrix+`<div class="captain-head captain-sample-head"><div class="captain-kicker">Top-manager sample</div><h3>Waiting for public picks</h3><p>Captain selections become available after the Gameweek deadline.</p></div>`;return;}
    const teams=Object.fromEntries((boot.teams||[]).map(t=>[t.id,t])),els=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
    const rows=(data.captains||[]).map(x=>({...x,e:els[x.element]})).filter(x=>x.e).slice(0,15);
    out.innerHTML=matrix+`<div class="captain-head captain-sample-head"><div><div class="captain-kicker">GW${data.gw} top-manager sample</div><h3>Who leading managers captained</h3><p>${data.sample_size||0} successfully read teams from the top ${data.requested_sample||50} overall managers.</p></div><button class="captain-refresh" id="captainRefresh">↻ Refresh</button></div><div class="captain-grid">${rows.map((x,i)=>{const e=x.e,t=teams[e.team]||{};return `<div class="captain-card"><div class="captain-rank">${i+1}</div>${teamKitImg(t,"captain-kit")}<div class="captain-info"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small><div class="captain-bar"><i style="width:${Math.max(2,Math.min(100,x.percent||0))}%"></i></div></div><div class="captain-share"><b>${(+x.percent||0).toFixed(1)}%</b><small>${x.count} captains${x.triple_count?` · ${x.triple_count} TC`:""}</small></div></div>`}).join("")}</div><div class="captain-footnote">Top-manager captain percentage is a sample, not an all-manager figure.</div>`;
    $("captainRefresh").onclick=()=>drawCaptainPicks();
  }catch(e){out.innerHTML=matrix+`<div class="captain-empty bad">Couldn’t build the top-manager sample right now. The captaincy matrix is still available above.</div>`;}
}
