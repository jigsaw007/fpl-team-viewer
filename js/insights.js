/* ============ FPL PEEK INSIGHTS ============ */
(function(){
  let data=null;
  const el=id=>document.getElementById(id);
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeImg=(src,cls,alt,extra='')=>src?`<img class="${cls}" src="${h(src)}" alt="${h(alt||'')}" loading="lazy" decoding="async" onerror="this.hidden=true" ${extra}>`:'';
  function rowMedia(r){
    if(r.fixture_kits?.length) return `<span class="insight-row-kits">${r.fixture_kits.slice(0,2).map((u,i)=>safeImg(u,'insight-kit',i?'Away kit':'Home kit')).join('')}</span>`;
    return r.kit_url?safeImg(r.kit_url,'insight-kit',`${r.team_name||r.team_short||''} kit`):'';
  }
  function block(b,i){
    return `<article class="insight-card insight-${h(b.kind||'story')}">
      <div class="insight-card-top"><div class="insight-card-meta"><span>${h((b.kind||'Insight').replace(/\b\w/g,m=>m.toUpperCase()))}</span></div><em>${String(i+1).padStart(2,'0')}</em></div>
      <h3>${h(b.title)}</h3><p class="insight-card-intro">${h(b.intro||'')}</p>
      <div class="insight-rows">${(b.rows||[]).map(r=>`<div class="insight-row"><div class="insight-row-main">${rowMedia(r)}<div><b>${h(r.name)}</b><small>${h(r.meta||'')}</small></div></div><span>${h(r.note||'')}</span></div>`).join('')}</div>
    </article>`;
  }
  function leadMedia(lead){
    const p=lead?.featured_player;
    const t=lead?.featured_team;
    if(lead?.visual_mode==='neutral') return `<div class="insights-lead-visual insights-neutral-visual"><div class="insights-gw-mark"><span>FPL PEEK</span><b>${h(lead.visual_label||'GW')}</b><small>Gameweek briefing</small></div></div>`;
    if(p?.photo_url) return `<div class="insights-lead-visual"><div class="insights-player-frame">${safeImg(p.photo_url,'insights-player-photo',p.name,'fetchpriority="low"')}</div><small>${h(p.name)}${p.team?` · ${h(p.team)}`:''}</small></div>`;
    if(t?.kit_url) return `<div class="insights-lead-visual insights-team-visual">${safeImg(t.kit_url,'insights-team-kit',`${t.name} kit`)}<small>${h(t.name)}</small></div>`;
    return `<div class="insights-lead-mark">P</div>`;
  }
  function render(d){
    data=d;
    const lead=d.lead||{};
    const leadEl=el('insightsLead');
    if(leadEl)leadEl.innerHTML=`<div class="insights-lead-copy"><span>${h(lead.kicker||'FPL Peek Insights')}</span><h3>${h(lead.title||'FPL Peek Insights')}</h3><p class="insights-lead-intro">${h(lead.text||'')}</p>${(lead.paragraphs||[]).length?`<div class="insights-story-copy">${lead.paragraphs.map(p=>`<p>${h(p)}</p>`).join('')}</div>`:''}${lead.takeaway?`<div class="insights-takeaway"><b>The takeaway</b><p>${h(lead.takeaway)}</p></div>`:''}<small>Based on the latest public FPL data.</small></div>${leadMedia(lead)}`;
    const list=el('insightsList');
    if(list)list.innerHTML=(d.blocks||[]).map(block).join('')||'<div class="insights-empty"><b>Waiting for enough FPL data.</b><p>Insights will fill in as the Gameweek develops.</p></div>';
    const stamp=el('insightsUpdated');if(stamp)stamp.textContent=`Updated ${new Date(d.generated_at).toLocaleString()}`;
    const archive=el('insightsArchive');
    if(archive){
      const gws=(d.available_gameweeks||[]).slice().sort((a,b)=>b-a);
      archive.innerHTML=gws.length?gws.map(gw=>`<a class="insights-archive-link" href="/insights/gw/${gw}/"><span><small>Review</small>GW${gw}</span><b>→</b></a>`).join(''):'<div class="insights-empty"><b>No completed Gameweeks yet.</b><p>Past reviews will appear here once Gameweeks finish.</p></div>';
    }
    renderHome();
  }
  async function load(force=false){
    const list=el('insightsList');if(list)list.innerHTML='<div class="insights-loading">Reading the latest FPL data…</div>';
    try{
      const r=await fetch(`/.netlify/functions/insights-data${force?'?refresh='+Date.now():''}`,{cache:force?'no-store':'default'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      render(await r.json());
    }catch(e){
      if(list)list.innerHTML='<div class="insights-empty"><b>Insights are temporarily unavailable.</b><p>The latest FPL data could not be loaded. Try again shortly.</p></div>';
      const home=el('homeEditorialInsights');if(home)home.innerHTML='<div class="home-editorial-empty">Insights will return when the FPL data feed is available.</div>';
    }
  }
  function renderHome(){
    const box=el('homeEditorialInsights');if(!box||!data)return;
    const lead=data.lead||{};
    const blocks=(data.blocks||[]).slice(0,2);
    const leadImg=lead.visual_mode==='neutral'?`<div class="home-gw-mark"><span>FPL PEEK</span><b>${h(lead.visual_label||'GW')}</b></div>`:lead.featured_player?.photo_url?safeImg(lead.featured_player.photo_url,'home-insight-photo',lead.featured_player.name):lead.featured_team?.kit_url?safeImg(lead.featured_team.kit_url,'home-insight-kit',`${lead.featured_team.name} kit`):'';
    const feature=`<a class="home-editorial-card home-editorial-feature" href="/?tool=insights"><div class="home-insight-copy"><span>${h(lead.kicker||'Current')}</span><b>${h(lead.title||'FPL Peek Insights')}</b><small>${h(lead.text||'')}</small><em>Read the briefing →</em></div>${leadImg?`<div class="home-insight-media">${leadImg}</div>`:''}</a>`;
    const rest=blocks.map((b,i)=>{const r=b.rows?.[0]||{};return `<a class="home-editorial-card home-editorial-secondary" href="/?tool=insights"><div class="home-insight-card-head"><span>${h(b.kind||'Insight')}</span><i>${String(i+2).padStart(2,'0')}</i></div><b>${h(b.title)}</b><small>${h(b.intro||'')}</small>${r.kit_url?`<div class="home-insight-club">${safeImg(r.kit_url,'home-insight-kit',`${r.team_name||''} kit`)}<span>${h(r.name||r.team_name||'')}</span></div>`:''}</a>`}).join('');
    box.innerHTML=feature+rest;
  }
  async function init(){
    el('insightsRefresh')?.addEventListener('click',()=>load(true));
    await load(false);
  }
  window.initInsights=async()=>{if(!data)await load(false)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
