const { buildLiveInsights, buildHistoricalInsights } = require("../lib/live-insights");
const SITE="https://fplpeek.com";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const img=(src,cls,alt)=>src?`<img class="${cls}" src="${esc(src)}" alt="${esc(alt||"")}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.hidden=true">`:"";
function playerAvatar(r){
  const kit=r.kit_url?img(r.kit_url,"row-face-kit",`${r.team_name||r.team_short||"Club"} kit`):"";
  if(!r.photo_url) return r.kit_url?`<span class="row-player-avatar photo-missing">${kit}</span>`:`<span class="row-avatar-fallback" aria-hidden="true"></span>`;
  const face=`<img class="row-face" src="${esc(r.photo_url)}" alt="${esc(r.name||"")}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.hidden=true;this.parentElement.classList.add('photo-missing')">`;
  return `<span class="row-player-avatar">${face}${kit}</span>`;
}
function rowMedia(r){
  if(Array.isArray(r.fixture_kits)&&r.fixture_kits.length) return `<span class="row-kits">${r.fixture_kits.slice(0,2).map((u,i)=>img(u,"row-kit",i?"Away kit":"Home kit")).join("")}</span>`;
  if(r.is_player || r.player_code || r.photo_url) return playerAvatar(r);
  return r.kit_url?img(r.kit_url,"row-kit",`${r.team_name||r.team_short||"Club"} kit`):`<span class="row-avatar-fallback" aria-hidden="true"></span>`;
}
function block(b,index){
  const rows=(b.rows||[]).map((r,ri)=>`<li class="${ri===0?'featured-row':''}"><div class="row-main">${rowMedia(r)}<div><b>${esc(r.name)}</b><span>${esc(r.meta||"")}</span></div></div><p>${esc(r.note||"")}</p></li>`).join("");
  return `<section class="live-block live-${esc(b.kind||"story")}"><header><div><span>${esc(b.kind||"Insight")}</span><em>${String(index+1).padStart(2,"0")}</em></div><h2>${esc(b.title)}</h2><p>${esc(b.intro||"")}</p></header><ul>${rows}</ul></section>`;
}
function archive(data,currentGw){
  const gws=(data.available_gameweeks||[]).slice().sort((a,b)=>b-a);
  if(!gws.length)return "";
  return `<section class="pub-archive"><header><span>Archive</span><h2>Past Gameweeks</h2><p>Revisit the final FPL returns and results after the current briefing has moved on.</p></header><div>${gws.map(gw=>`<a${gw===currentGw?' class="current"':''} href="/insights/gw/${gw}/"><small>Review</small><b>GW${gw}</b><em>→</em></a>`).join("")}</div></section>`;
}
function leadMedia(lead){
  const p=lead.featured_player;
  const t=lead.featured_team;
  if(lead.visual_mode==="neutral")return `<aside class="hero-visual neutral-stage"><div class="neutral-mark"><span>FPL PEEK</span><b>${esc(lead.visual_label||"GW")}</b><small>Gameweek briefing</small></div></aside>`;
  if(p?.photo_url)return `<aside class="hero-visual"><div class="player-stage">${img(p.photo_url,"hero-player",p.name)}</div><div><b>${esc(p.name)}</b><span>${esc(p.team||"")}</span></div></aside>`;
  if(t?.kit_url)return `<aside class="hero-visual team-stage">${img(t.kit_url,"hero-team-kit",`${t.name} kit`)}<div><b>${esc(t.name)}</b><span>Fixture focus</span></div></aside>`;
  return "";
}
function storyBody(lead){
  const paragraphs=(lead.paragraphs||[]).map(p=>`<p>${esc(p)}</p>`).join("");
  const takeaway=lead.takeaway?`<aside class="takeaway"><b>The takeaway</b><p>${esc(lead.takeaway)}</p></aside>`:"";
  return paragraphs||takeaway?`<section class="story-body">${paragraphs}${takeaway}</section>`:"";
}
function shell(data,{canonicalPath="/insights/",currentGw=null}={}){
  const lead=data.lead||{};
  const title=`${lead.title || "FPL Insights"} | FPL Peek`;
  const desc=lead.text || "FPL Gameweek review, preview, fixture, transfer and player insights from public FPL data.";
  const url=`${SITE}${canonicalPath}`;
  const ld=JSON.stringify({"@context":"https://schema.org","@type":"WebPage",name:lead.title||"FPL Peek Insights",description:desc,url,isPartOf:{"@type":"WebSite",name:"FPL Peek",url:SITE},dateModified:data.generated_at});
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><script>(function(){try{var s=localStorage.getItem("fplpeek_theme");var t=s||((window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})();</script><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="FPL Peek"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${SITE}/android-chrome-512x512.png"><meta name="twitter:card" content="summary"><link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/insights-public.css"><script type="application/ld+json">${ld}</script><script async src="https://www.googletagmanager.com/gtag/js?id=G-HRG9QW2NGC"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-HRG9QW2NGC');</script></head><body><header class="pub-header"><a class="pub-brand" href="/"><span>P</span><b>FPL Peek</b></a><nav><a href="/">Tools</a><a class="active" href="/insights/">Insights</a></nav></header><main class="pub-wrap"><section class="pub-hero"><div class="hero-copy"><span>${esc(lead.kicker||"Insights")}</span><h1>${esc(lead.title||"FPL Peek Insights")}</h1><p>${esc(lead.text||"")}</p><div class="live-update">Updated ${esc(new Date(data.generated_at).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}))} UTC</div></div>${leadMedia(lead)}</section>${storyBody(lead)}<div class="section-intro"><span>Gameweek notebook</span><h2>What deserves attention</h2><p>Short, data-backed reads on the returns, fixtures and market signals around this Gameweek.</p></div><section class="live-grid">${(data.blocks||[]).map(block).join("")}</section>${archive(data,currentGw)}<aside class="live-note"><b>How to read this page</b><p>${esc(data.footer_note||"")}</p></aside></main><footer class="pub-footer"><div><a href="/about.html">About</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="mailto:account@fplpeek.com">Contact</a></div><p>Data provided via the official Fantasy Premier League API. FPL Peek operates independently and is not affiliated with or endorsed by the Premier League.</p></footer></body></html>`;
}
exports.handler=async function(event){
  try{
    const raw=event.path||"/insights/";
    const match=raw.match(/\/insights\/gw\/(\d{1,2})\/?$/);
    if(match){
      const gw=Number(match[1]);
      const data=await buildHistoricalInsights(gw);
      return {statusCode:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=900, s-maxage=21600, stale-while-revalidate=86400"},body:shell(data,{canonicalPath:`/insights/gw/${gw}/`,currentGw:gw})};
    }
    const normalized=raw.replace(/\/+$/,"/");
    if(!normalized.endsWith("/insights/") && !normalized.includes("/.netlify/functions/insights")){
      return {statusCode:302,headers:{Location:"/insights/","Cache-Control":"no-store"},body:""};
    }
    const data=await buildLiveInsights();
    return {statusCode:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=120, s-maxage=600, stale-while-revalidate=900"},body:shell(data,{canonicalPath:"/insights/"})};
  }catch(e){
    return {statusCode:404,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"},body:`<!doctype html><meta charset="utf-8"><title>Insights unavailable | FPL Peek</title><style>body{font-family:system-ui;padding:40px;max-width:700px;margin:auto}a{color:#078755}</style><h1>That Gameweek insight is not available.</h1><p>${esc(e.message||"The FPL data could not be loaded.")}</p><p><a href="/insights/">Back to Insights</a></p>`};
  }
};
