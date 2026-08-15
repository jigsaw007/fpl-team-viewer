/* ============ FIXTURES tab ============ */
let _fxN=5, _fxSort="team", _allFixtures=null;
async function initFixtures(){
  $("fxGrid").innerHTML=`<div class="tab-status"><div class="spinner"></div>Loading fixtures…</div>`;
  const b=await loadBoot();
  _allFixtures=await get(`/fixtures/`);
  $("fxRange").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxRange").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxN=+x.dataset.n; drawFixtures();});
  $("fxSort").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("fxSort").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _fxSort=x.dataset.s; drawFixtures();});
  drawFixtures();
}
function drawFixtures(){
  const b=boot;
  const curEvent=b.events.find(e=>e.is_current);
  const nextEvent=b.events.find(e=>e.is_next);
  const fromGw=(curEvent||nextEvent||b.events[0]).id;
  const gws=[]; for(let g=fromGw; g<fromGw+_fxN && g<=38; g++) gws.push(g);
  // per team: {gw -> [{opp,home,fdr}]}
  const perTeam={};
  b.teams.forEach(t=>perTeam[t.id]={});
  _allFixtures.filter(f=>f.event && gws.includes(f.event)).forEach(f=>{
    (perTeam[f.team_h][f.event]??=[]).push({opp:f.team_a,home:true,fdr:f.team_h_difficulty});
    (perTeam[f.team_a][f.event]??=[]).push({opp:f.team_h,home:false,fdr:f.team_a_difficulty});
  });
  let teams=b.teams.slice();
  const avg=t=>{let s=0,n=0;gws.forEach(g=>(perTeam[t.id][g]||[]).forEach(x=>{s+=x.fdr;n++;}));return n?s/n:3;};
  if(_fxSort==="easy") teams.sort((a,c)=>avg(a)-avg(c));
  else teams.sort((a,c)=>a.name.localeCompare(c.name));
  const head=`<tr><th class="club">Club</th>${gws.map(g=>`<th>GW${g}</th>`).join("")}<th>Avg</th></tr>`;
  const body=teams.map(t=>{
    const cells=gws.map(g=>{
      const fx=perTeam[t.id][g]||[];
      if(!fx.length) return `<td><div class="cell blank">–</div></td>`;
      return `<td>${fx.map(x=>{const o=b.teams.find(z=>z.id===x.opp)||{};
        return `<div class="cell fdr${x.fdr}">${esc((o.short_name||"").toUpperCase())}<small>${x.home?"H":"A"}</small></div>`;}).join("")}</td>`;
    }).join("");
    const a=avg(t).toFixed(2);
    return `<tr><td class="club">${esc(t.name)}</td>${cells}<td><span class="agg">${a}</span></td></tr>`;
  }).join("");
  $("fxGrid").innerHTML=`<table class="fxg"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

