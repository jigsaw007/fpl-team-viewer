/* ============ events ============ */
$("go").addEventListener("click",()=>view($("tid").value));
$("tid").addEventListener("keydown",e=>{if(e.key==="Enter")view($("tid").value)});
// league modal controls
$("lmClose").addEventListener("click",closeLeague);
$("leagueModal").addEventListener("click",e=>{ if(e.target===$("leagueModal")) closeLeague(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && $("leagueModal").style.display==="flex") closeLeague(); });
$("lmMore").addEventListener("click",async()=>{ _leaguePage++; $("lmMore").textContent="Loading…"; $("lmMore").disabled=true; await loadLeaguePage(); $("lmMore").textContent="Load more"; $("lmMore").disabled=false; });
renderRecent();
// Home is the default landing page. A deep link with ?id=123 opens My Team directly.
_tabLoaded.home=true;
initHome();
// The deadline is a global workspace element in the desktop sidebar.
loadBoot().then(startCountdown).catch(()=>{});
const params=new URLSearchParams(location.search);
const tool=params.get("tool");
if(tool && document.getElementById("tab-"+tool)){ switchTab(tool); }
const q=params.get("id");
if(q){
  $("tid").value=q;
  if($("homeTeamId")) $("homeTeamId").value=q;
  switchTab("team");
  view(q);
}else{
  const st=savedTeam();
  if(st&&st.id){
    $("tid").value=st.id;
    if($("homeTeamId")) $("homeTeamId").value=st.id;
  }
}
