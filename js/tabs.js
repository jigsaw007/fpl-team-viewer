/* ============ tab system ============ */
const _tabLoaded={};
function markActiveSidebarGroup(name){
  document.querySelectorAll(".tab-label").forEach(l=>l.classList.remove("active-group"));
  const active=document.querySelector(`.tab[data-tab="${name}"]`);
  if(!active) return;
  let node=active.previousElementSibling;
  while(node && !node.classList.contains("tab-label")) node=node.previousElementSibling;
  if(node) node.classList.add("active-group");
}
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
  markActiveSidebarGroup(name);
  document.querySelectorAll(".tabpanel").forEach(p=>p.classList.toggle("active",p.id==="tab-"+name));
  document.querySelectorAll("[data-mobile-tab]").forEach(t=>t.classList.toggle("active",t.dataset.mobileTab===name));
  const primaryMobile=["home","team","scout","builder"];
  if($("mobileMore")) $("mobileMore").classList.toggle("active",!primaryMobile.includes(name));
  closeMobileMore();
  window.scrollTo({top:0,behavior:"smooth"});
  if(!_tabLoaded[name]){ _tabLoaded[name]=true; lazyLoadTab(name); }
}
async function lazyLoadTab(name){
  try{
    if(name==="home") await initHome();
    else if(name==="insights") await initInsights();
    else if(name==="scout") await initScout();
    else if(name==="peekteam") await initPeekTeam();
    else if(name==="captains") await initCaptains();
    else if(name==="analyzer") await initAnalyzer();
    else if(name==="transfer") await initTransferAnalyzer();
    else if(name==="compare") await initManagerCompare();
    else if(name==="cards") await initCardCreator();
    else if(name==="builder") await initBuilder();
    else if(name==="planner") await initPlanner();
    else if(name==="preseason") await initPreseason();
    else if(name==="fixtures") await initFixtures();
    else if(name==="players") await initPlayers();
    else if(name==="injuries") await initInjuries();
    else if(name==="setpieces") await initSetPieces();
    else if(name==="defcon") await initDefcon();
    else if(name==="prices") await initPrices();
    else if(name==="live") await initLive();
  }catch(e){ /* per-tab handlers show their own errors */ }
}
function closeMobileMore(){
  const sheet=$("mobileMoreSheet"),more=$("mobileMore");
  if(sheet){sheet.classList.remove("open");sheet.setAttribute("aria-hidden","true");}
  if(more) more.setAttribute("aria-expanded","false");
}
document.getElementById("tabbar").addEventListener("click",e=>{
  const b=e.target.closest(".tab"); if(b) switchTab(b.dataset.tab);
});
document.querySelectorAll("[data-mobile-tab]").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.mobileTab)));
if($("mobileMore")) $("mobileMore").addEventListener("click",()=>{
  const sheet=$("mobileMoreSheet"),open=!sheet.classList.contains("open");
  sheet.classList.toggle("open",open);sheet.setAttribute("aria-hidden",open?"false":"true");$("mobileMore").setAttribute("aria-expanded",open?"true":"false");
});
if($("mobileMoreClose")) $("mobileMoreClose").addEventListener("click",closeMobileMore);

markActiveSidebarGroup("home");
