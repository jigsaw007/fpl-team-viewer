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
    const num=v=>(v==null||v==="")?"—":v;
    // season underlying stats live on the element (bootstrap)
    const faceHead=`<div class="pdd-face-row">${faceImg(e,"pdd-face")}<div class="pdd-face-info"><div class="pdd-face-nm">${esc(e.web_name)}</div><div class="pdd-face-mt">${esc(t.name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)} · ${(+e.selected_by_percent).toFixed(1)}% owned</div></div></div>`;
    const head=faceHead+`<div class="cap-grid">
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
    </div>`;
    // recent gameweek history
    const hist=(sum.history||[]).slice(-8).reverse();
    const histTbl=hist.length?`<div class="lg-cat" style="margin-top:18px">Recent gameweeks</div>
      <div class="compact-table-scroll"><table class="dt compact-dt"><thead><tr><th class="left">GW</th><th>Pts</th><th>Min</th><th>xGI</th><th>ICT</th><th class="left">Opp</th></tr></thead>
      <tbody>${hist.map(h=>{
        const opp=b.teams.find(z=>z.id===h.opponent_team)||{};
        return `<tr><td class="left">GW${h.round}</td><td>${h.total_points}</td><td>${h.minutes}</td>
          <td>${num(h.expected_goal_involvements)}</td><td>${num(h.ict_index)}</td>
          <td class="left">${esc(opp.short_name||"")} ${h.was_home?"(H)":"(A)"}</td></tr>`;
      }).join("")}</tbody></table></div>`:"";
    // upcoming fixtures
    const fix=(sum.fixtures||[]).slice(0,5);
    const fixTbl=fix.length?`<div class="lg-cat" style="margin-top:18px">Next fixtures</div>
      <div class="fx" style="max-width:280px">${fix.map(f=>{
        const homeTeam=f.is_home?e.team:f.team_h===e.team?f.team_a:f.team_h;
        const opp=b.teams.find(z=>z.id===(f.is_home?f.team_a:f.team_h))||{};
        const fdr=f.difficulty;
        return `<span class="fdr${fdr}" title="GW${f.event}">${esc((opp.short_name||"").toUpperCase())}${f.is_home?"":" (a)"}</span>`;
      }).join("")}</div>`:"";
    $("lmBody").innerHTML=head+histTbl+fixTbl;
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

