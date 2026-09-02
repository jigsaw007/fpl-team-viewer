
(function(){
  const FPL_PROXY = '/.netlify/functions/fpl?path=';
  const CAPTAINS_API = '/.netlify/functions/captains';

  const money = v => `£${(Number(v||0)/10).toFixed(1)}m`;
  const pct = v => `${Number(v||0).toFixed(1)}%`;
  const n = v => Number(v || 0);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const todayLabel = () => new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'long', year:'numeric' }).format(new Date());

  async function fetchJSON(url){
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function detectState(events, fixtures){
    const evs = events || [];
    const fx = fixtures || [];
    const byEvent = new Map();
    fx.forEach(f => {
      if (!f || !f.event) return;
      if (!byEvent.has(f.event)) byEvent.set(f.event, []);
      byEvent.get(f.event).push(f);
    });

    const fixtureState = eventId => {
      const list = byEvent.get(eventId) || [];
      if (!list.length) return { has:false, started:false, complete:false, live:false };
      const started = list.some(f => f.started || f.finished || f.finished_provisional);
      const complete = list.every(f => f.finished || f.finished_provisional);
      const live = list.some(f => (f.started || f.finished_provisional) && !f.finished && !f.finished_provisional);
      return { has:true, started, complete, live };
    };

    const liveEvent = [...evs].sort((a,b)=>b.id-a.id).find(e => {
      const s = fixtureState(e.id);
      return s.has && s.started && !s.complete;
    }) || null;

    const completedEvent = [...evs].sort((a,b)=>b.id-a.id).find(e => {
      const s = fixtureState(e.id);
      return s.has ? s.complete : !!(e.finished || e.data_checked);
    }) || null;

    const flaggedCurrent = evs.find(e => e.is_current) || null;
    const flaggedNext = evs.find(e => e.is_next) || null;

    // If the API still flags a completed GW as current, prefer the next GW.
    let current = liveEvent;
    if (!current && flaggedCurrent) {
      const s = fixtureState(flaggedCurrent.id);
      if (!s.has || !s.complete) current = flaggedCurrent;
    }

    let next = flaggedNext;
    if (!next) {
      const baseId = current ? current.id : (completedEvent ? completedEvent.id : 0);
      next = evs.find(e => e.id > baseId && !fixtureState(e.id).complete) || null;
    }

    const preview = current || next || completedEvent || flaggedCurrent || evs[0] || null;
    const review = completedEvent || flaggedCurrent || current || next || preview || null;

    return {
      current,
      next,
      finished: completedEvent,
      preview,
      review,
      focusLabel: current ? 'Live / current Gameweek' : next ? 'Upcoming deadline' : 'Latest available coverage'
    };
  }

  function buildFixtureMap(fixtures, teams){
    const out = {};
    const teamMap = new Map((teams || []).map(t => [t.id, t]));
    (fixtures || []).forEach(f => {
      if (!f || !f.team_h || !f.team_a) return;
      const homeOpp = teamMap.get(f.team_a) || {};
      const awayOpp = teamMap.get(f.team_h) || {};
      (out[f.team_h] ||= []).push({ opp: homeOpp, home: true, difficulty: n(f.team_h_difficulty), kickoff: f.kickoff_time || '', finished: !!f.finished });
      (out[f.team_a] ||= []).push({ opp: awayOpp, home: false, difficulty: n(f.team_a_difficulty), kickoff: f.kickoff_time || '', finished: !!f.finished });
    });
    Object.values(out).forEach(list => list.sort((a,b) => String(a.kickoff).localeCompare(String(b.kickoff))));
    return out;
  }

  function fixtureSummary(teamId, fixtureMap){
    const list = fixtureMap[teamId] || [];
    if(!list.length) return 'Fixture data updating';
    return list.slice(0, 2).map(x => `${x.home ? 'vs' : '@'} ${esc(x.opp.short_name || x.opp.name || '?')} · FDR ${x.difficulty || '—'}`).join(' · ');
  }

  function firstFixture(teamId, fixtureMap){
    const x = (fixtureMap[teamId] || [])[0];
    if(!x) return 'TBC';
    return `${x.home ? 'vs' : '@'} ${esc(x.opp.short_name || x.opp.name || '?')} · FDR ${x.difficulty || '—'}`;
  }

  function applySharedTokens(ctx){
    document.querySelectorAll('[data-token="updated-date"]').forEach(el => el.textContent = todayLabel());
    document.querySelectorAll('[data-token="preview-gw"]').forEach(el => el.textContent = ctx.preview ? ctx.preview.id : '—');
    document.querySelectorAll('[data-token="review-gw"]').forEach(el => el.textContent = ctx.review ? ctx.review.id : '—');
    document.querySelectorAll('[data-token="preview-gw-label"]').forEach(el => el.textContent = ctx.preview ? `GW${ctx.preview.id}` : 'Current GW');
    document.querySelectorAll('[data-token="review-gw-label"]').forEach(el => el.textContent = ctx.review ? `GW${ctx.review.id}` : 'Latest GW');
    document.querySelectorAll('[data-token="focus-label"]').forEach(el => el.textContent = ctx.focusLabel);
    document.querySelectorAll('[data-token="live-count"]').forEach(el => el.textContent = ctx.current ? '5 live/current pieces' : '5 rolling current pieces');
  }

  async function loadCtx(){
    const [boot, allFixtures] = await Promise.all([
      fetchJSON(FPL_PROXY + encodeURIComponent('/bootstrap-static/')),
      fetchJSON(FPL_PROXY + encodeURIComponent('/fixtures/')).catch(() => [])
    ]);
    const state = detectState(boot.events || [], allFixtures || []);
    let fixtures = [];
    if (state.preview && state.preview.id) {
      fixtures = (allFixtures || []).filter(f => Number(f.event) === Number(state.preview.id));
      if (!fixtures.length) {
        try { fixtures = await fetchJSON(FPL_PROXY + encodeURIComponent(`/fixtures/?event=${state.preview.id}`)); }
        catch(e){ fixtures = []; }
      }
    }
    const teamMap = new Map((boot.teams || []).map(t => [t.id, t]));
    const elementMap = new Map((boot.elements || []).map(e => [e.id, e]));
    const fixtureMap = buildFixtureMap(fixtures, boot.teams || []);
    return { boot, ...state, fixtures, teamMap, elementMap, fixtureMap };
  }

  function captainCardHTML(player, team, captainMeta, fixtureMap, sampleSize){
    const code = player.code || '';
    const captainShare = captainMeta && sampleSize ? (captainMeta.count / sampleSize) * 100 : 0;
    const recentForm = n(player.form);
    const ppg = n(player.points_per_game);
    const shortWhy = recentForm >= 7 ? 'Strong recent form with repeated routes to returns.'
      : ppg >= 6 ? 'Reliable points-per-game baseline for a safer armband.'
      : n(player.selected_by_percent) >= 20 ? 'Popular pick with a rank-shield profile.'
      : 'Interesting captaincy profile if you want controlled upside.';
    return `<article class="spotlight-card">
      <div class="spotlight-head">
        <div class="spotlight-photo-wrap"><img class="spotlight-photo" loading="lazy" src="/.netlify/functions/player-photo?code=${esc(code)}" alt="${esc(player.web_name)} headshot"></div>
        <div class="spotlight-title">
          <span class="spotlight-tag">Captain option</span>
          <h3>${esc(player.web_name)}</h3>
          <p>${esc(team.name || '')} · ${money(player.now_cost)} · ${pct(player.selected_by_percent)}</p>
        </div>
      </div>
      <div class="spotlight-why">${esc(shortWhy)}</div>
      <div class="spotlight-stats">
        <div><span>Top-manager captain sample</span><b>${captainShare ? pct(captainShare) : 'Tracking'}</b></div>
        <div><span>Form</span><b>${recentForm.toFixed(1)}</b></div>
        <div><span>Points / game</span><b>${ppg.toFixed(1)}</b></div>
        <div><span>Total points</span><b>${n(player.total_points).toLocaleString()}</b></div>
        <div><span>Goals</span><b>${n(player.goals_scored)}</b></div>
        <div><span>Assists</span><b>${n(player.assists)}</b></div>
        <div><span>Minutes</span><b>${n(player.minutes).toLocaleString()}</b></div>
        <div><span>Bonus</span><b>${n(player.bonus)}</b></div>
      </div>
      <div class="spotlight-fixture"><span>Upcoming fixture</span><b>${firstFixture(team.id, fixtureMap)}</b></div>
    </article>`;
  }

  function fallbackCaptainCandidates(ctx){
    return [...(ctx.boot.elements || [])]
      .filter(e => n(e.minutes) >= 90)
      .sort((a,b) => (n(b.form) * 2 + n(b.points_per_game)) - (n(a.form) * 2 + n(a.points_per_game)))
      .slice(0,3);
  }

  async function renderCaptainSpotlights(ctx){
    const host = document.getElementById('captainSpotlights');
    if(!host) return;
    host.innerHTML = '<div class="widget-loading">Loading captain shortlist…</div>';
    try {
      let sampleSize = 0;
      let captainRows = [];
      if (ctx.current) {
        try {
          const capData = await fetchJSON(CAPTAINS_API);
          sampleSize = n(capData.sample_size);
          captainRows = Array.isArray(capData.captains) ? capData.captains.slice(0,3) : [];
        } catch(e){}
      }
      let players = captainRows.map(r => ({ player: ctx.elementMap.get(r.element), row: r })).filter(x => x.player);
      if(!players.length){
        players = fallbackCaptainCandidates(ctx).map(p => ({ player: p, row: null }));
      }
      host.innerHTML = players.slice(0,3).map(({player,row}) => {
        const team = ctx.teamMap.get(player.team) || {};
        return captainCardHTML(player, team, row, ctx.fixtureMap, sampleSize);
      }).join('');
      const sampleEl = document.getElementById('captainSampleLabel');
      if(sampleEl) sampleEl.textContent = sampleSize ? `Top-manager captain sample: ${sampleSize} tracked teams` : (ctx.current ? 'Captain sample updates automatically when data is available' : 'Public captain sample updates after the deadline; current shortlist uses rolling player stats');
    } catch(e){
      host.innerHTML = '<div class="widget-error">Captain shortlist is temporarily unavailable. The article text still explains the decision process and links to the live tools.</div>';
    }
  }

  function playerMiniCard(player, team, extraLabel, extraValue){
    return `<article class="mini-player-card">
      <div class="mini-player-top">
        <img class="mini-player-photo" loading="lazy" src="/.netlify/functions/player-photo?code=${esc(player.code || '')}" alt="${esc(player.web_name)} headshot">
        <div><span>${esc(team.short_name || team.name || '')}</span><b>${esc(player.web_name)}</b><small>${money(player.now_cost)} · ${pct(player.selected_by_percent)}</small></div>
      </div>
      <div class="mini-player-bars">
        <div><span>${esc(extraLabel)}</span><b>${esc(extraValue)}</b></div>
        <div><span>Form</span><b>${n(player.form).toFixed(1)}</b></div>
        <div><span>Total points</span><b>${n(player.total_points)}</b></div>
      </div>
    </article>`;
  }

  function renderTransferSnapshot(ctx){
    const host = document.getElementById('transferSnapshot');
    if(!host) return;
    const pool = [...(ctx.boot.elements || [])];
    const topIn = [...pool].sort((a,b)=>n(b.transfers_in_event)-n(a.transfers_in_event)).slice(0,3);
    const topOut = [...pool].sort((a,b)=>n(b.transfers_out_event)-n(a.transfers_out_event)).slice(0,3);
    const makeCol = (title, rows, key) => `<div class="mini-widget-col"><div class="mini-widget-head"><b>${title}</b><span>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} movement</span></div>${rows.map(p => playerMiniCard(p, ctx.teamMap.get(p.team)||{}, key === 'in' ? 'Transfers in' : 'Transfers out', (key === 'in' ? n(p.transfers_in_event) : n(p.transfers_out_event)).toLocaleString())).join('')}</div>`;
    host.innerHTML = makeCol('Most transferred in', topIn, 'in') + makeCol('Most transferred out', topOut, 'out');
  }

  function renderDifferentialSnapshot(ctx){
    const host = document.getElementById('differentialSnapshot');
    if(!host) return;
    const rows = [...(ctx.boot.elements || [])]
      .filter(p => n(p.minutes) >= 90 && n(p.selected_by_percent) > 0 && n(p.selected_by_percent) <= 10)
      .sort((a,b)=> (n(b.form) + n(b.points_per_game)) - (n(a.form) + n(a.points_per_game)))
      .slice(0,4);
    host.innerHTML = rows.length ? rows.map(p => playerMiniCard(p, ctx.teamMap.get(p.team)||{}, 'Points / game', n(p.points_per_game).toFixed(1))).join('') : '<div class="widget-error">Not enough differential data yet.</div>';
  }

  function renderFixtureSnapshot(ctx){
    const host = document.getElementById('fixtureSnapshot');
    if(!host) return;
    const items = [...(ctx.boot.teams || [])].map(t => {
      const list = ctx.fixtureMap[t.id] || [];
      const avg = list.length ? list.reduce((sum,x)=>sum+n(x.difficulty),0)/list.length : 9;
      return { team: t, avg, label: fixtureSummary(t.id, ctx.fixtureMap) };
    }).sort((a,b)=>a.avg-b.avg).slice(0,6);
    host.innerHTML = `<div class="fixture-mini-table">${items.map((x,i)=>`<div class="fixture-mini-row"><span class="fixture-rank">${i+1}</span><div><b>${esc(x.team.name)}</b><small>${esc(x.label)}</small></div><strong>FDR ${x.avg<9?x.avg.toFixed(1):'—'}</strong></div>`).join('')}</div>`;
  }

  function renderPreviewSummary(ctx){
    const host = document.getElementById('previewSummary');
    if(!host) return;
    const mostIn = [...(ctx.boot.elements || [])].sort((a,b)=>n(b.transfers_in_event)-n(a.transfers_in_event))[0];
    const topDiff = [...(ctx.boot.elements || [])].filter(p=>n(p.selected_by_percent) <= 10 && n(p.minutes) >= 90).sort((a,b)=>n(b.form)-n(a.form))[0];
    const bestTeam = [...(ctx.boot.teams || [])].map(t => ({team:t, list:ctx.fixtureMap[t.id]||[]})).filter(x=>x.list.length).sort((a,b)=>n(a.list[0].difficulty)-n(b.list[0].difficulty))[0];
    host.innerHTML = `
      <article><span>Captaincy watch</span><b>Use the captaincy page for a live shortlist with headshots and key stats.</b><small id="previewCaptainHint">Popular armband conversations update automatically from live data.</small></article>
      <article><span>Transfer pulse</span><b>${mostIn ? esc(mostIn.web_name) : 'Transfer activity updating'}</b><small>${mostIn ? `${n(mostIn.transfers_in_event).toLocaleString()} transfers in for ${ctx.preview ? `GW${ctx.preview.id}` : 'the current Gameweek'}` : 'Official transfer activity will appear here shortly.'}</small></article>
      <article><span>Fixture edge</span><b>${bestTeam ? esc(bestTeam.team.name) : 'Fixture update pending'}</b><small>${bestTeam ? esc(firstFixture(bestTeam.team.id, ctx.fixtureMap)) : 'Check the fixture page for difficulty swings.'}</small></article>
      <article><span>Differential spark</span><b>${topDiff ? esc(topDiff.web_name) : 'Differential update pending'}</b><small>${topDiff ? `${pct(topDiff.selected_by_percent)} owned · form ${n(topDiff.form).toFixed(1)}` : 'Useful low-owned picks will appear when data is available.'}</small></article>`;
  }

  function renderHub(ctx){
    const heroBtn = document.getElementById('analysisHeroAction');
    if(heroBtn) heroBtn.textContent = `Explore ${ctx.preview ? `GW${ctx.preview.id}` : 'current'} analysis`;
    const focusBox = document.getElementById('analysisFocusGw');
    if(focusBox) focusBox.textContent = ctx.preview ? `Gameweek ${ctx.preview.id}` : 'Current coverage';
    const reviewBox = document.getElementById('analysisReviewGw');
    if(reviewBox) reviewBox.textContent = ctx.review ? `GW${ctx.review.id}` : 'Latest';
    const coverageBox = document.getElementById('analysisCoverageCount');
    if(coverageBox) coverageBox.textContent = '6 editorial pages';
    const heroAnchor = document.getElementById('dynamicCurrentLinks');
    if(heroAnchor) {
      heroAnchor.innerHTML = `
        <a class="analysis-card" href="/analysis/current-preview.html"><span class="tag">Decision hub</span><h2>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} preview: build the decision before the deadline</h2><p>A structured weekly checklist for transfers, captaincy, fixture swings, minutes risk and bench decisions.</p><span class="analysis-card-foot">Read analysis →</span></a>
        <a class="analysis-card" href="/analysis/current-captaincy.html"><span class="tag">Captaincy</span><h2>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} captaincy watch: shortlist before chasing a name</h2><p>Now enhanced with live player headshots, ownership and public FPL stats.</p><span class="analysis-card-foot">Read analysis →</span></a>
        <a class="analysis-card" href="/analysis/current-transfer-watch.html"><span class="tag">Transfers</span><h2>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} transfer watch: buy, sell or roll?</h2><p>See the most transferred-in and transferred-out players alongside the editorial process.</p><span class="analysis-card-foot">Read analysis →</span></a>
        <a class="analysis-card" href="/analysis/current-differentials.html"><span class="tag">Differentials</span><h2>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} differentials: when low ownership is useful</h2><p>Use low ownership as a risk lever, with a live shortlist of viable differential profiles.</p><span class="analysis-card-foot">Read analysis →</span></a>
        <a class="analysis-card" href="/analysis/current-fixture-focus.html"><span class="tag">Fixtures</span><h2>${ctx.preview ? `GW${ctx.preview.id}` : 'Current GW'} fixture focus: identify the next useful swing</h2><p>Review current fixture difficulty and plan across a useful window rather than a single opponent.</p><span class="analysis-card-foot">Read analysis →</span></a>
        <a class="analysis-card" href="/analysis/latest-review.html"><span class="tag">Review</span><h2>${ctx.review ? `GW${ctx.review.id}` : 'Latest GW'} review: separate good decisions from good outcomes</h2><p>A post-Gameweek review process to reduce hindsight bias and improve next-week decision quality.</p><span class="analysis-card-foot">Read analysis →</span></a>`;
    }
    const archive = document.getElementById('analysisArchiveList');
    if(archive){
      archive.innerHTML = `
        <a class="archive-link" href="/analysis/gw3-preview.html">GW3 preview archive</a>
        <a class="archive-link" href="/analysis/gw3-captaincy-watch.html">GW3 captaincy archive</a>
        <a class="archive-link" href="/analysis/gw3-transfer-watch.html">GW3 transfer watch archive</a>
        <a class="archive-link" href="/analysis/gw3-differentials.html">GW3 differentials archive</a>
        <a class="archive-link" href="/analysis/gw3-fixture-focus.html">GW3 fixture focus archive</a>
        <a class="archive-link" href="/analysis/gw2-review.html">GW2 review archive</a>`;
    }
  }

  function replaceHomeAnalysisLinks(ctx){
    const lead = document.querySelector('.home-analysis-lead');
    if(lead){
      lead.href = '/analysis/current-preview.html';
      const chip = lead.querySelector('.analysis-chip');
      const title = lead.querySelector('b');
      const desc = lead.querySelector('small');
      const tail = lead.querySelector('em');
      if(chip) chip.textContent = `${ctx.preview ? `GW${ctx.preview.id}` : 'Current'} · Decision hub`;
      if(title) title.textContent = `${ctx.preview ? `Gameweek ${ctx.preview.id}` : 'Current Gameweek'} preview: build the decision before the deadline`;
      if(desc) desc.textContent = 'A structured weekly checklist for transfers, captaincy, fixture swings, minutes risk and bench decisions — refreshed automatically for the current Gameweek.';
      if(tail) tail.textContent = `Read the ${ctx.preview ? `GW${ctx.preview.id}` : 'current GW'} preview →`;
    }
    const mini = document.querySelectorAll('.home-analysis-mini a');
    const links = [
      ['/analysis/current-captaincy.html', 'Captaincy', `How to build the ${ctx.preview ? `GW${ctx.preview.id}` : 'current'} captain shortlist`],
      ['/analysis/current-transfer-watch.html', 'Transfers', `Buy, sell or roll: ${ctx.preview ? `GW${ctx.preview.id}` : 'current GW'} transfer watch`],
      ['/analysis/current-differentials.html', 'Differentials', `Finding useful low-owned picks for ${ctx.preview ? `GW${ctx.preview.id}` : 'the current Gameweek'}`],
      ['/analysis/current-fixture-focus.html', 'Fixtures', 'Reading the next fixture swing']
    ];
    mini.forEach((a, i) => {
      const row = links[i];
      if(!row) return;
      a.href = row[0];
      const span = a.querySelector('span');
      const b = a.querySelector('b');
      if(span) span.textContent = row[1];
      if(b) b.textContent = row[2];
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let ctx = null;
    try { ctx = await loadCtx(); }
    catch(e) { ctx = null; }
    if(!ctx) return;
    applySharedTokens(ctx);
    replaceHomeAnalysisLinks(ctx);
    const page = document.body && document.body.dataset ? document.body.dataset.analysisPage : '';
    if(page === 'hub') renderHub(ctx);
    if(page === 'current-preview') renderPreviewSummary(ctx);
    if(page === 'current-captaincy') renderCaptainSpotlights(ctx);
    if(page === 'current-transfer') renderTransferSnapshot(ctx);
    if(page === 'current-differentials') renderDifferentialSnapshot(ctx);
    if(page === 'current-fixture') renderFixtureSnapshot(ctx);
  });
})();
