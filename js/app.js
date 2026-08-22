/* ============ appearance ============ */
(function initAppearance(){
  const root=document.documentElement,btn=$("themeToggle");
  function current(){return root.dataset.theme==="dark"?"dark":"light"}
  function paint(){
    if(!btn)return;
    const dark=current()==="dark";
    const icon=btn.querySelector(".theme-toggle-icon"),text=btn.querySelector(".theme-toggle-text");
    if(icon)icon.textContent=dark?"☀":"☾";
    if(text)text.textContent=dark?"Light":"Dark";
    btn.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
    btn.title=dark?"Switch to light mode":"Switch to dark mode";
  }
  paint();
  btn?.addEventListener("click",()=>{
    const next=current()==="dark"?"light":"dark";
    root.dataset.theme=next;
    try{localStorage.setItem("fplpeek_theme",next)}catch(e){}
    paint();
  });
})();

/* ============ events ============ */
$("go").addEventListener("click",()=>view($("tid").value));
$("tid").addEventListener("keydown",e=>{if(e.key==="Enter")view($("tid").value)});
// league modal controls
$("lmClose").addEventListener("click",closeLeague);
$("leagueModal").addEventListener("click",e=>{ if(e.target===$("leagueModal")) closeLeague(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && $("leagueModal").style.display==="flex") closeLeague(); });
$("lmMore").addEventListener("click",async()=>{ _leaguePage++; $("lmMore").textContent="Loading…"; $("lmMore").disabled=true; await loadLeaguePage(); $("lmMore").textContent="Load more"; $("lmMore").disabled=false; });
renderRecent();
// Resolve SEO-friendly tool routes first. Legacy ?tool= links still work.
const params=new URLSearchParams(location.search);
const tool=params.get("tool");
const routeTab=window.FPLPeekSEO?.tabForPath(location.pathname);
const initialTab=(tool && document.getElementById("tab-"+tool))?tool:(routeTab||"home");
if(tool && window.FPLPeekSEO) window.FPLPeekSEO.navigate(initialTab,true);
else if(!routeTab && location.pathname!=="/" && window.FPLPeekSEO) window.FPLPeekSEO.navigate("home",true);

if(initialTab==="home"){
  _tabLoaded.home=true;
  initHome();
  window.FPLPeekSEO?.setMetadata("home");
}else{
  switchTab(initialTab,{fromRoute:true,replace:true,noScroll:true});
}

// The deadline is a global workspace element in the desktop sidebar.
loadBoot().then(startCountdown).catch(()=>{});
const q=params.get("id");
if(q){
  $("tid").value=q;
  if($("homeTeamId")) $("homeTeamId").value=q;
  switchTab("team",{replace:initialTab!=="team"});
  view(q);
}else{
  const st=savedTeam();
  if(st&&st.id){
    $("tid").value=st.id;
    if($("homeTeamId")) $("homeTeamId").value=st.id;
  }
}
