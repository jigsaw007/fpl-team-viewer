/* ============ PLAYERS tab ============ */
let _plSort="total_points", _plDir=-1, _plPos=0, _plQuery="", _plLimit=40, _plWatchOnly=false;
async function initPlayers(){
  await loadBoot();
  $("plSearch").addEventListener("input",e=>{_plQuery=e.target.value.toLowerCase();_plLimit=40;drawPlayers();});
  $("plPos").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("plPos").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _plPos=+x.dataset.p;_plLimit=40;drawPlayers();});
  $("plWatchOnly").addEventListener("click",()=>{
    _plWatchOnly=!_plWatchOnly; _plLimit=40;
    $("plWatchOnly").classList.toggle("on",_plWatchOnly); drawPlayers();
  });
  $("plMore").addEventListener("click",()=>{_plLimit+=40;drawPlayers();});
  // columns panel
  $("plColsBtn").addEventListener("click",()=>{
    const p=$("plColsPanel"); const open=p.style.display!=="none";
    p.style.display=open?"none":"block";
    $("plColsBtn").classList.toggle("on",!open);
    if(!open) renderColsPanel();
  });
  // top scrollbar sync
  const top=$("plScrollTop"), main=$("plScrollMain");
  let lock=false;
  top.addEventListener("scroll",()=>{if(lock)return;lock=true;main.scrollLeft=top.scrollLeft;lock=false;});
  main.addEventListener("scroll",()=>{if(lock)return;lock=true;top.scrollLeft=main.scrollLeft;lock=false;});
  drawPlayers();
}
function renderColsPanel(){
  const vis=_plCols||plVisible();
  $("plColsPanel").innerHTML=`<div class="plcols-hd">Show columns</div>
    <div class="plcols-grid">${PL_COLS.filter(c=>c.k!=="status").map(c=>`
      <label class="plcol-chk"><input type="checkbox" data-col="${c.k}" ${vis.has(c.k)?"checked":""}> ${esc(c.label)}</label>
    `).join("")}</div>
    <div class="plcols-actions"><button class="bld-reset" id="plColsReset">Reset to default</button></div>`;
  $("plColsPanel").querySelectorAll("input[data-col]").forEach(cb=>cb.addEventListener("change",()=>{
    const set=_plCols||plVisible();
    if(cb.checked) set.add(cb.dataset.col); else set.delete(cb.dataset.col);
    _plCols=set; plSaveVisible(set); drawPlayers();
  }));
  $("plColsReset").addEventListener("click",()=>{
    _plCols=new Set(PL_COLS.filter(c=>c.def).map(c=>c.k));
    plSaveVisible(_plCols); renderColsPanel(); drawPlayers();
  });
}
const PL_COLS=[
  {k:"status",label:"Status",def:true,left:true,fmt:(v,e)=>statusPill(e)},
  {k:"now_cost",label:"£",def:true,fmt:v=>money(v)},
  {k:"total_points",label:"Pts",def:true},
  {k:"event_points",label:"GW",def:true},
  {k:"form",label:"Form",def:true,fmt:v=>(+v).toFixed(1)},
  {k:"points_per_game",label:"PPG",def:true,fmt:v=>(+v).toFixed(1)},
  {k:"selected_by_percent",label:"Own%",def:true,fmt:v=>(+v).toFixed(1)+"%"},
  {k:"minutes",label:"Min",def:false},
  {k:"starts",label:"Starts",def:false},
  {k:"goals_scored",label:"G",def:true},
  {k:"assists",label:"A",def:true},
  {k:"clean_sheets",label:"CS",def:false},
  {k:"goals_conceded",label:"GC",def:false},
  {k:"saves",label:"Saves",def:false},
  {k:"bonus",label:"Bns",def:false},
  {k:"bps",label:"BPS",def:false},
  {k:"expected_goals",label:"xG",def:true,fmt:v=>(+v).toFixed(2)},
  {k:"expected_assists",label:"xA",def:true,fmt:v=>(+v).toFixed(2)},
  {k:"expected_goal_involvements",label:"xGI",def:false,fmt:v=>(+v).toFixed(2)},
  {k:"expected_goals_conceded",label:"xGC",def:false,fmt:v=>(+v).toFixed(2)},
  {k:"expected_goals_per_90",label:"xG/90",def:false,fmt:v=>(+v).toFixed(2)},
  {k:"expected_assists_per_90",label:"xA/90",def:false,fmt:v=>(+v).toFixed(2)},
  {k:"expected_goal_involvements_per_90",label:"xGI/90",def:false,fmt:v=>(+v).toFixed(2)},
  {k:"ict_index",label:"ICT",def:false,fmt:v=>(+v).toFixed(1)},
  {k:"influence",label:"Infl",def:false,fmt:v=>(+v).toFixed(0)},
  {k:"creativity",label:"Creat",def:false,fmt:v=>(+v).toFixed(0)},
  {k:"threat",label:"Threat",def:false,fmt:v=>(+v).toFixed(0)},
  {k:"yellow_cards",label:"YC",def:false},
  {k:"red_cards",label:"RC",def:false},
  {k:"cost_change_start",label:"Δ£ szn",def:false,fmt:v=>(v>0?"+":"")+(v/10).toFixed(1)},
];
function statusPill(e){
  const c=e.chance_of_playing_next_round;
  if(e.status==="a" && (c===null||c===100)) return `<span class="stp fit">Fit</span>`;
  if(c===0 || e.status==="i" || e.status==="s" || e.status==="u") return `<span class="stp out" title="${esc(e.news||'')}">${e.status==="s"?"Susp":"Out"}</span>`;
  return `<span class="stp dbt" title="${esc(e.news||'')}">${c!=null?c+"%":"Doubt"}</span>`;
}
// which columns are visible (persisted)
function plVisible(){
  try{ const s=JSON.parse(localStorage.getItem("fpl_plcols")||"null"); if(s) return new Set(s); }catch{}
  return new Set(PL_COLS.filter(c=>c.def).map(c=>c.k));
}
function plSaveVisible(set){ try{localStorage.setItem("fpl_plcols",JSON.stringify([...set]))}catch{} }
let _plCols=null;
function drawPlayers(){
  const b=boot;
  let list=b.elements.filter(e=>e.element_type>0);
  if(_plWatchOnly){ const w=watchlist(); list=list.filter(e=>w.includes(e.id)); }
  if(_plPos) list=list.filter(e=>e.element_type===_plPos);
  if(_plQuery) list=list.filter(e=>e.web_name.toLowerCase().includes(_plQuery));
  if(_plWatchOnly && !list.length){ $("plTable").innerHTML=`<tbody><tr><td style="padding:30px;text-align:center;color:var(--dim)">No players in your watchlist yet. Tap ☆ on any player to add them.</td></tr></tbody>`; $("plMore").style.display="none"; return; }
  const num=v=>typeof v==="string"?parseFloat(v)||0:(v||0);
  list.sort((a,c)=>{
    if(_plSort==="web_name") return _plDir*String(a.web_name).localeCompare(String(c.web_name));
    if(_plSort==="team"){const tx=b.teams.find(t=>t.id===a.team)?.short_name||"";const ty=b.teams.find(t=>t.id===c.team)?.short_name||"";return _plDir*tx.localeCompare(ty);}
    return _plDir*(num(a[_plSort])-num(c[_plSort]));
  });
  const total=list.length;
  list=list.slice(0,_plLimit);
  if(!_plCols) _plCols=plVisible();
  const cols=PL_COLS.filter(c=>_plCols.has(c.k));
  const sortMark=k=>_plSort===k?`<span class="ar">${_plDir<0?'▼':'▲'}</span>`:"";
  const head=`<thead><tr>
    <th class="star-col"></th>
    <th class="left ${_plSort==='web_name'?'sorted':''}" data-k="web_name">Player${sortMark("web_name")}</th>
    <th class="left ${_plSort==='team'?'sorted':''}" data-k="team">Team${sortMark("team")}</th>
    ${cols.map(c=>`<th class="${c.left?'left':''} ${_plSort===c.k?'sorted':''}" data-k="${c.k}" title="${esc(c.label)}">${c.label}${sortMark(c.k)}</th>`).join("")}
  </tr></thead>`;
  const body=`<tbody>${list.map(e=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    const w=isWatched(e.id);
    const kit=kitUrl(t,e.element_type===1);
    const kitCell=kit?`<img class="pl-kit" src="${kit}" alt="" loading="lazy" onerror="this.style.display='none'">`:"";
    return `<tr class="pl-clickable" data-pid="${e.id}" tabindex="0" role="button">
      <td class="star-col"><button class="star ${w?'on':''}" data-star="${e.id}" aria-label="Watchlist" title="${w?'Remove from watchlist':'Add to watchlist'}">${w?'★':'☆'}</button></td>
      <td class="left"><span class="pl-name">${esc(e.web_name)}</span> <span class="pl-meta">${POS[e.element_type]}</span></td>
      <td class="left pl-team">${kitCell}<span>${esc(t.short_name||"")}</span></td>
      ${cols.map(c=>`<td class="${c.left?'left':''}">${c.fmt?c.fmt(e[c.k],e):(e[c.k]??0)}</td>`).join("")}
    </tr>`;
  }).join("")}</tbody>`;
  $("plTable").innerHTML=head+body;
  $("plTable").querySelectorAll("th[data-k]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    if(_plSort===k) _plDir*=-1; else {_plSort=k; _plDir=(k==="web_name"||k==="team")?1:-1;}
    drawPlayers();
  });
  $("plTable").querySelectorAll(".star").forEach(btn=>btn.addEventListener("click",ev=>{
    ev.stopPropagation();
    const on=toggleWatch(btn.dataset.star);
    btn.classList.toggle("on",on); btn.textContent=on?'★':'☆';
    btn.title=on?'Remove from watchlist':'Add to watchlist';
  }));
  $("plTable").querySelectorAll(".pl-clickable").forEach(tr=>{
    const open=(e)=>{ if(e.target.closest(".star")) return; openPlayer(tr.dataset.pid); };
    tr.addEventListener("click",open);
    tr.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPlayer(tr.dataset.pid);}});
  });
  $("plMore").style.display=list.length<total?"block":"none";
  $("plMore").textContent=`Show more (${list.length} of ${total})`;
  // size the top scrollbar to match table width
  const tbl=$("plTable"), inner=$("plScrollTopInner");
  if(tbl&&inner){ inner.style.width=tbl.scrollWidth+"px"; }
}

