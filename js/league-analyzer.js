/* ============ standalone league analyzer ============ */
let _laState={leagueId:null,gw:null,league:null,rows:[],page:1,pageSize:20,search:"",sortKey:"rank",sortDir:"asc"};
const _laCache=new Map();

async function initLeagueAnalyzer(){
  await loadBoot();
  const input=$("laLeagueId"),run=$("laRun"),search=$("laSearch");
  if(run&&!run.dataset.bound){
    run.dataset.bound="1";
    run.addEventListener("click",()=>runLeagueAnalyzer());
    input?.addEventListener("keydown",e=>{if(e.key==="Enter")runLeagueAnalyzer();});
    search?.addEventListener("input",()=>{_laState.search=search.value.trim().toLowerCase();_laState.page=1;renderLeagueAnalyzerTable();});
  }
}

function laCurrentGw(){
  const ev=(boot.events||[]).find(e=>e.is_current)||(boot.events||[]).find(e=>e.is_next)||[...(boot.events||[])].reverse().find(e=>e.finished);
  return ev?ev.id:1;
}

async function laFetchAllStandings(leagueId,onProgress){
  const rows=[]; let page=1,league=null,hasNext=true;
  while(hasNext&&page<=100){
    const data=await get(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
    league=league||data.league||{};
    rows.push(...(data.standings?.results||[]));
    hasNext=!!data.standings?.has_next;
    onProgress?.(`Loading standings… ${rows.length} managers found`);
    page++;
  }
  return {league,rows};
}

async function laMapLimit(items,limit,worker,onProgress){
  const out=new Array(items.length); let next=0,done=0;
  async function lane(){
    while(true){
      const i=next++; if(i>=items.length) return;
      try{out[i]=await worker(items[i],i);}catch(e){out[i]={error:e};}
      done++; onProgress?.(done,items.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},lane));
  return out;
}

function laLoading(text,done=0,total=0){
  const pct=total?Math.round(done/total*100):8;
  $("leagueAnalyzerBody").innerHTML=`<div class="la-loading"><div class="la-spinner"></div><div><b>${esc(text)}</b><small>${total?`${done} of ${total} managers analysed`:"This may take a moment for large leagues."}</small></div><div class="la-progress"><span style="width:${pct}%"></span></div></div>`;
}

async function runLeagueAnalyzer(){
  const leagueId=String($("laLeagueId")?.value||"").trim();
  if(!/^\d+$/.test(leagueId)){
    $("leagueAnalyzerBody").innerHTML=`<div class="tool-empty">Enter a valid numeric FPL Classic League ID.</div>`; return;
  }
  const gw=laCurrentGw(),cacheKey=`${leagueId}:${gw}`;
  if(_laCache.has(cacheKey)){_laState={..._laCache.get(cacheKey),page:1,pageSize:20,search:"",sortKey:_laCache.get(cacheKey).sortKey||"rank",sortDir:_laCache.get(cacheKey).sortDir||"asc"};if($("laSearch"))$("laSearch").value="";renderLeagueAnalyzer();return;}
  try{
    laLoading("Loading league…");
    const {league,rows:standings}=await laFetchAllStandings(leagueId,t=>laLoading(t));
    laLoading("Loading Gameweek points…",0,standings.length);
    const [live,fixtures]=await Promise.all([
      get(`/event/${gw}/live/`),
      get(`/fixtures/?event=${gw}`)
    ]);
    const livePoints=new Map((live.elements||[]).map(x=>[Number(x.id),Number(x.stats?.total_points)||0]));
    const teamsStarted=new Set();
    (fixtures||[]).forEach(f=>{
      if(f.started || f.finished || f.finished_provisional){
        teamsStarted.add(Number(f.team_h));
        teamsStarted.add(Number(f.team_a));
      }
    });
    const playerTeam=new Map((boot.elements||[]).map(p=>[Number(p.id),Number(p.team)]));
    laLoading("Analysing managers…",0,standings.length);
    const details=await laMapLimit(standings,20,async row=>{
      const picks=await get(`/entry/${row.entry}/event/${gw}/picks/`);
      const pickRows=picks.picks||[];
      const captain=pickRows.find(p=>Number(p.multiplier)>1) || pickRows.find(p=>p.is_captain);
      const activeChip=picks.active_chip||null;
      const scoringPicks=pickRows.filter(p=>activeChip==="bboost" || Number(p.position)<=11);
      const playedNow=scoringPicks.filter(p=>teamsStarted.has(playerTeam.get(Number(p.element)))).length;
      const playedMax=activeChip==="bboost"?15:11;
      const benchPoints=pickRows.filter(p=>Number(p.position)>11).reduce((sum,p)=>sum+(livePoints.get(Number(p.element))||0),0);
      return {captainId:captain?.element||null,chip:activeChip,playedNow,playedMax,benchPoints,points:Number(picks.entry_history?.points??row.event_total??0)};
    },(d,t)=>laLoading("Analysing managers…",d,t));
    const merged=standings.map((r,i)=>({...r,...(details[i]?.error?{}:details[i])}));
    const payload={leagueId,gw,league,rows:merged,page:1,pageSize:20,search:"",sortKey:"rank",sortDir:"asc"};
    _laCache.set(cacheKey,payload); _laState={...payload};
    renderLeagueAnalyzer();
  }catch(e){
    $("leagueAnalyzerBody").innerHTML=`<div class="banner err"><div><b>Couldn’t load this league.</b><small>Check the league ID and try again. ${esc(e.message||"")}</small></div></div>`;
  }
}

function laChipLabel(chip){
  const m={bboost:"Bench Boost","3xc":"Triple Captain",freehit:"Free Hit",wildcard:"Wildcard"};
  return m[chip]||"—";
}

function renderLeagueAnalyzer(){
  const {league,rows,gw}=_laState;
  const byId={};(boot.elements||[]).forEach(e=>byId[e.id]=e);
  const points=rows.map(r=>Number(r.points??r.event_total??0));
  const avg=points.length?points.reduce((a,b)=>a+b,0)/points.length:0;
  const high=points.length?Math.max(...points):0;
  const chipUsers=rows.filter(r=>r.chip).length;
  const chipCounts={wildcard:0,freehit:0,bboost:0,"3xc":0};
  rows.forEach(r=>{if(r.chip&&Object.prototype.hasOwnProperty.call(chipCounts,r.chip))chipCounts[r.chip]++;});
  const caps={};rows.forEach(r=>{if(r.captainId)caps[r.captainId]=(caps[r.captainId]||0)+1;});
  const topCap=Object.entries(caps).sort((a,b)=>b[1]-a[1])[0];
  const topCapPlayer=topCap?byId[topCap[0]]:null;
  const topCapPct=topCap&&rows.length?Math.round(topCap[1]/rows.length*100):0;
  $("leagueAnalyzerBody").innerHTML=`
    <div class="la-hero">
      <div><span class="la-gw">Gameweek ${gw}</span><h3>${esc(league?.name||"Classic League")}</h3><p>${rows.length} managers analysed from the public FPL league table.</p></div>
      <a class="la-official-link" href="https://fantasy.premierleague.com/leagues/${esc(_laState.leagueId)}/standings/c" target="_blank" rel="noopener">Open in FPL <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
    </div>
    <div class="la-stat-grid">
      <article><i class="fa-solid fa-users"></i><span>Managers</span><b>${rows.length}</b></article>
      <article><i class="fa-solid fa-chart-line"></i><span>Average GW score</span><b>${avg.toFixed(1)}</b></article>
      <article><i class="fa-solid fa-trophy"></i><span>Highest GW score</span><b>${high}</b></article>
      <article class="la-chip-stat"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Chip users</span><b>${chipUsers}</b><div class="la-chip-breakdown"><small><strong>Wildcard</strong> ${chipCounts.wildcard}</small><small><strong>Free Hit</strong> ${chipCounts.freehit}</small><small><strong>Bench Boost</strong> ${chipCounts.bboost}</small><small><strong>Triple Captain</strong> ${chipCounts["3xc"]}</small></div></article>
      <article class="la-stat-wide"><i class="fa-solid fa-c"></i><span>Most captained</span><b>${topCapPlayer?esc(topCapPlayer.web_name):"—"}</b><small>${topCapPlayer?`${topCapPct}% of analysed managers`:"No captain data"}</small></article>
    </div>
    <div class="la-table-card">
      <div class="la-table-head"><div><span>League table</span><h3>Gameweek ${gw} breakdown</h3></div><input id="laSearch" type="search" placeholder="Search team or manager" value="${esc(_laState.search||"")}"></div>
      <div id="laTableWrap"></div>
    </div>`;
  $("laSearch")?.addEventListener("input",e=>{_laState.search=e.target.value.trim().toLowerCase();_laState.page=1;renderLeagueAnalyzerTable();});
  renderLeagueAnalyzerTable();
}

function renderLeagueAnalyzerTable(){
  const wrap=$("laTableWrap"); if(!wrap||!_laState.rows.length)return;
  const byId={};(boot.elements||[]).forEach(e=>byId[e.id]=e);
  const q=_laState.search||"";
  const filtered=_laState.rows.filter(r=>!q||String(r.entry_name||"").toLowerCase().includes(q)||String(r.player_name||"").toLowerCase().includes(q));

  const sortKey=_laState.sortKey||"rank",sortDir=_laState.sortDir==="desc"?-1:1;
  const text=v=>String(v??"").toLowerCase();
  const number=v=>Number(v)||0;
  const sortValue=(r,key)=>{
    const cap=byId[r.captainId];
    switch(key){
      case "team": return text(`${r.entry_name||""} ${r.player_name||""}`);
      case "captain": return text(cap?.web_name||"");
      case "gw": return number(r.points??r.event_total);
      case "bench": return number(r.benchPoints);
      case "chip": return text(laChipLabel(r.chip));
      case "played": return number(r.playedMax)?number(r.playedNow)/number(r.playedMax):0;
      case "total": return number(r.total);
      default: return number(r.rank);
    }
  };
  const sorted=[...filtered].sort((a,b)=>{
    const av=sortValue(a,sortKey),bv=sortValue(b,sortKey);
    let cmp=typeof av==="string"?av.localeCompare(bv):av-bv;
    if(cmp===0)cmp=number(a.rank)-number(b.rank);
    return cmp*sortDir;
  });

  const pages=Math.max(1,Math.ceil(sorted.length/_laState.pageSize));_laState.page=Math.min(_laState.page,pages);
  const start=(_laState.page-1)*_laState.pageSize,slice=sorted.slice(start,start+_laState.pageSize);
  const rowsHtml=slice.map(r=>{
    const cap=byId[r.captainId]; const chip=laChipLabel(r.chip);
    return `<tr>
      <td><span class="la-rank">${Number(r.rank)||"—"}</span></td>
      <td><a class="la-manager" href="https://fantasy.premierleague.com/entry/${r.entry}/event/${_laState.gw}" target="_blank" rel="noopener"><b>${esc(r.entry_name||"Unnamed team")}</b><small>${esc(r.player_name||"")}</small></a></td>
      <td><div class="la-captain">${cap?`<b>${esc(cap.web_name)}</b><small>${esc((boot.teams.find(t=>t.id===cap.team)||{}).short_name||"")} captain</small>`:"—"}</div></td>
      <td><b class="la-points">${Number(r.points??r.event_total??0)}</b></td>
      <td><span class="la-bench-points ${Number(r.benchPoints)>9?'hot':''}">${Number(r.benchPoints)||0}</span></td>
      <td>${r.chip?`<span class="la-chip la-chip-${esc(r.chip)}">${chip}</span>`:`<span class="la-no-chip">—</span>`}</td>
      <td><span class="la-played" title="Players whose Gameweek fixture has started">${Number(r.playedNow)||0}/${Number(r.playedMax)||(r.chip==="bboost"?15:11)}</span></td>
      <td><b class="la-total">${Number(r.total)||0}</b></td>
    </tr>`;
  }).join("");

  const th=(key,label,title="")=>{
    const active=sortKey===key,arrow=active?(_laState.sortDir==="asc"?"fa-arrow-up-short-wide":"fa-arrow-down-wide-short"):"fa-sort";
    return `<th${title?` title="${title}"`:""}><button type="button" class="la-sort ${active?'active':''}" data-sort="${key}">${label}<i class="fa-solid ${arrow}"></i></button></th>`;
  };

  wrap.innerHTML=`<div class="la-table-scroll"><table class="la-table"><thead><tr>${th("rank","Rank")}${th("team","Team & manager")}${th("captain","Captain")}${th("gw","GW pts")}${th("bench","Bench pts")}${th("chip","Chip")}${th("played","Played","Players whose Gameweek fixture has started")}${th("total","Total")}</tr></thead><tbody>${rowsHtml||`<tr><td colspan="8" class="la-none">No managers match your search.</td></tr>`}</tbody></table></div>
  <div class="la-pagination"><span>${sorted.length?`${start+1}–${Math.min(start+_laState.pageSize,sorted.length)} of ${sorted.length}`:"0 managers"}</span><div><button id="laPrev" ${_laState.page<=1?"disabled":""}>Previous</button><b>Page ${_laState.page} of ${pages}</b><button id="laNext" ${_laState.page>=pages?"disabled":""}>Next</button></div></div>`;
  wrap.querySelectorAll(".la-sort").forEach(btn=>btn.addEventListener("click",()=>{
    const key=btn.dataset.sort;
    if(_laState.sortKey===key)_laState.sortDir=_laState.sortDir==="asc"?"desc":"asc";
    else{_laState.sortKey=key;_laState.sortDir=(key==="team"||key==="captain"||key==="chip")?"asc":"desc";}
    _laState.page=1;renderLeagueAnalyzerTable();
  }));
  $("laPrev")?.addEventListener("click",()=>{if(_laState.page>1){_laState.page--;renderLeagueAnalyzerTable();}});
  $("laNext")?.addEventListener("click",()=>{if(_laState.page<pages){_laState.page++;renderLeagueAnalyzerTable();}});
}
