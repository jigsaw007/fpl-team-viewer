/* ============ GAMEWEEK PLANNER ============
   Local-first planning sandbox. It never writes to a user's FPL account.
   Cloud sync is optional and handled by account.js when Supabase is configured. */
const PLANS_KEY="fplpeek_plans_v1";
const PL_BUDGET=1000;
const PL_SQUAD={1:2,2:5,3:5,4:3};
const PL_MAX_CLUB=3;
let _plInit=false,_plPlans=[],_plActiveId=null,_plActiveGw=null,_plFixtures=[],_plOutId=null,_plSwapId=null,_plQuery="",_plPos=0,_plTeam=0;

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
  const out=[]; for(let gw=start;gw<=38&&out.length<8;gw++) out.push({gw,transfers:[],captain:null,vice:null,chip:"",starters:null});
  return out;
}
function plNewPlan({name="New plan",baseSquad=[],baseBank=PL_BUDGET,source="Blank squad",sourceTeamId=null,sellPrices={}}={}){
  const start=plStartGw();
  const plan={
    id:plUuid(),name,source,sourceTeamId:sourceTeamId?String(sourceTeamId):null,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),baseGw:start,
    baseSquad:[...baseSquad],baseBank:Number(baseBank)||0,baseSellPrices:{...sellPrices},weeks:plMakeWeeks(start)
  };
  _plPlans.unshift(plan);_plActiveId=plan.id;_plActiveGw=start;plWrite(_plPlans);
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
    x.gw=w.gw;x.transfers=Array.isArray(x.transfers)?x.transfers:[];x.captain=x.captain?Number(x.captain):null;x.vice=x.vice?Number(x.vice):null;x.chip=x.chip||"";x.starters=Array.isArray(x.starters)?x.starters.map(Number):null;
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
function plPlayerScore(e){return (parseFloat(e.form)||0)*2+(Number(e.total_points)||0)/10+(Number(e.minutes)||0)/1000}
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
  plRenderPlanSelect();plRenderSync();const plan=plActive();
  $("plEmpty").style.display=plan?"none":"block";$("plWorkspace").style.display=plan?"block":"none";
  if(!plan)return;
  if(!plWeek(plan,_plActiveGw))_plActiveGw=plan.baseGw;
  $("plTitle").textContent=plan.name||"Plan";$("plSource").textContent=plan.source||"Local plan";
  $("plMeta").textContent=`${plan.baseSquad.length}/15 base squad · saved automatically${window.FPLPeekCloud?.isSignedIn?.()?" and synced":" on this device"}.`;
  plRenderGwStrip();plRenderWorkspace();
}
function plRenderGwStrip(){
  const plan=plActive();if(!plan)return;
  $("plGwStrip").innerHTML=plan.weeks.map(w=>{
    const bits=[];if(w.transfers?.length)bits.push(`${w.transfers.length} move${w.transfers.length>1?"s":""}`);if(w.captain)bits.push("C");if(w.chip)bits.push(w.chip);
    return `<button class="planner-gw ${+w.gw===+_plActiveGw?"active":""}" data-gw="${w.gw}"><b>GW${w.gw}</b><small>${bits.join(" · ")||"No changes"}</small></button>`;
  }).join("");
}
function plRenderWorkspace(){
  const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!plan||!w)return;
  const st=plDerive(plan,_plActiveGw),complete=plValidBase(plan),currentValue=st.squad.reduce((s,id)=>s+(st.byId[id]?.now_cost||0),0);
  $("plGwHeading").textContent=`Gameweek ${_plActiveGw}`;$("plChip").value=w.chip||"";
  $("plResetGw").disabled=!(w.transfers?.length||w.captain||w.vice||w.chip||w.starters);if($("plClearSquad"))$("plClearSquad").disabled=!plan.baseSquad.length;
  $("plSummary").innerHTML=`
    <div><span>Squad</span><b>${st.squad.length}/15</b><small>${complete?"Base squad valid":"Finish your base squad"}</small></div>
    <div><span>Current value</span><b>${money(currentValue)}</b><small>Today's FPL prices</small></div>
    <div><span>Bank</span><b>${money(st.bank)}</b><small>Planner balance</small></div>
    <div><span>GW moves</span><b>${w.transfers?.length||0}</b><small>Planned only</small></div>
    <div><span>Captain</span><b>${w.captain&&st.byId[w.captain]?esc(st.byId[w.captain].web_name):"—"}</b><small>${w.vice&&st.byId[w.vice]?`Vice: ${esc(st.byId[w.vice].web_name)}`:"No vice selected"}</small></div>`;
  plRenderTransfers(st,w);plRenderSquad(st,w);plRenderPicker(st);
}
function plRenderTransfers(st,w){
  const box=$("plTransfers");if(!box)return;
  const invalidForGw=st.invalid.filter(x=>+x.gw===+_plActiveGw);
  const rows=(w.transfers||[]).map(tr=>{
    const a=st.byId[tr.out]||{},b=st.byId[tr.in]||{},isInvalid=invalidForGw.some(x=>x.id===tr.id);
    return `<div class="planner-transfer ${isInvalid?"invalid":""}"><span>${esc(a.web_name||"Unknown")}</span><b>→</b><span>${esc(b.web_name||"Unknown")}</span><small>${money(tr.sellPrice||0)} → ${money(tr.buyPrice||0)}</small><button data-pl-remove-transfer="${tr.id}" aria-label="Remove transfer">×</button></div>`;
  }).join("");
  box.innerHTML=rows?`<div class="planner-transfer-head"><span>Planned transfers</span><small>Changes flow into later gameweeks</small></div>${rows}${invalidForGw.length?`<div class="planner-invalid-note">One or more moves no longer fit the plan. Remove them or reset this gameweek.</div>`:""}`:"";
}
function plPitchPlayer(e,st,w,{starter=false,baseIncomplete=false,bench=false}={}){
  const t=boot.teams.find(x=>x.id===e.team)||{},isOut=+_plOutId===e.id,isSwap=+_plSwapId===e.id,cap=+w.captain===e.id,vice=+w.vice===e.id;
  const fixture=plFixtureHtml(e,_plActiveGw);
  const action=baseIncomplete?"Remove from base squad":"Plan transfer";
  return `<div class="planner-pitch-player ${starter?"starter":""} ${bench?"bench":""} ${isOut?"selected-out":""} ${isSwap?"selected-swap":""}">
    <button class="planner-pitch-main" data-pl-out="${e.id}" title="${action}: ${esc(e.web_name)}">
      <span class="planner-pitch-kit">${teamKitImg(t,"planner-pitch-kit-img",`${e.web_name} ${t.name||"club"} kit`)}</span>
      <span class="planner-pitch-name">${esc(e.web_name)}</span>
      <span class="planner-pitch-meta">${baseIncomplete?money(e.now_cost):fixture}</span>
    </button>
    ${!baseIncomplete?`<button class="planner-sub-btn ${isSwap?"active":""}" data-pl-sub="${e.id}" title="${isSwap?"Cancel substitution selection":bench?"Substitute into starting XI":"Swap with a bench player"}" aria-label="Substitute ${esc(e.web_name)}">⇅</button>`:""}
    ${cap?`<span class="planner-role-badge captain" title="Captain">C</span>`:""}
    ${vice?`<span class="planner-role-badge vice" title="Vice captain">V</span>`:""}
    ${isOut?`<span class="planner-pitch-selected">Transfer out</span>`:""}
    ${isSwap?`<span class="planner-pitch-swap-label">Select swap</span>`:""}
  </div>`;
}
function plPitchEmpty(pos,index){
  return `<button class="planner-pitch-empty" data-pl-empty-pos="${pos}" title="Add ${POS[pos]}"><span>+</span><small>${POS[pos]}</small></button>`;
}
function plRenderSquad(st,w){
  const squad=st.squad.map(id=>st.byId[id]).filter(Boolean),baseIncomplete=!plValidBase(plActive());
  const grouped={1:[],2:[],3:[],4:[]};squad.forEach(e=>grouped[e.element_type].push(e));Object.values(grouped).forEach(a=>a.sort((a,b)=>plPlayerScore(b)-plPlayerScore(a)));
  if(baseIncomplete){
    const rows=[1,2,3,4].map(pos=>{
      const players=grouped[pos];const empty=Math.max(0,PL_SQUAD[pos]-players.length);
      return `<div class="planner-pitch-row planner-pitch-row-${pos}">${players.map(e=>plPitchPlayer(e,st,w,{baseIncomplete:true})).join("")}${Array.from({length:empty},(_,i)=>plPitchEmpty(pos,i)).join("")}</div>`;
    }).join("");
    $("plSquad").innerHTML=`
      <div class="planner-pitch-topline"><div><span>Base squad</span><b>${squad.length}/15 selected</b></div><small>Select a slot or use the player picker. Click a player to remove them.</small></div>
      <div class="planner-fpl-pitch planner-fpl-pitch-build"><span class="planner-pitch-center-circle" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-top" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-bottom" aria-hidden="true"></span>${rows}</div>`;
    return;
  }
  const xiIds=plCurrentXi(st,w),xi=new Set(xiIds);
  const starting=squad.filter(e=>xi.has(e.id));const bench=squad.filter(e=>!xi.has(e.id));
  const byPos={1:[],2:[],3:[],4:[]};starting.forEach(e=>byPos[e.element_type].push(e));Object.values(byPos).forEach(a=>a.sort((a,b)=>plPlayerScore(b)-plPlayerScore(a)));
  const formation=[byPos[2].length,byPos[3].length,byPos[4].length].join("-");
  const pitchRows=[1,2,3,4].map(pos=>`<div class="planner-pitch-row planner-pitch-row-${pos}">${byPos[pos].map(e=>plPitchPlayer(e,st,w,{starter:true})).join("")}</div>`).join("");
  const benchOrder=bench.slice().sort((a,b)=>a.element_type-b.element_type||plPlayerScore(b)-plPlayerScore(a));
  $("plSquad").innerHTML=`
    <div class="planner-pitch-topline">
      <div><span>Starting XI</span><b>${formation}</b></div>
      <div class="planner-lineup-controls">
        <label><span>Captain</span><select data-pl-role-select="captain"><option value="">None</option>${plCaptainOptions(st,w,w.captain)}</select></label>
        <label><span>Vice</span><select data-pl-role-select="vice"><option value="">None</option>${plCaptainOptions(st,w,w.vice)}</select></label>
      </div>
      <small>${_plSwapId?"Choose a player on the other side of the bench line to complete the substitution.":"Use ⇅ to swap starters and bench players. Click a player card to plan a transfer."}</small>
    </div>
    <div class="planner-fpl-pitch"><span class="planner-pitch-center-circle" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-top" aria-hidden="true"></span><span class="planner-pitch-box planner-pitch-box-bottom" aria-hidden="true"></span>${pitchRows}</div>
    <div class="planner-fpl-bench"><div class="planner-bench-title"><span>Bench</span><small>Use ⇅ to substitute</small></div><div class="planner-bench-row">${benchOrder.map(e=>plPitchPlayer(e,st,w,{bench:true})).join("")}</div></div>`;
}
function plRenderOutCard(st){
  const box=$("plOutCard"),e=st.byId[_plOutId];if(!box)return;
  if(!e){box.innerHTML="";$("plCancelOut").style.display="none";$("plPickerKicker").textContent=plValidBase(plActive())?"Transfer target":"Player picker";$("plPickerTitle").textContent=plValidBase(plActive())?"Choose a player to transfer out":"Build your base squad";return;}
  const t=boot.teams.find(x=>x.id===e.team)||{};box.innerHTML=`<div class="planner-out-card">${teamKitImg(t,"planner-out-kit",`${e.web_name} kit`)}<span><small>Transfer out</small><b>${esc(e.web_name)}</b><em>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(st.sellPrices[e.id]??e.now_cost)}</em></span></div>`;
  $("plCancelOut").style.display="inline-block";$("plPickerKicker").textContent="Replacement";$("plPickerTitle").textContent=`Choose a ${POS[e.element_type]}`;
}
function plRenderPicker(st){
  plRenderOutCard(st);const baseIncomplete=!plValidBase(plActive()),byId=st.byId,out=byId[_plOutId];let list=boot.elements.filter(e=>e.element_type>0);
  if(out)list=list.filter(e=>e.element_type===out.element_type);else if(_plPos)list=list.filter(e=>e.element_type===_plPos);
  if(_plTeam)list=list.filter(e=>e.team===_plTeam);if(_plQuery)list=list.filter(e=>(e.web_name||"").toLowerCase().includes(_plQuery));
  list=list.filter(e=>!st.squad.includes(e.id));
  const clubs=plClubCounts(st.squad,byId),pos=plPosCounts(st.squad,byId);
  list.sort((a,b)=>plPlayerScore(b)-plPlayerScore(a));
  const rows=list.slice(0,100).map(e=>{
    const t=boot.teams.find(x=>x.id===e.team)||{},sell=out?Number(st.sellPrices[out.id]??out.now_cost):0,afford=out?st.bank+sell>=e.now_cost:st.bank>=e.now_cost;
    const clubAfter=(clubs[e.team]||0)+(out&&out.team===e.team?-1:0);const clubOk=clubAfter<PL_MAX_CLUB;
    const posOk=out?true:(pos[e.element_type]||0)<PL_SQUAD[e.element_type];const disabled=!afford||!clubOk||!posOk;
    return `<button class="planner-pick-row ${disabled?"disabled":""}" data-pl-in="${e.id}" ${disabled?"disabled":""} title="${disabled?(!afford?"Not enough bank":!clubOk?"Maximum 3 from this club":"Position is full"):"Add to plan"}">
      ${teamKitImg(t,"planner-list-kit",`${e.web_name} kit`)}<span class="planner-pick-name"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]}</small></span><span class="planner-pick-price">${money(e.now_cost)}<small>${(+e.selected_by_percent||0).toFixed(1)}% owned</small></span><span class="planner-pick-add">+</span>
    </button>`;
  }).join("");
  $("plPlayerList").innerHTML=rows||`<div class="planner-no-results">No players match these filters.</div>`;
}
function plSetOut(id){
  const plan=plActive(),st=plDerive(plan,_plActiveGw),e=st.byId[+id];if(!e)return;
  if(!plValidBase(plan)){
    plan.baseSquad=plan.baseSquad.filter(x=>+x!==+id);delete plan.baseSellPrices[id];plan.baseBank=PL_BUDGET-plan.baseSquad.reduce((s,pid)=>s+(st.byId[pid]?.now_cost||0),0);plTouch(plan);plRenderWorkspace();return;
  }
  _plOutId=+id;_plPos=e.element_type;$("plannerPos").value=String(_plPos);plRenderSquad(st,plWeek(plan,_plActiveGw));plRenderPicker(st);
}
function plAddOrTransfer(id){
  const plan=plActive(),st=plDerive(plan,_plActiveGw),incoming=st.byId[+id];if(!incoming)return;
  if(!plValidBase(plan)){
    const pc=plPosCounts(plan.baseSquad,st.byId),cc=plClubCounts(plan.baseSquad,st.byId);if(plan.baseSquad.length>=15)return toast("Base squad is full");if(pc[incoming.element_type]>=PL_SQUAD[incoming.element_type])return toast(`${POS[incoming.element_type]} slots are full`);if((cc[incoming.team]||0)>=PL_MAX_CLUB)return toast("Maximum 3 players from one club");if(plan.baseBank<incoming.now_cost)return toast("Not enough budget");
    plan.baseSquad.push(incoming.id);plan.baseBank-=incoming.now_cost;plan.baseSellPrices[incoming.id]=incoming.now_cost;plTouch(plan);plRenderWorkspace();return;
  }
  if(!_plOutId)return toast("Choose a player in your squad to transfer out first");const out=st.byId[_plOutId];if(!out||out.element_type!==incoming.element_type)return toast("Replacement must be the same position");
  const sell=Number(st.sellPrices[out.id]??out.now_cost),buy=Number(incoming.now_cost);if(st.bank+sell-buy<0)return toast("Not enough money in the bank");const test=st.squad.map(x=>x===out.id?incoming.id:x),cc=plClubCounts(test,st.byId);if((cc[incoming.team]||0)>PL_MAX_CLUB)return toast("Maximum 3 players from one club");
  const w=plWeek(plan,_plActiveGw);w.transfers.push({id:plUuid(),out:out.id,in:incoming.id,sellPrice:sell,buyPrice:buy});if(Array.isArray(w.starters)&&w.starters.includes(out.id))w.starters=w.starters.map(x=>x===out.id?incoming.id:x);if(w.captain===out.id)w.captain=null;if(w.vice===out.id)w.vice=null;_plOutId=null;_plSwapId=null;plTouch(plan);plRenderAll();
}
function plSetCaptain(id,type){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=id?+id:null;const xi=new Set(plCurrentXi(st,w));
  if(id&&!xi.has(id))return toast("Captain and vice captain must be in the starting XI");
  if(type==="cap"){w.captain=id;if(w.captain&&w.captain===w.vice)w.vice=null}else{w.vice=id;if(w.vice&&w.vice===w.captain)w.captain=null}plTouch(plan);plRenderAll();
}
function plSubstitute(id){
  const plan=plActive(),w=plWeek(plan,_plActiveGw),st=plDerive(plan,_plActiveGw);id=+id;if(!st.squad.includes(id)||!plValidBase(plan))return;
  if(!_plSwapId){_plSwapId=id;plRenderSquad(st,w);return}
  if(+_plSwapId===id){_plSwapId=null;plRenderSquad(st,w);return}
  const xi=plCurrentXi(st,w),set=new Set(xi),aIn=set.has(+_plSwapId),bIn=set.has(id);
  if(aIn===bIn)return toast(aIn?"Choose a player from the bench":"Choose a player from the starting XI");
  const next=xi.map(pid=>pid===(aIn?+_plSwapId:id)?(aIn?id:+_plSwapId):pid);
  if(!plLineupValid(next,st))return toast("That substitution would create an invalid FPL formation");
  w.starters=next;if(w.captain&&!next.includes(+w.captain))w.captain=null;if(w.vice&&!next.includes(+w.vice))w.vice=null;_plSwapId=null;plTouch(plan);plRenderAll();
}
function plClearSquad(){
  const plan=plActive();if(!plan||!plan.baseSquad.length)return;if(!confirm("Clear the entire base squad and all planned gameweek changes for this plan?"))return;
  plan.baseSquad=[];plan.baseBank=PL_BUDGET;plan.baseSellPrices={};plan.weeks=plMakeWeeks(plan.baseGw);_plOutId=null;_plSwapId=null;_plActiveGw=plan.baseGw;plTouch(plan);plRenderAll();
}
function plRemoveTransfer(id){const plan=plActive(),w=plWeek(plan,_plActiveGw);w.transfers=(w.transfers||[]).filter(t=>t.id!==id);_plOutId=null;plTouch(plan);plRenderAll()}
function plResetGw(){const plan=plActive(),w=plWeek(plan,_plActiveGw);if(!w)return;w.transfers=[];w.captain=null;w.vice=null;w.chip="";w.starters=null;_plOutId=null;_plSwapId=null;plTouch(plan);plRenderAll()}
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
function plNewDialog(){
  const name=prompt("Plan name","New plan");if(name===null)return;plNewPlan({name:name.trim()||"New plan",baseSquad:[],baseBank:PL_BUDGET,source:"Started from scratch"});
}
function plDuplicate(){const p=plActive();if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=plUuid();c.name=`${p.name} copy`;c.createdAt=c.updatedAt=new Date().toISOString();_plPlans.unshift(c);_plActiveId=c.id;_plActiveGw=c.baseGw;plWrite(_plPlans);document.dispatchEvent(new CustomEvent("fplpeek:plan-saved",{detail:{plan:c}}));plRenderAll()}
function plRename(){const p=plActive();if(!p)return;const n=prompt("Rename plan",p.name);if(n===null||!n.trim())return;p.name=n.trim();plTouch(p);plRenderAll()}
function plDelete(){const p=plActive();if(!p||!confirm(`Delete “${p.name}”?`))return;_plPlans=_plPlans.filter(x=>x.id!==p.id);plWrite(_plPlans);document.dispatchEvent(new CustomEvent("fplpeek:plan-deleted",{detail:{id:p.id}}));_plActiveId=_plPlans[0]?.id||null;_plActiveGw=plActive()?.baseGw||null;plRenderAll()}

async function initPlanner(){
  if(_plInit){plRenderAll();return}_plInit=true;await loadBoot();_plFixtures=await get(`/fixtures/`);_plPlans=plRead().map(plNormalize).filter(Boolean);_plActiveId=_plPlans[0]?.id||null;_plActiveGw=plActive()?.baseGw||plStartGw();
  const st=savedTeam();if(st?.id)$("plTeamId").value=st.id;boot.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;$("plannerTeam").appendChild(o)});
  $("plPlanSelect").addEventListener("change",e=>{_plActiveId=e.target.value||null;_plActiveGw=plActive()?.baseGw||null;_plOutId=null;_plSwapId=null;plRenderAll()});
  $("plNew").addEventListener("click",plNewDialog);$("plDuplicate").addEventListener("click",plDuplicate);$("plRename").addEventListener("click",plRename);$("plDelete").addEventListener("click",plDelete);
  $("plImportTeam").addEventListener("click",plImportFpl);$("plTeamId").addEventListener("keydown",e=>{if(e.key==="Enter")plImportFpl()});$("plImportBuilder").addEventListener("click",plImportBuilder);$("plBlank").addEventListener("click",plCreateBlank);
  $("plGwStrip").addEventListener("click",e=>{const b=e.target.closest("[data-gw]");if(!b)return;_plActiveGw=+b.dataset.gw;_plOutId=null;_plSwapId=null;plRenderAll()});
  $("plChip").addEventListener("change",e=>{const p=plActive(),w=plWeek(p,_plActiveGw);w.chip=e.target.value;plTouch(p);plRenderGwStrip();plRenderWorkspace()});$("plResetGw").addEventListener("click",plResetGw);$("plClearSquad")?.addEventListener("click",plClearSquad);
  $("plannerSearch").addEventListener("input",e=>{_plQuery=e.target.value.toLowerCase();plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plannerPos").addEventListener("change",e=>{_plPos=+e.target.value;plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plannerTeam").addEventListener("change",e=>{_plTeam=+e.target.value;plRenderPicker(plDerive(plActive(),_plActiveGw))});$("plCancelOut").addEventListener("click",()=>{_plOutId=null;const st=plDerive(plActive(),_plActiveGw);plRenderSquad(st,plWeek(plActive(),_plActiveGw));plRenderPicker(st)});
  $("plSquad").addEventListener("change",e=>{const role=e.target.closest("[data-pl-role-select]");if(role)plSetCaptain(role.value,role.dataset.plRoleSelect==="captain"?"cap":"vice")});
  $("plSquad").addEventListener("click",e=>{const sub=e.target.closest("[data-pl-sub]");if(sub)return plSubstitute(sub.dataset.plSub);const empty=e.target.closest("[data-pl-empty-pos]");if(empty){_plPos=+empty.dataset.plEmptyPos;$("plannerPos").value=String(_plPos);plRenderPicker(plDerive(plActive(),_plActiveGw));$("plannerSearch")?.focus();return}const out=e.target.closest("[data-pl-out]");if(out)return plSetOut(out.dataset.plOut)});
  $("plPlayerList").addEventListener("click",e=>{const b=e.target.closest("[data-pl-in]");if(b&&!b.disabled)plAddOrTransfer(b.dataset.plIn)});$("plTransfers").addEventListener("click",e=>{const b=e.target.closest("[data-pl-remove-transfer]");if(b)plRemoveTransfer(b.dataset.plRemoveTransfer)});
  document.addEventListener("fplpeek:account-state",plRenderSync);plRenderAll();
}

// Called by account.js after sign-in to merge server plans into the local-first store.
window.FPLPlannerCloudMerge=function(cloudPlans){
  const local=plRead().map(plNormalize).filter(Boolean),m=new Map(local.map(p=>[p.id,p]));
  (cloudPlans||[]).map(plNormalize).filter(Boolean).forEach(cp=>{const lp=m.get(cp.id);if(!lp||new Date(cp.updatedAt||0)>new Date(lp.updatedAt||0))m.set(cp.id,cp)});
  _plPlans=[...m.values()].sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));plWrite(_plPlans);if(!_plActiveId&&_plPlans[0]){_plActiveId=_plPlans[0].id;_plActiveGw=_plPlans[0].baseGw}if(_plInit)plRenderAll();return _plPlans;
};
window.FPLPlannerGetPlans=()=>plRead();
