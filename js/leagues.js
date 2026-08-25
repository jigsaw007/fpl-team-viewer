/* ============ in-app league standings ============ */
let _leaguePage=1, _leagueId=null, _leagueType=null, _leagueName="", _leagueRows=[];
async function openLeague(id, type, name){
  _leagueId=id; _leagueType=type; _leagueName=name; _leaguePage=1; _leagueRows=[];
  $("leagueModal").style.display="flex";
  document.body.style.overflow="hidden";
  $("lmTitle").textContent=name;
  $("lmSub").textContent=type==="h2h"?"Head-to-head standings":"Classic standings";
  $("lmBody").innerHTML=`<div class="status"><div class="spinner"></div>Loading standings…</div>`;
  $("lmMore").style.display="none";
  await loadLeaguePage();
}
async function loadLeaguePage(){
  const base = _leagueType==="h2h"
    ? `/leagues-h2h/${_leagueId}/standings/?page_standings=${_leaguePage}`
    : `/leagues-classic/${_leagueId}/standings/?page_standings=${_leaguePage}`;
  try{
    const data=await get(base);
    if(_leaguePage===1){
      $("lmTitle").textContent=(data.league&&data.league.name)||_leagueName;
    }
    const results=(data.standings&&data.standings.results)||[];
    _leagueRows=_leagueRows.concat(results);
    renderLeagueTable(data);
    const hasNext=data.standings&&data.standings.has_next;
    $("lmMore").style.display=hasNext?"block":"none";
  }catch(e){
    $("lmBody").innerHTML=`<div class="banner err" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>Couldn't load standings.</b><small>${esc(e.message)}. Very large global leagues can be slow — try again.</small></div></div>`;
  }
}
function renderLeagueTable(data){
  const meRow = _leagueRows.find(r=>String(r.entry)===String(_currentEntryId));
  const rows=_leagueRows.map(r=>{
    const me=String(r.entry)===String(_currentEntryId);
    const mv=moveBadge(r.rank, r.last_rank);
    return `<tr class="${me?'lm-me':''}">
      <td class="rank">${r.rank}${mv}</td>
      <td><div class="lm-team">${esc(cleanLeagueText(r.entry_name))}${me?' <span class="lm-you">YOU</span>':''}</div>
          <div class="lm-mgr">${esc(cleanLeagueText(r.player_name))}</div></td>
      <td class="rank">${_leagueType==="h2h"?(r.total??r.points_for??"—"):short(r.total)}</td>
    </tr>`;
  }).join("");
  const ptsHead=_leagueType==="h2h"?"Pts":"Total";
  let meHint="";
  if(meRow) meHint=`<div class="lm-hint">You're <b>${short(meRow.rank)}</b> of ${short(_leagueRows.length)}${data.standings&&data.standings.has_next?"+":""} shown</div>`;
  const analyseBtn=_leagueType!=="h2h"?`<button class="lm-more" id="lmAnalyse" style="margin-bottom:12px">Analyse whole league</button>`:"";
  $("lmBody").innerHTML=`${meHint}${analyseBtn}<table class="lm-table"><thead><tr>
      <th class="rank">Rank</th><th>Team &amp; manager</th><th class="rank">${ptsHead}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  const ab=$("lmAnalyse"); if(ab) ab.onclick=()=>analyseLeague();
}
async function fetchWholeLeagueRows(onProgress){
  const rows=[];
  let page=1;
  let hasNext=true;
  while(hasNext){
    if(onProgress) onProgress(`Loading league standings… page ${page}`);
    const base=_leagueType==="h2h"
      ? `/leagues-h2h/${_leagueId}/standings/?page_standings=${page}`
      : `/leagues-classic/${_leagueId}/standings/?page_standings=${page}`;
    const data=await get(base);
    const standings=data&&data.standings;
    const results=(standings&&standings.results)||[];
    rows.push(...results);
    hasNext=!!(standings&&standings.has_next);
    page++;
  }
  return rows;
}

async function mapInBatches(items, batchSize, worker, onProgress){
  const out=[];
  let completed=0;
  const total=items.length;
  if(onProgress) onProgress(0,total);
  for(let i=0;i<items.length;i+=batchSize){
    const batch=items.slice(i,i+batchSize);
    const values=await Promise.all(batch.map(async item=>{
      try{
        return await worker(item);
      }finally{
        completed++;
        if(onProgress) onProgress(completed,total);
      }
    }));
    out.push(...values);
  }
  return out;
}

const _leagueAnalysisCache=new Map();
let _leagueChipLists={};
let _leagueBenchManagers=[];
let _leagueBenchPage=1;
const LEAGUE_BENCH_PAGE_SIZE=5;

function cleanLeagueText(v){
  return String(v??"")
    .replace(/\uFFFD/g,"")
    .replace(/&amp;/gi,"&")
    .replace(/\s{2,}/g," ")
    .trim();
}

function chipLabel(name){
  const labels={wildcard:"Wildcard",freehit:"Free Hit",bboost:"Bench Boost","3xc":"Triple Captain"};
  return labels[name]||String(name||"Chip");
}
function chipIcon(name){
  const icons={
    wildcard:'fa-solid fa-shuffle',
    freehit:'fa-solid fa-bolt',
    bboost:'fa-solid fa-users',
    '3xc':'fa-solid fa-crown'
  };
  return icons[name]||'fa-solid fa-circle';
}
function chipManagerHtml(row){
  const gw=row.event?`<span class="lm-chip-gw">GW${row.event}</span>`:'';
  const managerUrl=row.entry?`https://fantasy.premierleague.com/entry/${encodeURIComponent(row.entry)}/event/${encodeURIComponent(row.event||1)}`:'#';
  return `<div class="lm-chip-manager-row"><a class="lm-chip-manager-link" href="${managerUrl}" target="_blank" rel="noopener noreferrer"><span><b>${esc(cleanLeagueText(row.entry_name||'Unknown team'))}</b><small>${esc(cleanLeagueText(row.player_name||''))}</small></span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>${gw}</div>`;
}
function showChipManagers(name, scope='season'){
  const panel=$("lmChipManagerPanel");
  if(!panel) return;
  const list=(_leagueChipLists[name]||[]).filter(x=>scope==='gw'?x.currentGw:true);
  const scopeText=scope==='gw'?'this Gameweek':'this season';
  panel.innerHTML=`<div class="lm-chip-manager-head"><div><span>${chipLabel(name)}</span><b>${list.length} manager${list.length===1?'':'s'} used it ${scopeText}</b></div><button type="button" id="lmChipClose" aria-label="Close">×</button></div><div class="lm-chip-manager-list">${list.length?list.map(chipManagerHtml).join(''):'<div class="lm-chip-empty">No managers recorded.</div>'}</div>`;
  panel.hidden=false;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  $("lmChipClose").onclick=()=>{panel.hidden=true;};
}
function bindChipClicks(){
  document.querySelectorAll('[data-chip-name]').forEach(el=>{
    el.addEventListener('click',()=>showChipManagers(el.dataset.chipName,el.dataset.chipScope||'season'));
  });
}

function benchManagerHtml(row){
  const managerUrl=`https://fantasy.premierleague.com/entry/${encodeURIComponent(row.entry)}/event/${encodeURIComponent(row.gw)}`;
  return `<div class="lm-bench-manager-row"><div class="lm-bench-rank">${row.rank}</div><a href="${managerUrl}" target="_blank" rel="noopener noreferrer" class="lm-bench-manager-link"><b>${esc(cleanLeagueText(row.entry_name||'Unknown team'))}</b><small>${esc(cleanLeagueText(row.player_name||''))}</small></a><strong>${row.benchPoints}<small> pts</small></strong></div>`;
}
function renderBenchManagers(){
  const host=$("lmBenchManagers");
  if(!host) return;
  const total=_leagueBenchManagers.length;
  const pages=Math.max(1,Math.ceil(total/LEAGUE_BENCH_PAGE_SIZE));
  _leagueBenchPage=Math.min(Math.max(1,_leagueBenchPage),pages);
  const start=(_leagueBenchPage-1)*LEAGUE_BENCH_PAGE_SIZE;
  const rows=_leagueBenchManagers.slice(start,start+LEAGUE_BENCH_PAGE_SIZE);
  host.innerHTML=`<div class="lm-bench-manager-list">${rows.length?rows.map(benchManagerHtml).join(''):'<div class="lm-empty-state">No bench-points data.</div>'}</div>${total>LEAGUE_BENCH_PAGE_SIZE?`<div class="lm-bench-pager"><button type="button" id="lmBenchPrev" ${_leagueBenchPage===1?'disabled':''}>← Previous</button><span>${_leagueBenchPage} of ${pages}</span><button type="button" id="lmBenchNext" ${_leagueBenchPage===pages?'disabled':''}>Next →</button></div>`:''}`;
  const prev=$("lmBenchPrev"), next=$("lmBenchNext");
  if(prev) prev.onclick=()=>{_leagueBenchPage--;renderBenchManagers();};
  if(next) next.onclick=()=>{_leagueBenchPage++;renderBenchManagers();};
}

async function analyseLeague(){
  const b=boot;
  const curEvent=b.events.find(e=>e.is_current)||b.events.find(e=>e.is_next)||b.events[0];
  const gw=curEvent.id;
  const cacheKey=`${_leagueType}:${_leagueId}:gw${gw}`;
  const showLoad=(msg,done=0,total=0)=>{
    const pct=total?Math.round(done/total*100):0;
    const progressText=total?`${done} of ${total} managers analysed · ${pct}%`:'';
    $("lmBody").innerHTML=`<div class="status league-analysis-loading"><div class="spinner"></div><div class="league-load-copy"><b>Analysing whole league</b><small>${esc(msg)}</small>${total?`<div class="league-load-track"><i style="width:${pct}%"></i></div><em>${progressText}</em>`:''}</div></div>`;
  };
  try{
    if(_leagueAnalysisCache.has(cacheKey)){
      renderLeagueAnalysis(_leagueAnalysisCache.get(cacheKey));
      return;
    }
    showLoad("Loading all league managers…");
    const members=await fetchWholeLeagueRows(showLoad);
    _leagueRows=members;

    // Fetch picks and chip history together. This is substantially faster than two full sequential passes.
    showLoad(`Loading Gameweek ${gw} teams and chip history…`,0,members.length);
    const managerData=await mapInBatches(members,18,async m=>{
      const [p,h]=await Promise.all([
        get(`/entry/${m.entry}/event/${gw}/picks/`).catch(()=>null),
        get(`/entry/${m.entry}/history/`).catch(()=>null)
      ]);
      return {member:m,p,h};
    },(done,total)=>showLoad(`Loading teams and chip history…`,done,total));

    const own={}, cap={}, benched={}, benchPointsByPlayer={}, activeChips={}, chipUses={}, managersUsed={}, formations={};
    const chipLists={wildcard:[],freehit:[],bboost:[],'3xc':[]};
    const gwScores=[], benchManagers=[];
    const elementMap=new Map((b.elements||[]).map(e=>[Number(e.id),e]));
    let counted=0;
    managerData.forEach(({member,p,h})=>{
      if(p&&p.picks){
        counted++;
        const starters=p.picks.filter(x=>x.position<=11);
        const bench=p.picks.filter(x=>x.position>11);
        p.picks.forEach(x=>{ own[x.element]=(own[x.element]||0)+1; });
        const benchBoost=p.active_chip==='bboost';
        let managerBenchPoints=0;
        bench.forEach(x=>{
          const el=elementMap.get(Number(x.element));
          const pts=Number(el&&el.event_points)||0;
          if(!benchBoost){
            benched[x.element]=(benched[x.element]||0)+1;
            benchPointsByPlayer[x.element]=(benchPointsByPlayer[x.element]||0)+pts;
            managerBenchPoints+=pts;
          }
        });
        if(!benchBoost){
          benchManagers.push({entry:member.entry,entry_name:member.entry_name,player_name:member.player_name,benchPoints:managerBenchPoints,gw});
        }
        const c=p.picks.find(x=>x.is_captain); if(c) cap[c.element]=(cap[c.element]||0)+1;
        if(p.active_chip) activeChips[p.active_chip]=(activeChips[p.active_chip]||0)+1;

        const types={2:0,3:0,4:0};
        starters.forEach(x=>{
          const el=elementMap.get(Number(x.element));
          if(el&&types[el.element_type]!==undefined) types[el.element_type]++;
        });
        const formation=`${types[2]}-${types[3]}-${types[4]}`;
        if(/^\d-\d-\d$/.test(formation)) formations[formation]=(formations[formation]||0)+1;

        const pts=Number(p.entry_history&&p.entry_history.points);
        if(Number.isFinite(pts)) gwScores.push({entry:member.entry,points:pts,chip:p.active_chip||null});
      }
      if(h&&Array.isArray(h.chips)){
        const seen=new Set();
        h.chips.forEach(ch=>{
          const nm=ch.name||"unknown";
          chipUses[nm]=(chipUses[nm]||0)+1;
          seen.add(nm);
          if(!chipLists[nm]) chipLists[nm]=[];
          chipLists[nm].push({
            entry:member.entry,
            entry_name:member.entry_name,
            player_name:member.player_name,
            event:ch.event,
            currentGw:Number(ch.event)===Number(gw)
          });
        });
        seen.forEach(nm=>managersUsed[nm]=(managersUsed[nm]||0)+1);
      }
    });

    benchManagers.sort((a,c)=>c.benchPoints-a.benchPoints||String(a.entry_name||'').localeCompare(String(c.entry_name||'')));
    benchManagers.forEach((x,i)=>x.rank=i+1);
    const payload={members,counted,gw,own,cap,benched,benchPointsByPlayer,benchManagers,formations,gwScores,activeChips,chipUses,managersUsed,chipLists};
    _leagueAnalysisCache.set(cacheKey,payload);
    renderLeagueAnalysis(payload);
  }catch(e){
    $("lmBody").innerHTML=`<div class="banner err" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>Couldn't analyse.</b><small>${esc(e.message)}</small></div></div>`;
  }
}

function renderLeagueAnalysis(data){
  const {members,counted,gw,own,cap,benched={},benchPointsByPlayer={},benchManagers=[],formations={},gwScores=[],activeChips,chipUses,managersUsed,chipLists}=data;
  _leagueChipLists=chipLists||{};
  _leagueBenchManagers=benchManagers||[];
  _leagueBenchPage=1;
  const b=boot;
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const pct=n=>counted?Math.round(n/counted*100):0;
  const statPlayerRow=(x,right,subRight='')=>{const t=b.teams.find(z=>z.id===x.e.team)||{}; return `<div class="pr-row lm-player-stat"><div class="lm-stat-player">${teamKitImg(t,"lm-stat-kit",`${t.name||'Club'} kit`)}<div class="l"><div class="nm">${esc(cleanLeagueText(x.e.web_name))}</div><div class="mt">${esc(t.short_name||"")} · ${POS[x.e.element_type]} · £${(x.e.now_cost/10).toFixed(1)}m</div></div></div><div class="pc">${right}${subRight?`<span class="mt">${subRight}</span>`:''}</div></div>`;};

  const ownRows=Object.entries(own).map(([id,n])=>({e:byId[id],n})).filter(x=>x.e).sort((a,c)=>c.n-a.n).slice(0,12);
  const ownHtml=ownRows.map(x=>{const global=parseFloat(x.e.selected_by_percent)||0; const leaguePct=pct(x.n); const diff=leaguePct-global; return statPlayerRow(x,`${leaguePct}%`,`${diff>=0?'+':''}${diff.toFixed(1)}% vs global`);}).join('');
  const capRows=Object.entries(cap).map(([id,n])=>({e:byId[id],n})).filter(x=>x.e).sort((a,c)=>c.n-a.n).slice(0,8);
  const capHtml=capRows.map(x=>statPlayerRow(x,`${pct(x.n)}%`,'captained')).join('');

  const benchRows=Object.entries(benched).map(([id,n])=>({e:byId[id],n})).filter(x=>x.e).sort((a,c)=>c.n-a.n).slice(0,8);
  const benchHtml=benchRows.map(x=>statPlayerRow(x,`${pct(x.n)}%`,`${x.n} manager${x.n===1?'':'s'} · ${benchPointsByPlayer[x.e.id]||0} bench pts`)).join('');

  const differentialRows=Object.entries(own).map(([id,n])=>({e:byId[id],n,leaguePct:counted?n/counted*100:0})).filter(x=>x.e&&x.n>0&&x.leaguePct<=10).sort((a,c)=>(c.e.total_points||0)-(a.e.total_points||0)||c.n-a.n).slice(0,8);
  const differentialHtml=differentialRows.map(x=>{const global=parseFloat(x.e.selected_by_percent)||0; return statPlayerRow(x,`${x.leaguePct.toFixed(x.leaguePct<1?1:0)}%`,`league owned · ${global.toFixed(1)}% global`);}).join('');

  const formationRows=Object.entries(formations).sort((a,c)=>c[1]-a[1]).slice(0,6);
  const formationHtml=formationRows.length?`<div class="lm-formation-list">${formationRows.map(([formation,n],i)=>`<div class="lm-formation-row"><div><b>${formation}</b><span>${n} manager${n===1?'':'s'}</span></div><div class="lm-formation-track"><i style="width:${pct(n)}%"></i></div><strong>${pct(n)}%</strong></div>`).join('')}</div>`:'<div class="lm-empty-state">No formation data.</div>';

  const chipOrder=["wildcard","freehit","bboost","3xc"];
  const thisGwTotal=Object.values(activeChips).reduce((a,n)=>a+n,0);
  const chipCards=chipOrder.map(name=>{ const usedManagers=managersUsed[name]||0; const active=activeChips[name]||0; return `<button type="button" class="lm-chip-card compact" data-chip-name="${name}" data-chip-scope="season"><span class="lm-chip-icon"><i class="${chipIcon(name)}"></i></span><span class="lm-chip-card-copy"><span class="lm-chip-name">${chipLabel(name)}</span><small><b>${usedManagers}</b> used${active?` · <b>${active}</b> this GW`:''}</small></span><i class="fa-solid fa-chevron-right lm-chip-chevron"></i></button>`; }).join('');

  $("lmBody").innerHTML=`
    <button class="lm-more" id="lmBack" style="margin-bottom:12px">← Back to standings</button>
    <div class="lm-analysis-hero"><div><span>League Insights · GW${gw}</span><b>${counted} managers analysed</b><small>${members.length===counted?'Whole league analysed':`${members.length-counted} manager${members.length-counted===1?'':'s'} could not be loaded`}</small></div><div class="lm-analysis-hero-stat"><b>${thisGwTotal}</b><span>chip users this GW</span></div></div>

    <section class="lm-insight-section lm-chip-section"><div class="lm-section-title"><div><b>Chip usage</b><span>Tap a chip to see who used it</span></div></div><div class="lm-chip-grid compact-grid">${chipCards}</div><div id="lmChipManagerPanel" class="lm-chip-manager-panel" hidden></div></section>

    <div class="lm-insight-grid">
      <section class="lm-insight-section"><div class="lm-section-title"><div><b>Most benched</b><span>Players most often left outside the starting XI</span></div></div>${benchHtml||'<div class="lm-empty-state">No bench data.</div>'}</section>
      <section class="lm-insight-section"><div class="lm-section-title"><div><b>League differentials</b><span>Owned by 10% or fewer managers, ranked by FPL points</span></div></div>${differentialHtml||'<div class="lm-empty-state">No qualifying differentials.</div>'}</section>
      <section class="lm-insight-section"><div class="lm-section-title"><div><b>Formation usage</b><span>Starting formations across the league</span></div></div>${formationHtml}</section>
      <section class="lm-insight-section"><div class="lm-section-title"><div><b>Bench points</b><span>Most points left on the bench · Bench Boost users excluded</span></div></div><div id="lmBenchManagers"></div></section>
    </div>

    <section class="lm-insight-section"><div class="lm-section-title"><div><b>Most owned</b><span>League ownership compared with global ownership</span></div></div>${ownHtml||'<div class="lm-empty-state">No ownership data.</div>'}</section>
    <section class="lm-insight-section"><div class="lm-section-title"><div><b>Captaincy split</b><span>Most selected captains this Gameweek</span></div></div>${capHtml||'<div class="lm-empty-state">No captaincy data.</div>'}</section>`;
  $("lmMore").style.display="none";
  $("lmBack").onclick=()=>renderLeagueTable({standings:{has_next:false}});
  bindChipClicks();
  renderBenchManagers();
}

function closeLeague(){
  $("leagueModal").style.display="none";
  document.body.style.overflow="";
}

