/* ============ GAMEWEEK PLANNER ============
   Local-first planning sandbox. It never writes to a user's FPL account.
   Cloud sync is optional and handled by account.js when Supabase is configured. */
const PLANS_KEY="fplpeek_plans_v1";
const PL_BUDGET=1000;
const PL_SQUAD={1:2,2:5,3:5,4:3};
const PL_MAX_CLUB=3;
let _plInit=false,_plPlans=[],_plActiveId=null,_plActiveGw=null,_plGwWindowStart=null,_plFixtures=[],_plOutId=null,_plSwapId=null,_plActionId=null,_plQuery="",_plPos=0,_plTeam=0,_plSort="suggested";
let _plBatchMode=false,_plBatchOut=[],_plBatchIn=[];
let _plSharedSnapshot=null;

function plUuid(){
  if(window.crypto&&crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});
}
function plRead(){try{return JSON.parse(localStorage.getItem(PLANS_KEY)||"[]")}catch{return[]}}
function plWrite(plans){try{localStorage.setItem(PLANS_KEY,JSON.stringify(plans))}catch{}}
function plActive(){return _plPlans.find(p=>p.id===_plActiveId)||null}
function plTouch(plan,notify=true){
  plan.updatedAt=new Date().toISOString();
  plWrite(_plPlans);
  if(notify) document.dispatchEvent(new CustomEvent("fplpeek:plan-saved",{detail:{plan:JSON.parse(JSON.stringify(plan))}}));
  plRenderPlanSelect();
  plRenderSync();
}
function plStartGw(){
  const ev=boot.events.find(e=>e.is_next)||boot.events.find(e=>!e.finished)||boot.events[boot.events.length-1];
  return ev?ev.id:1;
}
function plMakeWeeks(start){
  const out=[]; for(let gw=start;gw<=38;gw++) out.push({gw,transfers:[],captain:null,vice:null,chip:"",starters:null});
  return out;
}
function plNewPlan({name="New plan",baseSquad=[],baseBank=PL_BUDGET,source="Blank squad",sourceTeamId=null,sellPrices={}}={}){
  const start=plStartGw();
  const plan={
    id:plUuid(),name,source,sourceTeamId:sourceTeamId?String(sourceTeamId):null,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),baseGw:start,
    baseSquad:[...baseSquad],baseBank:Number(baseBank)||0,baseSellPrices:{...sellPrices},weeks:plMakeWeeks(start)
  };
  _plPlans.unshift(plan);_plActiveId=plan.id;_plActiveGw=start;_plGwWindowStart=null;plResetBatch();plWrite(_plPlans);
  document.dispatchEvent(new CustomEvent("fplpeek:plan-saved",{detail:{plan:JSON.parse(JSON.stringify(plan))}}));
  plRenderAll();return plan;
}
function plNormalize(plan){
  if(!plan||!plan.id) return null;
  plan.baseSquad=Array.isArray(plan.baseSquad)?plan.baseSquad.map(Number):[];
  plan.baseBank=Number(plan.baseBank??PL_BUDGET);
  plan.baseSellPrices=plan.baseSellPrices||{};
  plan.baseGw=Number(plan.baseGw||plStartGw());
  if(!Array.isArray(plan.weeks)) plan.weeks=plMakeWeeks(plan.baseGw);
  const existing=new Map(plan.weeks.map(w=>[Number(w.gw),w]));
  plan.weeks=plMakeWeeks(plan.baseGw).map(w=>{
    const x=existing.get(w.gw)||w;
    x.gw=w.gw;x.transfers=Array.isArray(x.transfers)?x.transfers:[];x.captain=x.captain?Number(x.captain):null;x.vice=x.vice?Number(x.vice):null;x.chip=x.chip||"";x.starters=Array.isArray(x.starters)?x.starters.map(Number):null;x.freshSquad=Array.isArray(x.freshSquad)?x.freshSquad.map(Number):null;x.independent=!!x.independent;
    return x;
  });
  return plan;
}
function plWeek(plan,gw){return plan.weeks.find(w=>+w.gw===+gw)||null}
function plById(){const m={};boot.elements.forEach(e=>m[e.id]=e);return m}
function plClubCounts(ids,byId){const m={};ids.forEach(id=>{const e=byId[id];if(e)m[e.team]=(m[e.team]||0)+1});return m}
function plPosCounts(ids,byId){const m={1:0,2:0,3:0,4:0};ids.forEach(id=>{const e=byId[id];if(e)m[e.element_type]++});return m}
function plDerive(plan,targetGw){
  const byId=plById();let squad=[...plan.baseSquad],bank=Number(plan.baseBank)||0,sellPrices={...plan.baseSellPrices};const applied=[],invalid=[];
  plan.weeks.filter(w=>+w.gw<=+targetGw).sort((a,b)=>a.gw-b.gw).forEach(w=>{
    if(Array.isArray(w.freshSquad)){
      const candidate=[...w.freshSquad],candidateCost=candidate.reduce((sum,id)=>sum+(byId[id]?.now_cost||0),0),candidateState={squad:candidate,bank:PL_BUDGET-candidateCost,byId};
      const usable=plValidSquadState(candidateState)||+w.gw===+targetGw;
      if(usable){
        squad=candidate;bank=PL_BUDGET-candidateCost;sellPrices={};squad.forEach(id=>{if(byId[id])sellPrices[id]=byId[id].now_cost});
      }else{
        return; // an unfinished independent GW never blocks or overwrites later planning
      }
    }
    (w.transfers||[]).forEach(tr=>{
      const out=Number(tr.out),inn=Number(tr.in),oi=squad.indexOf(out),incoming=byId[inn];
      if(oi<0||!incoming||squad.includes(inn)){invalid.push({...tr,gw:w.gw});return;}
      const outEl=byId[out];if(!outEl||outEl.element_type!==incoming.element_type){invalid.push({...tr,gw:w.gw});return;}
      const sell=Number(tr.sellPrice??sellPrices[out]??outEl.now_cost),buy=Number(tr.buyPrice??incoming.now_cost);
      if(bank+sell-buy<0){invalid.push({...tr,gw:w.gw});return;}
      const test=[...squad];test[oi]=inn;const clubs=plClubCounts(test,byId);if((clubs[incoming.team]||0)>PL_MAX_CLUB){invalid.push({...tr,gw:w.gw});return;}
      squad=test;bank+=sell-buy;delete sellPrices[out];sellPrices[inn]=buy;applied.push({...tr,gw:w.gw});
    });
  });
  return {squad,bank,sellPrices,applied,invalid,byId};
}
function plValidBase(plan){
  const byId=plById(),ids=plan.baseSquad,pc=plPosCounts(ids,byId),cc=plClubCounts(ids,byId),cost=ids.reduce((s,id)=>s+(byId[id]?.now_cost||0),0);
  const budgetOk=plan.sourceTeamId?true:cost<=PL_BUDGET;return ids.length===15&&[1,2,3,4].every(p=>pc[p]===PL_SQUAD[p])&&Object.values(cc).every(n=>n<=PL_MAX_CLUB)&&budgetOk;
}
function plWeekIsFresh(w){return !!w&&Array.isArray(w.freshSquad)}
function plValidSquadState(st){
  if(!st||!Array.isArray(st.squad))return false;
  const pc=plPosCounts(st.squad,st.byId),cc=plClubCounts(st.squad,st.byId);
  return st.squad.length===15&&[1,2,3,4].every(p=>pc[p]===PL_SQUAD[p])&&Object.values(cc).every(n=>n<=PL_MAX_CLUB)&&Number(st.bank)>=0;
}
function plBuildMode(plan,w,st){return plWeekIsFresh(w)?!plValidSquadState(st):!plValidBase(plan)}
function plBlockingFreshGw(plan,targetGw){return null}

function plResetBatch(){_plBatchMode=false;_plBatchOut=[];_plBatchIn=[]}
function plBatchOutSet(){return new Set(_plBatchOut.map(Number))}
function plBatchMissingByPos(st){
  const out={1:0,2:0,3:0,4:0},inn={1:0,2:0,3:0,4:0};
  _plBatchOut.forEach(id=>{const e=st.byId[+id];if(e)out[e.element_type]++});
  _plBatchIn.forEach(id=>{const e=st.byId[+id];if(e)inn[e.element_type]++});
  return {1:Math.max(0,out[1]-inn[1]),2:Math.max(0,out[2]-inn[2]),3:Math.max(0,out[3]-inn[3]),4:Math.max(0,out[4]-inn[4])};
}
function plBatchTempState(st){
  const outSet=plBatchOutSet(),squad=st.squad.filter(id=>!outSet.has(+id)).concat(_plBatchIn.map(Number));
  const released=_plBatchOut.reduce((sum,id)=>sum+Number((st.sellPrices[+id]??st.byId[+id]?.now_cost) || 0),0);
  const spend=_plBatchIn.reduce((sum,id)=>sum+Number(st.byId[+id]?.now_cost||0),0);
  return {squad,bank:Number(st.bank)+released-spend,byId:st.byId};
}
function plBatchCanAdd(incoming,st){
  if(!incoming||_plBatchIn.includes(+incoming.id)||st.squad.includes(+incoming.id))return false;
  const missing=plBatchMissingByPos(st);if(!missing[incoming.element_type])return false;
  const temp=plBatchTempState(st),test=[...temp.squad,+incoming.id],cc=plClubCounts(test,st.byId);
  const spendAfter=Number(temp.bank)-Number(incoming.now_cost||0);
  return spendAfter>=0&&(cc[incoming.team]||0)<=PL_MAX_CLUB;
}
function plBatchSummary(st){
  const missing=plBatchMissingByPos(st),temp=plBatchTempState(st),outCount=_plBatchOut.length,inCount=_plBatchIn.length;
  const slots=Object.entries(missing).filter(([,n])=>n>0).map(([p,n])=>`${n} ${POS[p]}`).join(' · ');
  return {missing,temp,outCount,inCount,slots};
}
function plBatchReplacementMap(st){
  const available=[..._plBatchIn.map(Number)],map=new Map();
  _plBatchOut.map(Number).forEach(outId=>{
    const pos=st.byId[outId]?.element_type;if(!pos)return;
    const i=available.findIndex(inId=>st.byId[inId]?.element_type===pos);
    if(i>=0){map.set(outId,available[i]);available.splice(i,1)}
  });
  return map;
}
function plBatchSlot(pos,outId,st){
  const out=st.byId[+outId],t=out?boot.teams.find(x=>x.id===out.team)||{}:{};
  return `<button class="planner-transfer-empty" data-pl-batch-empty-pos="${pos}" title="Add ${POS[pos]} replacement"><span class="planner-transfer-empty-plus">+</span><b>${POS[pos]}</b><small>${out?`Replace ${esc(out.web_name)}`:"Empty transfer slot"}</small></button>`;
}
function plBatchFindTransfers(st){
  const outs=_plBatchOut.map(Number),ins=_plBatchIn.map(Number);
  if(!outs.length||outs.length!==ins.length)return null;
  const startSquad=[...st.squad],startBank=Number(st.bank),byId=st.byId,sellPrices={...st.sellPrices};
  const memo=new Set();
  function dfs(squad,bank,ro,ri,acc){
    if(!ro.length)return acc;
    const key=ro.slice().sort((a,b)=>a-b).join(',')+'|'+ri.slice().sort((a,b)=>a-b).join(',')+'|'+Math.round(bank);
    if(memo.has(key))return null;memo.add(key);
    for(let oi=0;oi<ro.length;oi++){
      const outId=ro[oi],out=byId[outId];if(!out)continue;
      for(let ii=0;ii<ri.length;ii++){
        const inId=ri[ii],incoming=byId[inId];if(!incoming||incoming.element_type!==out.element_type)continue;
        const idx=squad.indexOf(outId);if(idx<0||squad.includes(inId))continue;
        const sell=Number(sellPrices[outId]??out.now_cost),buy=Number(incoming.now_cost||0);if(bank+sell-buy<0)continue;
        const next=[...squad];next[idx]=inId;const cc=plClubCounts(next,byId);if((cc[incoming.team]||0)>PL_MAX_CLUB)continue;
        const nextSell={...sellPrices};delete nextSell[outId];nextSell[inId]=buy;
        const res=dfs(next,bank+sell-buy,ro.filter((_,i)=>i!==oi),ri.filter((_,i)=>i!==ii),acc.concat([{id:plUuid(),out:outId,in:inId,sellPrice:sell,buyPrice:buy}]));
        if(res)return res;
      }
    }
    return null;
  }
  return dfs(startSquad,startBank,outs,ins,[]);
}
function plPlayerScore(e){return (parseFloat(e.form)||0)*2+(Number(e.total_points)||0)/10+(Number(e.minutes)||0)/1000}
function plAutoPickAvailability(e){
  if(!e)return 0;
  const chance=e.chance_of_playing_next_round;
  if(chance!=null)return Math.max(0,Math.min(1,Number(chance)/100));
  if(e.status==="a")return 1;
  if(e.status==="d")return .62;
  if(["i","s","u"].includes(e.status))return .06;
  return .75;
}
function plAutoPickGwProjection(e,gw){
  const rows=plFixturesFor(e.team,gw);if(!rows.length)return 0;
  if(typeof fplPeekProjectedPoints!=="function")return Math.max(0,plPlayerScore(e));
  return fplPeekProjectedPoints(e,{[e.team]:rows},Math.max(1,rows.length));
}
function plAutoPickCandidates(startGw=_plActiveGw){
  const fixtureMap=plUpcomingFixtureMap(startGw,5);
  return boot.elements.filter(e=>e.element_type>0).map(e=>{
    const price=Math.max(4,(Number(e.now_cost)||40)/10),form=parseFloat(e.form)||0,ppg=parseFloat(e.points_per_game)||0;
    const proj5=typeof fplPeekProjectedPoints==="function"?fplPeekProjectedPoints(e,fixtureMap,5):Math.max(0,plPlayerScore(e)*2.4);
    const proj1=plAutoPickGwProjection(e,startGw);
    const security=typeof minutesSecurity==="function"?Math.max(.25,Math.min(1,(minutesSecurity(e).score||70)/100)):Math.max(.35,Math.min(1,(Number(e.minutes)||0)/Math.max(1,(Number(e.starts)||1)*90)));
    const availability=plAutoPickAvailability(e),value=proj5/price;
    const role=(Number(e.penalties_order)>0&&Number(e.penalties_order)<=2)?.32:(Number(e.direct_freekicks_order)>0&&Number(e.direct_freekicks_order)<=2)?.10:0;
    const recent=Math.min(.9,form*.06+ppg*.07);
    const score=proj5+Math.min(2.1,value*.42)+security*.72+recent+role;
    const premium=e.element_type>=3?Math.max(0,price-8)*.10:Math.max(0,price-6)*.035;
    const captain=proj1*1.24+ppg*.16+role*.8+premium+security*.28;
    return {...e,_plAutoScore:score,_plAutoOne:proj1,_plAutoCaptain:captain,_plAutoAvailability:availability};
  });
}
function plAutoPickBuild(fixedIds=[],startGw=_plActiveGw){
  fixedIds=[...new Set((fixedIds||[]).map(Number))];
  const all=plAutoPickCandidates(startGw),model=new Map(all.map(e=>[e.id,e])),fixedSet=new Set(fixedIds);
  const fixed=fixedIds.map(id=>model.get(id)).filter(Boolean);
  if(fixed.length!==fixedIds.length)return null;
  const fixedPos=plPosCounts(fixedIds,plById()),fixedClub=plClubCounts(fixedIds,plById()),fixedCost=fixed.reduce((sum,e)=>sum+(Number(e.now_cost)||0),0);
  if(fixedIds.length>15||fixedCost>PL_BUDGET||Object.entries(PL_SQUAD).some(([p,n])=>(fixedPos[p]||0)>n)||Object.values(fixedClub).some(n=>n>PL_MAX_CLUB))return null;
  const pool=all.filter(e=>fixedSet.has(e.id)||e._plAutoAvailability>=.25);
  const orders=[[1,2,3,4],[4,3,2,1],[1,4,2,3],[1,3,2,4]];
  let base=null;
  for(const order of orders){
    const sel=[...fixed],ids=new Set(sel.map(e=>e.id)),clubs=new Map();sel.forEach(e=>clubs.set(e.team,(clubs.get(e.team)||0)+1));
    let cost=sel.reduce((a,e)=>a+(Number(e.now_cost)||0),0),ok=true;
    for(const pos of order){
      const need=PL_SQUAD[pos]-sel.filter(e=>e.element_type===pos).length;
      const choices=pool.filter(e=>e.element_type===pos&&!ids.has(e.id)).sort((a,b)=>a.now_cost-b.now_cost||b._plAutoScore-a._plAutoScore);
      for(let k=0;k<need;k++){
        const pick=choices.find(e=>!ids.has(e.id)&&(clubs.get(e.team)||0)<PL_MAX_CLUB&&cost+Number(e.now_cost||0)<=PL_BUDGET);
        if(!pick){ok=false;break}
        sel.push(pick);ids.add(pick.id);clubs.set(pick.team,(clubs.get(pick.team)||0)+1);cost+=Number(pick.now_cost||0);
      }
      if(!ok)break;
    }
    if(ok&&sel.length===15&&(!base||cost<base.cost))base={sel,cost};
  }
  if(!base)return null;
  let sel=base.sel,cost=base.cost;
  const pools={1:[],2:[],3:[],4:[]};pool.forEach(e=>pools[e.element_type].push(e));Object.values(pools).forEach(a=>a.sort((x,y)=>y._plAutoScore-x._plAutoScore));
  for(let round=0;round<180;round++){
    let best=null;const clubs=new Map();sel.forEach(e=>clubs.set(e.team,(clubs.get(e.team)||0)+1));const selected=new Set(sel.map(e=>e.id));
    for(let i=0;i<sel.length;i++){
      const cur=sel[i];if(fixedSet.has(cur.id))continue;
      for(const alt of pools[cur.element_type].slice(0,80)){
        if(alt.id===cur.id||selected.has(alt.id))continue;
        const delta=Number(alt.now_cost||0)-Number(cur.now_cost||0);if(cost+delta>PL_BUDGET)continue;
        const altClub=(clubs.get(alt.team)||0)-(alt.team===cur.team?1:0);if(altClub>=PL_MAX_CLUB)continue;
        const gain=alt._plAutoScore-cur._plAutoScore;if(gain<=.015)continue;
        const efficiency=gain-Math.max(0,delta)*.00025;
        if(!best||efficiency>best.efficiency||(Math.abs(efficiency-best.efficiency)<1e-7&&gain>best.gain))best={i,alt,delta,gain,efficiency};
      }
    }
    if(!best)break;
    sel[best.i]=best.alt;cost+=best.delta;
  }
  const ids=sel.map(e=>e.id),pc=plPosCounts(ids,plById()),cc=plClubCounts(ids,plById());
  if(ids.length!==15||Object.entries(PL_SQUAD).some(([p,n])=>pc[p]!==n)||Object.values(cc).some(n=>n>PL_MAX_CLUB)||cost>PL_BUDGET)return null;
  return {ids,cost,bank:PL_BUDGET-cost,model:new Map(all.map(e=>[e.id,e]))};
}
function plAutoPickXi(ids,model){
  const by={1:[],2:[],3:[],4:[]};ids.forEach(id=>{const e=model.get(+id);if(e)by[e.element_type].push(e)});Object.values(by).forEach(a=>a.sort((x,y)=>y._plAutoOne-x._plAutoOne));
  const formations=[[3,4,3],[3,5,2],[4,3,3],[4,4,2],[4,5,1],[5,2,3],[5,3,2],[5,4,1]];let best=null;
  formations.forEach(([d,m,f])=>{const xi=[by[1][0],...by[2].slice(0,d),...by[3].slice(0,m),...by[4].slice(0,f)].filter(Boolean);if(xi.length!==11)return;const score=xi.reduce((sum,e)=>sum+e._plAutoOne,0);if(!best||score>best.score)best={xi,score}});
  return (best?.xi||[]).map(e=>e.id);
}
async function plAutoPickSquad({skipConfirm=false}={}){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!plan||!w)return;
  const st=plDerive(plan,_plActiveGw);if(!plBuildMode(plan,w,st))return toast("AutoPick is available while building an incomplete squad");
  let fixed=[...st.squad];
  if(fixed.length&&!skipConfirm){
    const ok=await fplConfirm(`Keep your ${fixed.length} current pick${fixed.length===1?"":"s"} and let AutoPick complete the remaining squad?`,{title:"Complete squad with AutoPick?",confirmText:"AutoPick remaining"});
    if(!ok)return;
  }
  let result=plAutoPickBuild(fixed,_plActiveGw);
  if(!result&&fixed.length){
    const replace=await fplConfirm("Those current picks do not leave a legal £100m completion. Let AutoPick replace them and build a fresh 15-player squad instead?",{title:"Build a fresh AutoPick squad?",confirmText:"Replace and AutoPick"});
    if(!replace)return;fixed=[];result=plAutoPickBuild([],_plActiveGw);
  }
  if(!result)return toast("AutoPick could not build a legal squad from the current player data");
  const sell={};result.ids.forEach(id=>sell[id]=result.model.get(id)?.now_cost||0);
  if(plWeekIsFresh(w))w.freshSquad=[...result.ids];else{plan.baseSquad=[...result.ids];plan.baseBank=result.bank;plan.baseSellPrices=sell;}
  const xi=plAutoPickXi(result.ids,result.model);w.starters=xi;
  const capPool=xi.map(id=>result.model.get(+id)).filter(Boolean).sort((a,b)=>b._plAutoCaptain-a._plAutoCaptain||b._plAutoOne-a._plAutoOne);
  w.captain=capPool[0]?.id||null;w.vice=capPool.find(e=>e.id!==w.captain)?.id||null;
  _plOutId=null;_plSwapId=null;_plActionId=null;plResetBatch();plTouch(plan);plRenderAll();
  toast(`${fixed.length?"AutoPick completed":"AutoPick built"} the squad · ${money(result.bank)} left in the bank`);
}
async function plCreateAutoPick(){plNewPlan({name:"AutoPick plan",baseSquad:[],baseBank:PL_BUDGET,source:"AutoPick squad"});await plAutoPickSquad({skipConfirm:true})}

function plShareEncode(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));let binary="";
  bytes.forEach(b=>binary+=String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function plShareDecode(value){
  try{
    const padded=String(value||"").replace(/-/g,"+").replace(/_/g,"/")+"===".slice((String(value||"").length+3)%4);
    const binary=atob(padded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!data||+data.v!==1||!Array.isArray(data.s)||!Array.isArray(data.x))return null;
    return data;
  }catch{return null}
}
function plShareSnapshot(){
  const plan=plActive(),w=plan&&plWeek(plan,_plActiveGw);if(!plan||!w)return null;
  const st=plDerive(plan,_plActiveGw);if(!plValidSquadState(st))return null;
  const xi=plCurrentXi(st,w),validXi=plLineupValid(xi,st)?xi:plAutoXi(st.squad);
  const projected=Math.round(validXi.map(id=>st.byId[+id]).filter(Boolean).reduce((sum,e)=>sum+plAutoPickGwProjection(e,+_plActiveGw),0)*10)/10;
  return {
    v:1,g:+_plActiveGw,n:String(plan.name||"Shared plan").slice(0,60),s:st.squad.map(Number),x:validXi.map(Number),
    c:+w.captain||0,d:+w.vice||0,b:Math.round(Number(st.bank)||0),k:String(w.chip||"").slice(0,12),p:projected,
    t:(w.transfers||[]).slice(0,15).map(tr=>[+tr.out,+tr.in])
  };
}
function plShareUrl(snapshot){
  const url=new URL(location.href);url.search="";url.searchParams.set("tool","planner");url.searchParams.set("share",plShareEncode(snapshot));url.hash="";return url.toString();
}
async function plCopyText(text){
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true}}catch{}
  const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch{}ta.remove();return ok;
}
function plShareFormation(snapshot){
  const byId=plById(),pc=plPosCounts((snapshot.x||[]).map(Number),byId);return `${pc[2]||0}-${pc[3]||0}-${pc[4]||0}`;
}
function plShareProjected(snapshot){
  if(Number.isFinite(Number(snapshot?.p)))return Number(snapshot.p);
  return (snapshot.x||[]).map(id=>plById()[+id]).filter(Boolean).reduce((sum,e)=>sum+plAutoPickGwProjection(e,+snapshot.g||1),0);
}
function plEnsureShareDialog(){
  let root=document.getElementById("plShareDialog");if(root)return root;
  document.body.insertAdjacentHTML("beforeend",`<div id="plShareDialog" class="planner-share-layer" hidden>
    <button class="planner-share-backdrop" data-pl-share-close aria-label="Close share dialog"></button>
    <section class="fpl-dialog planner-share-dialog" role="dialog" aria-modal="true" aria-labelledby="plShareTitle">
      <button class="planner-share-x" data-pl-share-close aria-label="Close">×</button>
      <div class="fpl-dialog-brand"><span class="fpl-dialog-logo">P</span><span>FPL Peek</span></div>
      <h3 id="plShareTitle">Share Gameweek</h3>
      <p id="plShareMessage">Share a read-only snapshot of this Gameweek with a link. Your original Planner stays private and editable.</p>
      <div class="planner-share-link"><input id="plShareLink" type="text" readonly aria-label="Share link"><button class="primary-action" data-pl-share-copy>Copy link</button></div>
      <small class="planner-share-privacy">Only this Gameweek snapshot is included. Your FPL Team ID and other planned Gameweeks are not shared.</small>
      <div id="plShareStatus" class="planner-share-status" aria-live="polite"></div>
    </section>
  </div>`);
  root=document.getElementById("plShareDialog");
  root.addEventListener("click",async e=>{
    if(e.target.closest("[data-pl-share-close]")){plCloseShareDialog();return}
    if(e.target.closest("[data-pl-share-copy]")){
      const url=$("plShareLink")?.value||"",ok=await plCopyText(url);if($("plShareStatus"))$("plShareStatus").textContent=ok?"Link copied — anyone with it can view this snapshot.":"Could not copy automatically. Select the link above and copy it.";return;
    }
  });
  return root;
}
function plOpenShareDialog(){
  const snapshot=plShareSnapshot();if(!snapshot)return toast("Complete a valid 15-player squad before sharing this Gameweek");
  _plSharedSnapshot=snapshot;const root=plEnsureShareDialog(),url=plShareUrl(snapshot);
  $("plShareTitle").textContent=`Share GW${snapshot.g}`;$("plShareLink").value=url;$("plShareStatus").textContent="";root.hidden=false;
  const prev=document.body.dataset.plShareOverflow||document.body.style.overflow;document.body.dataset.plShareOverflow=prev;document.body.style.overflow="hidden";
  requestAnimationFrame(()=>root.querySelector("[data-pl-share-copy]")?.focus());
}
function plCloseShareDialog(){
  const root=document.getElementById("plShareDialog");if(root)root.hidden=true;
  document.body.style.overflow=document.body.dataset.plShareOverflow||"";delete document.body.dataset.plShareOverflow;
}
function plSharePlayerHtml(e,snapshot){
  const t=boot.teams.find(x=>x.id===e.team)||{},cap=+snapshot.c===e.id,vice=+snapshot.d===e.id;
  return `<div class="planner-shared-player"><span class="planner-shared-kit">${teamKitImg(t,"planner-pitch-kit-img",`${e.web_name} ${t.name||"club"} kit`)}</span><b>${esc(e.web_name)}</b><span>${plFixtureRunHtml(e,+snapshot.g,5,"pitch-run")}</span>${cap?`<i class="captain">C</i>`:vice?`<i class="vice">V</i>`:""}</div>`;
}
function plRenderSharedSnapshot(snapshot){
  const view=$("plSharedView");if(!view)return false;const byId=plById(),squad=(snapshot.s||[]).map(Number).filter(id=>byId[id]),xiIds=(snapshot.x||[]).map(Number).filter(id=>byId[id]),st={squad,bank:+snapshot.b||0,byId},validSquad=squad.length===15&&plValidSquadState(st),validXi=plLineupValid(xiIds,st);
  if(!validSquad||!validXi){view.hidden=false;view.innerHTML=`<div class="planner-shared-error"><b>This shared squad could not be opened.</b><span>The link may be incomplete or the player data may no longer match this season.</span><button class="primary-action" data-pl-share-exit>Open Planner</button></div>`}else{
    const xiSet=new Set(xiIds),bench=squad.filter(id=>!xiSet.has(id)).sort((a,b)=>(byId[a]?.element_type||0)-(byId[b]?.element_type||0)||plPlayerScore(byId[b])-plPlayerScore(byId[a])),grouped={1:[],2:[],3:[],4:[]};xiIds.map(id=>byId[id]).filter(Boolean).forEach(e=>grouped[e.element_type].push(e));
    const rows=[1,2,3,4].map(pos=>`<div class="planner-shared-row planner-shared-row-${pos}">${grouped[pos].map(e=>plSharePlayerHtml(e,snapshot)).join("")}</div>`).join(""),cap=byId[+snapshot.c],vice=byId[+snapshot.d],moves=(snapshot.t||[]).map(([a,b])=>{const out=byId[+a],inn=byId[+b];return out&&inn?`<span><b>${esc(out.web_name)}</b> → <b>${esc(inn.web_name)}</b></span>`:""}).filter(Boolean).join(""),projected=plShareProjected(snapshot).toFixed(1);
    view.hidden=false;view.innerHTML=`<div class="planner-shared-head"><div><span class="analysis-eyebrow">Shared Planner snapshot</span><h3>${esc(snapshot.n||`GW${snapshot.g} plan`)}</h3><p>GW${snapshot.g} · ${plShareFormation(snapshot)} · read-only snapshot</p></div><div class="planner-shared-actions"><button class="secondary-action" data-pl-share-exit>Open my Planner</button><button class="primary-action" data-pl-share-copy-plan>Copy to my Planner</button></div></div>
      <div class="planner-shared-stats"><div><span>Gameweek</span><b>GW${snapshot.g}</b></div><div><span>Formation</span><b>${plShareFormation(snapshot)}</b></div><div><span>Bank</span><b>${money(snapshot.b||0)}</b></div><div><span>Projected XI</span><b>${projected}</b><small>FPL Peek estimate</small></div><div><span>Chip</span><b>${esc(snapshot.k||"None")}</b></div></div>
      <div class="planner-shared-pitch"><span class="planner-pitch-center-circle" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-top" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-bottom" aria-hidden="true"></span>${rows}</div>
      <div class="planner-shared-bench"><div><span>Substitutes</span><small>Snapshot bench order shown by position</small></div><div class="planner-shared-bench-row">${bench.map(id=>plSharePlayerHtml(byId[id],snapshot)).join("")}</div></div>
      <div class="planner-shared-foot"><div><span>Captain</span><b>${cap?esc(cap.web_name):"Not set"}</b></div><div><span>Vice</span><b>${vice?esc(vice.web_name):"Not set"}</b></div><div><span>Planned transfers</span><b>${(snapshot.t||[]).length}</b>${moves?`<div class="planner-shared-moves">${moves}</div>`:""}</div><p>This link contains only this Gameweek snapshot. It cannot edit the original plan and does not include the creator's FPL Team ID or other Gameweeks.</p></div>`;
  }
  document.querySelector("#tab-planner .planner-toolbar")?.classList.add("planner-share-hidden");$("plEmpty").style.display="none";$("plWorkspace").style.display="none";return true;
}
function plExitSharedSnapshot(){
  _plSharedSnapshot=null;const url=new URL(location.href);url.searchParams.delete("share");url.searchParams.set("tool","planner");history.replaceState({},"",url.toString());const view=$("plSharedView");if(view){view.hidden=true;view.innerHTML=""}document.querySelector("#tab-planner .planner-toolbar")?.classList.remove("planner-share-hidden");plRenderAll();
}
function plCopySharedToPlanner(snapshot){
  const gw=+snapshot.g||plStartGw(),start=plStartGw();if(gw<start)return toast(`GW${gw} is already before the Planner's current starting Gameweek`);
  plExitSharedSnapshot();const p=plNewPlan({name:`Shared GW${gw} plan`,baseSquad:[],baseBank:PL_BUDGET,source:`Copied from shared GW${gw} snapshot`}),w=plWeek(p,gw);if(!w)return toast("Could not create this shared Gameweek in the Planner");
  w.freshSquad=(snapshot.s||[]).map(Number);w.independent=true;w.starters=(snapshot.x||[]).map(Number);w.captain=+snapshot.c||null;w.vice=+snapshot.d||null;w.chip=snapshot.k||"";_plActiveGw=gw;_plGwWindowStart=null;plTouch(p);plRenderAll();toast(`GW${gw} copied to your Planner — you can edit it normally`);
}
function plAutoXi(ids){
  const byId=plById(),g={1:[],2:[],3:[],4:[]};ids.map(id=>byId[id]).filter(Boolean).forEach(e=>g[e.element_type].push(e));
  Object.values(g).forEach(a=>a.sort((a,b)=>plPlayerScore(b)-plPlayerScore(a)));
  if(ids.length<11) return [...ids];
  const xi=[...g[1].slice(0,1),...g[2].slice(0,3),...g[3].slice(0,2),...g[4].slice(0,1)];
  const used=new Set(xi.map(e=>e.id));
  const rest=[...g[2],...g[3],...g[4]].filter(e=>!used.has(e.id)).sort((a,b)=>plPlayerScore(b)-plPlayerScore(a));
  xi.push(...rest.slice(0,11-xi.length));return xi.map(e=>e.id);
}
function plLineupValid(ids,st){
  if(!Array.isArray(ids)||ids.length!==11||new Set(ids).size!==11||ids.some(id=>!st.squad.includes(+id)))return false;
  const pc=plPosCounts(ids,st.byId);
  return pc[1]===1&&pc[2]>=3&&pc[2]<=5&&pc[3]>=2&&pc[3]<=5&&pc[4]>=1&&pc[4]<=3;
}
function plCurrentXi(st,w){
  const saved=Array.isArray(w?.starters)?w.starters.map(Number):null;
  return plLineupValid(saved,st)?saved:plAutoXi(st.squad);
}
function plCaptainOptions(st,w,selected){
  const xi=new Set(plCurrentXi(st,w));
  return st.squad.map(id=>st.byId[id]).filter(e=>e&&xi.has(e.id)).sort((a,b)=>a.element_type-b.element_type||a.web_name.localeCompare(b.web_name)).map(e=>`<option value="${e.id}" ${+selected===e.id?"selected":""}>${esc(e.web_name)} · ${POS[e.element_type]}</option>`).join("");
}
function plTeamCode(team){
  const short=String(team?.short_name||"").replace(/[^A-Za-z]/g,"").toUpperCase();
  if(short.length===3)return short;
  const name=String(team?.name||"").toLowerCase();
  const known={
    "nottingham forest":"NFO","nott'm forest":"NFO","newcastle united":"NEW","newcastle":"NEW",
    "manchester united":"MUN","man utd":"MUN","manchester city":"MCI","man city":"MCI",
    "crystal palace":"CRY","aston villa":"AVL","west ham united":"WHU","west ham":"WHU",
    "tottenham hotspur":"TOT","tottenham":"TOT","spurs":"TOT","brighton and hove albion":"BHA","brighton":"BHA",
    "wolverhampton wanderers":"WOL","wolves":"WOL","leeds united":"LEE","leeds":"LEE",
    "ipswich town":"IPS","hull city":"HUL","coventry city":"COV"
  };
  if(known[name])return known[name];
  return (short||String(team?.name||"").replace(/[^A-Za-z]/g,"").toUpperCase()).slice(0,3)||"---";
}
function plFixturesFor(teamId,gw){
  return _plFixtures.filter(f=>+f.event===+gw&&(f.team_h===teamId||f.team_a===teamId)).map(f=>{
    const home=f.team_h===teamId,oppId=home?f.team_a:f.team_h,opp=boot.teams.find(t=>t.id===oppId)||{};
    return {home,opp,fdr:home?f.team_h_difficulty:f.team_a_difficulty};
  });
}
function plFixtureHtml(e,gw){
  const rows=plFixturesFor(e.team,gw);if(!rows.length)return `<span class="pl-fixture blank">Blank</span>`;
  return rows.map(r=>`<span class="pl-fixture fdr${r.fdr}" title="${esc(r.opp.name||"")} ${r.home?"home":"away"}">${esc(r.home?(r.opp.short_name||""):(r.opp.short_name||"").toLowerCase())}</span>`).join("");
}
function plFixtureRunHtml(e,startGw=_plActiveGw,count=5,extraClass=""){
  const cells=[];
  for(let gw=Number(startGw)||1;gw<=38&&cells.length<count;gw++){
    const rows=plFixturesFor(e.team,gw);
    if(!rows.length){cells.push(`<span class="pl-fixture blank" title="GW${gw}: Blank">—</span>`);continue;}
    if(rows.length===1){
      const r=rows[0],short=plTeamCode(r.opp),label=r.home?short:short.toLowerCase();
      cells.push(`<span class="pl-fixture fdr${r.fdr}" title="GW${gw}: ${esc(r.opp.name||short)} (${r.home?"H":"A"}) · FDR ${r.fdr}">${esc(label)}</span>`);
    }else{
      const avg=Math.max(1,Math.min(5,Math.round(rows.reduce((a,r)=>a+(Number(r.fdr)||3),0)/rows.length)));
      const label=rows.map(r=>plTeamCode(r.opp).slice(0,2)).join("+");
      const title=rows.map(r=>`${r.opp.name||r.opp.short_name} (${r.home?"H":"A"})`).join(" + ");
      cells.push(`<span class="pl-fixture fdr${avg} double" title="GW${gw}: ${esc(title)}">${esc(label)}</span>`);
    }
  }
  return `<span class="planner-fixture-run ${extraClass}">${cells.join("")}</span>`;
}
function plUpcomingFixtureMap(startGw=_plActiveGw,count=5){
  const map={};
  boot.teams.forEach(t=>{
    const rows=[];
    for(let gw=Number(startGw)||1;gw<=38&&gw<(Number(startGw)||1)+count;gw++) plFixturesFor(t.id,gw).forEach(r=>rows.push(r));
    map[t.id]=rows;
  });
  return map;
}
function plPickerMetric(e,key){
  const price=(Number(e.now_cost)||0)/10,total=Number(e.total_points)||0;
  if(key==="ownership")return parseFloat(e.selected_by_percent)||0;
  if(key==="priceHigh"||key==="priceLow")return Number(e.now_cost)||0;
  if(key==="points")return total;
  if(key==="ppg")return parseFloat(e.points_per_game)||0;
  if(key==="form")return parseFloat(e.form)||0;
  if(key==="value")return price?total/price:0;
  if(key==="minutes")return Number(e.minutes)||0;
  return 0;
}
function plPickerSort(list){
  const map=plUpcomingFixtureMap(_plActiveGw,5);
  return list.sort((a,b)=>{
    if(_plSort==="suggested"||_plSort==="projection"){
      const av=typeof fplPeekProjectedPoints==="function"?fplPeekProjectedPoints(a,map,5):plPlayerScore(a);
      const bv=typeof fplPeekProjectedPoints==="function"?fplPeekProjectedPoints(b,map,5):plPlayerScore(b);
      if(bv!==av)return bv-av;
    }else{
      const av=plPickerMetric(a,_plSort),bv=plPickerMetric(b,_plSort);
      if(_plSort==="priceLow"&&av!==bv)return av-bv;
      if(bv!==av)return bv-av;
    }
    return plPlayerScore(b)-plPlayerScore(a)||String(a.web_name||"").localeCompare(String(b.web_name||""));
  });
}
function plRenderPlanSelect(){
  const sel=$("plPlanSelect");if(!sel)return;
  sel.innerHTML=_plPlans.length?_plPlans.map(p=>`<option value="${p.id}" ${p.id===_plActiveId?"selected":""}>${esc(p.name||"Plan")}</option>`).join(""):`<option value="">No saved plans</option>`;
  ["plDuplicate","plRename","plDelete"].forEach(id=>{if($(id))$(id).disabled=!plActive()});
}
function plRenderSync(){
  const el=$("plSyncStatus");if(!el)return;
  if(window.FPLPeekCloud?.isSignedIn?.()) el.innerHTML=`<span class="sync-dot"></span> Synced to account`;
  else if(window.FPLPeekCloud?.isConfigured?.()) el.textContent="Saved locally · sign in to sync";
  else el.textContent="Saved on this device";
}
function plRenderAll(){
  if($("plSharedView")){ $("plSharedView").hidden=true; $("plSharedView").innerHTML=""; } document.querySelector("#tab-planner .planner-toolbar")?.classList.remove("planner-share-hidden");
  plRenderPlanSelect();plRenderSync();const plan=plActive();
  $("plEmpty").style.display=plan?"none":"block";$("plWorkspace").style.display=plan?"block":"none";
  if(!plan)return;
  if(!plWeek(plan,_plActiveGw))_plActiveGw=plan.baseGw;
  $("plTitle").textContent=plan.name||"Plan";$("plSource").textContent=plan.source||"Local plan";
  $("plMeta").textContent=`${plan.baseSquad.length}/15 base squad · saved automatically${window.FPLPeekCloud?.isSignedIn?.()?" and synced":" on this device"}.`;
  plRenderGwStrip();plRenderWorkspace();
}
function plGwWindowForActive(weeks,windowSize=7){
  const idx=Math.max(0,weeks.findIndex(w=>+w.gw===+_plActiveGw));
  let start=Math.max(0,idx-Math.floor(windowSize/2));
  if(start+windowSize>weeks.length)start=Math.max(0,weeks.length-windowSize);
  return start;
}
function plRenderGwStrip(){
  const plan=plActive();if(!plan)return;
  const weeks=plan.weeks||[],windowSize=7,maxStart=Math.max(0,weeks.length-windowSize);
  if(_plGwWindowStart==null||_plGwWindowStart<0||_plGwWindowStart>maxStart)_plGwWindowStart=plGwWindowForActive(weeks,windowSize);
  const start=Math.max(0,Math.min(maxStart,_plGwWindowStart)),visible=weeks.slice(start,start+windowSize);
  const buttons=visible.map(w=>{
    const bits=[],ws=plDerive(plan,w.gw),isFresh=plWeekIsFresh(w),valid=plValidSquadState(ws);if(isFresh)bits.push(valid?"Independent":"Incomplete");else if(!valid)bits.push("Incomplete");else if(w.transfers?.length)bits.push(`${w.transfers.length} move${w.transfers.length>1?"s":""}`);else bits.push("Carried forward");if(w.captain)bits.push("C");if(w.chip)bits.push(w.chip);
    return `<button class="planner-gw ${+w.gw===+_plActiveGw?"active":""}" data-gw="${w.gw}"><b>GW${w.gw}</b><small>${bits.join(" · ")}</small></button>`;
  }).join("");
  const firstVisible=visible[0]?.gw||1,lastVisible=visible[visible.length-1]?.gw||38;
  $("plGwStrip").innerHTML=`<button class="planner-gw-nav" data-gw-nav="prev" ${start<=0?"disabled":""} aria-label="Show earlier Gameweeks" title="Show earlier Gameweeks">‹</button>${buttons}<div class="planner-gw-jump"><span>GW ${_plActiveGw} of 38</span><select id="plGwJump" aria-label="Jump to Gameweek">${weeks.map(w=>`<option value="${w.gw}" ${+w.gw===+_plActiveGw?"selected":""}>GW${w.gw}</option>`).join("")}</select></div><button class="planner-gw-nav" data-gw-nav="next" ${start>=maxStart?"disabled":""} aria-label="Show later Gameweeks" title="Show later Gameweeks">›</button>`;
}
function plRenderWorkspace(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!plan||!w)return;
  if($("plWorkspace"))$("plWorkspace").classList.toggle("planner-batch-active",_plBatchMode);
  const st=plDerive(plan,_plActiveGw),complete=plValidSquadState(st),fresh=plWeekIsFresh(w),currentValue=st.squad.reduce((s,id)=>s+(st.byId[id]?.now_cost||0),0);
  $("plGwHeading").textContent=`Gameweek ${_plActiveGw}`;$("plChip").value=w.chip||"";
  $("plChip").disabled=false;
  $("plResetGw").disabled=!(w.transfers?.length||w.captain||w.vice||w.chip||w.starters||fresh);if($("plClearSquad"))$("plClearSquad").disabled=!plan.baseSquad.length;if($("plFreshGw")){ $("plFreshGw").textContent=fresh?`Restart GW${_plActiveGw} independently`:`Start GW${_plActiveGw} independently`; $("plFreshGw").disabled=false; }
  const buildMode=plBuildMode(plan,w,st);if($("plAutoPick")){const remaining=Math.max(0,15-st.squad.length);$("plAutoPick").hidden=!buildMode;$("plAutoPick").textContent=st.squad.length?`✨ AutoPick ${remaining} remaining`:`✨ AutoPick squad`;$("plAutoPick").title=st.squad.length?"Keep your current picks and let AutoPick complete the legal squad":"Build a balanced legal squad from current public FPL data";}
  if($("plShare")){ $("plShare").disabled=!complete; $("plShare").textContent=`↗ Share GW${_plActiveGw}`; $("plShare").title=complete?`Share a read-only snapshot of GW${_plActiveGw}`:"Complete a valid 15-player squad before sharing"; }
  if($("plBatchTransfers")){const canBatch=!buildMode;$("plBatchTransfers").disabled=!canBatch;$("plBatchTransfers").classList.toggle("active",_plBatchMode);$("plBatchTransfers").textContent=_plBatchMode?"Cancel transfer edit":"Edit transfers";}
  $("plSummary").innerHTML=`
    <div><span>Squad</span><b>${st.squad.length}/15</b><small>${complete?(fresh?"Independent squad valid":"Squad valid"):(fresh?"Independent GW incomplete":"No valid squad yet")}</small></div>
    <div><span>Current value</span><b>${money(currentValue)}</b><small>Today's FPL prices</small></div>
    <div><span>Bank</span><b>${money(st.bank)}</b><small>Planner balance</small></div>
    <div><span>GW moves</span><b>${w.transfers?.length||0}</b><small>Planned only</small></div>
    <div><span>Captain</span><b>${w.captain&&st.byId[w.captain]?esc(st.byId[w.captain].web_name):"—"}</b><small>${w.vice&&st.byId[w.vice]?`Vice: ${esc(st.byId[w.vice].web_name)}`:"No vice selected"}</small></div>`;
  plRenderTransfers(st,w);plRenderSquad(st,w);plRenderPicker(st);
}
function plRenderTransfers(st,w){
  const box=$("plTransfers"),mode=$("plTransferMode");if(!box)return;
  const invalidForGw=st.invalid.filter(x=>+x.gw===+_plActiveGw);
  const rows=(w.transfers||[]).map(tr=>{
    const a=st.byId[tr.out]||{},b=st.byId[tr.in]||{},isInvalid=invalidForGw.some(x=>x.id===tr.id);
    return `<div class="planner-transfer ${isInvalid?"invalid":""}"><span>${esc(a.web_name||"Unknown")}</span><b>→</b><span>${esc(b.web_name||"Unknown")}</span><small>${money(tr.sellPrice||0)} → ${money(tr.buyPrice||0)}</small></div>`;
  }).join("");
  let batch="";
  if(_plBatchMode){
    const info=plBatchSummary(st),outs=_plBatchOut.map(id=>st.byId[+id]).filter(Boolean),ins=_plBatchIn.map(id=>st.byId[+id]).filter(Boolean),ready=info.outCount>0&&info.outCount===info.inCount&&plValidSquadState(info.temp);
    batch=`<div class="planner-batch-panel planner-batch-panel-focus">
      <div class="planner-batch-head"><div><span class="home-section-kicker">Transfer plan</span><b>${info.outCount?`${info.outCount} player${info.outCount===1?"":"s"} selected`:"Remove players from the pitch"}</b><small>${info.outCount?(info.slots?`Still need: ${esc(info.slots)}`:"All replacements selected — ready to confirm."):"Select one or more players, then choose their replacements."}</small></div><div class="planner-batch-budget"><span>Bank after</span><b>${money(info.temp.bank)}</b></div></div>
      <div class="planner-batch-focus-body">
        ${outs.length?`<div class="planner-batch-group"><span>OUT</span>${outs.map(e=>`<button data-pl-batch-remove-out="${e.id}" title="Undo transfer out: keep ${esc(e.web_name)}"><b>${esc(e.web_name)}</b><small>${POS[e.element_type]}</small><em>−</em></button>`).join("")}</div>`:""}
        ${ins.length?`<div class="planner-batch-group incoming"><span>IN</span>${ins.map(e=>`<button data-pl-batch-remove-in="${e.id}" title="Remove ${esc(e.web_name)} from incoming players"><b>${esc(e.web_name)}</b><small>${POS[e.element_type]}</small><em>−</em></button>`).join("")}</div>`:""}
      </div>
      <div class="planner-batch-actions"><button class="secondary-action" data-pl-batch-cancel>Cancel</button><button class="primary-action" data-pl-batch-confirm ${ready?"":"disabled"}>Confirm ${info.outCount||""} transfer${info.outCount===1?"":"s"}</button></div>
    </div>`;
  }
  if(mode){mode.innerHTML=batch;mode.style.display=batch?"block":"none";}
  const planned=rows?`<div class="planner-transfer-log-head"><div><span class="home-section-kicker">Gameweek changes</span><h3>${rows?`${w.transfers.length} planned transfer${w.transfers.length===1?"":"s"}`:"No planned transfers"}</h3></div><small>These moves carry into later Gameweeks unless you change them.</small></div>${rows}${invalidForGw.length?`<div class="planner-invalid-note">One or more moves no longer fit the plan. Reset this Gameweek to clear its planned changes.</div>`:""}`:"";
  box.innerHTML=planned;
  box.style.display=planned?"block":"none";
}
function plSwapCandidateValid(sourceId,targetId,st,w){
  sourceId=+sourceId;targetId=+targetId;if(!sourceId||!targetId||sourceId===targetId)return false;
  const xi=plCurrentXi(st,w),set=new Set(xi),sourceIn=set.has(sourceId),targetIn=set.has(targetId);
  if(sourceIn===targetIn)return false;
  const next=xi.map(pid=>pid===(sourceIn?sourceId:targetId)?(sourceIn?targetId:sourceId):pid);
  return plLineupValid(next,st);
}
function plPitchPlayer(e,st,w,{starter=false,baseIncomplete=false,bench=false}={}){
  const t=boot.teams.find(x=>x.id===e.team)||{},isOut=+_plOutId===e.id||(_plBatchMode&&plBatchOutSet().has(e.id)),isSwap=+_plSwapId===e.id,cap=+w.captain===e.id,vice=+w.vice===e.id;
  const fixture=plFixtureRunHtml(e,_plActiveGw,5,"pitch-run"),swapMode=!!_plSwapId,swapEligible=swapMode&&plSwapCandidateValid(_plSwapId,e.id,st,w);
  const swapIneligible=swapMode&&!isSwap&&!swapEligible;
  const title=baseIncomplete?`Remove ${e.web_name} from base squad`:_plBatchMode?`${isOut?"Keep":"Transfer out"} ${e.web_name}`:swapMode?(swapEligible?`Swap with ${e.web_name}`:`Not an eligible substitution`):`Open options for ${e.web_name}`;
  return `<div class="planner-pitch-player ${starter?"starter":""} ${bench?"bench":""} ${isOut?"selected-out":""} ${isSwap?"selected-swap":""} ${swapEligible?"swap-eligible":""} ${swapIneligible?"swap-ineligible":""}">
    ${_plBatchMode?`<button class="planner-transfer-remove" data-pl-player="${e.id}" aria-label="Remove ${esc(e.web_name)} from transfer draft" title="Remove ${esc(e.web_name)}">−</button>`:""}
    <button class="planner-pitch-main" data-pl-player="${e.id}" title="${esc(title)}">
      <span class="planner-pitch-kit">${teamKitImg(t,"planner-pitch-kit-img",`${e.web_name} ${t.name||"club"} kit`)}</span>
      <span class="planner-pitch-name">${esc(e.web_name)}</span>
      <span class="planner-pitch-meta">${baseIncomplete?money(e.now_cost):fixture}</span>
    </button>
    ${cap?`<span class="planner-role-badge captain" title="Captain">C</span>`:""}
    ${vice?`<span class="planner-role-badge vice" title="Vice captain">V</span>`:""}
    ${isOut?`<span class="planner-pitch-selected">${_plBatchMode?"OUT":"Transfer selected"}</span>`:""}
    ${isSwap?`<span class="planner-pitch-swap-label">Choose replacement</span>`:""}
  </div>`;
}
function plPitchEmpty(pos,index){
  return `<button class="planner-pitch-empty" data-pl-empty-pos="${pos}" title="Add ${POS[pos]}"><span>+</span><small>${POS[pos]}</small></button>`;
}
function plRenderSquad(st,w){
  const plan=plActive(),fresh=plWeekIsFresh(w),squad=st.squad.map(id=>st.byId[id]).filter(Boolean),baseIncomplete=plBuildMode(plan,w,st);
  const grouped={1:[],2:[],3:[],4:[]};squad.forEach(e=>grouped[e.element_type].push(e));Object.values(grouped).forEach(a=>a.sort((a,b)=>plPlayerScore(b)-plPlayerScore(a)));
  if(baseIncomplete){
    const rows=[1,2,3,4].map(pos=>{
      const players=grouped[pos];const empty=Math.max(0,PL_SQUAD[pos]-players.length);
      return `<div class="planner-pitch-row planner-pitch-row-${pos} planner-pitch-row-count-${PL_SQUAD[pos]}" data-row-count="${PL_SQUAD[pos]}">${players.map(e=>plPitchPlayer(e,st,w,{baseIncomplete:true})).join("")}${Array.from({length:empty},(_,i)=>plPitchEmpty(pos,i)).join("")}</div>`;
    }).join("");
    $("plSquad").innerHTML=`
      <div class="planner-pitch-topline"><div><span>${fresh?`Fresh GW${_plActiveGw} squad`:"Base squad"}</span><b>${squad.length}/15 selected</b></div><small>${fresh?"Independent Gameweek squad. You can leave earlier or later Gameweeks unfinished without blocking this one.":"Select a slot or use the player picker. Click a player to remove them."}</small></div>
      <div class="planner-fpl-pitch planner-fpl-pitch-build"><span class="planner-pitch-center-circle" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-top" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-bottom" aria-hidden="true"></span>${rows}</div>`;
    return;
  }
  const xiIds=plCurrentXi(st,w),xi=new Set(xiIds),batchMap=_plBatchMode?plBatchReplacementMap(st):new Map(),outSet=_plBatchMode?plBatchOutSet():new Set();
  const renderSlot=(id,{starter=false,bench=false}={})=>{
    const original=st.byId[+id];if(!original)return "";
    if(_plBatchMode&&outSet.has(+id)){
      const inId=batchMap.get(+id),incoming=inId&&st.byId[inId];
      return incoming?plPitchPlayer(incoming,st,w,{starter,bench}):plBatchSlot(original.element_type,id,st);
    }
    return plPitchPlayer(original,st,w,{starter,bench});
  };
  const xiByPos={1:[],2:[],3:[],4:[]};xiIds.forEach(id=>{const e=st.byId[id];if(e)xiByPos[e.element_type].push(id)});
  const formation=[xiByPos[2].length,xiByPos[3].length,xiByPos[4].length].join("-");
  const pitchRows=[1,2,3,4].map(pos=>`<div class="planner-pitch-row planner-pitch-row-${pos} planner-pitch-row-count-${xiByPos[pos].length}" data-row-count="${xiByPos[pos].length}">${xiByPos[pos].map(id=>renderSlot(id,{starter:true})).join("")}</div>`).join("");
  const benchIds=st.squad.filter(id=>!xi.has(id)).sort((a,b)=>(st.byId[a]?.element_type||0)-(st.byId[b]?.element_type||0)||plPlayerScore(st.byId[b])-plPlayerScore(st.byId[a]));
  const capName=w.captain&&st.byId[w.captain]?esc(st.byId[w.captain].web_name):"Not set",viceName=w.vice&&st.byId[w.vice]?esc(st.byId[w.vice].web_name):"Not set";
  $("plSquad").innerHTML=`
    <div class="planner-pitch-topline">
      <div><span>Starting XI</span><b>${formation}</b></div>
      <div class="planner-role-summary"><span><i>C</i><b>${capName}</b></span><span><i>V</i><b>${viceName}</b></span></div>
      <small>${_plBatchMode?"Transfer edit mode: click any player to remove them. Empty slots stay visible while you choose several replacements.":_plSwapId?"Substitution mode: choose a highlighted player on the other side of the bench line.":"Click a player to set captain or vice, substitute, or plan transfers."}</small>
    </div>
    <div class="planner-fpl-pitch ${_plSwapId?"swap-mode":""} ${_plBatchMode?"transfer-edit-mode":""}"><span class="planner-pitch-center-circle" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-top" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-bottom" aria-hidden="true"></span>${pitchRows}</div>
    <div class="planner-fpl-bench ${_plSwapId?"swap-mode":""} ${_plBatchMode?"transfer-edit-mode":""}"><div class="planner-bench-title"><span>Substitutes</span><small>${_plBatchMode?"Click a player to remove / click an empty slot to filter replacements":_plSwapId?"Choose a highlighted player":"Click a player for options"}</small></div><div class="planner-bench-row">${benchIds.map(id=>renderSlot(id,{bench:true})).join("")}</div></div>`;
}

function plRenderOutCard(st){
  const box=$("plOutCard"),e=st.byId[_plOutId];if(!box)return;
  if(_plBatchMode){const info=plBatchSummary(st);box.innerHTML=info.outCount?`<div class="planner-batch-picker-note"><b>${info.outCount} player${info.outCount===1?"":"s"} selected out</b><span>${info.slots?`Choose: ${esc(info.slots)}`:"All replacements selected — confirm the transfer plan."}</span></div>`:`<div class="planner-batch-picker-note"><b>Select players to transfer out</b><span>Remove players from the pitch or bench. Leave several slots empty, then choose replacements.</span></div>`;$("plCancelOut").style.display="none";$("plPickerKicker").textContent="Transfer edit";$("plPickerTitle").textContent=info.outCount?"Choose replacements":"Select players on the pitch";return;}
  if(!e){const plan=plActive(),w=plWeek(plan,_plActiveGw),st2=plDerive(plan,_plActiveGw),build=plBuildMode(plan,w,st2),fresh=plWeekIsFresh(w);box.innerHTML="";$("plCancelOut").style.display="none";$("plPickerKicker").textContent=build?"Player picker":"Player search";$("plPickerTitle").textContent=build?(fresh?`Build GW${_plActiveGw} from blank`:"Build your base squad"):"Browse available players";return;}
  const t=boot.teams.find(x=>x.id===e.team)||{};box.innerHTML=`<div class="planner-out-card">${teamKitImg(t,"planner-out-kit",`${e.web_name} kit`)}<span><small>Transfer out</small><b>${esc(e.web_name)}</b><em>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(st.sellPrices[e.id]??e.now_cost)}</em></span></div>`;
  $("plCancelOut").style.display="inline-block";$("plPickerKicker").textContent="Replacement";$("plPickerTitle").textContent=`Choose a ${POS[e.element_type]}`;
}
function plRenderPicker(st){
  plRenderOutCard(st);const plan=plActive(),w=plWeek(plan,_plActiveGw),baseIncomplete=plBuildMode(plan,w,st),byId=st.byId,out=byId[_plOutId];
  if(_plBatchMode&&_plBatchOut.length===0){
    $("plPlayerList").innerHTML=`<div class="planner-picker-idle"><span>−</span><b>Remove players from your squad</b><small>Click any player on the pitch or bench. You can leave several slots empty before choosing replacements.</small></div>`;return;
  }
  if(!baseIncomplete&&!out&&!_plBatchMode){
    $("plPlayerList").innerHTML=`<div class="planner-picker-idle"><span>↔</span><b>Select a player from your squad</b><small>Click a player on the pitch and choose <strong>Transfer out</strong>. Compatible replacements will appear here.</small></div>`;
    return;
  }
  let list=boot.elements.filter(e=>e.element_type>0);
  const missing=_plBatchMode?plBatchMissingByPos(st):null;
  if(_plBatchMode){
    list=list.filter(e=>missing[e.element_type]>0);
    if(_plPos&&missing[_plPos]>0)list=list.filter(e=>e.element_type===_plPos);
  }else if(out)list=list.filter(e=>e.element_type===out.element_type);else if(_plPos)list=list.filter(e=>e.element_type===_plPos);
  if(_plTeam)list=list.filter(e=>e.team===_plTeam);if(_plQuery)list=list.filter(e=>(e.web_name||"").toLowerCase().includes(_plQuery));
  list=list.filter(e=>!st.squad.includes(e.id)&&!_plBatchIn.includes(+e.id));
  const clubs=plClubCounts(st.squad,byId),pos=plPosCounts(st.squad,byId);
  plPickerSort(list);
  const rows=list.slice(0,100).map(e=>{
    const t=boot.teams.find(x=>x.id===e.team)||{};
    let afford=true,clubOk=true,posOk=true,disabled=false,why="";
    if(_plBatchMode){
      posOk=missing[e.element_type]>0;const temp=plBatchTempState(st),test=[...temp.squad,e.id],cc=plClubCounts(test,byId);clubOk=(cc[e.team]||0)<=PL_MAX_CLUB;afford=Number(temp.bank)>=Number(e.now_cost||0);disabled=!afford||!clubOk||!posOk;
      why=!afford?"Not enough projected bank":!clubOk?"Maximum 3 from this club":!posOk?"No replacement slot for this position":"";
    }else{
      const sell=out?Number(st.sellPrices[out.id]??out.now_cost):0;afford=out?st.bank+sell>=e.now_cost:st.bank>=e.now_cost;
      const clubAfter=(clubs[e.team]||0)+(out&&out.team===e.team?-1:0);clubOk=clubAfter<PL_MAX_CLUB;
      posOk=out?true:(pos[e.element_type]||0)<PL_SQUAD[e.element_type];disabled=!afford||!clubOk||!posOk;why=!afford?"Not enough bank":!clubOk?"Maximum 3 from this club":"Position is full";
    }
    const own=(parseFloat(e.selected_by_percent)||0).toFixed(1),ppg=(parseFloat(e.points_per_game)||0).toFixed(1),form=(parseFloat(e.form)||0).toFixed(1),pts=Number(e.total_points)||0;
    return `<button class="planner-pick-row ${disabled?"disabled":""}" data-pl-in="${e.id}" ${disabled?"disabled":""} title="${disabled?esc(why):_plBatchMode?"Add to multi-transfer plan":"Add to plan"}">
      ${teamKitImg(t,"planner-list-kit",`${e.web_name} kit`)}
      <span class="planner-pick-main"><span class="planner-pick-name"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]}</small></span>${plFixtureRunHtml(e,_plActiveGw,5,"picker-run")}</span>
      <span class="planner-pick-metrics"><b>${money(e.now_cost)}</b><small>${pts} pts · ${ppg} PPG</small><small>${own}% own · form ${form}</small></span><span class="planner-pick-add">+</span>
    </button>`;
  }).join("");
  $("plPlayerList").innerHTML=rows||`<div class="planner-no-results">${_plBatchMode&&Object.values(missing).every(n=>n===0)?"All replacements selected. Confirm the transfer plan.":"No players match these filters."}</div>`;
}
function plEnsureActionSheet(){
  let sheet=document.getElementById("plPlayerActions");if(sheet)return sheet;
  document.body.insertAdjacentHTML("beforeend",`<div id="plPlayerActions" class="planner-action-layer" hidden>
    <button class="planner-action-backdrop" data-pl-action-close aria-label="Close player options"></button>
    <section class="planner-action-sheet" role="dialog" aria-modal="true" aria-labelledby="plActionName">
      <button class="planner-action-close" data-pl-action-close aria-label="Close">×</button>
      <div id="plActionHeader"></div>
      <div id="plActionButtons" class="planner-action-buttons"></div>
    </section>
  </div>`);
  sheet=document.getElementById("plPlayerActions");
  sheet.addEventListener("click",e=>{
    if(e.target.closest("[data-pl-action-close]")){plClosePlayerActions();return}
    const b=e.target.closest("[data-pl-action]");if(b)plHandlePlayerAction(b.dataset.plAction);
  });
  return sheet;
}
function plOpenPlayerActions(id){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw),e=st.byId[+id];if(!e)return;
  if(plBuildMode(plan,w,st)){plSetOut(id);return}
  _plActionId=+id;const xi=new Set(plCurrentXi(st,w)),inXi=xi.has(e.id),t=boot.teams.find(x=>x.id===e.team)||{};
  const sheet=plEnsureActionSheet(),header=sheet.querySelector("#plActionHeader"),buttons=sheet.querySelector("#plActionButtons");
  header.innerHTML=`<div class="planner-action-player">${teamKitImg(t,"planner-action-kit",`${e.web_name} kit`)}<div><span>${esc(t.name||t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</span><h3 id="plActionName">${esc(e.web_name)}</h3><div class="planner-action-fixture">${plFixtureRunHtml(e,_plActiveGw,5,"action-run")}</div></div></div>`;
  const opts=[];
  if(inXi){
    opts.push(`<button data-pl-action="captain"><i>C</i><span><b>${+w.captain===e.id?"Remove captain":"Make captain"}</b><small>${+w.captain===e.id?"Clear the captain role":"Set as captain for this planned gameweek"}</small></span></button>`);
    opts.push(`<button data-pl-action="vice"><i>V</i><span><b>${+w.vice===e.id?"Remove vice-captain":"Make vice-captain"}</b><small>${+w.vice===e.id?"Clear the vice-captain role":"Set as vice-captain for this planned gameweek"}</small></span></button>`);
  }
  opts.push(`<button data-pl-action="sub"><i>⇅</i><span><b>${inXi?"Substitute":"Substitute into XI"}</b><small>${inXi?"Choose a bench player to swap with":"Choose a starter to swap with"}</small></span></button>`);
  opts.push(`<button data-pl-action="transfer" class="transfer"><i>↔</i><span><b>Transfer out</b><small>Choose a replacement from the player list</small></span></button>`);
  buttons.innerHTML=opts.join("");sheet.hidden=false;document.body.classList.add("planner-action-open");
}
function plClosePlayerActions(){const sheet=document.getElementById("plPlayerActions");if(sheet)sheet.hidden=true;document.body.classList.remove("planner-action-open");_plActionId=null}
function plHandlePlayerAction(action){
  const id=+_plActionId;if(!id)return;const plan=plActive(),w=plWeek(plan,_plActiveGw);
  if(action==="captain"){const next=+w.captain===id?null:id;plClosePlayerActions();return plSetCaptain(next,"cap")}
  if(action==="vice"){const next=+w.vice===id?null:id;plClosePlayerActions();return plSetCaptain(next,"vice")}
  if(action==="sub"){plClosePlayerActions();return plSubstitute(id)}
  if(action==="transfer"){plClosePlayerActions();if(!_plBatchMode){_plBatchMode=true;_plBatchOut=[];_plBatchIn=[]}_plOutId=null;_plSwapId=null;plBatchToggleOut(id);return}
}
function plHandlePitchPlayer(id){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=+id;if(!st.byId[id])return;
  if(plBuildMode(plan,w,st))return plSetOut(id);
  if(_plBatchMode){if(_plBatchIn.includes(id))return plBatchRemoveIn(id);return plBatchToggleOut(id);}
  if(_plSwapId){
    if(id===+_plSwapId)return plSubstitute(id);
    if(plSwapCandidateValid(_plSwapId,id,st,w))return plSubstitute(id);
    const xi=new Set(plCurrentXi(st,w)),sourceIn=xi.has(+_plSwapId);return toast(sourceIn?"Choose a highlighted substitute":"Choose a highlighted starting player");
  }
  plOpenPlayerActions(id);
}

function plToggleBatchMode(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!plan||!w)return;const st=plDerive(plan,_plActiveGw);
  if(plBuildMode(plan,w,st))return toast("Finish the squad before planning transfers");
  if(_plBatchMode){plResetBatch();plRenderAll();return}
  _plBatchMode=true;_plBatchOut=[];_plBatchIn=[];_plOutId=null;_plSwapId=null;_plActionId=null;plClosePlayerActions();plRenderAll();toast("Transfer edit mode: remove as many players as you want, then fill the empty slots");
}
function plBatchToggleOut(id){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=+id;if(!_plBatchMode||!st.squad.includes(id))return;
  const idx=_plBatchOut.indexOf(id);
  if(idx>=0){
    const pos=st.byId[id]?.element_type;_plBatchOut.splice(idx,1);
    const inIdx=_plBatchIn.findIndex(pid=>st.byId[+pid]?.element_type===pos);if(inIdx>=0)_plBatchIn.splice(inIdx,1);
  }else _plBatchOut.push(id);
  _plPos=0;if($("plannerPos"))$("plannerPos").value="0";plRenderWorkspace();
}
function plBatchRemoveOut(id){id=+id;if(!_plBatchMode)return;const plan=plActive(),st=plDerive(plan,_plActiveGw),idx=_plBatchOut.indexOf(id);if(idx<0)return;const pos=st.byId[id]?.element_type;_plBatchOut.splice(idx,1);const inIdx=_plBatchIn.findIndex(pid=>st.byId[+pid]?.element_type===pos);if(inIdx>=0)_plBatchIn.splice(inIdx,1);plRenderWorkspace()}
function plBatchRemoveIn(id){id=+id;if(!_plBatchMode)return;_plBatchIn=_plBatchIn.filter(x=>+x!==id);plRenderWorkspace()}
function plBatchAddIn(id){
  const plan=plActive(),st=plDerive(plan,_plActiveGw),incoming=st.byId[+id];if(!_plBatchMode||!incoming)return;
  if(!plBatchCanAdd(incoming,st))return toast("That player does not fit the remaining transfer slots, club limit or budget");
  _plBatchIn.push(incoming.id);plRenderWorkspace();
}
async function plBatchConfirm(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);if(!_plBatchMode||!plan||!w)return;
  const info=plBatchSummary(st);if(!info.outCount)return toast("Select at least one player to transfer out");
  if(info.outCount!==info.inCount)return toast(`Choose ${info.outCount-info.inCount} more replacement${info.outCount-info.inCount===1?"":"s"}`);
  if(!plValidSquadState(info.temp))return toast("The planned squad is not valid yet");
  const transfers=plBatchFindTransfers(st);if(!transfers)return toast("These transfers cannot be ordered within the current budget and 3-per-club limit. Adjust one of the replacements.");
  const count=transfers.length;
  const preview=transfers.slice(0,3).map(tr=>`${st.byId[tr.out]?.web_name||"Player"} → ${st.byId[tr.in]?.web_name||"Player"}`).join("; ");
  const extra=count>3?` Plus ${count-3} more.`:"";
  const message=count===1?`${preview}. Bank after transfer: ${money(info.temp.bank)}. Add this planned transfer to GW${_plActiveGw}?`:`${preview}.${extra} Bank after transfers: ${money(info.temp.bank)}. Add these ${count} planned transfers to GW${_plActiveGw}?`;
  if(!await fplConfirm(message,{title:`Confirm ${count} transfer${count===1?"":"s"}?`,confirmText:`Confirm ${count} transfer${count===1?"":"s"}`}))return;
  const map=new Map(transfers.map(tr=>[tr.out,tr.in]));w.transfers.push(...transfers);
  if(Array.isArray(w.starters))w.starters=w.starters.map(id=>map.get(+id)||id);
  if(w.captain&&map.has(+w.captain))w.captain=null;if(w.vice&&map.has(+w.vice))w.vice=null;
  plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plTouch(plan);plRenderAll();toast(`${count} transfer${count===1?"":"s"} planned for GW${_plActiveGw}`);
}

function plSetOut(id){
  const plan=plActive(),st=plDerive(plan,_plActiveGw),e=st.byId[+id];if(!e)return;
  const w=plWeek(plan,_plActiveGw);
  if(plBuildMode(plan,w,st)){
    if(plWeekIsFresh(w)){w.freshSquad=w.freshSquad.filter(x=>+x!==+id)}
    else{plan.baseSquad=plan.baseSquad.filter(x=>+x!==+id);delete plan.baseSellPrices[id];plan.baseBank=PL_BUDGET-plan.baseSquad.reduce((s,pid)=>s+(st.byId[pid]?.now_cost||0),0)}
    plTouch(plan);plRenderWorkspace();return;
  }
  _plOutId=+id;_plPos=e.element_type;_plTeam=0;_plQuery="";$("plannerPos").value=String(_plPos);$("plannerTeam").value="0";$("plannerSearch").value="";plRenderSquad(st,plWeek(plan,_plActiveGw));plRenderPicker(st);
}
function plAddOrTransfer(id){
  const plan=plActive(),st=plDerive(plan,_plActiveGw),incoming=st.byId[+id];if(!incoming)return;
  const w=plWeek(plan,_plActiveGw);
  if(_plBatchMode)return plBatchAddIn(id);
  if(plBuildMode(plan,w,st)){
    const target=plWeekIsFresh(w)?w.freshSquad:plan.baseSquad,pc=plPosCounts(target,st.byId),cc=plClubCounts(target,st.byId);
    const bank=plWeekIsFresh(w)?st.bank:plan.baseBank;if(target.length>=15)return toast("Squad is full");if(pc[incoming.element_type]>=PL_SQUAD[incoming.element_type])return toast(`${POS[incoming.element_type]} slots are full`);if((cc[incoming.team]||0)>=PL_MAX_CLUB)return toast("Maximum 3 players from one club");if(bank<incoming.now_cost)return toast("Not enough budget");
    target.push(incoming.id);if(!plWeekIsFresh(w)){plan.baseBank-=incoming.now_cost;plan.baseSellPrices[incoming.id]=incoming.now_cost}plTouch(plan);plRenderWorkspace();return;
  }
  if(!_plOutId)return toast("Choose a player in your squad to transfer out first");const out=st.byId[_plOutId];if(!out||out.element_type!==incoming.element_type)return toast("Replacement must be the same position");
  const sell=Number(st.sellPrices[out.id]??out.now_cost),buy=Number(incoming.now_cost);if(st.bank+sell-buy<0)return toast("Not enough money in the bank");const test=st.squad.map(x=>x===out.id?incoming.id:x),cc=plClubCounts(test,st.byId);if((cc[incoming.team]||0)>PL_MAX_CLUB)return toast("Maximum 3 players from one club");
  w.transfers.push({id:plUuid(),out:out.id,in:incoming.id,sellPrice:sell,buyPrice:buy});if(Array.isArray(w.starters)&&w.starters.includes(out.id))w.starters=w.starters.map(x=>x===out.id?incoming.id:x);if(w.captain===out.id)w.captain=null;if(w.vice===out.id)w.vice=null;_plOutId=null;_plSwapId=null;_plActionId=null;plTouch(plan);plRenderAll();
}
function plSetCaptain(id,type){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=id?+id:null;const xi=new Set(plCurrentXi(st,w));
  if(id&&!xi.has(id))return toast("Captain and vice captain must be in the starting XI");
  if(type==="cap"){w.captain=id;if(w.captain&&w.captain===w.vice)w.vice=null}else{w.vice=id;if(w.vice&&w.vice===w.captain)w.captain=null}plTouch(plan);plRenderAll();
}
function plSubstitute(id){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=+id;if(!st.squad.includes(id)||!plValidSquadState(st))return;
  if(!_plSwapId){_plSwapId=id;plRenderSquad(st,w);return}
  if(+_plSwapId===id){_plSwapId=null;plRenderSquad(st,w);return}
  const xi=plCurrentXi(st,w),set=new Set(xi),aIn=set.has(+_plSwapId),bIn=set.has(id);
  if(aIn===bIn)return toast(aIn?"Choose a player from the bench":"Choose a player from the starting XI");
  const next=xi.map(pid=>pid===(aIn?+_plSwapId:id)?(aIn?id:+_plSwapId):pid);
  if(!plLineupValid(next,st))return toast("That substitution would create an invalid FPL formation");
  w.starters=next;if(w.captain&&!next.includes(+w.captain))w.captain=null;if(w.vice&&!next.includes(+w.vice))w.vice=null;_plSwapId=null;plTouch(plan);plRenderAll();
}
async function plClearSquad(){
  const plan=plActive();if(!plan||!plan.baseSquad.length)return;if(!await fplConfirm("Clear the base squad and every planned Gameweek in this plan? This cannot be undone.",{title:"Clear all Gameweeks?",confirmText:"Clear all",danger:true}))return;
  plan.baseSquad=[];plan.baseBank=PL_BUDGET;plan.baseSellPrices={};plan.weeks=plMakeWeeks(plan.baseGw);plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;_plActiveGw=plan.baseGw;_plGwWindowStart=null;plTouch(plan);plRenderAll();
}
async function plResetGw(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!w)return;
  const hasChanges=!!(w.transfers?.length||w.captain||w.vice||w.chip||w.starters||plWeekIsFresh(w));
  if(!hasChanges)return;
  if(!await fplConfirm(`Clear only the planned changes for GW${_plActiveGw}?${plWeekIsFresh(w)?" This will also return the Gameweek to the squad flowing in from the previous GW.":""}`,{title:`Clear GW${_plActiveGw} changes?`,confirmText:"Clear changes"}))return;
  w.transfers=[];w.captain=null;w.vice=null;w.chip="";w.starters=null;w.freshSquad=null;w.independent=false;plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plTouch(plan);plRenderAll();
}
async function plStartFreshGw(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!plan||!w)return;
  if(!await fplConfirm(`Start GW${_plActiveGw} independently with a completely blank squad? Earlier and later Gameweeks will stay exactly as they are.`,{title:`Start GW${_plActiveGw} independently?`,confirmText:"Start independently"}))return;
  w.transfers=[];w.captain=null;w.vice=null;w.chip="";w.starters=null;w.freshSquad=[];w.independent=true;
  plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;_plQuery="";_plPos=0;_plTeam=0;
  if($("plannerSearch"))$("plannerSearch").value="";if($("plannerPos"))$("plannerPos").value="0";if($("plannerTeam"))$("plannerTeam").value="0";
  plTouch(plan);plRenderAll();toast(`GW${_plActiveGw} is now independent and ready to build`);
}
async function plImportFpl(){
  const tid=String($("plTeamId").value||"").trim();if(!tid)return toast("Enter your FPL Team ID");$("plImportTeam").disabled=true;$("plImportTeam").textContent="Importing…";$("plImportHint").textContent="";
  try{
    const [entry,pub]=await Promise.all([get(`/entry/${tid}/`),latestPublicPicks(tid)]);if(!pub)throw new Error("FPL has not exposed a public squad for this team yet.");
    const ids=pub.data.picks.map(p=>Number(p.element)),sell={};pub.data.picks.forEach(p=>sell[p.element]=Number(p.selling_price||boot.elements.find(e=>e.id===p.element)?.now_cost||0));const bank=Number(pub.data.entry_history?.bank||0);
    plNewPlan({name:`${entry.name||"My team"} plan`,baseSquad:ids,baseBank:bank,source:`Imported from GW${pub.gw}`,sourceTeamId:tid,sellPrices:sell});
  }catch(e){$("plImportHint").textContent=e.message||"Could not import this team."}finally{$("plImportTeam").disabled=false;$("plImportTeam").textContent="Import"}
}
function plImportBuilder(){
  let draft=null;try{draft=JSON.parse(localStorage.getItem("fpl_draft")||"null")}catch{};const ids=(draft?.picks||[]).map(Number);if(ids.length!==15)return toast("Complete a 15-player Team Builder draft first");const byId=plById(),cost=ids.reduce((s,id)=>s+(byId[id]?.now_cost||0),0),sell={};ids.forEach(id=>sell[id]=byId[id]?.now_cost||0);plNewPlan({name:"Builder plan",baseSquad:ids,baseBank:PL_BUDGET-cost,source:"Team Builder draft",sellPrices:sell});
}
function plCreateBlank(){plNewPlan({name:"Blank plan",baseSquad:[],baseBank:PL_BUDGET,source:"Started from scratch"})}
async function plNewDialog(){
  const name=await fplPrompt("Plan name","New plan",{message:"Give this Planner draft a name."});if(name===null)return;plNewPlan({name:name.trim()||"New plan",baseSquad:[],baseBank:PL_BUDGET,source:"Started from scratch"});
}
function plDuplicate(){const p=plActive();if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=plUuid();c.name=`${p.name} copy`;c.createdAt=c.updatedAt=new Date().toISOString();_plPlans.unshift(c);_plActiveId=c.id;_plActiveGw=c.baseGw;_plGwWindowStart=null;plResetBatch();plWrite(_plPlans);document.dispatchEvent(new CustomEvent("fplpeek:plan-saved",{detail:{plan:c}}));plRenderAll()}
async function plRename(){const p=plActive();if(!p)return;const n=await fplPrompt("Rename plan",p.name,{message:"Choose a new name for this Planner draft."});if(n===null||!n.trim())return;p.name=n.trim();plTouch(p);plRenderAll()}
async function plDelete(){const p=plActive();if(!p||!await fplConfirm(`Delete “${p.name}”?`,{title:"Delete plan?",confirmText:"Delete",danger:true}))return;_plPlans=_plPlans.filter(x=>x.id!==p.id);plResetBatch();plWrite(_plPlans);document.dispatchEvent(new CustomEvent("fplpeek:plan-deleted",{detail:{id:p.id}}));_plActiveId=_plPlans[0]?.id||null;_plActiveGw=plActive()?.baseGw||null;_plGwWindowStart=null;plRenderAll()}

async function initPlanner(){
  if(_plInit){plRenderAll();return}_plInit=true;await loadBoot();_plFixtures=await get(`/fixtures/`);_plPlans=plRead().map(plNormalize).filter(Boolean);_plActiveId=_plPlans[0]?.id||null;_plActiveGw=plActive()?.baseGw||plStartGw();_plGwWindowStart=null;
  const st=savedTeam();if(st?.id)$("plTeamId").value=st.id;boot.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;$("plannerTeam").appendChild(o)});
  $("plPlanSelect").addEventListener("change",e=>{_plActiveId=e.target.value||null;_plActiveGw=plActive()?.baseGw||null;_plGwWindowStart=null;plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plClosePlayerActions();plRenderAll()});
  $("plNew").addEventListener("click",plNewDialog);$("plDuplicate").addEventListener("click",plDuplicate);$("plRename").addEventListener("click",plRename);$("plDelete").addEventListener("click",plDelete);
  $("plImportTeam").addEventListener("click",plImportFpl);$("plTeamId").addEventListener("keydown",e=>{if(e.key==="Enter")plImportFpl()});$("plImportBuilder").addEventListener("click",plImportBuilder);$("plBlank").addEventListener("click",plCreateBlank);$("plAutoStart")?.addEventListener("click",plCreateAutoPick);
  $("plGwStrip").addEventListener("click",e=>{const nav=e.target.closest("[data-gw-nav]");if(nav){const plan=plActive(),weeks=plan?.weeks||[],windowSize=7,maxStart=Math.max(0,weeks.length-windowSize);if(_plGwWindowStart==null)_plGwWindowStart=plGwWindowForActive(weeks,windowSize);_plGwWindowStart=Math.max(0,Math.min(maxStart,_plGwWindowStart+(nav.dataset.gwNav==="next"?1:-1)));plRenderGwStrip();return}const b=e.target.closest("[data-gw]");if(!b)return;_plActiveGw=+b.dataset.gw;plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plClosePlayerActions();plRenderAll()});
  $("plGwStrip").addEventListener("change",e=>{if(e.target.id!=="plGwJump")return;_plActiveGw=+e.target.value;const plan=plActive();_plGwWindowStart=plGwWindowForActive(plan?.weeks||[],7);plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plClosePlayerActions();plRenderAll()});
  $("plChip").addEventListener("change",e=>{const p=plActive(),w=plWeek(p,_plActiveGw);w.chip=e.target.value;plTouch(p);plRenderGwStrip();plRenderWorkspace()});$("plResetGw").addEventListener("click",plResetGw);$("plBatchTransfers")?.addEventListener("click",plToggleBatchMode);$("plShare")?.addEventListener("click",plOpenShareDialog);$("plFreshGw")?.addEventListener("click",plStartFreshGw);$("plAutoPick")?.addEventListener("click",()=>plAutoPickSquad());$("plClearSquad")?.addEventListener("click",plClearSquad);
  $("plannerSearch").addEventListener("input",e=>{_plQuery=e.target.value.toLowerCase();plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plannerPos").addEventListener("change",e=>{_plPos=+e.target.value;plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plannerTeam").addEventListener("change",e=>{_plTeam=+e.target.value;plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plannerSort")?.addEventListener("change",e=>{_plSort=e.target.value||"suggested";plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plCancelOut").addEventListener("click",()=>{_plOutId=null;_plActionId=null;const st=plDerive(plActive(),_plActiveGw);plRenderSquad(st,plWeek(plActive(),_plActiveGw));plRenderPicker(st)});
  $("plSquad").addEventListener("click",e=>{const jump=e.target.closest("[data-gw]");if(jump){_plActiveGw=+jump.dataset.gw;plResetBatch();_plOutId=null;_plSwapId=null;_plActionId=null;plClosePlayerActions();plRenderAll();return}const batchEmpty=e.target.closest("[data-pl-batch-empty-pos]");if(batchEmpty){_plPos=+batchEmpty.dataset.plBatchEmptyPos;$("plannerPos").value=String(_plPos);plRenderPicker(plDerive(plActive(),_plActiveGw));$("plannerSearch")?.focus();return}const empty=e.target.closest("[data-pl-empty-pos]");if(empty){_plPos=+empty.dataset.plEmptyPos;$("plannerPos").value=String(_plPos);plRenderPicker(plDerive(plActive(),_plActiveGw));$("plannerSearch")?.focus();return}const player=e.target.closest("[data-pl-player]");if(player)return plHandlePitchPlayer(player.dataset.plPlayer)});
  $("plPlayerList").addEventListener("click",e=>{const b=e.target.closest("[data-pl-in]");if(b&&!b.disabled)plAddOrTransfer(b.dataset.plIn)});
  $("plSharedView")?.addEventListener("click",e=>{if(e.target.closest("[data-pl-share-exit]"))return plExitSharedSnapshot();if(e.target.closest("[data-pl-share-copy-plan]")&&_plSharedSnapshot)return plCopySharedToPlanner(_plSharedSnapshot)});
  const plTransferClick=e=>{const out=e.target.closest("[data-pl-batch-remove-out]");if(out)return plBatchRemoveOut(out.dataset.plBatchRemoveOut);const inn=e.target.closest("[data-pl-batch-remove-in]");if(inn)return plBatchRemoveIn(inn.dataset.plBatchRemoveIn);if(e.target.closest("[data-pl-batch-cancel]")){plResetBatch();return plRenderAll()}if(e.target.closest("[data-pl-batch-confirm]"))return plBatchConfirm();};
  $("plTransfers").addEventListener("click",plTransferClick);$("plTransferMode").addEventListener("click",plTransferClick);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){const sd=document.getElementById("plShareDialog");if(sd&&!sd.hidden)plCloseShareDialog();else if(_plActionId)plClosePlayerActions();else if(_plSwapId){_plSwapId=null;const p=plActive();if(p)plRenderSquad(plDerive(p,_plActiveGw),plWeek(p,_plActiveGw));}}});
  document.addEventListener("fplpeek:account-state",plRenderSync);const shared=plShareDecode(new URLSearchParams(location.search).get("share"));if(shared){_plSharedSnapshot=shared;plRenderPlanSelect();plRenderSync();plRenderSharedSnapshot(shared)}else plRenderAll();
}

// Called by account.js after sign-in to merge server plans into the local-first store.
window.FPLPlannerCloudMerge=function(cloudPlans){
  const local=plRead().map(plNormalize).filter(Boolean),m=new Map(local.map(p=>[p.id,p]));
  (cloudPlans||[]).map(plNormalize).filter(Boolean).forEach(cp=>{const lp=m.get(cp.id);if(!lp||new Date(cp.updatedAt||0)>new Date(lp.updatedAt||0))m.set(cp.id,cp)});
  _plPlans=[...m.values()].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));plWrite(_plPlans);if(!_plActiveId&&_plPlans[0]){_plActiveId=_plPlans[0].id;_plActiveGw=_plPlans[0].baseGw;_plGwWindowStart=null}if(_plInit)plRenderAll();return _plPlans;
};
window.FPLPlannerGetPlans=()=>plRead();
