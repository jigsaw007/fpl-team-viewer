/* ============ TRANSFER STATS ============ */
let _tsMode="event";
let _tsSearch="";
let _tsPosition="all";
let _tsClub="all";
let _tsInPage=1;
let _tsOutPage=1;
const TS_PAGE_SIZE=15;

function tsEvent(){
  const evs=boot?.events||[];
  return evs.find(e=>e.is_current)||[...evs].filter(e=>e.finished||e.data_checked).sort((a,b)=>b.id-a.id)[0]||evs.find(e=>e.is_next)||{};
}
function tsFields(){
  return _tsMode==="season"
    ? {tin:"transfers_in",tout:"transfers_out",label:"Season total"}
    : {tin:"transfers_in_event",tout:"transfers_out_event",label:`GW${tsEvent().id||"—"}`};
}
function tsNum(v){return Number(v)||0;}
function tsSigned(v){return `${v>0?"+":v<0?"−":""}${Math.abs(v).toLocaleString()}`;}
function tsPlayers(){
  const q=_tsSearch.trim().toLowerCase();
  return (boot?.elements||[]).filter(e=>{
    if(_tsPosition!=="all"&&String(e.element_type)!==_tsPosition)return false;
    if(_tsClub!=="all"&&String(e.team)!==_tsClub)return false;
    if(q&&!String(e.web_name||"").toLowerCase().includes(q)&&!String(e.first_name||"").toLowerCase().includes(q)&&!String(e.second_name||"").toLowerCase().includes(q))return false;
    return true;
  });
}
function tsRows(){
  const f=tsFields();
  const players=tsPlayers();
  const rows=players.map(e=>({e,tin:tsNum(e[f.tin]),tout:tsNum(e[f.tout])})).map(x=>({...x,net:x.tin-x.tout}));
  return {
    incoming:[...rows].sort((a,b)=>b.tin-a.tin||b.net-a.net||b.e.total_points-a.e.total_points),
    outgoing:[...rows].sort((a,b)=>b.tout-a.tout||a.net-b.net||b.e.total_points-a.e.total_points),
    rows
  };
}
function tsPlayerRow(x,rank){
  const e=x.e,t=(boot.teams||[]).find(z=>z.id===e.team)||{};
  const netClass=x.net>0?"positive":x.net<0?"negative":"neutral";
  return `<article class="transfer-stats-row">
    <div class="transfer-stats-player">
      <span class="transfer-stats-rank">${rank}</span>
      ${teamKitImg(t,"transfer-stats-kit",`${t.name||"Club"} kit`)}
      <div class="transfer-stats-player-copy"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${money(e.now_cost)} · ${Number(e.selected_by_percent||0).toFixed(1)}% owned</small></div>
    </div>
    <div class="transfer-stat-num in">${x.tin.toLocaleString()}</div>
    <div class="transfer-stat-num out">${x.tout.toLocaleString()}</div>
    <div class="transfer-stat-num net ${netClass}">${tsSigned(x.net)}</div>
  </article>`;
}
function tsPage(rows,page){
  const pages=Math.max(1,Math.ceil(rows.length/TS_PAGE_SIZE));
  page=Math.min(Math.max(1,page),pages);
  const start=(page-1)*TS_PAGE_SIZE;
  return {page,pages,start,items:rows.slice(start,start+TS_PAGE_SIZE)};
}
function tsRenderPager(prefix,info,total){
  const count=$(prefix+"Count"),label=$(prefix+"Page"),prev=$(prefix+"Prev"),next=$(prefix+"Next");
  if(count)count.textContent=total?`${info.start+1}–${Math.min(info.start+TS_PAGE_SIZE,total)} of ${total}`:"0 players";
  if(label)label.textContent=`Page ${info.page} of ${info.pages}`;
  if(prev)prev.disabled=info.page<=1;
  if(next)next.disabled=info.page>=info.pages;
}
function tsRenderSummary(rows){
  const totalIn=rows.reduce((n,x)=>n+x.tin,0);
  const totalOut=rows.reduce((n,x)=>n+x.tout,0);
  const net=totalIn-totalOut;
  const mostIn=[...rows].sort((a,b)=>b.tin-a.tin)[0];
  const mostOut=[...rows].sort((a,b)=>b.tout-a.tout)[0];
  const f=tsFields();
  const label=$("tsGwLabel");if(label)label.textContent=f.label;
  $("tsSummary").innerHTML=`
    <article><span>Total transfers in</span><b>${totalIn.toLocaleString()}</b><small>${f.label}</small></article>
    <article><span>Total transfers out</span><b>${totalOut.toLocaleString()}</b><small>${f.label}</small></article>
    <article><span>Net transfer movement</span><b class="${net>0?"positive":net<0?"negative":""}">${tsSigned(net)}</b><small>Across filtered players</small></article>
    <article><span>Biggest movement</span><b>${esc(mostIn?.e?.web_name||"—")}</b><small>${mostIn?`+${mostIn.tin.toLocaleString()} in`:"No activity yet"}${mostOut?` · ${mostOut.e.web_name} ${mostOut.tout.toLocaleString()} out`:""}</small></article>`;
}
function renderTransferStats(){
  const data=tsRows();
  tsRenderSummary(data.rows);
  const inInfo=tsPage(data.incoming,_tsInPage),outInfo=tsPage(data.outgoing,_tsOutPage);
  _tsInPage=inInfo.page;_tsOutPage=outInfo.page;
  tsRenderPager("tsIn",inInfo,data.incoming.length);
  tsRenderPager("tsOut",outInfo,data.outgoing.length);
  $("tsInList").innerHTML=inInfo.items.length?inInfo.items.map((x,i)=>tsPlayerRow(x,inInfo.start+i+1)).join(""):'<div class="transfer-stats-empty"><b>No transfer-in data yet.</b><span>Official FPL activity will appear here once transfers are recorded.</span></div>';
  $("tsOutList").innerHTML=outInfo.items.length?outInfo.items.map((x,i)=>tsPlayerRow(x,outInfo.start+i+1)).join(""):'<div class="transfer-stats-empty"><b>No transfer-out data yet.</b><span>Official FPL activity will appear here once transfers are recorded.</span></div>';
}
function tsBindPager(id,fn){const el=$(id);if(el&&!el.dataset.bound){el.dataset.bound="1";el.addEventListener("click",fn);}}
async function initTransferStats(){
  await loadBoot();
  const club=$("tsClub");
  if(club&&club.options.length<=1){
    (boot.teams||[]).sort((a,b)=>String(a.name).localeCompare(String(b.name))).forEach(t=>club.add(new Option(t.name,t.id)));
  }
  const mode=$("tsMode");
  if(mode&&!mode.dataset.bound){mode.dataset.bound="1";mode.addEventListener("click",e=>{const b=e.target.closest("button[data-mode]");if(!b)return;_tsMode=b.dataset.mode;mode.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));_tsInPage=_tsOutPage=1;renderTransferStats();});}
  const pos=$("tsPosition");if(pos&&!pos.dataset.bound){pos.dataset.bound="1";pos.addEventListener("change",()=>{_tsPosition=pos.value;_tsInPage=_tsOutPage=1;renderTransferStats();});}
  if(club&&!club.dataset.bound){club.dataset.bound="1";club.addEventListener("change",()=>{_tsClub=club.value;_tsInPage=_tsOutPage=1;renderTransferStats();});}
  const search=$("tsSearch");if(search&&!search.dataset.bound){search.dataset.bound="1";search.addEventListener("input",()=>{_tsSearch=search.value;_tsInPage=_tsOutPage=1;renderTransferStats();});}
  tsBindPager("tsInPrev",()=>{if(_tsInPage>1){_tsInPage--;renderTransferStats();}});
  tsBindPager("tsInNext",()=>{_tsInPage++;renderTransferStats();});
  tsBindPager("tsOutPrev",()=>{if(_tsOutPage>1){_tsOutPage--;renderTransferStats();}});
  tsBindPager("tsOutNext",()=>{_tsOutPage++;renderTransferStats();});
  renderTransferStats();
  renderTransferOutcome();
}

async function renderTransferOutcome(){
  const body=$("tsOutcomeBody"),label=$("tsOutcomeGw");if(!body)return;
  const ev=tsEvent(),gw=Number(ev.id)||1;if(label)label.textContent=`GW${gw}`;
  try{
    const r=await fetch(`/.netlify/functions/transfer-outcomes?gw=${gw}`,{headers:{Accept:'application/json'}});
    const data=await r.json();if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
    if(data.status!=='ok'){
      const deadline=ev.deadline_time?new Date(ev.deadline_time).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'the deadline';
      body.innerHTML=`<div class="transfer-outcome-wait"><i class="fa-regular fa-clock"></i><div><b>${eventComplete(ev)||ev.is_current?'No deadline snapshot is available for this Gameweek.':'Tracking transfer activity'}</b><span>${eventComplete(ev)||ev.is_current?'Automatic snapshots begin with the next deadline after this update.':`The top three will be locked automatically before ${esc(deadline)}.`}</span></div></div>`;return;
    }
    const archived=data.snapshot_type==='archived-early';if(label)label.textContent=`GW${gw}${archived?' · ARCHIVED':''}`;
    const card=(x,type,i)=>{const p=x.player||{},t=(boot.teams||[]).find(z=>z.id===p.team)||{};return `<article class="transfer-outcome-player ${type}"><span class="transfer-outcome-rank">${i+1}</span>${teamKitImg(t,'transfer-outcome-kit',`${t.name||'Club'} kit`)}<div><b>${esc(p.web_name||x.web_name||'Player')}</b><small>${esc(t.short_name||'')} · ${Number(x.transfers||0).toLocaleString()} transferred ${type}</small></div><strong>${Number(x.points||0)}<small>pts</small></strong></article>`;};
    const inPts=(data.incoming||[]).reduce((s,x)=>s+Number(x.points||0),0),outPts=(data.outgoing||[]).reduce((s,x)=>s+Number(x.points||0),0),diff=inPts-outPts;
    body.innerHTML=`<div class="transfer-outcome-score"><div><span>Top 3 bought</span><b>${inPts} pts</b></div><div class="${diff>=0?'worked':'backfired'}"><span>Crowd result</span><b>${diff>0?'Worked':diff<0?'Backfired':'Level'}</b><small>${diff===0?'Same combined return':`${diff>0?'+':''}${diff} points vs sold players`}</small></div><div><span>Top 3 sold</span><b>${outPts} pts</b></div></div><div class="transfer-outcome-columns"><div><h4><i class="fa-solid fa-arrow-trend-up"></i> Most transferred in</h4>${(data.incoming||[]).map((x,i)=>card(x,'in',i)).join('')}</div><div><h4><i class="fa-solid fa-arrow-trend-down"></i> Most transferred out</h4>${(data.outgoing||[]).map((x,i)=>card(x,'out',i)).join('')}</div></div><div class="transfer-outcome-foot">${archived?'Archived early snapshot — captured 29 Aug, not deadline totals':`Snapshot locked ${new Date(data.captured_at).toLocaleString()}`} · ${data.final?'Final':'Live'} GW points</div>`;
  }catch(e){body.innerHTML=`<div class="transfer-outcome-wait"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Transfer outcome unavailable</b><span>The snapshot service could not be reached. Try again shortly.</span></div></div>`;}
}
