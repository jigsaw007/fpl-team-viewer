/* ============ OPTIONAL ACCOUNT + SUPABASE PLAN SYNC ============ */
(function(){
  const cfg=window.FPLPeekConfig||{};
  const configured=()=>/^https:\/\//.test(String(cfg.SUPABASE_URL||""))&&String(cfg.SUPABASE_PUBLISHABLE_KEY||"").length>20;
  let client=null,session=null,sdkPromise=null,syncTimer=null;
  const CLOUD_IDS_KEY="fplpeek_cloud_plan_ids_v1",LOCAL_PLANS_KEY="fplpeek_plans_v1";
  const panel=()=>document.getElementById("accountPanel"),mobileBtn=()=>document.getElementById("mobileAccountBtn");

  function loadSdk(){
    if(window.supabase?.createClient)return Promise.resolve(window.supabase);
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/dist/umd/supabase.min.js";s.async=true;
      s.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error("Supabase SDK did not load"));s.onerror=()=>reject(new Error("Could not load Supabase SDK"));document.head.appendChild(s);
    });return sdkPromise;
  }
  function openModal(){const m=document.getElementById("accountModal");if(m)m.style.display="flex";renderModal()}
  function closeModal(){const m=document.getElementById("accountModal");if(m)m.style.display="none"}
  function message(text,bad=false){const e=document.getElementById("accountMessage");if(!e)return;e.textContent=text||"";e.classList.toggle("bad",!!bad)}
  function renderPanel(){
    const p=panel(),mb=mobileBtn();if(!configured()){if(p)p.style.display="none";if(mb)mb.style.display="none";document.dispatchEvent(new CustomEvent("fplpeek:account-state"));return}
    if(p)p.style.display="block";if(mb)mb.style.display="block";
    const st=document.getElementById("accountStatus"),btn=document.getElementById("accountButton");
    if(session?.user){if(st)st.innerHTML=`<b>${escapeHtml(session.user.email||"Account")}</b><span>Planner sync enabled</span>`;if(btn)btn.textContent="Account"}
    else{if(st)st.innerHTML=`<b>Cloud sync</b><span>Sign in to sync plans</span>`;if(btn)btn.textContent="Sign in"}
    document.dispatchEvent(new CustomEvent("fplpeek:account-state"));
  }
  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function renderModal(){
    const out=document.getElementById("accountSignedOut"),inn=document.getElementById("accountSignedIn");if(!out||!inn)return;
    out.style.display=session?.user?"none":"block";inn.style.display=session?.user?"block":"none";
    if(session?.user){const email=session.user.email||"Signed in",ue=document.getElementById("accountUserEmail"),av=document.getElementById("accountAvatar");if(ue)ue.textContent=email;if(av)av.textContent=(email[0]||"A").toUpperCase();const sum=document.getElementById("accountSyncSummary");if(sum)sum.textContent="Your Planner drafts can sync across devices."}
  }
  async function ensureProfile(){
    if(!client||!session?.user)return;let fpl=null;try{fpl=JSON.parse(localStorage.getItem("fpl_myteam")||"null")}catch{}
    const payload={id:session.user.id,display_name:session.user.user_metadata?.name||null,fpl_team_id:fpl?.id?Number(fpl.id):null,updated_at:new Date().toISOString()};
    const {error}=await client.from("profiles").upsert(payload,{onConflict:"id"});if(error)console.warn("Profile sync",error.message);
  }
  function rowForPlan(plan){return {id:plan.id,user_id:session.user.id,name:plan.name||"Plan",source_team_id:plan.sourceTeamId?Number(plan.sourceTeamId):null,data:plan,updated_at:plan.updatedAt||new Date().toISOString()}}
  async function savePlan(plan){if(!client||!session?.user||!plan)return;const {error}=await client.from("plans").upsert(rowForPlan(plan),{onConflict:"id"});if(error)console.warn("Plan sync",error.message);else{let ids=[];try{ids=JSON.parse(localStorage.getItem(CLOUD_IDS_KEY)||"[]")}catch{};if(!ids.includes(plan.id)){ids.push(plan.id);localStorage.setItem(CLOUD_IDS_KEY,JSON.stringify(ids))}}}
  function scheduleSave(plan){clearTimeout(syncTimer);syncTimer=setTimeout(()=>savePlan(plan),450)}
  async function deletePlan(id){if(!client||!session?.user||!id)return;const {error}=await client.from("plans").delete().eq("id",id);if(error)console.warn("Plan delete",error.message)}
  async function syncAll(){
    if(!client||!session?.user)return false;
    const {data,error}=await client.from("plans").select("id,name,data,updated_at").order("updated_at",{ascending:false});
    if(error)throw error;
    const cloud=(data||[]).map(r=>{const p={...(r.data||{})};p.id=r.id;p.name=r.name||p.name;p.updatedAt=r.updated_at||p.updatedAt;return p});
    const cloudIds=new Set(cloud.map(p=>p.id));let known=[];try{known=JSON.parse(localStorage.getItem(CLOUD_IDS_KEY)||"[]")}catch{}
    // If this browser previously synced a plan and it has since disappeared from the server,
    // treat that as a deletion from another device instead of resurrecting the stale local copy.
    if(known.length){let local=[];try{local=JSON.parse(localStorage.getItem(LOCAL_PLANS_KEY)||"[]")}catch{};const filtered=local.filter(p=>!known.includes(p.id)||cloudIds.has(p.id));if(filtered.length!==local.length)localStorage.setItem(LOCAL_PLANS_KEY,JSON.stringify(filtered))}
    const merged=window.FPLPlannerCloudMerge?window.FPLPlannerCloudMerge(cloud):(window.FPLPlannerGetPlans?.()||[]);
    if(merged.length){const {error:upErr}=await client.from("plans").upsert(merged.map(rowForPlan),{onConflict:"id"});if(upErr)throw upErr}
    localStorage.setItem(CLOUD_IDS_KEY,JSON.stringify(merged.map(p=>p.id)));await ensureProfile();document.dispatchEvent(new CustomEvent("fplpeek:account-state"));return true;
  }
  async function sendMagicLink(){
    const input=document.getElementById("accountEmail"),button=document.getElementById("accountSendLink"),email=String(input?.value||"").trim();if(!email)return message("Enter your email address.",true);
    if(!client)return message("Cloud sync is not configured yet.",true);button.disabled=true;button.textContent="Sending…";message("");
    try{
      const redirect=`${location.origin}${location.pathname}`;
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:true}});if(error)throw error;
      message("Check your inbox. The sign-in link will return you to FPL Peek.");
    }catch(e){message(e.message||"Could not send the sign-in email.",true)}finally{button.disabled=false;button.textContent="Email sign-in link"}
  }
  async function signOut(){if(client)await client.auth.signOut();session=null;renderPanel();renderModal()}
  async function init(){
    // UI exists even when sync is disabled, but stays hidden until valid project keys are supplied.
    document.getElementById("accountButton")?.addEventListener("click",openModal);mobileBtn()?.addEventListener("click",()=>{document.getElementById("mobileMoreSheet")?.classList.remove("open");openModal()});
    document.getElementById("accountClose")?.addEventListener("click",closeModal);document.getElementById("accountModal")?.addEventListener("click",e=>{if(e.target.id==="accountModal")closeModal()});
    document.getElementById("accountSendLink")?.addEventListener("click",sendMagicLink);document.getElementById("accountEmail")?.addEventListener("keydown",e=>{if(e.key==="Enter")sendMagicLink()});document.getElementById("accountSignOut")?.addEventListener("click",signOut);
    document.getElementById("accountSyncNow")?.addEventListener("click",async()=>{const b=document.getElementById("accountSyncNow");b.disabled=true;b.textContent="Syncing…";try{await syncAll();b.textContent="Synced";setTimeout(()=>b.textContent="Sync now",1200)}catch(e){b.textContent="Sync failed";console.warn(e)}finally{b.disabled=false}});
    document.getElementById("plSyncStatus")?.addEventListener("click",()=>{if(configured())openModal()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.getElementById("accountModal")?.style.display==="flex")closeModal()});
    document.addEventListener("fplpeek:plan-saved",e=>{if(session?.user)scheduleSave(e.detail?.plan)});document.addEventListener("fplpeek:plan-deleted",e=>{if(session?.user)deletePlan(e.detail?.id)});
    if(!configured()){renderPanel();return}
    try{
      const sdk=await loadSdk();client=sdk.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data}=await client.auth.getSession();session=data.session;renderPanel();renderModal();if(session?.user)syncAll().catch(console.warn);
      client.auth.onAuthStateChange((_event,newSession)=>{session=newSession;renderPanel();renderModal();if(session?.user)setTimeout(()=>syncAll().catch(console.warn),0)});
    }catch(e){console.warn("FPL Peek cloud sync disabled:",e.message);renderPanel()}
  }
  window.FPLPeekCloud={isConfigured:configured,isSignedIn:()=>!!session?.user,open:openModal,syncAll,savePlan,deletePlan};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
