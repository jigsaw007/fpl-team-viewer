/* ============ SEO-friendly tool routes + metadata ============ */
(function(){
  const ROUTES={
    home:{path:"/",title:"FPL Peek | FPL Team Analyzer, Planner & Fantasy Tools",description:"Free Fantasy Premier League tools for gameweek planning, team analysis, player comparison, price tracking, captain picks, fixtures and live FPL data."},
    team:{path:"/my-team",title:"FPL Team Viewer & Manager Dashboard | FPL Peek",description:"View your public FPL squad, Gameweek points, rank, captain, bench, mini-leagues and season history using your Fantasy Premier League Team ID."},
    insights:{path:"/fpl-insights",title:"FPL Insights & Gameweek Analysis | FPL Peek",description:"Read FPL gameweek insights built from public Fantasy Premier League data, fixtures, form, availability and player trends."},
    onetowatch:{path:"/one-to-watch",title:"FPL One To Watch - 6 Players & Next 5 Fixtures | FPL Peek",description:"See six FPL players to watch with price, form, ownership, points and the next five fixtures with FDR."},
    planner:{path:"/planner",title:"FPL Gameweek Planner - Transfers, Chips & Captains | FPL Peek",description:"Plan FPL transfers across future Gameweeks, carry squads forward, choose captains and chips, and compare projected versus actual points without changing your real team."},
    builder:{path:"/team-builder",title:"FPL Team Builder & Squad Optimizer | FPL Peek",description:"Build a legal 15-player Fantasy Premier League squad, optimize the starting XI, bench and captain, and compare projected scores across 1, 3 or 5 Gameweeks."},
    scout:{path:"/fpl-scout",title:"FPL Scout - Player Picks & Transfer Ideas | FPL Peek",description:"Scout Fantasy Premier League players using fixtures, form, projected points, ownership, minutes and value to find transfer ideas."},
    transfer:{path:"/player-compare",title:"FPL Player Compare - Compare Transfers & Fixtures | FPL Peek",description:"Compare two or three FPL players side by side by price, points, form, ownership, minutes, fixtures and projected returns."},
    fixtures:{path:"/fixtures",title:"FPL Fixtures, Results & Fixture Difficulty | FPL Peek",description:"Explore Premier League fixtures and results for FPL with fixture difficulty, upcoming Gameweeks and team schedules."},
    players:{path:"/players",title:"FPL Players - Stats, Form, Price & Fixtures | FPL Peek",description:"Browse Fantasy Premier League players by position, club, price, ownership, points, form, minutes and upcoming fixtures."},
    preseason:{path:"/pre-season",title:"FPL Pre-Season Guide & Player Watch | FPL Peek",description:"Follow FPL pre-season player and team information before the opening Gameweek with useful planning context for your squad."},
    captains:{path:"/captain-picks",title:"FPL Captain Picks & Captaincy Matrix | FPL Peek",description:"Compare FPL captain options using projected points, fixtures, ownership and minutes security, plus top-manager captain selections after the deadline."},
    injuries:{path:"/injuries",title:"FPL Injuries, Doubts & Availability | FPL Peek",description:"Track FPL injuries, doubts, suspensions and chance-of-playing updates from official Fantasy Premier League player data."},
    setpieces:{path:"/set-pieces",title:"FPL Set Piece Takers - Penalties, Corners & Free Kicks | FPL Peek",description:"Check likely FPL penalty, corner and free-kick takers by Premier League club to support transfer and captain decisions."},
    defcon:{path:"/defcon-tracker",title:"FPL DEFCON Tracker - Defensive Contributions | FPL Peek",description:"Track FPL defensive contribution points, threshold progress and player performance for defenders, midfielders and forwards."},
    prices:{path:"/price-watch",title:"FPL Price Changes & Transfer Market Watch | FPL Peek",description:"Track official FPL price rises and falls plus the most transferred-in and transferred-out players this Gameweek."},
    pricepredict:{path:"/price-change-prediction",title:"FPL Price Change Prediction & Rise/Fall Pressure | FPL Peek",description:"Estimate FPL price rise and fall pressure from official transfer activity, ownership, player status and market movement. Includes rise and fall watchlists."},
    leagueanalyzer:{path:"/league-analyzer",title:"FPL League Analyzer - Classic League Stats & Table | FPL Peek",description:"Analyze any public FPL Classic League by League ID with Gameweek scores, captains, chip usage, manager links and league-wide stats."},
    market:{path:"/fpl-market",title:"FPL Market Terminal - Transfers, Ownership, Price & Value Charts | FPL Peek",description:"Explore the live FPL market with trading-style transfer movers, ownership, player price and Gameweek charts, value maps and market momentum."},
    analyzer:{path:"/team-rating",title:"FPL Team Rating - Rate Your Fantasy Squad | FPL Peek",description:"Get an FPL team rating using projected points, captaincy, fixtures, availability, bench depth and squad balance."},
    compare:{path:"/manager-compare",title:"FPL Manager Compare - Rank, Points & Squads | FPL Peek",description:"Compare two Fantasy Premier League managers by rank, points, history, squads and captaincy using public FPL Team IDs."},
    cards:{path:"/card-creator",title:"FPL Card Creator - Gameweek, Career & Rivalry Cards | FPL Peek",description:"Create shareable FPL Gameweek, career and rivalry cards from public Fantasy Premier League manager data."},
    peekteam:{path:"/fpl-peek-team",title:"FPL Peek Team - Weekly Fantasy Squad & Captain | FPL Peek",description:"See the FPL Peek Gameweek squad, starting XI, bench, captain, live points and previous Gameweek results."},
    live:{path:"/live-center",title:"FPL Live Center - Live Gameweek Scores & Updates | FPL Peek",description:"Follow the current Fantasy Premier League Gameweek with live player points, fixtures and useful matchday information."}
  };
  const BY_PATH={};
  Object.entries(ROUTES).forEach(([tab,cfg])=>{BY_PATH[cfg.path.replace(/\/$/,"")||"/"]=tab;});

  function routeForTab(tab){return ROUTES[tab]||ROUTES.home;}
  function tabForPath(pathname){
    let p=(pathname||"/").replace(/\/+$/,"")||"/";
    return BY_PATH[p]||null;
  }
  function ensureMeta(selector,attrs){
    let el=document.head.querySelector(selector);
    if(!el){el=document.createElement("meta");Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));document.head.appendChild(el);}
    return el;
  }
  function setMetadata(tab){
    const cfg=routeForTab(tab);
    const canonical=`https://fplpeek.com${cfg.path}`;
    document.title=cfg.title;
    const desc=ensureMeta('meta[name="description"]',{name:"description"}); desc.setAttribute("content",cfg.description);
    let can=document.head.querySelector('link[rel="canonical"]');
    if(!can){can=document.createElement("link");can.rel="canonical";document.head.appendChild(can);} can.href=canonical;
    const ogUrl=ensureMeta('meta[property="og:url"]',{property:"og:url"}); ogUrl.setAttribute("content",canonical);
    const ogTitle=ensureMeta('meta[property="og:title"]',{property:"og:title"}); ogTitle.setAttribute("content",cfg.title);
    const ogDesc=ensureMeta('meta[property="og:description"]',{property:"og:description"}); ogDesc.setAttribute("content",cfg.description);
    const twTitle=ensureMeta('meta[name="twitter:title"]',{name:"twitter:title"}); twTitle.setAttribute("content",cfg.title);
    const twDesc=ensureMeta('meta[name="twitter:description"]',{name:"twitter:description"}); twDesc.setAttribute("content",cfg.description);
    const ld=document.getElementById("seoStructuredData");
    if(ld){
      try{
        const data=JSON.parse(ld.textContent||"{}");
        data.name=cfg.title.replace(/ \| FPL Peek$/,"");
        data.url=canonical;
        data.description=cfg.description;
        ld.textContent=JSON.stringify(data);
      }catch(_){ }
    }
  }
  function navigate(tab,replace){
    const cfg=routeForTab(tab);
    const currentQuery=location.search||"";
    const keepQuery=tab==="team" && new URLSearchParams(currentQuery).has("id") ? currentQuery : "";
    const target=cfg.path+keepQuery;
    if((location.pathname+location.search)!==target){
      history[replace?"replaceState":"pushState"]({fplPeekTab:tab},"",target);
    }
    setMetadata(tab);
  }
  window.FPLPeekSEO={ROUTES,routeForTab,tabForPath,setMetadata,navigate};
})();
