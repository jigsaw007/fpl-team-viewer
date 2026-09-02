/* ============ main ============ */
async function view(tid){
  tid=String(tid).trim(); if(!tid) return;
  $("msg").innerHTML=`<div class="status"><div class="spinner"></div>Loading team ${esc(tid)}…</div>`;
  $("app").style.display="none";
  $("go").disabled=true;
  _currentEntryId=tid;
  try{
    const b=await loadBoot();
    const [entry, fixtures, history] = await Promise.all([
      get(`/entry/${tid}/`),
      get(`/fixtures/`),
      get(`/entry/${tid}/history/`).catch(()=>null)
    ]);

    const curEvent=b.events.find(e=>e.is_current);
    const nextEvent=b.events.find(e=>e.is_next);
    const lastStarted=[...b.events].reverse().find(e=>e.finished||e.is_current);
    const fixtureFromGw=(curEvent||nextEvent||b.events[0]).id;
    fixtureMap=buildFixtureMap(fixtures, fixtureFromGw);

    // header always
    renderHeader(entry, history, curEvent||nextEvent, !!lastStarted);
    renderLeagues(entry);
    renderHistory(history);
    renderChips(history);
    renderSeasonChart(history);

    if(!lastStarted){
      // pre-season: no public squad
      const gw1=b.events.find(e=>e.id===1);
      const dl=gw1&&gw1.deadline_time?new Date(gw1.deadline_time).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):"the GW1 deadline";
      $("msg").innerHTML=`<div class="banner"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div><b>Season hasn't started.</b><small>FPL only reveals a team's squad publicly once a gameweek kicks off. Your squad will appear here automatically after GW1 (${dl}). Everything else below is live.</small></div></div>`;
      $("formationBadge").textContent="";
      $("pitch").innerHTML=`<div class="empty">Squad unlocks when Gameweek 1 kicks off</div>`;
      $("bench").innerHTML="";
      $("app").style.display="block"; $("go").disabled=false;
      pushRecent(tid, entry.name); saveTeam(tid, entry.name); return;
    }

    // load latest started GW picks
    let picks=null, gwUsed=lastStarted.id;
    for(let gw=lastStarted.id; gw>=1 && !picks; gw--){
      try{ picks=await get(`/entry/${tid}/event/${gw}/picks/`); gwUsed=gw; }catch(_){}
    }
    if(!picks){
      $("msg").innerHTML=`<div class="banner err"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div><b>No squad found.</b><small>This manager may not have entered a team this season.</small></div></div>`;
      $("app").style.display="none"; $("go").disabled=false; return;
    }
    renderSquad(picks, gwUsed, b);
    renderCaptaincy(picks, b);
    renderRecap(picks, history, gwUsed, b);
    // enrich header GW stat from picks history
    renderHeader(entry, history, {id:gwUsed}, true, picks.entry_history);
    renderGridFromPicks(entry, picks.entry_history, b);

    $("msg").innerHTML="";
    $("app").style.display="block"; $("go").disabled=false;
    pushRecent(tid, entry.name); saveTeam(tid, entry.name);
  }catch(e){
    $("go").disabled=false;
    const notFound=/HTTP 404/.test(e.message);
    $("msg").innerHTML=`<div class="banner err"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <div><b>${notFound?`Team ${esc(tid)} not found.`:"Couldn't load that team."}</b>
      <small>${notFound?"Check the ID — it's the number in your FPL URL after /entry/.":esc(e.message)+". If the deploy is fresh, the proxy function may still be warming up — try again in a moment."}</small></div></div>`;
    $("app").style.display="none";
  }
}

function renderHeader(entry, history, gwEvent, started, gwHist){
  const cur=(history&&history.current)||[];
  const lastTwo=cur.slice(-2);
  let rankDelta="";
  if(lastTwo.length===2 && lastTwo[0].overall_rank && lastTwo[1].overall_rank){
    const d=lastTwo[0].overall_rank-lastTwo[1].overall_rank; // positive = improved (rank number went down)
    if(d>0) rankDelta=`<span class="delta up">▲ ${short(Math.abs(d))}</span>`;
    else if(d<0) rankDelta=`<span class="delta down">▼ ${short(Math.abs(d))}</span>`;
  }
  const flag = entry.player_region_iso_code_short?regionFlag(entry.player_region_iso_code_short):"";
  const past=(history&&history.past)||[];
  const careerPts=past.reduce((a,s)=>a+(s.total_points||0),0);
  const best=past.length?past.reduce((a,s)=>s.total_points>a.total_points?s:a):null;
  const thisSeasonEmpty=!(entry.summary_overall_points>0);
  // pre-season / empty: swap live totals for career highlights so the header isn't all zeros
  const primaryStats = thisSeasonEmpty && past.length ? `
      <div class="b"><div class="v">${short(careerPts)}</div><div class="k">Career points</div></div>
      <div class="b"><div class="v">${best?short(best.total_points):"—"}</div><div class="k">Best season${best?` · ${esc(best.season_name)}`:""}</div></div>
      <div class="b"><div class="v">${best&&best.rank?short(best.rank):"—"}</div><div class="k">Best rank</div></div>
      <div class="b"><div class="v">${past.length}</div><div class="k">Seasons played</div></div>`
    : `
      <div class="b"><div class="v">${short(entry.summary_overall_points||0)}</div><div class="k">Overall points</div></div>
      <div class="b"><div class="v">${entry.summary_overall_rank?short(entry.summary_overall_rank):"—"} ${rankDelta}</div><div class="k">Overall rank</div></div>
      <div class="b"><div class="v">${entry.summary_event_points!=null?entry.summary_event_points:"—"}</div><div class="k">Last GW pts</div></div>
      <div class="b"><div class="v">${best?short(best.total_points):"—"}</div><div class="k">Best season${best?` · ${esc(best.season_name)}`:""}</div></div>`;
  $("mhead").innerHTML=`
    <div class="top">
      <div>
        <div class="name">${esc(entry.name)}</div>
        <div class="mgr">${flag}${esc(entry.player_first_name)} ${esc(entry.player_last_name)} · ${esc(entry.player_region_name||"")}</div>
      </div>
      <div class="head-actions">
        <div class="gwtag">${started?`Gameweek ${gwEvent?gwEvent.id:"—"}`:`GW${gwEvent?gwEvent.id:1} · upcoming`}</div>
        <button class="share-btn" id="shareBtn" title="Download shareable card">Share card</button>
      </div>
    </div>
    <div class="ovr">${primaryStats}</div>`;
  _shareCtx={entry, best, gwEvent, started};
  const sb=$("shareBtn"); if(sb) sb.onclick=()=>makeShareCard();
}
let _shareCtx=null;

/* ============ shareable card (canvas → PNG) ============ */
function makeShareCard(){
  if(!_shareCtx) return;
  const {entry, best, gwEvent, started}=_shareCtx;
  const W=1080, H=1080, c=document.createElement("canvas"); c.width=W; c.height=H;
  const x=c.getContext("2d");
  // Light share-card surface to match the website.
  x.fillStyle="#f3f5f6"; x.fillRect(0,0,W,H);
  x.fillStyle="#ffffff"; roundRect(x,60,60,W-120,H-120,28); x.fill();
  x.strokeStyle="#e3e7eb"; x.lineWidth=2; x.stroke();
  x.fillStyle="#0b8f62"; x.fillRect(60,60,12,H-120);
  const cx=W/2;
  x.textAlign="center";
  // logo chip
  x.fillStyle="#0b8f62"; roundRect(x,cx-70,82,140,56,12); x.fill();
  x.fillStyle="#ffffff"; x.font="800 30px Inter, sans-serif"; x.fillText("FPL",cx,119);
  // team name
  x.fillStyle="#171a1f"; x.font="800 62px Inter, sans-serif";
  wrapText(x, entry.name, cx, 240, W-160, 66);
  x.fillStyle="#626b76"; x.font="500 30px Inter, sans-serif";
  x.fillText(`${entry.player_first_name} ${entry.player_last_name} · ${entry.player_region_name||""}`, cx, 300);
  // main stat block
  const stat=(label,val,y)=>{
    x.fillStyle="#0b8f62"; x.font="800 96px Inter, sans-serif"; x.fillText(val, cx, y);
    x.fillStyle="#929aa4"; x.font="600 26px Inter, sans-serif";
    x.fillText(label.toUpperCase(), cx, y+42);
  };
  if(started){
    stat("Overall points", short(entry.summary_overall_points||0), 480);
    // two side stats
    sideStat(x, W*0.30, 660, entry.summary_overall_rank?short(entry.summary_overall_rank):"—", "Overall rank");
    sideStat(x, W*0.70, 660, entry.summary_event_points!=null?String(entry.summary_event_points):"—", "Last GW");
    if(best){ sideStat(x, cx, 830, `${short(best.total_points)} (${best.season_name})`, "Best season", true); }
  }else{
    stat("Best season", best?short(best.total_points):"—", 480);
    sideStat(x, W*0.30, 660, best?best.season_name:"—", "Season");
    sideStat(x, W*0.70, 660, best&&best.rank?short(best.rank):"—", "Best rank");
    x.fillStyle="#626b76"; x.font="600 30px Inter, sans-serif";
    x.fillText(`Gameweek ${gwEvent?gwEvent.id:1} · season starting soon`, cx, 830);
  }
  // footer
  x.fillStyle="#929aa4"; x.font="500 24px Inter, sans-serif";
  x.fillText("Fantasy Premier League data · FPL Peek", cx, H-70);
  // download
  c.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`${(entry.name||"fpl").replace(/[^a-z0-9]+/gi,"-").toLowerCase()}-fpl-card.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  },"image/png");
}
function sideStat(x,px,py,val,label,wide){
  x.textAlign="center";
  x.fillStyle="#171a1f"; x.font=`800 ${wide?42:54}px Inter, sans-serif`; x.fillText(val,px,py);
  x.fillStyle="#929aa4"; x.font="600 24px Inter, sans-serif"; x.fillText(label.toUpperCase(),px,py+36);
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function wrapText(ctx,text,cx,y,maxW,lh){
  const words=String(text).split(" "); let line="", lines=[];
  words.forEach(w=>{ const t=line?line+" "+w:w; if(ctx.measureText(t).width>maxW && line){lines.push(line);line=w;} else line=t; });
  if(line)lines.push(line);
  lines.slice(0,2).forEach((l,i)=>ctx.fillText(l,cx,y+i*lh));
}

function renderGridFromPicks(entry, h, b){
  if(!h){ $("grid").innerHTML=""; return; }
  const cards=[
    ["GW points", h.points??"—", h.points_on_bench!=null?`${h.points_on_bench} on bench`:""],
    ["GW rank", h.rank?short(h.rank):"—", h.rank_sort?`of ${short(b?.total_players||0)}`:""],
    ["Team value", h.value?money(h.value):"—", h.bank!=null?`${money(h.bank)} in bank`:""],
    ["Transfers", h.event_transfers??"—", h.event_transfers_cost?`-${h.event_transfers_cost} pts hit`:"no hit"],
    ["Overall pts", short(entry.summary_overall_points||0), ""],
    ["Overall rank", entry.summary_overall_rank?short(entry.summary_overall_rank):"—", ""],
  ];
  $("grid").innerHTML=cards.map(([k,v,s])=>`<div class="card"><div class="v">${v}</div><div class="k">${k}</div>${s?`<div class="sub">${s}</div>`:""}</div>`).join("");
}

function renderSquad(picks, gwUsed, b){
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const rows=picks.picks.map(p=>({...p, el:byId[p.element]})).filter(p=>p.el);
  const start=rows.filter(p=>p.position<=11), bench=rows.filter(p=>p.position>11);
  const byPos=pos=>start.filter(p=>p.el.element_type===pos);
  const g=byPos(1),d=byPos(2),m=byPos(3),f=byPos(4);
  $("formationBadge").textContent=`${d.length}-${m.length}-${f.length}  ·  GW${gwUsed}${picks.active_chip?" · "+chipName(picks.active_chip):""}`;
  $("pitch").innerHTML=[g,d,m,f].map(r=>`<div class="prow">${r.map(p=>playerCard(p.el,p,false)).join("")}</div>`).join("");
  $("bench").innerHTML=`<div class="prow">${bench.map(p=>playerCard(p.el,p,true)).join("")}</div>`;
}

function renderSeasonChart(history){
  const cur=(history&&history.current)||[];
  if(cur.length>=2){
    $("seasonSec").style.display="block";
    drawChart(cur, "points");
    $("chartTabs").querySelectorAll(".ct").forEach(btn=>{
      btn.onclick=()=>{
        $("chartTabs").querySelectorAll(".ct").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        drawChart(_curRows.length?_curRows:cur, btn.dataset.c);
      };
    });
  } else $("seasonSec").style.display="none";
}

function renderHistory(history){
  const past=(history&&history.past)||[];
  if(!past.length){ $("histSec").style.display="none"; return; }
  $("histSec").style.display="block";
  const pts=past.map(s=>s.total_points), max=Math.max(...pts), min=Math.min(...pts);
  // scale so the smallest bar is ~40% tall (contrast) and largest is 100%
  const scale=v=>{ const t=max===min?1:(v-min)/(max-min); return Math.round(40+t*60); };
  $("history").innerHTML=`<div class="bars">${past.map(s=>`
    <div class="bar" title="${esc(s.season_name)}: ${s.total_points} pts · rank ${short(s.rank)}">
      <div class="val">${s.total_points}</div>
      <div class="track"><div class="col" style="height:${scale(s.total_points)}%"></div></div>
      <div class="lbl">${esc(s.season_name)}</div>
      <div class="rk">${short(s.rank)}</div>
    </div>`).join("")}</div>
  <div style="text-align:center;color:var(--dim);font-size:11.5px;margin-top:10px">bar = total points · number below = overall rank</div>`;
}

function renderRecap(picks, history, gwUsed, b){
  const cur=(history&&history.current)||[];
  const thisGw=cur.find(r=>r.event===gwUsed);
  if(!thisGw){ $("recapSec").style.display="none"; return; }
  const prevGw=cur.find(r=>r.event===gwUsed-1);
  $("recapSec").style.display="block";
  $("recapGw").textContent=`Gameweek ${gwUsed}`;
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const starters=picks.picks.filter(p=>p.position<=11).map(p=>({p,e:byId[p.element]})).filter(x=>x.e);
  // captain return
  const cap=picks.picks.find(p=>p.is_captain); const capEl=cap&&byId[cap.element];
  const capMult=picks.active_chip==="3xc"?3:2;
  const capPts=capEl?(capEl.event_points||0)*capMult:0;
  // best / worst starter (by GW points)
  const sorted=[...starters].sort((a,c)=>(c.e.event_points||0)-(a.e.event_points||0));
  const best=sorted[0], worst=sorted[sorted.length-1];
  // rank movement
  let rankMove="";
  if(prevGw&&prevGw.overall_rank&&thisGw.overall_rank){
    const d=prevGw.overall_rank-thisGw.overall_rank;
    rankMove = d>0?`<span class="delta up">▲ ${short(Math.abs(d))}</span>`:d<0?`<span class="delta down">▼ ${short(Math.abs(d))}</span>`:`<span class="delta">–</span>`;
  }
  const recapMedia=(icon, player, badge)=>{
    if(player){
      return `<div class="recap-media">${faceImg(player,"recap-face")}${badge?`<span class="recap-media-badge">${badge}</span>`:""}</div>`;
    }
    return `<div class="recap-ic">${icon}</div>`;
  };
  const item=(opts,label,val,sub)=>`<div class="recap-item">${recapMedia(opts.icon, opts.player, opts.badge)}
    <div><div class="recap-v">${val}</div><div class="recap-k">${label}${sub?` · ${sub}`:""}</div></div></div>`;
  $("recap").innerHTML=`<div class="recap-grid">
    ${item({icon:"PTS"}, "GW points", thisGw.points, thisGw.points_on_bench!=null?`${thisGw.points_on_bench} on bench`:"")}
    ${item({icon:"RANK"}, "Overall rank", short(thisGw.overall_rank)+" "+rankMove, "")}
    ${item({player:capEl,badge:"C"}, "Captain", capEl?esc(capEl.web_name):"—", capEl?`${capPts} pts`:"")}
    ${item({player:best?.e,badge:"TOP"}, "Top performer", best?esc(best.e.web_name):"—", best?`${best.e.event_points} pts`:"")}
    ${item({player:worst?.e,badge:"LOW"}, "Quietest starter", worst?esc(worst.e.web_name):"—", worst?`${worst.e.event_points} pts`:"")}
    ${item({icon:"MOVES"}, "Transfers", thisGw.event_transfers??0, thisGw.event_transfers_cost?`-${thisGw.event_transfers_cost} pt hit`:"no hit")}
  </div>`;
}

function renderCaptaincy(picks, b){
  if(!picks){ $("capSec").style.display="none"; return; }
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  const cap=picks.picks.find(p=>p.is_captain);
  const vice=picks.picks.find(p=>p.is_vice_captain);
  const capEl=cap&&byId[cap.element], viceEl=vice&&byId[vice.element];
  if(!capEl){ $("capSec").style.display="none"; return; }
  // differentials: owned by <10% of managers; template: >30%
  const starters=picks.picks.filter(p=>p.position<=11).map(p=>byId[p.element]).filter(Boolean);
  const diffs=starters.filter(e=>parseFloat(e.selected_by_percent)<10)
    .sort((a,b)=>parseFloat(a.selected_by_percent)-parseFloat(b.selected_by_percent));
  const capPts=(capEl.event_points||0)*(picks.active_chip==="3xc"?3:2);
  $("capSec").style.display="block";
  $("captaincy").innerHTML=`
    <div class="cap-grid">
      <div class="cap-item"><div class="v">${esc(capEl.web_name)}</div><div class="k">Captain (${capEl.selected_by_percent}% own)</div></div>
      <div class="cap-item"><div class="v">${capPts} pts</div><div class="k">Captain haul${picks.active_chip==="3xc"?" (3×)":" (2×)"}</div></div>
      <div class="cap-item"><div class="v">${viceEl?esc(viceEl.web_name):"—"}</div><div class="k">Vice-captain</div></div>
      <div class="cap-item"><div class="v">${diffs.length}</div><div class="k">Differentials (&lt;10% own)</div></div>
    </div>
    ${diffs.length?`<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      ${diffs.map(e=>`<span class="chipbadge">${esc(e.web_name)} <span class="tag-pill diff">${e.selected_by_percent}%</span></span>`).join("")}
    </div>`:`<div style="margin-top:12px;color:var(--dim);font-size:13px">No differentials — a template-heavy squad this week.</div>`}`;
}


function moveBadge(rank, last){
  if(!rank||!last) return `<span class="lg-move same">–</span>`;
  const d=last-rank; // positive = moved up
  if(d>0) return `<span class="lg-move up">▲ ${short(d)}</span>`;
  if(d<0) return `<span class="lg-move down">▼ ${short(Math.abs(d))}</span>`;
  return `<span class="lg-move same">–</span>`;
}
function leagueRows(list, type){
  return list.map(l=>{
    const rank=l.entry_rank, last=l.entry_last_rank, size=l.rank_count||l.total||null;
    return `<tr class="lg-clickable" data-lid="${l.id}" data-ltype="${type}" data-lname="${esc(l.name)}" tabindex="0" role="button">
      <td><div class="lg-name"><span class="dot ${type}"></span>
        <div><span class="lg-link">${esc(l.name)}</span>
        <div class="lg-type">${type==="h2h"?"Head-to-head":(l.league_type==="s"?"Global":"Invitational")}</div></div></div></td>
      <td class="rank">${rank?short(rank):"—"}${moveBadge(rank,last)}</td>
      <td class="rank">${size?short(size):"—"}<span class="lg-chev">›</span></td>
    </tr>`;
  }).join("");
}
function renderLeagues(entry){
  const lg=entry.leagues||{};
  const classic=(lg.classic||[]).filter(l=>l.entry_rank!=null || l.name);
  const h2h=(lg.h2h||[]);
  const invit=classic.filter(l=>l.league_type!=="s");
  const global=classic.filter(l=>l.league_type==="s");
  if(!classic.length && !h2h.length){ $("leaguesSec").style.display="none"; return; }
  $("leaguesSec").style.display="block";
  $("leaguesCount").textContent=`${classic.length+h2h.length} joined · tap to view standings`;
  const table=rows=>`<table class="lg-table"><thead><tr>
      <th>League</th><th class="rank">Your rank</th><th class="rank">Members</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  let html="";
  if(invit.length){ html+=`<div class="lg-cat">Invitational leagues</div>${table(leagueRows(invit,"classic"))}`; }
  if(h2h.length){ html+=`<div class="lg-cat">Head-to-head</div>${table(leagueRows(h2h,"h2h"))}`; }
  if(global.length){ html+=`<div class="lg-cat">Global leagues</div>${table(leagueRows(global,"classic"))}`; }
  $("leagues").innerHTML=html;
  $("leagues").querySelectorAll(".lg-clickable").forEach(tr=>{
    const open=()=>openLeague(tr.dataset.lid, tr.dataset.ltype, tr.dataset.lname);
    tr.addEventListener("click",open);
    tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
  });
}

