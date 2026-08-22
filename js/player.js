/* ============ player deep-dive (reuses modal) ============ */
async function openPlayer(pid){
  const b=boot; const e=b.elements.find(x=>String(x.id)===String(pid)); if(!e) return;
  const t=b.teams.find(z=>z.id===e.team)||{};
  $("leagueModal").style.display="flex"; document.body.style.overflow="hidden";
  $("lmTitle").textContent=e.web_name;
  $("lmSub").textContent=`${t.name||""} · ${POS[e.element_type]} · ${money(e.now_cost)}`;
  $("lmMore").style.display="none";
  $("lmBody").innerHTML=`<div class="status"><div class="spinner"></div>Loading player data…</div>`;
  try{
    const sum=await get(`/element-summary/${pid}/`);
    const stat=(k,v,s)=>`<div class="cap-item"><div class="v">${v}</div><div class="k">${k}</div>${s?`<div class="sub">${s}</div>`:""}</div>`;
    const localMap={[e.team]:(sum.fixtures||[]).slice(0,5).map(f=>({fdr:f.difficulty,gw:f.event}))};
    const proj=fplPeekProjectedPoints(e,localMap,1),proj5=fplPeekProjectedPoints(e,localMap,5);
    const security=minutesSecurity(e);
    const num=v=>(v==null||v==="")?"—":v;
    // season underlying stats live on the element (bootstrap)
    const nextFix=(sum.fixtures||[]).slice(0,5);
    const headFixtures=nextFix.length?`<div class="pdd-head-fixtures"><span class="pdd-head-fixtures-label">Next fixtures</span><div class="pdd-head-fixtures-chips">${nextFix.map(f=>{
      const opp=b.teams.find(z=>z.id===(f.is_home?f.team_a:f.team_h))||{};
      return `<span class="fdr${f.difficulty}" title="GW${f.event} vs ${esc(opp.name||"")} (${f.is_home?"H":"A"})">${esc((opp.short_name||"").toUpperCase())}${f.is_home?"":" (a)"}</span>`;
    }).join("")}</div></div>`:"";
    const kitHead=`<div class="pdd-head-row"><div class="pdd-kit-wrap">${teamKitImg(t,"pdd-kit",`${t.name||"Club"} kit`)}</div><div class="pdd-face-info"><div class="pdd-face-nm">${esc(e.web_name)}</div><div class="pdd-face-mt">${esc(t.name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)} · ${(+e.selected_by_percent).toFixed(1)}% owned</div></div>${headFixtures}</div>`;
    const head=kitHead+`<div class="cap-grid">
      ${stat("Projected GW", proj.toFixed(1), fplPeekProjectionLabel(proj))}
      ${stat("Projected next 5", proj5.toFixed(1), "FPL Peek estimate")}
      ${stat("Total points", e.total_points)}
      ${stat("Form", (+e.form).toFixed(1))}
      ${stat("PPG", num(e.points_per_game))}
      ${stat("Owned", (+e.selected_by_percent).toFixed(1)+"%")}
      ${stat("xG", num(e.expected_goals))}
      ${stat("xA", num(e.expected_assists))}
      ${stat("xGI", num(e.expected_goal_involvements))}
      ${stat("ICT index", num(e.ict_index))}
      ${stat("Goals", num(e.goals_scored))}
      ${stat("Assists", num(e.assists))}
      ${stat("Minutes", num(e.minutes))}
      ${stat("Bonus", num(e.bonus))}
      ${stat("DEFCON pts", num(e.defensive_contribution), Number(e.element_type)===2?"10-action threshold":(Number(e.element_type)>=3?"12-action threshold":""))}
    </div>`;
    // recent gameweek history + minutes tracker
    const hist=(sum.history||[]).slice(-8).reverse();
    const recentChron=[...hist].reverse();
    const startsRecent=recentChron.filter(h=>Number(h.minutes)>=60).length;
    const avgRecent=recentChron.length?recentChron.reduce((a,h)=>a+Number(h.minutes||0),0)/recentChron.length:0;
    const minutesTracker=recentChron.length?`<div class="minutes-tracker"><div class="minutes-tracker-head"><div><span class="lg-cat">Minutes tracker</span><h4>${esc(security.label)}</h4></div><div><b>${avgRecent.toFixed(0)}</b><small>avg min · ${startsRecent}/${recentChron.length} 60+ min</small></div></div><div class="minutes-bars">${recentChron.map(h=>`<div class="minutes-bar-col" title="GW${h.round}: ${h.minutes} minutes"><div class="minutes-bar"><i style="height:${Math.max(3,Math.min(100,(Number(h.minutes||0)/90)*100))}%"></i></div><span>GW${h.round}</span><b>${h.minutes}</b></div>`).join("")}</div></div>`:"";
    const histTbl=hist.length?`<div class="lg-cat" style="margin-top:18px">Recent gameweeks</div>
      <div class="compact-table-scroll"><table class="dt compact-dt"><thead><tr><th class="left">GW</th><th>Pts</th><th>Min</th><th>DEFCON</th><th>Actions</th><th>xGI</th><th>ICT</th><th class="left">Opp</th></tr></thead>
      <tbody>${hist.map(h=>{
        const opp=b.teams.find(z=>z.id===h.opponent_team)||{};
        const dcActions=defconActions(h,e.element_type);
        return `<tr><td class="left">GW${h.round}</td><td>${h.total_points}</td><td>${h.minutes}</td><td>${h.defensive_contribution!=null?h.defensive_contribution:"—"}</td><td>${dcActions==null?"—":dcActions}</td>
          <td>${num(h.expected_goal_involvements)}</td><td>${num(h.ict_index)}</td>
          <td class="left">${esc(opp.short_name||"")} ${h.was_home?"(H)":"(A)"}</td></tr>`;
      }).join("")}</tbody></table></div>`:"";
    $("lmBody").innerHTML=head+minutesTracker+histTbl;
  }catch(err){
    $("lmBody").innerHTML=`<div class="banner err" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>Couldn't load player data.</b><small>${esc(err.message)}</small></div></div>`;
  }
}

function renderChips(history){
  const chips=(history&&history.chips)||[];
  if(!chips.length){ $("chipsSec").style.display="none"; return; }
  $("chipsSec").style.display="block";
  $("chips").innerHTML=chips.map(c=>`<span class="chipbadge" style="margin:0 6px 8px 0">${chipName(c.name)} · GW${c.event}</span>`).join("");
}

/* ============ misc maps ============ */
function chipName(k){return {wildcard:"Wildcard","3xc":"Triple Captain",bboost:"Bench Boost",freehit:"Free Hit",manager:"Assistant Manager"}[k]||k;}
function shortRegion(r){return r.length>12?r.slice(0,11)+"…":r;}
function regionFlag(iso){
  if(!iso||iso.length!==2) return "";
  const cp=[...iso.toUpperCase()].map(c=>127397+c.charCodeAt(0));
  return `<span style="font-size:15px">${String.fromCodePoint(...cp)}</span>`;
}

