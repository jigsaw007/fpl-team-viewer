/* ============ MANAGER COMPARE ============ */
let _compareBound=false;

async function initManagerCompare(){
  await loadBoot();
  if(_compareBound) return;
  _compareBound=true;
  const st=savedTeam(); if(st&&st.id) $("cmpA").value=st.id;
  $("cmpRun").onclick=()=>runManagerCompare();
  [$("cmpA"),$("cmpB")].forEach(el=>el.addEventListener("keydown",e=>{if(e.key==="Enter") runManagerCompare();}));
}

function cmpLast(history){const r=history&&history.current||[];return r.length?r[r.length-1]:null;}
function cmpBest(history){const r=history&&history.past||[];return r.length?r.slice().sort((a,c)=>(c.total_points||0)-(a.total_points||0))[0]:null;}
function cmpVal(v,kind){if(v==null||v==="")return "-";if(kind==="rank")return short(Number(v));if(kind==="money")return `£${(Number(v)/10).toFixed(1)}m`;return short(Number(v));}
function cmpWinner(a,b,lower=false){if(a==null||b==null||a===b)return ["",""];const aw=lower?a<b:a>b;return aw?["win",""]:["","win"];}
function cmpMetric(label,a,b,kind="",lower=false){const cls=cmpWinner(Number(a)||0,Number(b)||0,lower);return `<div class="compare-metric"><span class="${cls[0]}">${cmpVal(a,kind)}</span><b>${esc(label)}</b><span class="${cls[1]}">${cmpVal(b,kind)}</span></div>`;}
function cmpManagerHead(entry){return `<div class="compare-manager"><span>${esc(entry.player_region_name||"")}</span><h3>${esc(entry.name||"")}</h3><p>${esc(entry.player_first_name||"")} ${esc(entry.player_last_name||"")}</p></div>`;}

async function runManagerCompare(){
  const aId=String($("cmpA").value||"").trim(),bId=String($("cmpB").value||"").trim(),out=$("compareBody");
  if(!/^\d+$/.test(aId)||!/^\d+$/.test(bId)||aId===bId){out.innerHTML=`<div class="tool-empty bad">Enter two different numeric Team IDs.</div>`;return;}
  out.innerHTML=`<div class="tool-loading">Comparing managers...</div>`;
  try{
    const [aEntry,bEntry,aHist,bHist]=await Promise.all([get(`/entry/${aId}/`),get(`/entry/${bId}/`),get(`/entry/${aId}/history/`).catch(()=>null),get(`/entry/${bId}/history/`).catch(()=>null)]);
    const aLast=cmpLast(aHist),bLast=cmpLast(bHist),aBest=cmpBest(aHist),bBest=cmpBest(bHist);
    let squadHtml="";
    const [ap,bp]=await Promise.all([latestPublicPicks(aId),latestPublicPicks(bId)]);
    if(ap&&bp){
      const els=Object.fromEntries((boot.elements||[]).map(e=>[e.id,e]));
      const aIds=new Set((ap.data.picks||[]).map(p=>p.element)),bIds=new Set((bp.data.picks||[]).map(p=>p.element));
      const common=[...aIds].filter(id=>bIds.has(id));
      const onlyA=[...aIds].filter(id=>!bIds.has(id)).map(id=>els[id]).filter(Boolean);
      const onlyB=[...bIds].filter(id=>!aIds.has(id)).map(id=>els[id]).filter(Boolean);
      const ac=(ap.data.picks||[]).find(p=>p.is_captain),bc=(bp.data.picks||[]).find(p=>p.is_captain);
      const chips=(rows)=>rows.slice(0,8).map(e=>`<span class="compare-player-chip">${esc(e.web_name)}</span>`).join("")||`<span class="compare-none">None</span>`;
      squadHtml=`<section class="analysis-panel compare-squads"><div class="analysis-panel-head"><div><span>GW${Math.min(ap.gw,bp.gw)} squads</span><h4>Where the teams differ</h4></div></div>
        <div class="compare-squad-summary"><div><b>${common.length}</b><small>players in common</small></div><div><b>${esc(ac&&els[ac.element]?els[ac.element].web_name:"-")}</b><small>${esc(aEntry.name)} captain</small></div><div><b>${esc(bc&&els[bc.element]?els[bc.element].web_name:"-")}</b><small>${esc(bEntry.name)} captain</small></div></div>
        <div class="compare-diffs"><div><h5>${esc(aEntry.name)} differentials</h5><div>${chips(onlyA)}</div></div><div><h5>${esc(bEntry.name)} differentials</h5><div>${chips(onlyB)}</div></div></div></section>`;
    }else{
      squadHtml=gwStartNotice("Squad comparison");
    }
    out.innerHTML=`
      <div class="compare-heads"><div>${cmpManagerHead(aEntry)}</div><div class="compare-vs big">vs</div><div>${cmpManagerHead(bEntry)}</div></div>
      <div class="compare-metrics">
        ${cmpMetric("Overall points",aEntry.summary_overall_points||0,bEntry.summary_overall_points||0)}
        ${cmpMetric("Overall rank",aEntry.summary_overall_rank,bEntry.summary_overall_rank,"rank",true)}
        ${cmpMetric("Last GW",aEntry.summary_event_points||0,bEntry.summary_event_points||0)}
        ${cmpMetric("Team value",aLast&&aLast.value,bLast&&bLast.value,"money")}
        ${cmpMetric("Best season points",aBest&&aBest.total_points,bBest&&bBest.total_points)}
        ${cmpMetric("Best season rank",aBest&&aBest.rank,bBest&&bBest.rank,"rank",true)}
      </div>${squadHtml}`;
  }catch(e){out.innerHTML=`<div class="tool-empty bad">Could not compare those managers. ${esc(e.message)}</div>`;}
}
