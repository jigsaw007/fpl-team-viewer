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
      <td><div class="lm-team">${esc(r.entry_name)}${me?' <span class="lm-you">YOU</span>':''}</div>
          <div class="lm-mgr">${esc(r.player_name)}</div></td>
      <td class="rank">${_leagueType==="h2h"?(r.total??r.points_for??"—"):short(r.total)}</td>
    </tr>`;
  }).join("");
  const ptsHead=_leagueType==="h2h"?"Pts":"Total";
  let meHint="";
  if(meRow) meHint=`<div class="lm-hint">You're <b>${short(meRow.rank)}</b> of ${short(_leagueRows.length)}${data.standings&&data.standings.has_next?"+":""} shown</div>`;
  const analyseBtn=_leagueType!=="h2h"?`<button class="lm-more" id="lmAnalyse" style="margin-bottom:12px">Analyse ownership (top ${Math.min(_leagueRows.length,20)})</button>`:"";
  $("lmBody").innerHTML=`${meHint}${analyseBtn}<table class="lm-table"><thead><tr>
      <th class="rank">Rank</th><th>Team &amp; manager</th><th class="rank">${ptsHead}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  const ab=$("lmAnalyse"); if(ab) ab.onclick=()=>analyseLeague();
}
async function analyseLeague(){
  const b=boot;
  const curEvent=b.events.find(e=>e.is_current)||b.events.find(e=>e.is_next)||b.events[0];
  const gw=curEvent.id;
  const members=_leagueRows.slice(0,20); // cap to keep it fast/kind to the proxy
  $("lmBody").innerHTML=`<div class="status"><div class="spinner"></div>Analysing ${members.length} squads…</div>`;
  try{
    const picksList=await Promise.all(members.map(m=>get(`/entry/${m.entry}/event/${gw}/picks/`).catch(()=>null)));
    const own={}, cap={};
    let counted=0;
    picksList.forEach(p=>{
      if(!p||!p.picks) return; counted++;
      p.picks.filter(x=>x.position<=11).forEach(x=>{ own[x.element]=(own[x.element]||0)+1; });
      const c=p.picks.find(x=>x.is_captain); if(c) cap[c.element]=(cap[c.element]||0)+1;
    });
    const byId={}; b.elements.forEach(e=>byId[e.id]=e);
    const ownRows=Object.entries(own).map(([id,n])=>({e:byId[id],n})).filter(x=>x.e)
      .sort((a,c)=>c.n-a.n).slice(0,15);
    const capRows=Object.entries(cap).map(([id,n])=>({e:byId[id],n})).filter(x=>x.e)
      .sort((a,c)=>c.n-a.n);
    const pct=n=>Math.round(n/counted*100);
    const ownHtml=ownRows.map(x=>{const t=b.teams.find(z=>z.id===x.e.team)||{};
      const global=parseFloat(x.e.selected_by_percent);
      const leaguePct=pct(x.n);
      const diff=leaguePct-global;
      return `<div class="pr-row"><div class="l"><div class="nm">${esc(x.e.web_name)}</div>
        <div class="mt">${esc(t.short_name||"")} · ${POS[x.e.element_type]} · global ${global.toFixed(1)}%</div></div>
        <div class="pc ${diff>=0?'up':'down'}">${leaguePct}%<span class="mt" style="display:block;font-size:10px">${diff>=0?"+":""}${diff}% vs global</span></div></div>`;
    }).join("");
    const capHtml=capRows.slice(0,8).map(x=>{const t=b.teams.find(z=>z.id===x.e.team)||{};
      return `<div class="pr-row"><div class="l"><div class="nm">${esc(x.e.web_name)}</div>
        <div class="mt">${esc(t.short_name||"")}</div></div><div class="pc up">${pct(x.n)}% (C)</div></div>`;
    }).join("");
    $("lmBody").innerHTML=`
      <button class="lm-more" id="lmBack" style="margin-bottom:14px">← Back to standings</button>
      <div class="lm-hint">Based on ${counted} of the top ${members.length} squads this gameweek.</div>
      <div class="lg-cat">Most-owned in this league</div>${ownHtml||'<div class="mt" style="color:var(--dim)">No data.</div>'}
      <div class="lg-cat" style="margin-top:16px">Captaincy split</div>${capHtml||'<div class="mt" style="color:var(--dim)">No data.</div>'}`;
    $("lmMore").style.display="none";
    $("lmBack").onclick=()=>renderLeagueTable({standings:{has_next:false}});
  }catch(e){
    $("lmBody").innerHTML=`<div class="banner err" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>Couldn't analyse.</b><small>${esc(e.message)}</small></div></div>`;
  }
}
function closeLeague(){
  $("leagueModal").style.display="none";
  document.body.style.overflow="";
}

