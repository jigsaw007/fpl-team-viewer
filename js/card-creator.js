/* ============ CARD CREATOR ============ */
let _ccBound=false;
let _ccType="gameweek";
let _ccLastBlob=null;

function ccRank(v){ return v ? short(Number(v)) : "-"; }
function ccPoints(v){ return v==null ? "-" : Number(v).toLocaleString(); }
function ccSeasonRows(h){ return (h&&h.past)||[]; }
function ccBestRank(h){
  const rows=ccSeasonRows(h).filter(r=>Number(r.rank)>0);
  return rows.length ? rows.reduce((a,b)=>Number(b.rank)<Number(a.rank)?b:a) : null;
}
function ccBestPoints(h){
  const rows=ccSeasonRows(h);
  return rows.length ? rows.reduce((a,b)=>Number(b.total_points)>Number(a.total_points)?b:a) : null;
}
function ccCareerPoints(entry,h){
  return ccSeasonRows(h).reduce((n,r)=>n+(Number(r.total_points)||0),0)+(Number(entry.summary_overall_points)||0);
}
function ccAverageFinish(h){
  const rows=ccSeasonRows(h).filter(r=>Number(r.rank)>0);
  if(!rows.length) return null;
  return Math.round(rows.reduce((n,r)=>n+Number(r.rank),0)/rows.length);
}
function ccFirstSeason(h){
  const rows=ccSeasonRows(h).filter(r=>r&&r.season_name);
  if(!rows.length) return null;
  const year=s=>{const m=String(s||"").match(/(\d{4})/);return m?Number(m[1]):9999;};
  return [...rows].sort((a,b)=>year(a.season_name)-year(b.season_name))[0].season_name||null;
}
function ccLoadImage(url){
  return new Promise(resolve=>{
    if(!url){resolve(null);return;}
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=url;
  });
}
function ccCaptainPhotoUrl(el){
  return el&&el.code?`/.netlify/functions/player-photo?code=${encodeURIComponent(el.code)}`:null;
}
function ccCaptainStat(x,px,py,w,h,el,points){
  const p=ccPalette();
  ccRR(x,px,py,w,h,20,p.panel,p.lineSoft);
  x.fillStyle=p.dim;x.font="800 16px Inter, sans-serif";x.fillText("CAPTAIN",px+24,py+32);
  const name=el?el.web_name:"-";
  x.fillStyle=p.ink;const sz=ccFit(x,name,w-180,36,23,800);x.font=`800 ${sz}px Inter, sans-serif`;x.fillText(name,px+24,py+79);
  const sub=points==null?"Captain points pending":`${points} captain points`;
  x.fillStyle=p.sub;x.font="500 17px Inter, sans-serif";x.fillText(sub,px+24,py+h-22);
}
function ccDrawCaptainPhoto(x,img,el,px,py,w,h){
  const boxX=px+w-122, boxY=py+12, boxW=98, boxH=h-24;
  x.save();
  ccRR(x,boxX,boxY,boxW,boxH,16,ccPalette().accentSoft,null);
  x.beginPath();
  x.roundRect(boxX,boxY,boxW,boxH,16);
  x.clip();
  if(img){
    const scale=Math.max(boxW/img.width,boxH/img.height);
    const dw=img.width*scale,dh=img.height*scale;
    x.drawImage(img,boxX+(boxW-dw)/2,boxY+(boxH-dh)/2,dw,dh);
  }else{
    const team=(boot.teams||[]).find(t=>el&&t.id===el.team)||{};
    x.fillStyle=teamColor(team.short_name||"");x.fillRect(boxX,boxY,boxW,boxH);
    x.fillStyle="#fff";x.textAlign="center";x.font="800 32px Inter, sans-serif";x.fillText((el&&el.web_name?el.web_name:"?").slice(0,2).toUpperCase(),boxX+boxW/2,boxY+boxH/2+12);x.textAlign="left";
  }
  x.restore();
}
function ccSetStatus(msg,bad=false){
  const el=$("ccStatus"); if(!el) return;
  el.textContent=msg||""; el.classList.toggle("bad",!!bad);
}
function ccSetType(type){
  _ccType=type;
  _ccLastBlob=null;
  if($("ccCanvas")) $("ccCanvas").hidden=true;
  if($("ccPreviewEmpty")) $("ccPreviewEmpty").hidden=false;
  if($("ccActions")) $("ccActions").hidden=true;
  document.querySelectorAll("#ccTypes button").forEach(b=>b.classList.toggle("active",b.dataset.type===type));
  $("ccRivalField").hidden=type!=="rivalry";
  $("ccGwField").hidden=type!=="gameweek";
  $("ccPrimaryLabel").textContent=type==="rivalry"?"Manager A Team ID":"FPL Team ID";
  const copy={
    gameweek:["Gameweek card","Latest score, rank movement, captaincy, transfers and bench points."],
    career:["Career card","A clean snapshot of your FPL history and best finishes."],
    rivalry:["Rivalry card","Put two managers head to head using current and career records."]
  }[type];
  $("ccModeTitle").textContent=copy[0];
  $("ccModeSub").textContent=copy[1];
  ccSetStatus("");
}

async function initCardCreator(){
  const b=await loadBoot();
  if(!_ccBound){
    _ccBound=true;
    const st=savedTeam(); if(st&&st.id) $("ccTeamA").value=st.id;
    const gwSel=$("ccGw");
    const playable=(b.events||[]).filter(e=>eventComplete(e)||e.is_current);
    gwSel.innerHTML=playable.length
      ? playable.slice().reverse().map(e=>`<option value="${e.id}">Gameweek ${e.id}${e.is_current?" - current":""}</option>`).join("")
      : `<option value="">Gameweek cards unlock after GW1 starts</option>`;
    gwSel.disabled=!playable.length;
    document.querySelectorAll("#ccTypes button").forEach(btn=>btn.onclick=()=>ccSetType(btn.dataset.type));
    $("ccCreate").onclick=()=>ccGenerate();
    $("ccDownload").onclick=()=>ccDownload();
    $("ccCopy").onclick=()=>ccCopy();
    $("ccShare").onclick=()=>ccShare();
    [$("ccTeamA"),$("ccTeamB")].forEach(el=>el.addEventListener("keydown",e=>{if(e.key==="Enter")ccGenerate();}));
    ccSetType("gameweek");
  }
}

async function ccManager(id){
  id=String(id||"").trim();
  if(!/^\d+$/.test(id)) throw new Error("Enter a valid numeric Team ID.");
  const [entry,history]=await Promise.all([
    get(`/entry/${id}/`),
    get(`/entry/${id}/history/`)
  ]);
  return {id,entry,history};
}

async function ccGenerate(){
  const a=String($("ccTeamA").value||"").trim();
  if(!/^\d+$/.test(a)){ccSetStatus("Enter a valid Team ID first.",true);return;}
  const btn=$("ccCreate"); btn.disabled=true; btn.textContent="Creating card...";
  $("ccDownload").disabled=true; $("ccCopy").disabled=true; $("ccShare").disabled=true; ccSetStatus("");
  try{
    await document.fonts.ready.catch(()=>{});
    if(_ccType==="career") await ccGenerateCareer(a);
    else if(_ccType==="rivalry"){
      const b=String($("ccTeamB").value||"").trim();
      if(!/^\d+$/.test(b)||a===b) throw new Error("Enter two different Team IDs for a rivalry card.");
      await ccGenerateRivalry(a,b);
    }else{
      const gw=Number($("ccGw").value||0);
      if(!gw) throw new Error("Gameweek cards will be available after the first gameweek starts.");
      await ccGenerateGameweek(a,gw);
    }
    $("ccDownload").disabled=false; $("ccCopy").disabled=false; $("ccShare").disabled=false;
    ccSetStatus("Card ready. Download it or copy the image to share.");
  }catch(e){
    ccSetStatus(e.message||"Could not create that card.",true);
  }finally{btn.disabled=false;btn.textContent="Create card";}
}

function ccCanvas(){
  const c=$("ccCanvas"); c.width=1080; c.height=1350; return c;
}
function ccCtx(c){const x=c.getContext("2d");x.textBaseline="alphabetic";return x;}

function ccPalette(){
  const dark=document.documentElement.getAttribute("data-theme")==="dark";
  return dark ? {
    outer:"#0d1318", card:"#171e24", panel:"#202830", panel2:"#13231d",
    line:"#33404a", lineSoft:"#2b363f", ink:"#f2f6f8", sub:"#c2cbd2", dim:"#8f9ba6",
    accent:"#27c486", accentSoft:"#17382d", white:"#ffffff"
  } : {
    outer:"#eef3f1", card:"#ffffff", panel:"#f7faf8", panel2:"#e9f5ef",
    line:"#dfe7e3", lineSoft:"#e3e9e6", ink:"#17212b", sub:"#63717b", dim:"#7a8790",
    accent:"#079b62", accentSoft:"#e9f5ef", white:"#ffffff"
  };
}
function ccRR(x,px,py,w,h,r,fill,stroke){
  x.beginPath();x.moveTo(px+r,py);x.arcTo(px+w,py,px+w,py+h,r);x.arcTo(px+w,py+h,px,py+h,r);x.arcTo(px,py+h,px,py,r);x.arcTo(px,py,px+w,py,r);x.closePath();
  if(fill){x.fillStyle=fill;x.fill();} if(stroke){x.strokeStyle=stroke;x.lineWidth=2;x.stroke();}
}
function ccFit(x,text,maxWidth,startSize=54,minSize=28,weight=800){
  let s=startSize; const val=String(text||"");
  while(s>minSize){x.font=`${weight} ${s}px Inter, sans-serif`;if(x.measureText(val).width<=maxWidth)break;s-=2;}
  return s;
}
function ccBase(x,kicker,title,subtitle){
  const p=ccPalette();
  x.fillStyle=p.outer;x.fillRect(0,0,1080,1350);
  ccRR(x,54,54,972,1242,34,p.card,p.line);
  x.fillStyle=p.accent;x.fillRect(54,54,14,1242);
  x.fillStyle=p.accent;x.font="800 25px Inter, sans-serif";x.fillText("FPL PEEK",105,125);
  x.fillStyle=p.dim;x.font="800 19px Inter, sans-serif";x.fillText(kicker.toUpperCase(),105,183);
  const sz=ccFit(x,title,860,58,34,800);x.fillStyle=p.ink;x.font=`800 ${sz}px Inter, sans-serif`;x.fillText(title,105,250);
  x.fillStyle=p.sub;x.font="500 25px Inter, sans-serif";x.fillText(subtitle,105,294);
  x.strokeStyle=p.lineSoft;x.lineWidth=2;x.beginPath();x.moveTo(105,330);x.lineTo(975,330);x.stroke();
}
function ccFooter(x,text){
  const p=ccPalette();
  x.strokeStyle=p.lineSoft;x.lineWidth=2;x.beginPath();x.moveTo(105,1216);x.lineTo(975,1216);x.stroke();
  x.fillStyle=p.dim;x.font="600 20px Inter, sans-serif";x.fillText(text,105,1262);
  x.textAlign="right";x.fillStyle=p.accent;x.font="800 20px Inter, sans-serif";x.fillText("fplpeek.com",975,1262);x.textAlign="left";
}
function ccStat(x,px,py,w,h,label,value,sub="",tone="ink"){
  const p=ccPalette();
  ccRR(x,px,py,w,h,20,p.panel,p.lineSoft);
  x.fillStyle=p.dim;x.font="800 16px Inter, sans-serif";x.fillText(label.toUpperCase(),px+24,py+32);
  x.fillStyle=tone==="green"?p.accent:p.ink;const sz=ccFit(x,value,w-48,40,24,800);x.font=`800 ${sz}px Inter, sans-serif`;x.fillText(String(value),px+24,py+84);
  if(sub){x.fillStyle=p.sub;x.font="500 17px Inter, sans-serif";x.fillText(String(sub),px+24,py+h-22);}
}
function ccSaveBlob(){
  const c=$("ccCanvas");
  return new Promise(resolve=>c.toBlob(blob=>{_ccLastBlob=blob;resolve(blob);},"image/png"));
}
async function ccFinish(){ await ccSaveBlob(); $("ccPreviewEmpty").hidden=true; $("ccCanvas").hidden=false; $("ccActions").hidden=false; }

async function ccGenerateCareer(id){
  const {entry,history}=await ccManager(id);
  const rows=ccSeasonRows(history),bestR=ccBestRank(history),bestP=ccBestPoints(history),avg=ccAverageFinish(history),firstSeason=ccFirstSeason(history);
  const top100=rows.filter(r=>Number(r.rank)>0&&Number(r.rank)<=100000).length;
  const top1m=rows.filter(r=>Number(r.rank)>0&&Number(r.rank)<=1000000).length;
  const c=ccCanvas(),x=ccCtx(c);
  ccBase(x,"Career card",entry.name,`${entry.player_first_name||""} ${entry.player_last_name||""} - ${entry.player_region_name||"FPL manager"}`.trim());
  x.fillStyle=ccPalette().ink;x.font="800 27px Inter, sans-serif";x.fillText("Career snapshot",105,390);
  x.textAlign="right";x.fillStyle=ccPalette().dim;x.font="800 14px Inter, sans-serif";x.fillText("FIRST FPL SEASON",975,371);
  x.fillStyle=ccPalette().ink;x.font="800 23px Inter, sans-serif";x.fillText(firstSeason||"-",975,399);x.textAlign="left";
  const col=418,g=18,left=105,right=105+col+g;
  ccStat(x,left,420,col,150,"Career points",ccPoints(ccCareerPoints(entry,history)),"Completed seasons plus current points","green");
  ccStat(x,right,420,col,150,"Seasons played",rows.length,firstSeason?`Started ${firstSeason}`:"FPL history on record");
  ccStat(x,left,590,col,150,"Best rank",bestR?ccRank(bestR.rank):"-",bestR?bestR.season_name:"No completed season");
  ccStat(x,right,590,col,150,"Best season points",bestP?ccPoints(bestP.total_points):"-",bestP?bestP.season_name:"No completed season");
  ccStat(x,left,760,col,150,"Average finish",avg?ccRank(avg):"-","Across completed seasons");
  ccStat(x,right,760,col,150,"Top 100k finishes",top100,`${top1m} top 1m finishes`);
  ccStat(x,left,930,col,150,"Current points",entry.summary_overall_points?ccPoints(entry.summary_overall_points):"-",entry.summary_overall_rank?`Rank ${ccRank(entry.summary_overall_rank)}`:"Season not underway");
  ccStat(x,right,930,col,150,"Current rank",entry.summary_overall_rank?ccRank(entry.summary_overall_rank):"-",entry.summary_event_points!=null&&entry.summary_event_points>0?`Last GW ${entry.summary_event_points} pts`:"Updates during the season");
  ccFooter(x,"Career statistics from public Fantasy Premier League data");
  await ccFinish();
}

async function ccGenerateGameweek(id,gw){
  const {entry,history}=await ccManager(id);
  const row=(history.current||[]).find(r=>Number(r.event)===gw);
  if(!row) throw new Error(`No public Gameweek ${gw} history is available for this manager yet.`);
  const [picks,live]=await Promise.all([
    get(`/entry/${id}/event/${gw}/picks/`),
    get(`/event/${gw}/live/`).catch(()=>null)
  ]);
  const byId=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
  const cap=(picks.picks||[]).find(p=>p.is_captain),capEl=cap&&byId[cap.element];
  const liveEl=live&&cap?(live.elements||[]).find(e=>e.id===cap.element):null;
  const capPts=liveEl?Number(liveEl.stats.total_points||0)*Number(cap.multiplier||2):null;
  const cur=(history.current||[]).slice().sort((a,b)=>a.event-b.event),idx=cur.findIndex(r=>Number(r.event)===gw),prev=idx>0?cur[idx-1]:null;
  const move=prev&&prev.overall_rank&&row.overall_rank?Number(prev.overall_rank)-Number(row.overall_rank):null;
  const c=ccCanvas(),x=ccCtx(c);
  ccBase(x,`Gameweek ${gw} card`,entry.name,`${entry.player_first_name||""} ${entry.player_last_name||""} - ${entry.player_region_name||"FPL manager"}`.trim());
  x.fillStyle=ccPalette().ink;x.font="800 27px Inter, sans-serif";x.fillText(`Gameweek ${gw} report`,105,390);
  const col=418,g=18,left=105,right=105+col+g;
  ccStat(x,left,420,col,150,"GW points",row.points,"Gameweek score","green");
  ccStat(x,right,420,col,150,"GW rank",ccRank(row.rank),"Gameweek rank");
  ccStat(x,left,590,col,150,"Overall rank",ccRank(row.overall_rank),move==null?"No prior rank comparison":move>0?`Up ${ccRank(move)} places`:move<0?`Down ${ccRank(Math.abs(move))} places`:"No rank movement");
  ccCaptainStat(x,right,590,col,150,capEl,capPts);
  const capImg=await ccLoadImage(ccCaptainPhotoUrl(capEl));
  ccDrawCaptainPhoto(x,capImg,capEl,right,590,col,150);
  ccStat(x,left,760,col,150,"Transfers",row.event_transfers||0,row.event_transfers_cost?`${row.event_transfers_cost} point hit`:"No transfer hit");
  ccStat(x,right,760,col,150,"Bench points",row.points_on_bench||0,"Points left on the bench");
  ccStat(x,left,930,col,150,"Team value",row.value?`\u00a3${(Number(row.value)/10).toFixed(1)}m`:"-",row.bank!=null?`\u00a3${(Number(row.bank)/10).toFixed(1)}m in the bank`:"");
  ccStat(x,right,930,col,150,"Total points",row.total_points||entry.summary_overall_points||0,`After Gameweek ${gw}`);
  ccFooter(x,`Gameweek ${gw} statistics from public Fantasy Premier League data`);
  await ccFinish();
}

function ccH2H(aHist,bHist){
  const am=new Map((aHist.current||[]).map(r=>[Number(r.event),r])),bm=new Map((bHist.current||[]).map(r=>[Number(r.event),r]));
  let a=0,b=0,t=0;
  [...am.keys()].filter(gw=>bm.has(gw)).sort((x,y)=>x-y).forEach(gw=>{const ap=Number(am.get(gw).points||0),bp=Number(bm.get(gw).points||0);if(ap>bp)a++;else if(bp>ap)b++;else t++;});
  return {a,b,t};
}
async function ccGenerateRivalry(aId,bId){
  const [a,b]=await Promise.all([ccManager(aId),ccManager(bId)]);
  const h2h=ccH2H(a.history,b.history),aBest=ccBestRank(a.history),bBest=ccBestRank(b.history);
  const liveSeason=(Number(a.entry.summary_overall_points)||0)+(Number(b.entry.summary_overall_points)||0)>0;
  let aCap="-",bCap="-",common=null;
  const [ap,bp]=await Promise.all([latestPublicPicks(aId),latestPublicPicks(bId)]);
  if(ap&&bp){
    const byId=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
    const ac=(ap.data.picks||[]).find(p=>p.is_captain),bc=(bp.data.picks||[]).find(p=>p.is_captain);
    if(ac&&byId[ac.element])aCap=byId[ac.element].web_name;if(bc&&byId[bc.element])bCap=byId[bc.element].web_name;
    const as=new Set((ap.data.picks||[]).map(p=>p.element)),bs=new Set((bp.data.picks||[]).map(p=>p.element));common=[...as].filter(v=>bs.has(v)).length;
  }
  const c=ccCanvas(),x=ccCtx(c);
  ccBase(x,"Rivalry card","FPL Rivalry",liveSeason?"Current season head to head":"Career comparison before the season starts");
  const nameY=405;
  x.fillStyle=ccPalette().dim;x.font="800 16px Inter, sans-serif";x.fillText("MANAGER A",105,nameY);
  x.textAlign="right";x.fillText("MANAGER B",975,nameY);x.textAlign="left";
  let s=ccFit(x,a.entry.name,390,40,24,800);x.fillStyle=ccPalette().ink;x.font=`800 ${s}px Inter, sans-serif`;x.fillText(a.entry.name,105,460);
  x.textAlign="right";s=ccFit(x,b.entry.name,390,40,24,800);x.font=`800 ${s}px Inter, sans-serif`;x.fillText(b.entry.name,975,460);x.textAlign="left";
  x.fillStyle=ccPalette().sub;x.font="500 18px Inter, sans-serif";x.fillText(a.entry.player_region_name||"",105,492);x.textAlign="right";x.fillText(b.entry.player_region_name||"",975,492);x.textAlign="left";
  const metrics=liveSeason?[
    ["Overall points",a.entry.summary_overall_points||0,b.entry.summary_overall_points||0,false],
    ["Overall rank",ccRank(a.entry.summary_overall_rank),ccRank(b.entry.summary_overall_rank),true],
    ["Last GW",a.entry.summary_event_points||0,b.entry.summary_event_points||0,false],
    ["GW wins",`${h2h.a}${h2h.t?` (${h2h.t} draw${h2h.t===1?"":"s"})`:""}`,`${h2h.b}${h2h.t?` (${h2h.t} draw${h2h.t===1?"":"s"})`:""}`,false],
    ["Captain",aCap,bCap,null],
    ["Common players",common==null?"-":`${common}/15`,common==null?"-":`${common}/15`,null]
  ]:[
    ["Career points",ccPoints(ccCareerPoints(a.entry,a.history)),ccPoints(ccCareerPoints(b.entry,b.history)),false],
    ["Best rank",aBest?ccRank(aBest.rank):"-",bBest?ccRank(bBest.rank):"-",true],
    ["Seasons",ccSeasonRows(a.history).length,ccSeasonRows(b.history).length,false],
    ["Top 100k",ccSeasonRows(a.history).filter(r=>r.rank&&r.rank<=100000).length,ccSeasonRows(b.history).filter(r=>r.rank&&r.rank<=100000).length,false]
  ];
  let y=545;
  metrics.forEach(([label,av,bv])=>{
    ccRR(x,105,y,870,92,16,ccPalette().panel,ccPalette().lineSoft);
    x.fillStyle=ccPalette().ink;x.font="800 28px Inter, sans-serif";x.fillText(String(av),135,y+57);
    x.textAlign="center";x.fillStyle=ccPalette().dim;x.font="800 15px Inter, sans-serif";x.fillText(String(label).toUpperCase(),540,y+53);
    x.textAlign="right";x.fillStyle=ccPalette().ink;x.font="800 28px Inter, sans-serif";x.fillText(String(bv),945,y+57);x.textAlign="left";y+=108;
  });
  if(liveSeason){
    const diff=(Number(a.entry.summary_overall_points)||0)-(Number(b.entry.summary_overall_points)||0);
    const lead=diff===0?"Level on points":diff>0?`${a.entry.name} leads by ${diff} points`:`${b.entry.name} leads by ${Math.abs(diff)} points`;
    x.fillStyle=ccPalette().accent;x.font="800 23px Inter, sans-serif";x.fillText(lead,105,1190);
  }
  ccFooter(x,"Rivalry comparison from public Fantasy Premier League data");
  await ccFinish();
}

function ccDownload(){
  if(!_ccLastBlob)return;
  const url=URL.createObjectURL(_ccLastBlob),a=document.createElement("a");
  a.href=url;a.download=`fpl-peek-${_ccType}-card.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function ccCopy(){
  if(!_ccLastBlob)return;
  try{
    if(!navigator.clipboard||!window.ClipboardItem) throw new Error("Image copy is not supported in this browser.");
    await navigator.clipboard.write([new ClipboardItem({"image/png":_ccLastBlob})]);
    ccSetStatus("Image copied. You can paste it into Messenger, WhatsApp or another app.");
  }catch(e){ccSetStatus(e.message||"Could not copy the image. Use Download PNG instead.",true);}
}

async function ccShare(){
  if(!_ccLastBlob)return;
  try{
    const file=new File([_ccLastBlob],`fpl-peek-${_ccType}-card.png`,{type:"image/png"});
    if(!navigator.share || (navigator.canShare && !navigator.canShare({files:[file]}))) throw new Error("Direct image sharing is not supported in this browser.");
    await navigator.share({files:[file],title:"FPL Peek card",text:"Created with FPL Peek"});
  }catch(e){
    if(e&&e.name==="AbortError")return;
    ccSetStatus((e&&e.message)||"Could not open the share sheet. Use Download PNG instead.",true);
  }
}
