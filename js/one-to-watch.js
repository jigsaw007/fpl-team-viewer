/* ============ one to watch ============ */
async function initOneToWatch(){
  const body=$("oneToWatchBody");
  if(!body)return;
  body.innerHTML=`<div class="otw-loading"><span class="spinner"></span><div><b>Finding this Gameweek's standout players…</b><small>Checking current-GW returns, current-season form and the next five fixtures.</small></div></div>`;
  try{
    const b=await loadBoot();
    const events=b.events||[];
    const current=events.find(e=>e.is_current);
    const latestFinished=[...events].reverse().find(e=>e.finished);
    const performanceEvent=current||latestFinished||events[0];
    const performanceGw=performanceEvent?.id||1;
    const nextGw=performanceGw+1;
    const fixtures=await get('/fixtures/');
    const map=buildFixtureMap(fixtures,nextGw);
    fixtureMap=map;

    const baseCandidates=(b.elements||[]).filter(e=>{
      const gwPts=Number(e.event_points)||0;
      const mins=Number(e.minutes)||0;
      const statusOk=e.status==='a'||e.status==='d';
      return statusOk && gwPts>0 && mins>0 && (map[e.team]||[]).length;
    });

    // One To Watch is not simply a GW-points leaderboard. A player should have
    // performed now AND have a useful short-term run for the next squad decision.
    const fixtureProfile=e=>{
      const fx=(map[e.team]||[]).slice(0,5);
      const fdrs=fx.map(f=>Number(f.fdr)||3);
      const nextFdr=fdrs[0] ?? 3;
      const firstThree=fdrs.slice(0,3);
      const avg3=firstThree.length?firstThree.reduce((a,n)=>a+n,0)/firstThree.length:3;
      const avg5=fdrs.length?fdrs.reduce((a,n)=>a+n,0)/fdrs.length:3;
      const easyCount=fdrs.filter(n=>n<=2).length;
      const favourableCount=fdrs.filter(n=>n<=3).length;
      const hardEarly=firstThree.filter(n=>n>=4).length;
      return {fx,fdrs,nextFdr,avg3,avg5,easyCount,favourableCount,hardEarly};
    };

    const strongCandidates=baseCandidates.filter(e=>{
      const fp=fixtureProfile(e);
      const availability=Number(e.chance_of_playing_next_round ?? 100);
      // Immediate fixture matters most: normally exclude FDR 4/5 next week.
      // Also require a generally playable next-five run.
      return availability>=75 && fp.nextFdr<=3 && fp.favourableCount>=3 && fp.hardEarly<=1;
    });

    // If the strict pool is unusually small, broaden only enough to fill six cards.
    // This avoids returning no list during odd fixture schedules while still
    // preferring the strict shortlist whenever possible.
    const candidates=strongCandidates.length>=6?strongCandidates:baseCandidates.filter(e=>{
      const fp=fixtureProfile(e);
      const availability=Number(e.chance_of_playing_next_round ?? 100);
      return availability>=75 && fp.nextFdr<=3 && fp.avg5<=3.4;
    });

    const score=e=>{
      const fp=fixtureProfile(e);
      const gwPts=Number(e.event_points)||0;
      const form=Number(e.form)||0;
      const ppg=Number(e.points_per_game)||0;
      const price=Math.max(3.5,Number(e.now_cost||0)/10);
      const mins=Number(e.minutes)||0;
      const starts=Number(e.starts)||0;
      const availability=Number(e.chance_of_playing_next_round ?? 100);
      const value=(gwPts+form+ppg)/price;
      // Weight the next fixture and next three more heavily than distant fixtures.
      const fixtureBoost=(4-fp.nextFdr)*4.2 + (3.7-fp.avg3)*3.3 + (3.5-fp.avg5)*1.8 + fp.easyCount*1.2;
      const minutesSecurity=Math.min(4,mins/180)+Math.min(2,starts*.15);
      const availabilityPenalty=availability<100?2:0;
      // GW performance remains important, but cannot overpower a poor immediate run.
      return gwPts*3.4 + form*1.5 + ppg*.8 + value*1.25 + fixtureBoost + minutesSecurity - availabilityPenalty;
    };

    const sorted=[...candidates].sort((a,z)=>score(z)-score(a));
    const picked=[]; const clubCount=new Map();
    for(const e of sorted){
      if((clubCount.get(e.team)||0)>=2)continue;
      picked.push(e); clubCount.set(e.team,(clubCount.get(e.team)||0)+1);
      if(picked.length===6)break;
    }
    if(picked.length<6){for(const e of sorted){if(!picked.some(x=>x.id===e.id)){picked.push(e);if(picked.length===6)break;}}}

    body.innerHTML=`
      <div class="otw-context">
        <div><span class="otw-gw">Gameweek ${performanceGw}</span><b>Standouts worth watching</b></div>
        <p>Selected from players who returned points in Gameweek ${performanceGw}. Ranking then considers current-season form, value, availability and the next five FDRs.</p>
      </div>
      <div class="otw-grid">${picked.map((e,i)=>otwCard(e,map,b,performanceGw,i+1)).join("")}</div>`;
  }catch(e){
    body.innerHTML=`<div class="banner err"><div><b>Couldn’t build One To Watch.</b><small>${esc(e.message||'Try again shortly.')}</small></div></div>`;
  }
}

function otwCard(e,map,b,performanceGw,rank){
  const team=b.teams.find(t=>t.id===e.team)||{};
  const fx=(map[e.team]||[]).slice(0,5);
  const fixtureHtml=fx.map(f=>{const opp=b.teams.find(t=>t.id===f.opp)||{};return `<div class="otw-fx fdr${f.fdr}"><span>GW${f.gw}</span><b>${esc(opp.short_name||"-")}</b><small>${f.home?'H':'A'} · FDR ${f.fdr}</small></div>`;}).join('');
  const gwPts=Number(e.event_points)||0;
  const form=Number(e.form)||0;
  const owned=Number(e.selected_by_percent)||0;
  const minutes=Number(e.minutes)||0;
  const seasonPts=Number(e.total_points)||0;
  const availability=Number(e.chance_of_playing_next_round ?? 100);
  return `<article class="otw-card">
    <div class="otw-player-top">
      <div class="otw-player-visual">${faceImg(e,"otw-face-img")}</div>
      <div class="otw-player-copy">
        <div class="otw-player-line">${teamKitImg(team,"otw-kit",`${team.name||'Club'} kit`)}<span>${esc(team.short_name||team.name||"")} · ${esc(POS[e.element_type]||"")}</span></div>
        <h3>${esc(e.web_name)}</h3>
        <div class="otw-price">${money(e.now_cost)}</div>
      </div>
      <div class="otw-gw-points"><small>GW${performanceGw}</small><b>${gwPts}</b><span>pts</span></div>
    </div>
    <div class="otw-metrics">
      <div><span>Season pts</span><b>${seasonPts}</b></div>
      <div><span>Form</span><b>${form.toFixed(1)}</b></div>
      <div><span>Owned</span><b>${owned.toFixed(1)}%</b></div>
      <div><span>Minutes</span><b>${minutes}</b></div>
    </div>
    ${availability<100?`<div class="otw-availability"><i class="fa-solid fa-triangle-exclamation"></i>${availability}% chance of playing next round</div>`:""}
    <div class="otw-fixtures"><div class="otw-fixtures-title"><b>Next 5 fixtures</b><span>FDR</span></div><div class="otw-fx-grid">${fixtureHtml}</div></div>
  </article>`;
}
