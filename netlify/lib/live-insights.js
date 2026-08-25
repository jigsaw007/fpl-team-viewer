const FPL_BASE = "https://fantasy.premierleague.com/api";

const n = (v, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const pct = v => n(v).toFixed(1);
const money = v => `£${(n(v) / 10).toFixed(1)}m`;
const avg = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 3;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const sentenceName = p => p?.web_name || `${p?.first_name || ""} ${p?.second_name || ""}`.trim() || "Player";
const kitUrl = team => team?.code ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${team.code}-66.webp` : "";
const playerPhotoUrl = p => p?.code ? `/.netlify/functions/player-photo?code=${p.code}` : "";

function decorateRows(blocks, players, teamById) {
  const byName = new Map(players.map(p => [sentenceName(p), p]));
  for (const b of blocks || []) {
    for (const r of b.rows || []) {
      const p = byName.get(r.name);
      if (!p) continue;
      const team = teamById.get(p.team);
      r.team_name = team?.name || "";
      r.team_short = team?.short_name || "";
      r.team_code = team?.code || null;
      r.kit_url = kitUrl(team);
      r.player_code = p.code || null;
      r.is_player = true;
      r.photo_url = playerPhotoUrl(p);
    }
  }
}

function decorateLead(lead, players, teamById, preferredPlayer=null, preferredTeam=null) {
  const p = preferredPlayer || players.find(x => (lead?.title || "").includes(sentenceName(x))) || players.find(x => (lead?.text || "").includes(sentenceName(x)));
  if (p) {
    const playerTeam = teamById.get(p.team);
    lead.visual_mode = "player";
    lead.featured_player = {name:sentenceName(p), code:p.code || null, photo_url:playerPhotoUrl(p), team:playerTeam?.name || "", team_code:playerTeam?.code || null, kit_url:kitUrl(playerTeam)};
    delete lead.featured_team;
    return;
  }
  if (preferredTeam) {
    lead.visual_mode = "team";
    lead.featured_team = {name:preferredTeam.name, short_name:preferredTeam.short_name, team_code:preferredTeam.code || null, kit_url:kitUrl(preferredTeam)};
    delete lead.featured_player;
  }
}

async function getJson(path) {
  const r = await fetch(`${FPL_BASE}${path}`, {
    headers: {
      "User-Agent": "FPL Peek/1.0 (+https://fplpeek.com)",
      Accept: "application/json"
    }
  });
  if (!r.ok) throw new Error(`FPL API ${r.status} for ${path}`);
  return r.json();
}

function fixtureMap(fixtures, teams, startGw, count = 5) {
  const byTeam = new Map(teams.map(t => [t.id, []]));
  const maxGw = startGw + count - 1;
  for (const f of fixtures) {
    if (!f.event || f.event < startGw || f.event > maxGw) continue;
    if (f.finished) continue;
    const h = byTeam.get(f.team_h); const a = byTeam.get(f.team_a);
    if (h) h.push({gw:f.event,opp:f.team_a,home:true,diff:n(f.team_h_difficulty,3),kickoff:f.kickoff_time});
    if (a) a.push({gw:f.event,opp:f.team_h,home:false,diff:n(f.team_a_difficulty,3),kickoff:f.kickoff_time});
  }
  for (const arr of byTeam.values()) arr.sort((x,y)=>x.gw-y.gw || String(x.kickoff).localeCompare(String(y.kickoff)));
  return byTeam;
}

function fixtureText(arr, teamById, limit=3) {
  return (arr || []).slice(0,limit).map(f => {
    const opp = teamById.get(f.opp)?.short_name || "TBC";
    return `${opp} (${f.home ? "H" : "A"})`;
  }).join(" · ") || "Fixtures TBC";
}

function availability(p) {
  if (p.status === "a") return true;
  if (p.chance_of_playing_next_round == null) return p.status !== "u";
  return n(p.chance_of_playing_next_round) >= 75;
}


function eventComplete(ev, fixtures=[]) {
  if (!ev) return false;
  if (ev.finished || ev.data_checked) return true;
  const rows=(fixtures||[]).filter(f=>f.event===ev.id);
  return rows.length>0 && rows.every(f=>f.finished || f.finished_provisional);
}

function playerScore(p, fdr, seasonStarted) {
  const form = n(p.form);
  const ppg = n(p.points_per_game);
  const fixture = clamp(4.2 - fdr, 0, 2.5);
  const market = Math.log10(1 + Math.max(0,n(p.transfers_in_event))) / 2.5;
  const ownership = Math.min(n(p.selected_by_percent),35) / 35;
  const base = form * 1.1 + ppg * .75 + fixture * 1.65 + market + ownership * .35;
  if (seasonStarted && n(p.minutes) < 45) return base - 2.5;
  return base;
}


function captainScore(p, fixturesForTeam, seasonStarted) {
  const first = (fixturesForTeam || [])[0] || null;
  const fdr = n(first?.diff, 3);
  const fixture = ({1:2.0,2:1.45,3:.78,4:.25,5:-.25})[fdr] ?? .78;
  const home = first?.home ? .58 : 0;
  const ep = Math.min(9, n(p.ep_next));
  const form = n(p.form);
  const ppg = n(p.points_per_game);
  const xgi90 = n(p.expected_goal_involvements_per_90);
  const xg90 = n(p.expected_goals_per_90);
  const xa90 = n(p.expected_assists_per_90);
  const price = n(p.now_cost, 40) / 10;
  const own = Math.min(80, n(p.selected_by_percent));
  const starts = Math.max(1, n(p.starts));
  const minsPerStart = n(p.minutes) / starts;
  const minutes = clamp(minsPerStart / 88, .45, 1.04);
  const penalty = n(p.penalties_order) > 0 && n(p.penalties_order) <= 2 ? .92 : 0;
  const setPieces = (n(p.direct_freekicks_order) > 0 && n(p.direct_freekicks_order) <= 2 ? .16 : 0) + (n(p.corners_and_indirect_freekicks_order) > 0 && n(p.corners_and_indirect_freekicks_order) <= 2 ? .08 : 0);
  const premium = Math.max(0, price - 8) * .16;
  const goalCeiling = Math.min(2.6, xg90 * 1.35 + xgi90 * .82 + xa90 * .18);
  const stable = ppg * .56 + own * .009 + premium + penalty + setPieces + fixture + home + goalCeiling;
  const liveSignal = seasonStarted ? ep * .58 + form * .48 : ep * .20;
  return (stable + liveSignal) * minutes * (availability(p) ? 1 : .35);
}

function reviewLead(gw, top, popularBlanks, teamById) {
  if (!top) return {
    kicker:`GW${gw} review`,
    title:`GW${gw}: the first useful signals are in`,
    text:"The review uses official FPL data to highlight what looks actionable, not simply repeat the points table."
  };
  const own = n(top.selected_by_percent);
  const club = teamById.get(top.team)?.name || "his club";
  if (own < 10 && n(top.event_points) >= 10) return {
    kicker:`GW${gw} review`,
    title:`${sentenceName(top)} delivered the differential haul of GW${gw}`,
    text:`${top.event_points} points at ${pct(top.selected_by_percent)}% ownership puts ${sentenceName(top)} on the radar. Our read: the haul deserves attention, but the next fixtures matter more than chasing points already scored.`
  };
  if (popularBlanks.length >= 3) return {
    kicker:`GW${gw} review`,
    title:`GW${gw} punished several popular picks`,
    text:`The week produced ${popularBlanks.length} highly owned players with two points or fewer. That is useful context, but one blank is rarely enough reason to abandon a good role or fixture run.`
  };
  return {
    kicker:`GW${gw} review`,
    title:`${sentenceName(top)} set the pace in GW${gw}`,
    text:`${sentenceName(top)} returned ${top.event_points} points for ${club}. The bigger question for the next deadline is whether the fixtures, role and market movement support a move now.`
  };
}

function previewLead(gw, fixtureSwings, marketIn, teamById) {
  const easy = fixtureSwings[0];
  const mover = marketIn[0];
  if (easy && mover) return {
    kicker:`GW${gw} preview`,
    title:`Fixture runs and transfer momentum are shaping GW${gw}`,
    text:`${teamById.get(easy.team)?.name || "One side"} owns one of the friendliest short-term fixture runs, while ${sentenceName(mover)} is attracting early transfers. Our read: use the market as a clue, not a command.`
  };
  return {
    kicker:`GW${gw} preview`,
    title:`What matters before the GW${gw} deadline`,
    text:"This page prioritises fixture quality, player form, availability and market movement. It follows the latest public FPL data as the deadline approaches."
  };
}

function listBlock(kind, title, intro, rows) {
  return {kind,title,intro,rows:rows.filter(Boolean)};
}

async function buildLiveInsights() {
  const [boot, fixtures] = await Promise.all([getJson("/bootstrap-static/"), getJson("/fixtures/")]);
  const teams = boot.teams || [];
  const players = boot.elements || [];
  const events = boot.events || [];
  const teamById = new Map(teams.map(t=>[t.id,t]));
  const completedEvents = [...events].filter(e=>eventComplete(e,fixtures)).sort((a,b)=>b.id-a.id);
  const latestFinished = completedEvents[0] || null;
  const current = events.find(e=>e.is_current) || null;
  const next = events.find(e=>e.is_next) || null;
  const currentComplete = eventComplete(current,fixtures);
  const reviewGw = latestFinished?.id || 0;
  const now = Date.now();
  const currentDeadline = current?.deadline_time ? Date.parse(current.deadline_time) : 0;
  const isLive = !!(current && !currentComplete && currentDeadline && currentDeadline <= now);
  const previewGw = next?.id || (!isLive && current && !currentComplete ? current.id : (reviewGw<38 ? reviewGw+1 : 0));
  const seasonStarted = reviewGw > 0 || !!current;
  const baseGw = previewGw || Math.min(38,(reviewGw || 0)+1) || 1;
  const fmap = fixtureMap(fixtures, teams, baseGw, 5);
  const teamFdr = new Map(teams.map(t=>[t.id,avg((fmap.get(t.id)||[]).slice(0,3).map(f=>f.diff))]));

  const fitPlayers = players.filter(availability);
  const topPerformers = [...players].filter(p=>n(p.event_points)>0).sort((a,b)=>n(b.event_points)-n(a.event_points) || n(b.total_points)-n(a.total_points)).slice(0,5);
  const popularBlanks = [...players].filter(p=>n(p.selected_by_percent)>=15 && n(p.minutes)>0 && n(p.event_points)<=2).sort((a,b)=>n(b.selected_by_percent)-n(a.selected_by_percent)).slice(0,5);
  const marketIn = [...fitPlayers].sort((a,b)=>n(b.transfers_in_event)-n(a.transfers_in_event)).slice(0,5);
  const marketOut = [...players].sort((a,b)=>n(b.transfers_out_event)-n(a.transfers_out_event)).slice(0,5);
  const fixtureSwings = teams.map(t=>({team:t.id,avg:teamFdr.get(t.id),fixtures:fmap.get(t.id)||[]})).filter(x=>x.fixtures.length).sort((a,b)=>a.avg-b.avg).slice(0,5);
  const watch = [...fitPlayers].map(p=>({p,score:playerScore(p,teamFdr.get(p.team)||3,seasonStarted)})).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.p);
  const differentials = [...fitPlayers].filter(p=>n(p.selected_by_percent)>0.3 && n(p.selected_by_percent)<=10).map(p=>({p,score:playerScore(p,teamFdr.get(p.team)||3,seasonStarted)})).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.p);
  const captainRanked = [...fitPlayers]
    .filter(p=>[3,4].includes(p.element_type) && n(p.selected_by_percent)>=5)
    .map(p=>({p,score:captainScore(p,fmap.get(p.team)||[],seasonStarted)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,4);
  const captains = captainRanked.map(x=>x.p);
  const captainScoreById = new Map(captainRanked.map(x=>[x.p.id,x.score]));

  const blocks = [];
  let lead;
  if (isLive) {
    const liveTop = topPerformers[0];
    lead = {
      kicker:`GW${current.id} live`,
      title:liveTop ? `GW${current.id} is live: ${sentenceName(liveTop)} leads the early returns` : `GW${current.id} is live`,
      text:"Scores, bonus and minutes can still change. Treat this as an early read rather than a finished Gameweek review."
    };
    if (topPerformers.length) blocks.push(listBlock("live","Live returns so far", "Useful for context, but not a final verdict while matches and bonus can still change.", topPerformers.slice(0,4).map(p=>({
      name:sentenceName(p), meta:`${teamById.get(p.team)?.short_name || ""} · ${p.event_points} pts · ${pct(p.selected_by_percent)}% owned`, note:n(p.selected_by_percent)<10?"A low-owned return worth monitoring after the Gameweek closes.":"Wait for the Gameweek to finish before making conclusions."
    }))));
  } else if (previewGw) {
    // Between deadlines the live notebook should move forward to the next Gameweek.
    // The completed round remains available in the archive and as a compact review block below.
    lead = previewLead(previewGw, fixtureSwings, marketIn, teamById);
    if (reviewGw && topPerformers.length) blocks.push(listBlock("review",`GW${reviewGw} final standouts`, `A quick final look at GW${reviewGw}; the main briefing has already moved on to GW${previewGw}.`, topPerformers.slice(0,4).map(p=>({
      name:sentenceName(p), meta:`${teamById.get(p.team)?.short_name || ""} · ${p.event_points} pts · ${pct(p.selected_by_percent)}% owned`, note:n(p.selected_by_percent)<10?"A low-owned return worth carrying into the next-fixture conversation.":"Final return recorded; judge the player on what comes next."
    }))));
  } else if (reviewGw) {
    lead = reviewLead(reviewGw, topPerformers[0], popularBlanks, teamById);
    blocks.push(listBlock("review","What stood out", "The highest returns are useful, but they are only the starting point.", topPerformers.slice(0,4).map(p=>({
      name:sentenceName(p), meta:`${teamById.get(p.team)?.short_name || ""} · ${p.event_points} pts · ${pct(p.selected_by_percent)}% owned`, note:n(p.selected_by_percent)<10?"Low ownership makes this a genuine differential return.":"A strong return; check the next fixtures before reacting."
    }))));
    if (popularBlanks.length) blocks.push(listBlock("caution","Popular blanks", "A blank is information, not necessarily a sell signal.", popularBlanks.slice(0,4).map(p=>({
      name:sentenceName(p), meta:`${pct(p.selected_by_percent)}% owned · ${p.event_points} pts`, note:`Next three: ${fixtureText(fmap.get(p.team),teamById,3)}`
    }))));
  } else {
    lead = previewLead(baseGw, fixtureSwings, marketIn, teamById);
  }

  if (previewGw || !reviewGw) {
    blocks.push(listBlock("watch","Players on the radar", "A rules-based shortlist using form, FPL output, availability, market interest and the next fixtures. It is a watchlist, not a transfer order.", watch.slice(0,5).map(p=>({
      name:sentenceName(p), meta:`${teamById.get(p.team)?.short_name || ""} · ${money(p.now_cost)} · ${pct(p.selected_by_percent)}% owned`, note:`Form ${n(p.form).toFixed(1)} · next three: ${fixtureText(fmap.get(p.team),teamById,3)}`
    }))));
    if (differentials.length) blocks.push(listBlock("differential","Differential watch", "Lower-owned players whose current profile and fixtures make them worth monitoring.", differentials.slice(0,4).map(p=>({
      name:sentenceName(p), meta:`${pct(p.selected_by_percent)}% owned · ${money(p.now_cost)}`, note:`Form ${n(p.form).toFixed(1)} · ${fixtureText(fmap.get(p.team),teamById,3)}`
    }))));
    if (captains.length) blocks.push(listBlock("captain","FPL Peek captain ranking", "A predictive captain shortlist balancing expected return, goal involvement, penalties, minutes security, fixture, home advantage and proven FPL output.", captains.map((p,i)=>({
      name:sentenceName(p), meta:`${i===0?"Top captain":"Captain option"} · ${pct(p.selected_by_percent)}% owned`, note:`Next: ${fixtureText(fmap.get(p.team),teamById,1)} · Captain Score ${captainScoreById.get(p.id).toFixed(1)}`
    }))));
  }

  if (fixtureSwings.length) blocks.push(listBlock("fixtures","Fixture runs to notice", "Teams with the lowest average FPL difficulty across their next three scheduled fixtures.", fixtureSwings.slice(0,4).map(x=>({
    name:teamById.get(x.team)?.name || "Team", meta:`Avg FDR ${x.avg.toFixed(2)}`, note:fixtureText(x.fixtures,teamById,3),
    team_name:teamById.get(x.team)?.name || "", team_short:teamById.get(x.team)?.short_name || "", team_code:teamById.get(x.team)?.code || null, kit_url:kitUrl(teamById.get(x.team))
  }))));

  const marketRows = marketIn.slice(0,4).map((p,i)=>({
    name:sentenceName(p), meta:`+${n(p.transfers_in_event).toLocaleString("en-GB")} transfers in`, note:`${money(p.now_cost)} · ${pct(p.selected_by_percent)}% owned${marketOut[i] ? ` · Most-sold watch: ${sentenceName(marketOut[i])}` : ""}`
  }));
  if (marketRows.some(r=>!r.meta.includes("+0 "))) blocks.push(listBlock("market","Transfer market", "Early movement can reveal where managers are looking, but popularity alone is not a reason to buy.", marketRows));

  // Add a little more editorial depth without turning the page into a long-form blog.
  if (isLive) {
    const liveTop = topPerformers[0];
    lead.paragraphs = [
      liveTop ? `${sentenceName(liveTop)} is setting the early pace on ${n(liveTop.event_points)} points, but live FPL scoring can still move as minutes, bonus and remaining fixtures settle.` : `GW${current?.id || baseGw} is still developing, so the useful job right now is separating confirmed returns from noise.`,
      `The best use of this page during a live round is context: note who is returning, who has the minutes, and which outcomes might change plans for the next deadline. The finished review will carry more weight than an early rank swing.`
    ];
    lead.takeaway = "Treat live scores as provisional. The finished Gameweek matters more than an early rank swing, and the next fixture run should decide whether a return is worth acting on.";
    decorateLead(lead, players, teamById, liveTop || null);
  } else if (previewGw) {
    const mover = marketIn[0];
    const easy = fixtureSwings[0];
    const cap = captains[0];
    lead.paragraphs = [
      reviewGw ? `GW${reviewGw} is complete, so the live notebook has moved on to GW${previewGw}. Final GW${reviewGw} returns remain in the archive; this briefing is about the next decision.` : `The focus is now GW${previewGw}: fixture quality, expected minutes, availability and role matter more than chasing the previous round's points.`,
      easy ? `${teamById.get(easy.team)?.name || "One club"} has one of the friendlier short-term fixture runs${mover ? `, while ${sentenceName(mover)} is attracting early transfer interest` : ""}. Market movement is useful context, not a transfer command.` : `The next fixtures now matter more than the points already scored.`,
      cap ? `${sentenceName(cap)} currently leads the FPL Peek captain ranking for GW${previewGw}. Recheck availability and team news before the deadline.` : `Captaincy will become clearer as the deadline approaches and availability information settles.`
    ];
    lead.takeaway = `Treat GW${reviewGw || Math.max(1,previewGw-1)} as history and GW${previewGw} as the decision window. Prioritise the next three fixtures, expected minutes and role before reacting to one return or blank.`;
    lead.visual_mode = "neutral";
    lead.visual_label = `GW${previewGw}`;
    delete lead.featured_player;
    delete lead.featured_team;
  } else if (reviewGw) {
    const star = topPerformers[0];
    const mover = marketIn[0];
    const easy = fixtureSwings[0];
    lead.paragraphs = [
      star ? `${sentenceName(star)} produced one of the headline FPL returns with ${n(star.event_points)} points. The score matters, but the more useful question is whether the next fixtures and current role make that return actionable before the next deadline.` : `The latest Gameweek is complete, so the focus shifts from live scores to what should actually influence the next decision.`,
      popularBlanks.length ? `${popularBlanks.length} widely owned players finished on two points or fewer. That creates pressure to react, but a single blank is weak evidence on its own; fixture quality, minutes and role should still carry more weight.` : `There was no broad collapse among the most-owned picks, which makes it easier to judge transfers on upcoming opportunity rather than frustration with one result.`,
      `${easy ? `${teamById.get(easy.team)?.name || "One club"} has one of the friendlier short-term fixture runs` : "The next fixtures now matter more than the points just scored"}${mover ? `, while ${sentenceName(mover)} is already drawing transfer interest` : ""}. The useful move is to connect those signals rather than chase the previous week's leaderboard.`
    ];
    lead.takeaway = star ? `Start with whether ${sentenceName(star)}'s next fixtures support the haul. One blank is not a reason to sell a good pick, and the next three fixtures should carry more weight than last week's points.` : "Judge the strongest returns against what comes next. One blank is weak evidence, so prioritise the next three fixtures before changing a good pick.";
    decorateLead(lead, players, teamById, star || null);
  } else {
    const mover = marketIn[0];
    const easy = fixtureSwings[0];
    const cap = captains[0];
    lead.paragraphs = [
      easy ? `${teamById.get(easy.team)?.name || "One club"} enters the opening stretch with one of the strongest short-term fixture profiles. That is useful because early-season decisions are often better when they start with schedule and expected minutes rather than ownership alone.` : `With no completed Gameweek yet, the strongest signals come from fixture quality, expected minutes, availability and how heavily managers are backing particular players.`,
      mover ? `${sentenceName(mover)} is attracting early transfer interest. That can be a useful clue about where the market is moving, but it is not enough by itself to make a transfer.` : `The transfer market is still quiet, so there is little value in forcing conclusions from movement that has not started yet.`,
      cap ? `${sentenceName(cap)} leads the current FPL Peek captain ranking after balancing attacking ceiling, penalties, expected minutes, fixture and home/away context. The final call should still wait for the latest availability and team news.` : `Captaincy becomes more meaningful once the final availability picture and opening fixtures are clear.`
    ];
    lead.takeaway = easy ? `Start with the strongest fixture runs, then use market movement only as supporting evidence. Recheck availability close to the deadline before making the final call.` : "Start with fixtures and expected minutes, use market movement only as supporting evidence, and recheck availability close to the deadline.";
    lead.visual_mode = "neutral";
    lead.visual_label = `GW${baseGw}`;
    delete lead.featured_player;
    delete lead.featured_team;
  }
  decorateRows(blocks, players, teamById);

  const phase = isLive ? "live" : !reviewGw ? "preview" : previewGw ? "between-gameweeks" : "season-review";
  return {
    generated_at:new Date().toISOString(),
    phase,
    review_gameweek:reviewGw || null,
    preview_gameweek:previewGw || null,
    lead,
    blocks:blocks.slice(0,7),
    available_gameweeks:[...events].filter(e=>eventComplete(e,fixtures)).map(e=>e.id),
    footer_note:"FPL Peek Insights uses public Fantasy Premier League data and transparent rules. It does not claim to have watched matches or know information outside the public data feed."
  };
}


async function buildHistoricalInsights(gw) {
  const gameweek = Number(gw);
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) throw new Error("Invalid Gameweek");
  const [boot, live, fixtures] = await Promise.all([
    getJson("/bootstrap-static/"),
    getJson(`/event/${gameweek}/live/`),
    getJson("/fixtures/")
  ]);
  const event = (boot.events || []).find(e => e.id === gameweek);
  if (!event || !eventComplete(event,fixtures)) throw new Error(`GW${gameweek} is not complete yet`);
  const teams = boot.teams || [];
  const players = boot.elements || [];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const playerById = new Map(players.map(p => [p.id, p]));
  const rows = (live.elements || []).map(x => ({
    id:x.id,
    p:playerById.get(x.id),
    s:x.stats || {}
  })).filter(x => x.p);
  const top = [...rows].sort((a,b)=>n(b.s.total_points)-n(a.s.total_points) || n(b.s.minutes)-n(a.s.minutes)).slice(0,8);
  const goals = [...rows].filter(x=>n(x.s.goals_scored)>0).sort((a,b)=>n(b.s.goals_scored)-n(a.s.goals_scored) || n(b.s.total_points)-n(a.s.total_points)).slice(0,6);
  const assists = [...rows].filter(x=>n(x.s.assists)>0).sort((a,b)=>n(b.s.assists)-n(a.s.assists) || n(b.s.total_points)-n(a.s.total_points)).slice(0,6);
  const bonus = [...rows].filter(x=>n(x.s.bonus)>0).sort((a,b)=>n(b.s.bonus)-n(a.s.bonus) || n(b.s.total_points)-n(a.s.total_points)).slice(0,6);
  const keepers = [...rows].filter(x=>x.p.element_type===1 && (n(x.s.saves)>0 || n(x.s.clean_sheets)>0)).sort((a,b)=>n(b.s.total_points)-n(a.s.total_points)).slice(0,5);
  const gwFixtures=(fixtures||[]).filter(f=>f.event===gameweek && f.finished);
  const results=gwFixtures.map(f=>({
    name:`${teamById.get(f.team_h)?.short_name || "Home"} ${n(f.team_h_score)}–${n(f.team_a_score)} ${teamById.get(f.team_a)?.short_name || "Away"}`,
    meta:"Final score",
    note:n(f.team_h_score)+n(f.team_a_score)>=5?"One of the higher-scoring matches of the Gameweek.":"Completed fixture.",
    fixture_kits:[kitUrl(teamById.get(f.team_h)),kitUrl(teamById.get(f.team_a))].filter(Boolean)
  }));
  const blocks=[];
  if(top.length) blocks.push(listBlock("review","Top FPL returns",`The leading final scores from GW${gameweek}.`,top.slice(0,6).map(x=>({
    name:sentenceName(x.p),
    meta:`${teamById.get(x.p.team)?.short_name || ""} · ${n(x.s.total_points)} pts · ${n(x.s.minutes)} mins`,
    note:[n(x.s.goals_scored)?`${n(x.s.goals_scored)} goal${n(x.s.goals_scored)===1?'':'s'}`:'',n(x.s.assists)?`${n(x.s.assists)} assist${n(x.s.assists)===1?'':'s'}`:'',n(x.s.bonus)?`${n(x.s.bonus)} bonus`:''].filter(Boolean).join(" · ") || "Points came from the final FPL event data."
  }))));
  if(goals.length) blocks.push(listBlock("goals","Goal threat that paid off","Players who converted their attacking involvement into goals in this Gameweek.",goals.map(x=>({name:sentenceName(x.p),meta:`${n(x.s.goals_scored)} goal${n(x.s.goals_scored)===1?'':'s'} · ${n(x.s.total_points)} pts`,note:n(x.s.bonus)?`${n(x.s.bonus)} bonus point${n(x.s.bonus)===1?'':'s'}`:"No bonus points"}))));
  if(assists.length) blocks.push(listBlock("assists","Creators who returned","The main assist contributors from the final Gameweek data.",assists.map(x=>({name:sentenceName(x.p),meta:`${n(x.s.assists)} assist${n(x.s.assists)===1?'':'s'} · ${n(x.s.total_points)} pts`,note:`${n(x.s.minutes)} minutes played`}))));
  if(bonus.length) blocks.push(listBlock("bonus","Bonus leaders","Players who collected the most official FPL bonus points.",bonus.map(x=>({name:sentenceName(x.p),meta:`${n(x.s.bonus)} bonus · ${n(x.s.total_points)} pts`,note:`${n(x.s.bps)} BPS`}))));
  if(keepers.length) blocks.push(listBlock("keepers","Goalkeeper returns","Goalkeepers who combined saves, clean sheets or bonus into useful returns.",keepers.map(x=>({name:sentenceName(x.p),meta:`${n(x.s.total_points)} pts · ${n(x.s.saves)} saves`,note:n(x.s.clean_sheets)?"Clean sheet":"No clean sheet"}))));
  if(results.length) blocks.push(listBlock("results","GW results","Completed Premier League fixtures attached to this FPL Gameweek.",results));
  const star=top[0];
  const lead=star?{
    kicker:`GW${gameweek} archive`,
    title:`${sentenceName(star.p)} topped the FPL scoring in GW${gameweek}`,
    text:`${sentenceName(star.p)} finished on ${n(star.s.total_points)} points. This archive keeps the final Gameweek returns and results available after the current briefing has moved on.`
  }:{kicker:`GW${gameweek} archive`,title:`GW${gameweek} review`,text:"Final Gameweek data from the official public FPL feed."};
  lead.paragraphs = star ? [
    `${sentenceName(star.p)} ended GW${gameweek} as the leading FPL scorer on ${n(star.s.total_points)} points across ${n(star.s.minutes)} minutes. The return is preserved here alongside the other final event data rather than being overwritten by the next Gameweek.`,
    goals.length ? `${goals.length} of the leading attacking contributors recorded at least one goal, while ${assists.length} players feature among the main assist returns. Those outcomes explain where the biggest FPL swings came from in the round.` : `The Gameweek was less about a single wave of goals and more about how clean sheets, assists and bonus combined across the final scores.`,
    bonus.length ? `${sentenceName(bonus[0].p)} led the bonus group with ${n(bonus[0].s.bonus)} bonus point${n(bonus[0].s.bonus)===1?'':'s'}. Looking back, the useful context is the complete return profile rather than only the headline score.` : `Bonus did not create a major separate story in this round, so the final points table tells most of the story.`
  ] : [`GW${gameweek} is complete. This page keeps the final FPL returns and fixture results available as a reference point for the rest of the season.`];
  lead.takeaway = star ? `${sentenceName(star.p)} finished on ${n(star.s.total_points)} points. The archive keeps that return in context with the main goal, assist and bonus outcomes across all ${gwFixtures.length} completed fixtures.` : "This archive keeps the final Gameweek returns and results available as a season reference.";
  decorateRows(blocks, players, teamById);
  decorateLead(lead, players, teamById, star?.p || null);
  return {
    generated_at:new Date().toISOString(),
    phase:"archive",
    review_gameweek:gameweek,
    preview_gameweek:null,
    lead,
    blocks:blocks.slice(0,7),
    available_gameweeks:[...boot.events].filter(e=>eventComplete(e,fixtures)).map(e=>e.id),
    footer_note:"This archive is rebuilt from final public Fantasy Premier League Gameweek data. Historical ownership and transfer snapshots are not shown because the public feed does not preserve every past market value."
  };
}

module.exports = { buildLiveInsights, buildHistoricalInsights };
