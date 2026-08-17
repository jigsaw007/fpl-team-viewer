/* ============ data layer ============ */
const PROXY_BASE = "/.netlify/functions/fpl?path=";
// Local test without the function: uncomment the next line.
// const PROXY_BASE = "https://api.allorigins.win/raw?url=https://fantasy.premierleague.com/api";
async function get(path){
  const url = PROXY_BASE.includes("allorigins")
    ? PROXY_BASE + encodeURIComponent(path)
    : PROXY_BASE + encodeURIComponent(path);
  const r = await fetch(url, {headers:{Accept:"application/json"}});
  if(!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}
const $ = id => document.getElementById(id);
let boot=null, fixtureMap={}, _currentEntryId=null;
async function loadBoot(){ if(!boot) boot=await get("/bootstrap-static/"); return boot; }

/* ============ helpers ============ */
const short = n => n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,"")+"k":(n??"—");
const money = t => "£"+(t/10).toFixed(1);
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const POS = {1:"GKP",2:"DEF",3:"MID",4:"FWD"};

/* season / gameweek state helpers */
function seasonStarted(){ return !!(boot && boot.events && boot.events.some(e=>e.finished||e.is_current)); }
function nextDeadlineEvent(){
  if(!boot||!boot.events) return null;
  return boot.events.find(e=>e.is_next) || boot.events.find(e=>!e.finished && !e.is_current) || null;
}
function gwStartNotice(what){
  const ev=nextDeadlineEvent();
  const gw=ev?ev.id:1;
  const dl=ev&&ev.deadline_time?new Date(ev.deadline_time).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):"the next deadline";
  return `<div class="banner" style="margin:0"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
    <div><b>${esc(what)} will be available when Gameweek ${gw} kicks off.</b><small>This data only updates once matches are underway (deadline ${dl}). Check back then.</small></div></div>`;
}

let _cdTimer=null;
function startCountdown(){
  if(_cdTimer){ clearInterval(_cdTimer); _cdTimer=null; }
  const ev=nextDeadlineEvent();
  const el=$("countdown");
  if(!ev||!ev.deadline_time){ el.style.display="none"; return; }
  const target=new Date(ev.deadline_time).getTime();
  const tick=()=>{
    const now=Date.now(); let d=Math.floor((target-now)/1000);
    if(d<=0){ el.innerHTML=`<div class="cd-label">Gameweek ${ev.id} deadline</div><div class="cd-live">Deadline passed — matches underway</div>`; clearInterval(_cdTimer); _cdTimer=null; return; }
    const days=Math.floor(d/86400); d-=days*86400;
    const hrs=Math.floor(d/3600); d-=hrs*3600;
    const mins=Math.floor(d/60); const secs=d-mins*60;
    const box=(v,l)=>`<div class="cd-box"><div class="cd-num">${String(v).padStart(2,"0")}</div><div class="cd-unit">${l}</div></div>`;
    el.innerHTML=`<div class="cd-label">Gameweek ${ev.id} deadline</div>
      <div class="cd-boxes">${box(days,"days")}${box(hrs,"hrs")}${box(mins,"min")}${box(secs,"sec")}</div>`;
  };
  el.style.display="block"; tick(); _cdTimer=setInterval(tick,1000);
}

const teamColor = short_name => {
  // approximate club colours keyed by short_name
  const m={ARS:"#EF0107",AVL:"#95BFE5",BOU:"#DA291C",BRE:"#e30613",BHA:"#0057B8",CHE:"#034694",
    CRY:"#1B458F",EVE:"#003399",FUL:"#000000",IPS:"#3a64a3",LEI:"#0053A0",LIV:"#C8102E",
    LUT:"#F78F1E",MCI:"#6CABDD",MUN:"#DA291C",NEW:"#241F20",NFO:"#DD0000",SOU:"#D71920",
    TOT:"#132257",WHU:"#7A263A",WOL:"#FDB913",BUR:"#6C1D45",SHU:"#EE2737",SUN:"#eb172b",LEE:"#1D428A"};
  return m[short_name]||"#334155";
};

function buildFixtureMap(fixtures, fromGw){
  const map={};
  fixtures.filter(f=>f.event && f.event>=fromGw && !f.finished)
    .sort((a,b)=>a.event-b.event)
    .forEach(f=>{
      (map[f.team_h]??=[]).push({opp:f.team_a,home:true,fdr:f.team_h_difficulty,gw:f.event});
      (map[f.team_a]??=[]).push({opp:f.team_h,home:false,fdr:f.team_a_difficulty,gw:f.event});
    });
  for(const t in map) map[t]=map[t].slice(0,5);
  return map;
}

function publicSquadEvent(){
  if(!boot||!boot.events) return null;
  return [...boot.events].reverse().find(e=>e.finished||e.is_current)||null;
}

async function latestPublicPicks(tid){
  const ev=publicSquadEvent();
  if(!ev) return null;
  for(let gw=ev.id;gw>=1;gw--){
    try{
      const data=await get(`/entry/${tid}/event/${gw}/picks/`);
      if(data&&Array.isArray(data.picks)) return {gw,data};
    }catch(_){ }
  }
  return null;
}

function fixtureAverageForTeam(teamId,map,n=5){
  const rows=(map&&map[teamId]||[]).slice(0,n);
  if(!rows.length) return null;
  return rows.reduce((a,f)=>a+(Number(f.fdr)||3),0)/rows.length;
}

function fplPeekProjectedPoints(e,map,n=1){
  if(!e) return 0;
  const fixtures=(map&&map[e.team]||[]).slice(0,Math.max(1,n));
  const form=parseFloat(e.form||0)||0;
  const ppg=parseFloat(e.points_per_game||0)||0;
  const starts=Number(e.starts)||0;
  const mins=Number(e.minutes)||0;
  const liveSeason=typeof seasonStarted==="function" ? seasonStarted() : (form>0||mins>0);
  let base;
  if(!liveSeason){
    const price=(Number(e.now_cost)||50)/10;
    const own=Math.min(60,parseFloat(e.selected_by_percent||0)||0);
    base=1.65 + Math.max(0,price-4.0)*0.34 + own*0.018;
    base=Math.max(1.8,Math.min(6.4,base));
  }else{
    base=form>0 ? form*0.58 + Math.max(ppg,1.5)*0.42 : Math.max(ppg,1.8);
    base=Math.max(1.2,Math.min(8.6,base||1.8));
  }
  let minuteFactor=1;
  if(liveSeason && starts>0){
    const minsPerStart=mins/starts;
    minuteFactor=Math.max(.58,Math.min(1,minsPerStart/88));
  }
  let availability=1;
  if(e.status&&e.status!=="a"){
    const chance=e.chance_of_playing_next_round;
    availability=chance==null?.35:Math.max(0,Math.min(1,Number(chance)/100));
  }else if(e.chance_of_playing_next_round!=null){
    availability=Math.max(0,Math.min(1,Number(e.chance_of_playing_next_round)/100));
  }
  const setPieceBoost=(Number(e.penalties_order)>0&&Number(e.penalties_order)<=2)?.22:(Number(e.direct_freekicks_order)>0&&Number(e.direct_freekicks_order)<=2)?.08:0;
  const rows=fixtures.length?fixtures:[{fdr:3}];
  const total=rows.reduce((sum,f)=>{
    const fdr=Number(f.fdr)||3;
    const fixtureFactor=Math.max(.76,Math.min(1.24,1+(3-fdr)*.12));
    return sum+Math.min(9.8,(base+setPieceBoost)*fixtureFactor*minuteFactor*availability);
  },0);
  return Math.max(0,total);
}
function fplPeekProjectionLabel(v){
  if(v>=7.5) return "Elite";
  if(v>=6) return "Strong";
  if(v>=4.5) return "Solid";
  if(v>=3.2) return "Playable";
  return "Low";
}
function minutesSecurity(e){
  const starts=Number(e&&e.starts)||0, mins=Number(e&&e.minutes)||0;
  if(!starts) return {score:70,label:"Unproven",minsPerStart:null};
  const mps=mins/starts;
  const score=Math.max(35,Math.min(100,Math.round((mps/90)*100)));
  return {score,label:score>=92?"Very secure":score>=82?"Secure":score>=68?"Some risk":"Rotation risk",minsPerStart:mps};
}

function defconThreshold(elementType){
  return Number(elementType)===2 ? 10 : (Number(elementType)===3||Number(elementType)===4 ? 12 : null);
}
function defconPoints(row){
  const v=Number(row&&row.defensive_contribution);
  return Number.isFinite(v)?v:0;
}
function defconActions(row,elementType){
  if(!row) return null;
  const keys=["clearances_blocks_interceptions","tackles"];
  if(Number(elementType)===3||Number(elementType)===4) keys.push("recoveries");
  let seen=false,total=0;
  keys.forEach(k=>{ if(row[k]!=null&&row[k]!==""){seen=true;total+=Number(row[k])||0;} });
  return seen?total:null;
}
function defconHitsFromPoints(row){
  return Math.floor(Math.max(0,defconPoints(row))/2);
}

function playerWindowScore(e,map,n=5){
  if(!e) return 0;
  const form=parseFloat(e.form||0)||0;
  const ppg=parseFloat(e.points_per_game||0)||0;
  const seasonBase=(Number(e.total_points)||0)/38;
  const base=form>0 ? form*0.55+Math.max(ppg,seasonBase)*0.45 : Math.max(ppg,seasonBase);
  const fx=(map&&map[e.team]||[]).slice(0,n);
  const avg=fixtureAverageForTeam(e.team,map,n);
  const fixtureFactor=avg==null?1:Math.max(.68,Math.min(1.28,1+(3-avg)*.16));
  let availability=1;
  if(e.status&&e.status!=="a"){
    const chance=e.chance_of_playing_next_round;
    availability=chance==null?.35:Math.max(0,Math.min(1,Number(chance)/100));
  }else if(e.chance_of_playing_next_round!=null){
    availability=Math.max(0,Math.min(1,Number(e.chance_of_playing_next_round)/100));
  }
  const games=Math.max(1,Math.min(n,fx.length||n));
  return base*games*fixtureFactor*availability;
}

function fixtureRunHtml(teamId,map,teams,n=5){
  const fx=(map&&map[teamId]||[]).slice(0,n);
  if(!fx.length) return `<span class="fixture-empty">No fixtures</span>`;
  return fx.map(f=>{
    const opp=(teams||[]).find(t=>t.id===f.opp)||{};
    const code=f.home?(opp.short_name||""):(opp.short_name||"").toLowerCase();
    return `<span class="fdr${f.fdr}" title="GW${f.gw} vs ${esc(opp.name||"")} (${f.home?"H":"A"})">${esc(code||"-")}</span>`;
  }).join("");
}

function teamKitUrl(team){
  // Current FPL UI shirt asset. team.code comes from bootstrap-static teams[].
  const code=team&&team.code;
  if(!code) return null;
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}-66.webp`;
}
function kitUrl(team, isGk){
  // Legacy Premier League CDN fallback (also keeps goalkeeper variants for the squad pitch).
  const code=team&&team.code;
  if(!code) return null;
  return `https://resources.premierleague.com/premierleague/shirts/${isGk?`t${code}_1`:`t${code}`}-66.png`;
}
function teamKitImg(team, cls="club-kit", alt){
  const primary=teamKitUrl(team);
  if(!primary) return "";
  const fallback=kitUrl(team,false);
  const label=alt||`${team.name||team.short_name||"Club"} kit`;
  return `<img class="${cls}" src="${primary}" alt="${esc(label)}" loading="lazy" decoding="async" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallback||""}'}else{this.style.display='none'}">`;
}
function faceUrl(e){
  // player photo CDN; e.code is the opta/player code
  if(!e || !e.code) return null;
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${e.code}.png`;
}
// face image with colored-initial fallback if the photo is missing
function faceImg(e, cls){
  const b=boot; const t=(b.teams.find(z=>z.id===e.team))||{};
  const url=faceUrl(e);
  const fb=`<div class='${cls} face-fb' style='background:${teamColor(t.short_name)}'>${esc((e.web_name||"?").slice(0,2))}</div>`;
  if(!url) return fb;
  return `<img class="${cls}" src="${url}" alt="${esc(e.web_name)}" loading="lazy" onerror="this.outerHTML=\`${fb.replace(/`/g,"\\`")}\`">`;
}

function playerCard(el, pick, bench){
  const b=boot;
  const t=b.teams.find(x=>x.id===el.team)||{};
  const isGk=el.element_type===1;
  const fixes=fixtureMap[el.team]||[];
  const arm = pick.is_captain?`<div class="arm">C</div>`:pick.is_vice_captain?`<div class="arm vc">V</div>`:"";
  const fx = fixes.map(f=>{
    const o=b.teams.find(x=>x.id===f.opp)||{};
    const code=f.home?(o.short_name||""):(o.short_name||"").toLowerCase();
    return `<span class="fdr${f.fdr}" title="GW${f.gw} vs ${esc(o.name||"")} (${f.home?"H":"A"}) · FDR ${f.fdr}">${esc(code)}</span>`;
  }).join("")||`<span class="fdr3">—</span>`;
  const price=money(el.now_cost);
  const form=el.form??"0.0";
  const kit=kitUrl(t,isGk);
  const jerseyFallback=`<div class=\\'jersey\\' style=\\'background:${teamColor(t.short_name)}\\'>${esc(t.short_name||"")}</div>`;
  const shirt = kit
    ? `<img class="kit" src="${kit}" alt="${esc(t.name||"")} kit" loading="lazy" onerror="this.outerHTML='${jerseyFallback}'">`
    : `<div class="jersey" style="background:${teamColor(t.short_name)}">${esc(t.short_name||"")}</div>`;
  return `<div class="pl ${bench?'benchpl':''}">
    ${arm}
    <div class="shirt">${shirt}</div>
    <div class="nm" title="${esc(el.web_name)} · ${POS[el.element_type]} · ${price} · form ${form} · ${el.selected_by_percent}% owned">${esc(el.web_name)}</div>
    <div class="meta"><span>${price}</span><span>${el.event_points??0}pt</span></div>
    <div class="fx">${fx}</div>
  </div>`;
}

/* ============ line chart engine ============ */
let _curRows=[], _curMetric="points";
const METRICS={
  points:{label:"points per gameweek", get:r=>r.points, fmt:v=>v+" pts", invert:false, color:"var(--mint)"},
  rank:{label:"overall rank (lower is better)", get:r=>r.overall_rank, fmt:v=>short(v), invert:true, color:"var(--cyan)"},
  value:{label:"team value (£m)", get:r=>r.value/10, fmt:v=>"£"+v.toFixed(1)+"m", invert:false, color:"#c084fc"},
};
function drawChart(rows, metricKey){
  _curRows=rows; _curMetric=metricKey;
  const M=METRICS[metricKey];
  if(!rows.length) return;
  const W=Math.min(1000, Math.max(320, rows.length*30)), H=180, pad=30;
  const vals=rows.map(M.get);
  let max=Math.max(...vals), min=Math.min(...vals);
  if(max===min){ max+=1; min-=1; }
  const x=i=>pad+i*((W-pad*2)/Math.max(rows.length-1,1));
  // invert axis for rank so "up" = better
  const y=v=>{ const t=(v-min)/(max-min); return M.invert ? pad+t*(H-pad*2) : H-pad-t*(H-pad*2); };
  const line=vals.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baseY=M.invert?pad:H-pad;
  const area=`${line} L${x(rows.length-1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z`;
  const avg=vals.reduce((a,c)=>a+c,0)/vals.length;
  const dots=vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" fill="#ffffff" stroke="${M.color}" stroke-width="2" data-i="${i}" style="cursor:pointer"/>`).join("");
  $("chartToggleBadge").textContent=M.label;
  $("spark").innerHTML=`
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">
      <line x1="${pad}" y1="${y(avg).toFixed(1)}" x2="${W-pad}" y2="${y(avg).toFixed(1)}" stroke="var(--line2)" stroke-dasharray="4 4"/>
      <text x="${W-pad}" y="${(y(avg)-6).toFixed(1)}" fill="var(--dim)" font-size="10" text-anchor="end" font-family="Roboto Mono">avg ${M.fmt(avg)}</text>
      <path d="${area}" fill="transparent"/>
      <path d="${line}" fill="none" stroke="${M.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
  const svg=$("spark").querySelector("svg"), tip=$("sparkTip");
  const show=c=>{
    const r=rows[+c.dataset.i], box=$("spark").getBoundingClientRect(), cr=c.getBoundingClientRect();
    tip.innerHTML=`GW${r.event} · <b>${M.fmt(M.get(r))}</b><br>${r.points} pts · rank ${short(r.overall_rank)}`;
    tip.style.left=Math.max(0,(cr.left-box.left-tip.offsetWidth/2+6))+"px";
    tip.style.top=(cr.top-box.top-42)+"px"; tip.style.opacity=1;
  };
  svg.querySelectorAll("circle").forEach(c=>{
    c.addEventListener("mouseenter",()=>show(c));
    c.addEventListener("mouseleave",()=>tip.style.opacity=0);
    c.addEventListener("click",()=>show(c));
  });
}

/* ============ recent IDs ============ */
function recentIds(){ try{return JSON.parse(localStorage.getItem("fpl_recent")||"[]")}catch{return[]} }

/* ============ watchlist (localStorage) ============ */
function watchlist(){ try{return JSON.parse(localStorage.getItem("fpl_watch")||"[]")}catch{return[]} }
function isWatched(id){ return watchlist().includes(+id); }
function toggleWatch(id){
  id=+id; let w=watchlist();
  if(w.includes(id)) w=w.filter(x=>x!==id); else w.push(id);
  try{localStorage.setItem("fpl_watch",JSON.stringify(w))}catch{}
  return w.includes(id);
}
/* ============ saved team (localStorage) ============ */
function savedTeam(){ try{return JSON.parse(localStorage.getItem("fpl_myteam")||"null")}catch{return null} }
function saveTeam(id,name){ try{localStorage.setItem("fpl_myteam",JSON.stringify({id:String(id),name:name||""}))}catch{} }
function clearSavedTeam(){ try{localStorage.removeItem("fpl_myteam")}catch{} }

function pushRecent(id,name){
  let r=recentIds().filter(x=>x.id!==id); r.unshift({id,name}); r=r.slice(0,5);
  try{localStorage.setItem("fpl_recent",JSON.stringify(r))}catch{}
  renderRecent();
}
function renderRecent(){
  const r=recentIds();
  $("recent").innerHTML=r.map(x=>`<span class="chip" data-id="${x.id}">${esc(x.name||x.id)}</span>`).join("");
  $("recent").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{ $("tid").value=c.dataset.id; view(c.dataset.id); });
}

