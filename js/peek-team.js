/* ============ FPL Peek Team ============
   A deterministic, public-data-only fantasy squad built for one Gameweek at a time.
   No real FPL account is used or changed. Historical Gameweeks are reconstructed from
   information available before that round where the public API permits it. */
const PEEK_TEAM_VERSION="v3";
let _peekFixtures=null,_peekLiveCache=new Map(),_peekHistoryBusy=false,_peekCurrentGw=null;

async function peekFixtures(){
  if(!_peekFixtures) _peekFixtures=await get('/fixtures/');
  return _peekFixtures;
}
async function peekLive(gw){
  if(_peekLiveCache.has(gw)) return _peekLiveCache.get(gw);
  const p=get(`/event/${gw}/live/`).catch(()=>({elements:[]}));
  _peekLiveCache.set(gw,p); return p;
}
function peekFixtureFor(teamId,gw,fixtures){
  const f=(fixtures||[]).find(x=>x.event===gw&&(x.team_h===teamId||x.team_a===teamId));
  if(!f) return null;
  const home=f.team_h===teamId;
  return {home,opp:home?f.team_a:f.team_h,fdr:Number(home?f.team_h_difficulty:f.team_a_difficulty)||3};
}
function peekEventState(gw){
  const ev=(boot?.events||[]).find(e=>e.id===gw)||{};
  if(ev.finished) return 'final';
  if(ev.is_current) return 'live';
  return 'upcoming';
}
function peekTargetEvent(){
  const evs=boot?.events||[];
  return evs.find(e=>e.is_current&&!e.finished) || evs.find(e=>e.is_next) || evs.find(e=>!e.finished) || [...evs].reverse().find(e=>e.finished) || evs[0];
}
async function peekPriorStats(gw){
  const ids=(boot?.elements||[]).map(e=>e.id);
  const map=new Map(ids.map(id=>[id,{games:0,points:0,weighted:0,weight:0,minutes:0,appearances:0,xgi:0,bps:0,bonus:0,goals:0,assists:0,cleanSheets:0,saves:0}]));
  const from=Math.max(1,gw-5);
  for(let g=from;g<gw;g++){
    const live=await peekLive(g); const weight=1+(g-from)*0.22;
    for(const row of live.elements||[]){
      const s=map.get(row.id); if(!s) continue;
      const st=row.stats||{}, pts=Number(st.total_points)||0, mins=Number(st.minutes)||0;
      s.games++; s.points+=pts; s.minutes+=mins; s.weighted+=pts*weight; s.weight+=weight; if(mins>0)s.appearances++;
      s.xgi+=(Number(st.expected_goal_involvements)||0);
      s.bps+=(Number(st.bps)||0); s.bonus+=(Number(st.bonus)||0);
      s.goals+=(Number(st.goals_scored)||0); s.assists+=(Number(st.assists)||0);
      s.cleanSheets+=(Number(st.clean_sheets)||0); s.saves+=(Number(st.saves)||0);
    }
  }
  return map;
}
function peekTeamStrengthFactor(e,fx){
  const own=(boot?.teams||[]).find(t=>t.id===e.team)||{};
  const opp=(boot?.teams||[]).find(t=>t.id===fx?.opp)||{};
  if(!fx||!own.id||!opp.id)return 1;
  const ownAttack=Number(fx.home?own.strength_attack_home:own.strength_attack_away)||1000;
  const ownDef=Number(fx.home?own.strength_defence_home:own.strength_defence_away)||1000;
  const oppAttack=Number(fx.home?opp.strength_attack_away:opp.strength_attack_home)||1000;
  const oppDef=Number(fx.home?opp.strength_defence_away:opp.strength_defence_home)||1000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  if(e.element_type===1||e.element_type===2){
    return clamp((ownDef/Math.max(850,oppAttack))**0.28,.88,1.14);
  }
  return clamp((ownAttack/Math.max(850,oppDef))**0.30,.87,1.16);
}
function peekRecentMinuteFactor(e,prior){
  const s=prior?.get(e.id);
  if(s?.games){
    const avg=s.minutes/s.games;
    const app=s.appearances/s.games;
    return Math.max(.28,Math.min(1.03,(avg/84)*.78+app*.22));
  }
  const starts=Number(e.starts)||0, mins=Number(e.minutes)||0;
  if(starts>0)return Math.max(.48,Math.min(1.02,mins/starts/88));
  return seasonStarted()?.68:.91;
}
function peekAvailability(e,state){
  if(state!=='upcoming') return 1;
  if(e.status==='a' && (e.chance_of_playing_next_round==null||Number(e.chance_of_playing_next_round)>=75)) return 1;
  const c=e.chance_of_playing_next_round;
  if(c!=null) return Math.max(0,Math.min(1,Number(c)/100));
  return e.status==='d'?0.65:e.status==='i'||e.status==='s'||e.status==='u'?0.08:0.45;
}
function peekPlayerModel(e,gw,fixtures,prior,state){
  const fx=peekFixtureFor(e.team,gw,fixtures); if(!fx) return {...e,_peek:-99,_peekCaptain:-99,_peekFx:null};
  const fdr=fx.fdr||3, fixtureFactor={1:1.23,2:1.13,3:1,4:.87,5:.74}[fdr]||1;
  const homeFactor=fx.home?1.035:.985;
  const strengthFactor=peekTeamStrengthFactor(e,fx);
  const own=Math.min(85,Number(e.selected_by_percent)||0), price=(Number(e.now_cost)||40)/10;
  const availability=peekAvailability(e,state);
  const minuteFactor=peekRecentMinuteFactor(e,prior);
  const ep=Number(e.ep_next)||0, form=Number(e.form)||0, ppg=Number(e.points_per_game)||0;
  const xgi90=Number(e.expected_goal_involvements_per_90)||0;
  const xg90=Number(e.expected_goals_per_90)||0, xa90=Number(e.expected_assists_per_90)||0;
  const xgc90=Number(e.expected_goals_conceded_per_90)||0;
  const threat=(Number(e.threat)||0)/Math.max(1,Number(e.starts)||1);
  const creativity=(Number(e.creativity)||0)/Math.max(1,Number(e.starts)||1);
  const ict=(Number(e.ict_index)||0)/Math.max(1,Number(e.starts)||1);
  const total=Number(e.total_points)||0, starts=Number(e.starts)||0;
  const historicalRate=starts?total/starts:0;
  const s=prior?.get(e.id)||null;
  const recentAvg=s?.weight?s.weighted/s.weight:0;
  const recentPlain=s?.games?s.points/s.games:0;
  const recentXgi=s?.games?s.xgi/s.games:0;
  const recentBps=s?.games?s.bps/s.games:0;
  const recentBonus=s?.games?s.bonus/s.games:0;
  let base=0;
  if(state==='upcoming'){
    // Blend the official next-GW estimate with underlying role/output signals. After GW1,
    // recent match data gets the largest say; before GW1, stable historical/profile data carries more weight.
    if(s?.games){
      base=recentAvg*.46 + recentPlain*.10 + Math.min(8,ep)*.16 + form*.10 + ppg*.06 + Math.min(2.5,recentXgi*1.35)*.08 + Math.min(1.2,recentBonus*.28)*.04;
    }else{
      base=Math.min(8,ep)*.30 + form*.12 + ppg*.18 + Math.min(7,historicalRate)*.14 + Math.min(2.8,xgi90*1.55)*.15 + Math.min(1.2,ict/22)*.06 + Math.min(.8,(threat+creativity)/160)*.05;
      if(base<1.4) base=1.0 + Math.max(0,price-4)*.23 + Math.min(.95,xgi90*.6) + own*.006;
    }
  }else{
    // Historical round reconstruction must never use the target round's own returns.
    base=recentAvg*.68+recentPlain*.13+Math.min(2.5,recentXgi*1.30)*.10+Math.min(1.1,recentBonus*.24)*.04+Math.min(.8,recentBps/70)*.05;
    if(!s?.games) base=1.05+Math.max(0,price-4)*.24+own*.006;
  }
  const penalty=(Number(e.penalties_order)>0&&Number(e.penalties_order)<=2)?.52:0;
  const directFk=(Number(e.direct_freekicks_order)>0&&Number(e.direct_freekicks_order)<=2)?.15:0;
  const corners=(Number(e.corners_and_indirect_freekicks_order)>0&&Number(e.corners_and_indirect_freekicks_order)<=2)?.07:0;
  let defensive=0;
  if(e.element_type===1||e.element_type===2){
    const cleanSignal=s?.games?(s.cleanSheets/s.games):Math.max(0,.65-Math.min(.65,xgc90*.20));
    defensive=Math.min(.85,cleanSignal*.62)+(e.element_type===1&&s?.games?Math.min(.28,(s.saves/s.games)/14):0);
  }
  // Ceiling is deliberately separate from value. Elite attackers should remain viable even when
  // cheaper players have better points-per-million, especially for captaincy.
  const attackingProfile=Math.min(1.6,Math.max(xgi90,recentXgi)*.85 + Math.max(xg90,0)*.32 + Math.max(xa90,0)*.18);
  const premiumCeiling=(e.element_type>=3?Math.max(0,price-8)*.11:Math.max(0,price-6)*.035);
  const roleCeiling=attackingProfile*.24 + penalty*.30 + (e.element_type>=3?Math.min(.34,ppg/18):0);
  let projected=(base+penalty+directFk+corners+defensive+premiumCeiling*.30+roleCeiling*.34)*fixtureFactor*homeFactor*strengthFactor*minuteFactor*availability;
  projected=Math.max(.35,Math.min(10.8,projected));
  const market=state==='upcoming'?Math.min(.18,Math.max(-.10,(Number(e.transfers_in_event)||0-(Number(e.transfers_out_event)||0))/300000*.05)):0;
  const reliability=minuteFactor*.40 + Math.min(.16,own/250) + Math.min(.12,recentBps/180);
  // Squad score is primarily expected points, not points-per-million. Price only acts as a small
  // opportunity-cost signal; the optimizer itself enforces the £100m budget.
  const squadScore=projected + reliability + market + roleCeiling*.22 - Math.max(0,price-11)*.025;
  // Captaincy is a separate ceiling model, not just the squad score. Goal threat, penalties,
  // premium attacking pedigree and a home fixture get extra weight because doubling a high-ceiling
  // return matters more than squeezing value from the £100m budget.
  const captainHome=fx.home?.30:0;
  const captainGoalThreat=Math.min(2.1,Math.max(xg90,0)*1.05 + Math.max(xgi90,recentXgi)*.62);
  const captainPedigree=Math.min(1.25,Math.max(0,price-8)*.13) + Math.min(.72,ppg*.10);
  const capScore=projected*1.17 + roleCeiling*.58 + premiumCeiling*.42 + captainGoalThreat + captainPedigree + captainHome + Math.min(.34,own/190) + minuteFactor*.22 + penalty*.68;
  return {...e,_peek:projected,_peekSquad:squadScore,_peekCaptain:capScore,_peekFx:fx,_peekAvailability:availability,_peekCeiling:roleCeiling+premiumCeiling,_peekMinutes:minuteFactor};
}
function peekClubCount(sel){const m=new Map(); for(const p of sel)m.set(p.team,(m.get(p.team)||0)+1); return m;}
function peekCheapestBase(candidates){
  const req={1:2,2:5,3:5,4:3}, sel=[], counts=new Map();
  for(const pos of [1,2,3,4]){
    const pool=candidates.filter(p=>p.element_type===pos).sort((a,b)=>a.now_cost-b.now_cost||b._peekSquad-a._peekSquad);
    for(let k=0;k<req[pos];k++){
      const p=pool.find(x=>!sel.some(s=>s.id===x.id)&&(counts.get(x.team)||0)<3);
      if(!p) return [];
      sel.push(p); counts.set(p.team,(counts.get(p.team)||0)+1);
    }
  }
  return sel;
}
function peekBuildSquad(candidates){
  let sel=peekCheapestBase(candidates); if(sel.length!==15)return [];
  let cost=sel.reduce((a,p)=>a+Number(p.now_cost||0),0);
  // Spend the budget on the largest absolute model gains, rather than blindly chasing
  // points-per-million. This gives genuine premium/ceiling picks a fair route into the squad.
  for(let round=0;round<120;round++){
    let best=null;
    const club=peekClubCount(sel);
    for(let i=0;i<sel.length;i++){
      const cur=sel[i];
      for(const alt of candidates){
        if(alt.element_type!==cur.element_type||sel.some((s,j)=>j!==i&&s.id===alt.id))continue;
        const delta=Number(alt.now_cost)-Number(cur.now_cost); if(cost+delta>1000)continue;
        const altClub=(club.get(alt.team)||0)-(alt.team===cur.team?1:0); if(altClub>=3)continue;
        const gain=alt._peekSquad-cur._peekSquad; if(gain<=.018)continue;
        // Slight preference for moves that use idle bank efficiently, but absolute projected gain dominates.
        const bankAfter=1000-(cost+delta);
        const utility=gain + Math.min(.10,Math.max(0,delta)/100)*.08 - Math.max(0,bankAfter-85)*.00015;
        if(!best||utility>best.utility||(Math.abs(utility-best.utility)<1e-6&&gain>best.gain))best={i,alt,delta,gain,utility};
      }
    }
    if(!best)break;
    sel[best.i]=best.alt; cost+=best.delta;
  }
  // One pass of paired swaps can escape a value-heavy local optimum: downgrade one slot to
  // unlock a large premium upgrade elsewhere when the combined expected score improves.
  let bestPair=null;
  const club=peekClubCount(sel);
  const shortlist=candidates.filter(p=>p._peekSquad>1.2).sort((a,b)=>b._peekSquad-a._peekSquad).slice(0,90);
  for(let i=0;i<sel.length;i++) for(let j=i+1;j<sel.length;j++){
    const a=sel[i],b=sel[j];
    for(const x of shortlist){
      if(x.element_type!==a.element_type||sel.some((s,k)=>k!==i&&k!==j&&s.id===x.id))continue;
      for(const y of shortlist){
        if(y.id===x.id||y.element_type!==b.element_type||sel.some((s,k)=>k!==i&&k!==j&&s.id===y.id))continue;
        const newCost=cost-a.now_cost-b.now_cost+x.now_cost+y.now_cost; if(newCost>1000)continue;
        const counts=new Map(club); counts.set(a.team,(counts.get(a.team)||0)-1); counts.set(b.team,(counts.get(b.team)||0)-1); counts.set(x.team,(counts.get(x.team)||0)+1); counts.set(y.team,(counts.get(y.team)||0)+1);
        if([...counts.values()].some(v=>v>3))continue;
        const gain=x._peekSquad+y._peekSquad-a._peekSquad-b._peekSquad;
        if(gain>.06&&(!bestPair||gain>bestPair.gain))bestPair={i,j,x,y,newCost,gain};
      }
    }
  }
  if(bestPair){sel[bestPair.i]=bestPair.x;sel[bestPair.j]=bestPair.y;cost=bestPair.newCost;}
  return sel;
}
function peekStartingXI(squad){
  const by={1:[],2:[],3:[],4:[]}; squad.forEach(p=>by[p.element_type].push(p));
  Object.values(by).forEach(a=>a.sort((x,y)=>y._peek-x._peek));
  const forms=[[3,4,3],[3,5,2],[4,3,3],[4,4,2],[4,5,1],[5,2,3],[5,3,2],[5,4,1]];
  let best=null;
  for(const [d,m,f] of forms){
    const xi=[by[1][0],...by[2].slice(0,d),...by[3].slice(0,m),...by[4].slice(0,f)].filter(Boolean);
    if(xi.length!==11)continue;
    const score=xi.reduce((a,p)=>a+p._peek,0);
    if(!best||score>best.score)best={xi,score,form:`${d}-${m}-${f}`};
  }
  const xi=best?.xi||[]; const ids=new Set(xi.map(p=>p.id));
  const benchGk=by[1].find(p=>!ids.has(p.id));
  const benchOut=squad.filter(p=>p.element_type!==1&&!ids.has(p.id)).sort((a,b)=>b._peek-a._peek);
  return {xi,bench:[benchGk,...benchOut].filter(Boolean),form:best?.form||'—'};
}
async function buildPeekTeam(gw){
  await loadBoot(); const fixtures=await peekFixtures(); const state=peekEventState(gw);
  const prior=gw>1?await peekPriorStats(gw):null;
  const candidates=(boot.elements||[]).map(e=>peekPlayerModel(e,gw,fixtures,prior,state)).filter(p=>p._peekFx&&p._peekAvailability>.12);
  let squad=peekBuildSquad(candidates);
  // If injury filtering made a position impossible, fall back to all fixture-listed players.
  if(squad.length!==15){
    const all=(boot.elements||[]).map(e=>peekPlayerModel(e,gw,fixtures,prior,state)).filter(p=>p._peekFx);
    squad=peekBuildSquad(all);
  }
  const line=peekStartingXI(squad);
  const cap=[...line.xi].sort((a,b)=>b._peekCaptain-a._peekCaptain);
  return {gw,state,squad,xi:line.xi,bench:line.bench,formation:line.form,captain:cap[0]||null,vice:cap[1]||null,cost:squad.reduce((a,p)=>a+Number(p.now_cost||0),0),projected:line.xi.reduce((a,p)=>a+p._peek,0)+(cap[0]?cap[0]._peek:0)};
}
function peekLiveMap(live){const m=new Map();for(const x of live?.elements||[])m.set(x.id,x.stats||{});return m;}
function peekCounts(players){const c={2:0,3:0,4:0};for(const p of players)if(c[p.element_type]!=null)c[p.element_type]++;return c;}
function peekFormationValid(players){const c=peekCounts(players);return players.length===10&&c[2]>=3&&c[2]<=5&&c[3]>=2&&c[3]<=5&&c[4]>=1&&c[4]<=3;}
async function scorePeekTeam(team){
  const live=await peekLive(team.gw), stats=peekLiveMap(live);
  let active=[...team.xi], used=new Set(active.map(p=>p.id));
  const minutes=p=>Number(stats.get(p.id)?.minutes)||0;
  const points=p=>Number(stats.get(p.id)?.total_points)||0;
  const startGk=active.find(p=>p.element_type===1), benchGk=team.bench.find(p=>p.element_type===1);
  if(startGk&&minutes(startGk)===0&&benchGk&&minutes(benchGk)>0){active=active.map(p=>p.id===startGk.id?benchGk:p);used.add(benchGk.id)}
  const outBench=team.bench.filter(p=>p.element_type!==1&&minutes(p)>0);
  for(const missing of [...active].filter(p=>p.element_type!==1&&minutes(p)===0)){
    for(const sub of outBench){
      if(used.has(sub.id))continue;
      const outfield=active.filter(p=>p.element_type!==1&&p.id!==missing.id);
      const proposed=[...outfield,sub];
      if(peekFormationValid(proposed)){active=active.map(p=>p.id===missing.id?sub:p);used.add(sub.id);break}
    }
  }
  let total=active.reduce((a,p)=>a+points(p),0);
  let doubled=null;
  if(team.captain&&minutes(team.captain)>0)doubled=team.captain;
  else if(team.vice&&minutes(team.vice)>0)doubled=team.vice;
  if(doubled)total+=points(doubled);
  return {total,active,doubled,stats};
}
function peekKit(p){
  const t=(boot.teams||[]).find(x=>x.id===p.team)||{};
  // Reuse the same resilient current-FPL shirt helper used across Builder, Planner and Fixtures.
  // This avoids stale legacy shirt URLs rendering only their alt text on the pitch.
  const html=teamKitImg(t,"peek-kit-img",`${p.web_name||t.name||"Club"} kit`);
  return html||`<span class="peek-jersey" style="background:${teamColor(t.short_name)}"></span>`;
}
function peekFixtureText(p){
  if(!p._peekFx)return '—'; const opp=(boot.teams||[]).find(t=>t.id===p._peekFx.opp)||{};
  return `${opp.short_name||'—'} ${p._peekFx.home?'(H)':'(A)'}`;
}
function peekPlayerHtml(p,team,score){
  const s=score?.stats?.get(p.id);
  const rawActual=s?Number(s.total_points)||0:null;
  const isDoubled=!!(score?.doubled&&score.doubled.id===p.id);
  const actual=rawActual==null?null:rawActual*(isDoubled?2:1);
  const cap=team.captain?.id===p.id?'C':team.vice?.id===p.id?'V':'';
  return `<div class="peek-player">${cap?`<span class="peek-arm ${cap==='V'?'vice':''}">${cap}</span>`:''}<div class="peek-shirt">${peekKit(p)}</div><b>${esc(p.web_name)}</b><span>${esc(peekFixtureText(p))}</span><small>${actual==null?`${p._peek.toFixed(1)} proj`:`${actual} pt${actual===1?'':'s'}${isDoubled?' · 2×':''}`}</small></div>`;
}
function peekPitchRows(team,score){
  const rows=[1,2,3,4].map(pos=>team.xi.filter(p=>p.element_type===pos));
  return rows.map(row=>`<div class="peek-pitch-row">${row.map(p=>peekPlayerHtml(p,team,score)).join('')}</div>`).join('');
}
function peekMethodText(state){
  if(state==='upcoming')return 'The squad combines official FPL expected points where available with recent Gameweek returns, rolling minutes, xGI and attacking involvement, team and opponent strength, fixture difficulty, home/away context, availability, penalties and set pieces, defensive signals, price and a small market-confidence signal. Premium ceiling is scored separately from value so elite captaincy options are not excluded simply for being expensive. The final 15 always obey the £100.0m budget, positional limits and maximum three players per club.';
  return 'For completed and live rounds, the selection model uses only earlier Gameweek returns for recent form, plus the target fixture and stable player-role signals. This helps keep the archive from simply selecting players because they already scored in that round.';
}
function peekRender(team,score){
  _peekCurrentGw=team.gw; const state=team.state;
  const ev=(boot.events||[]).find(e=>e.id===team.gw)||{};
  const status=state==='final'?`Final score · ${score?.total??'—'} pts`:state==='live'?`Live score · ${score?.total??'—'} pts`:`Projected XI · ${team.projected.toFixed(1)} pts`;
  $('peekTeamStatus').innerHTML=`<span class="peek-status-dot ${state}"></span><b>${status}</b><span>${state==='upcoming'&&ev.deadline_time?`Deadline ${new Date(ev.deadline_time).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:state==='live'?'Points are provisional until the Gameweek is final.':'Official FPL points with captaincy and valid autosubs applied.'}</span>`;
  $('peekTeamTitle').textContent=`FPL Peek Team · GW${team.gw}`;
  $('peekTeamMeta').innerHTML=`<span>${team.formation}</span><span>${money(team.cost)}</span><span>Captain: <b>${esc(team.captain?.web_name||'—')}</b></span><span>Vice: <b>${esc(team.vice?.web_name||'—')}</b></span>`;
  $('peekTeamPitch').innerHTML=peekPitchRows(team,score);
  $('peekBench').innerHTML=team.bench.map((p,i)=>`<div class="peek-bench-slot"><em>${i===0?'GK':i}</em>${peekPlayerHtml(p,team,score)}</div>`).join('');
  $('peekMethodBody').textContent=peekMethodText(state);
  $('peekArchiveTitle').textContent=`Gameweek record`;
  document.querySelectorAll('[data-peek-gw]').forEach(b=>b.classList.toggle('active',Number(b.dataset.peekGw)===team.gw));
}
async function peekLoadGw(gw){
  const wrap=$('peekTeamBody'); if(!wrap)return;
  wrap.classList.add('loading');
  try{
    const team=await buildPeekTeam(gw); const score=team.state==='upcoming'?null:await scorePeekTeam(team); peekRender(team,score);
  }catch(e){
    $('peekTeamStatus').innerHTML=`<b>FPL Peek Team is temporarily unavailable.</b><span>${esc(e.message)}</span>`;
  }finally{wrap.classList.remove('loading')}
}
async function peekLoadArchive(){
  if(_peekHistoryBusy)return; _peekHistoryBusy=true;
  const box=$('peekArchive'); if(!box)return;
  const done=(boot.events||[]).filter(e=>e.finished).sort((a,b)=>b.id-a.id);
  if(!done.length){box.innerHTML='<div class="peek-empty">Gameweek scores will appear here once GW1 is complete.</div>';_peekHistoryBusy=false;return}
  box.innerHTML=done.map(e=>`<button data-peek-gw="${e.id}"><span>GW${e.id}</span><b id="peekScore${e.id}">Calculating…</b><em>View squad →</em></button>`).join('');
  box.querySelectorAll('[data-peek-gw]').forEach(b=>b.addEventListener('click',()=>peekLoadGw(Number(b.dataset.peekGw))));
  // Compute sequentially to stay gentle on the public API. Shared event responses are cached above.
  for(const e of [...done].reverse()){
    const label=$(`peekScore${e.id}`); if(!label)continue;
    try{const t=await buildPeekTeam(e.id),s=await scorePeekTeam(t);label.textContent=`${s.total} pts`;}catch(_){label.textContent='View';}
  }
  _peekHistoryBusy=false;
}
async function initPeekTeam(){
  await loadBoot();
  const ev=peekTargetEvent(); if(!ev)return;
  await peekLoadGw(ev.id);
  peekLoadArchive();
  $('peekCurrentBtn')?.addEventListener('click',()=>{const x=peekTargetEvent();if(x)peekLoadGw(x.id)});
}
