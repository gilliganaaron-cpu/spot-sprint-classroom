(() => {
  'use strict';
  const socket = io({ reconnection: true, timeout: 10000 });
  const screen = document.getElementById('screen');
  const alertBox = document.getElementById('alert');
  const connection = document.getElementById('connection');
  const soundBtn = document.getElementById('sound-btn');
  const musicBtn = document.getElementById('music-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const ENTRY_KEY = 'spotsprint:session';
  const SOUND_KEY = 'spotsprint:muted';
  const MUSIC_KEY = 'spotsprint:musicEnabled';
  const query = new URLSearchParams(location.search);
  const suggestedCode = (query.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const format = n => String(n).padStart(2, '0');
  // The source illustration for each symbol is ALWAYS the same sprite image,
  // regardless of device / browser emoji fonts. Only its scale and placement
  // vary by card, in the spirit of Spot It.
  const positions = [
    [50, 50], [51, 18], [75, 31], [80, 58],
    [63, 79], [32, 79], [19, 57], [26, 29]
  ];
  const preview = {
    id: 1,
    symbols: [
      [2,'fox'], [23,'sunflower'], [43,'rocket'], [35,'guitar'],
      [16,'turtle'], [33,'doughnut'], [48,'basketball'], [56,'rainbow']
    ].map(([id,label]) => ({ id, label }))
  };
  function cardVariation(cardId, symbolId, index, salt) {
    // Stable across rerenders; varies from card to card even for the same symbol.
    let n = (Math.imul(cardId + 37, 19771) ^ Math.imul(symbolId + 59, 27449) ^ Math.imul(index + 1, 31469) ^ salt) >>> 0;
    n = Math.imul(n ^ (n >>> 15), 2246822507) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 3266489909) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function artwork(symbolId) {
    const x = (symbolId % 8) * (100 / 7);
    const y = Math.floor(symbolId / 8) * (100 / 7);
    return `<span class="symbol-art" aria-hidden="true" style="background-position:${x.toFixed(5)}% ${y.toFixed(5)}%"></span>`;
  }
  let view = null;
  let session = readSession();
  let localMuted = localStorage.getItem(SOUND_KEY) === 'true';
  let musicEnabled = localStorage.getItem(MUSIC_KEY) !== 'false';
  let musicTimer = null;
  let musicBus = null;
  let musicStep = 0;
  let nextMusicTime = 0;
  let musicDucked = false;
  let musicMode = null;
  let audio = null;
  let lastEventId = null;
  let winningEventShown = null;
  let toastTimeout = null;
  let choiceLocked = false;
  let joinDraft = { code: suggestedCode || '', name: '' };
  let creating = false;
  let joining = false;
  let penaltyTurn = null;
  let wrongFlashTimeout = null;

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(ENTRY_KEY) || 'null'); } catch { return null; }
  }
  function saveSession(role, code, token) {
    session = { role, code, token };
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(session));
    socket.setRoom(session);
  }
  function clearSession() {
    session = null;
    sessionStorage.removeItem(ENTRY_KEY);
    socket.clearRoom();
    view = null;
    penaltyTurn = null;
    if (wrongFlashTimeout) clearTimeout(wrongFlashTimeout);
    stopMusic();
  }
  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function unlockAudio() {
    if (localMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audio) audio = new AudioContext();
      if (audio.state === 'suspended') audio.resume().then(() => syncMusic()).catch(() => {});
    } catch { /* Browser has no Web Audio support. The game still works. */ }
  }
  function tone(frequency, delay, duration, volume = .07, type = 'sine', destination = null) {
    if (!audio || localMuted) return;
    const at = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(destination || audio.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
  }
  function playSound(which) {
    if (localMuted || !audio) return;
    try {
      if (which === 'correct') { tone(660, 0, .12); tone(990, .11, .22); }
      if (which === 'celebrate') { [740, 988, 1175, 1480].forEach((f,i)=>tone(f, i*.13, .22, .105, 'triangle')); tone(1960, .58, .27, .075); }
      if (which === 'wrong') { tone(230, 0, .18, .045, 'triangle'); tone(180, .12, .16, .035, 'triangle'); }
      if (which === 'flip') tone(480, 0, .09, .025, 'sine');
      if (which === 'start') { tone(450, 0, .1); tone(640, .13, .1); tone(880, .27, .25); }
      if (which === 'win') {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .11, .27, .07));
      }
    } catch { /* Never block game play for unavailable audio. */ }
  }
  // Two original, browser-synthesised instrumental tracks: a playful lobby
  // theme and a faster race theme. No downloads, third-party audio or royalties.
  // Played on the teacher projector only, never on every student device.
  const TRACKS = {
    lobby: {
      bpm: 122,
      melody: [
        659, 784, 988, null, 880, 784, 659, null,
        587, 659, 784, 880, 784, 659, 587, null,
        659, 784, 1047, 988, 880, 784, 659, null,
        698, 784, 880, 784, 659, 587, 523, null
      ],
      bass: [131, 147, 165, 147, 131, 147, 175, 196],
      chords: [
        [523, 659, 784], [587, 698, 880], [659, 784, 988], [587, 740, 880],
        [523, 659, 784], [494, 659, 784], [587, 698, 880], [440, 659, 784]
      ]
    },
    playing: {
      bpm: 134,
      melody: [
        784, 988, 1175, 988, 880, 784, 698, null,
        784, 988, 1175, 1319, 1175, 988, 880, null,
        880, 988, 1175, 988, 1319, 1175, 988, 880,
        784, 880, 988, 1175, 1047, 988, 880, null
      ],
      bass: [110, 110, 131, 131, 147, 147, 165, 165],
      chords: [
        [392, 523, 659], [440, 554, 698], [494, 659, 784], [523, 659, 784],
        [440, 554, 698], [494, 659, 784], [523, 659, 784], [587, 740, 880]
      ]
    }
  };
  function scheduleMusic() {
    if (!audio || !musicBus || !musicMode) return;
    const track = TRACKS[musicMode];
    while (nextMusicTime < audio.currentTime + .24) {
      const n = musicStep % track.melody.length;
      const stepInBar = n % 8;
      const delay = Math.max(0, nextMusicTime - audio.currentTime);
      if (track.melody[n]) tone(track.melody[n], delay, musicMode === 'lobby' ? .18 : .16, musicMode === 'lobby' ? .02 : .024, stepInBar % 4 === 0 ? 'triangle' : 'square', musicBus);
      if (stepInBar % 4 === 0) {
        tone(track.bass[Math.floor(n / 4) % track.bass.length], delay, .33, .028, 'sine', musicBus);
        for (const [i, f] of track.chords[Math.floor(n / 4) % track.chords.length].entries()) {
          tone(f, delay, musicMode === 'lobby' ? .34 : .28, Math.max(.004, .012 - i * .002), i === 0 ? 'triangle' : 'sine', musicBus);
        }
        tone(72, delay, .09, musicMode === 'lobby' ? .018 : .025, 'sine', musicBus);
      }
      if (stepInBar === 4) tone(210, delay, .08, .0055, 'triangle', musicBus);
      if (stepInBar % 2 === 0) tone(musicMode === 'lobby' ? 1280 : 1450, delay + .01, .03, musicMode === 'lobby' ? .0032 : .0042, 'square', musicBus);
      if (musicMode === 'lobby' && stepInBar === 6) tone(1568, delay, .12, .0075, 'sine', musicBus);
      if (musicMode === 'playing' && [1,3,5,7].includes(stepInBar)) tone(1760, delay + .015, .02, .0048, 'square', musicBus);
      musicStep++;
      nextMusicTime += 30 / track.bpm;
    }
  }
  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (musicBus && audio) {
      musicBus.gain.setTargetAtTime(.0001, audio.currentTime, .035);
      // Notes already scheduled fade through the old bus.
    }
    musicBus = null;
    musicDucked = false;
    musicMode = null;
  }
  function syncMusic() {
    const mode = view?.role === 'teacher' && ['lobby','playing'].includes(view.status) && musicEnabled && !localMuted && audio && audio.state === 'running' ? view.status : null;
    if (!mode) { stopMusic(); return; }
    if (musicMode !== mode) stopMusic();
    if (!musicTimer) {
      musicMode = mode;
      musicBus = audio.createGain();
      musicBus.gain.value = .0001;
      musicBus.connect(audio.destination);
      musicStep = 0;
      nextMusicTime = audio.currentTime + .08;
      musicTimer = setInterval(scheduleMusic, 95);
      scheduleMusic();
    }
    const duck = Boolean(view.pendingMatch);
    if (musicDucked !== duck || musicBus.gain.value < .05) {
      musicBus.gain.setTargetAtTime(duck ? .13 : (mode === 'lobby' ? .75 : .85), audio.currentTime, .12);
      musicDucked = duck;
    }
  }
  function setSoundUI() {
    soundBtn.innerHTML = localMuted ? '🔇 <span>Sound off</span>' : '🔊 <span>Sound on</span>';
    soundBtn.setAttribute('aria-pressed', String(!localMuted));
    musicBtn.hidden = view?.role !== 'teacher';
    fullscreenBtn.hidden = view?.role !== 'teacher';
    const name = view?.status === 'lobby' ? 'Lobby music' : 'Game music';
    musicBtn.innerHTML = musicEnabled ? `🎵 <span>${name} on</span>` : `🎶 <span>${name} off</span>`;
    musicBtn.setAttribute('aria-pressed', String(musicEnabled));
  }
  function updateFullscreenUI() {
    const on = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    document.documentElement.classList.toggle('fullscreen-mode', on);
    fullscreenBtn.innerHTML = on ? '⤢ <span>Exit full screen</span>' : '⛶ <span>Full screen</span>';
    fullscreenBtn.setAttribute('aria-pressed', String(on));
    fullscreenBtn.setAttribute('title', on ? 'Exit full screen' : 'Show the game without scrolling');
  }
  function toast(message, error = false) {
    clearTimeout(toastTimeout);
    alertBox.className = `toast visible ${error ? 'toast-error' : ''}`;
    alertBox.textContent = message;
    toastTimeout = setTimeout(() => alertBox.classList.remove('visible'), 3200);
  }
  function send(event, data = {}) {
    return new Promise(resolve => {
      if (!socket.connected) return resolve({ ok: false, error: 'Not connected. Check your internet and try again.' });
      socket.timeout(8000).emit(event, data, (err, answer) => {
        resolve(err ? { ok: false, error: 'No reply from the game server. Please try again.' } : answer);
      });
    });
  }
  function symbolCard(card, { small = false, interactive = false, faded = false } = {}) {
    const symbols = card?.symbols || preview.symbols;
    const cardId = Number(card?.id ?? 1);
    const baseClasses = `picture-card ${small ? 'picture-card-small' : ''} ${interactive ? 'picture-card-clickable' : ''} ${faded ? 'picture-card-faded' : ''}`;
    return `<div class="${baseClasses}" role="group" aria-label="${interactive ? 'Your card. Select the matching picture.' : 'Picture matching card'}">
      <div class="card-inner-ring" aria-hidden="true"></div>
      ${symbols.map((item, index) => {
        const [x, y] = positions[index];
        // Changing sizes and small rotations create the Spot It challenge without
        // ever changing a picture's actual artwork or identity.
        const scale = (0.72 + cardVariation(cardId, item.id, index, 6129) * .67).toFixed(2);
        const rotate = Math.round((cardVariation(cardId, item.id, index, 19031) - .5) * 34);
        const style = `--x:${x}%;--y:${y}%;--s:${scale};--rotate:${rotate}deg`;
        const label = escape(item.label);
        const art = artwork(item.id);
        return interactive
          ? `<button class="symbol symbol-button" style="${style}" type="button" data-action="guess" data-symbol="${item.id}" aria-label="Picture: ${label}" title="${label}">${art}</button>`
          : `<span class="symbol" style="${style}" role="img" aria-label="Picture: ${label}">${art}</span>`;
      }).join('')}
    </div>`;
  }
  function playerList(showProgress = true) {
    // In projector fullscreen, fit a useful leaderboard preview without
    // overflowing the screen, even for a 40-student classroom.
    const compact = document.documentElement.classList.contains('fullscreen-mode') && view.role === 'teacher';
    const cols = window.innerWidth >= 1100 ? 2 : 1;
    const maxVisible = compact ? Math.max(5, Math.min(40, Math.floor((window.innerHeight - 450) / 35) * cols)) : view.players.length;
    const listed = view.players.slice(0, maxVisible);
    const more = view.players.length - listed.length;
    if (!view.players.length) return `<div class="empty-players"><span>👀</span><strong>No players yet</strong><small>Students enter the room code to join.</small></div>`;
    return `<div class="player-list">${listed.map((p, i) => `<div class="player-row ${p.id === view.me?.id ? 'self' : ''} ${p.id === view.winnerId ? 'winner-row' : ''} ${!p.online ? 'offline' : ''}">
      <span class="rank">${view.status === 'lobby' ? '●' : (i + 1)}</span>
      <div class="player-details"><div class="player-name">${escape(p.name)} ${p.id === view.winnerId ? '👑' : ''}${!p.online ? '<span class="offline-label">offline</span>' : ''}${!p.inRound && ['playing','paused'].includes(view.status) ? '<span class="offline-label">next round</span>' : ''}</div>
      ${showProgress && view.status !== 'lobby' && p.inRound ? `<div class="tiny-progress"><span style="width:${(p.points / view.cardsToWin) * 100}%"></span></div>` : ''}</div>
      ${showProgress && view.status !== 'lobby' && p.inRound ? `<b class="score">${p.points}<small>/${view.cardsToWin}</small></b>` : ''}
      </div>`).join('')}${more ? `<div class="more-players">+ ${more} more players · showing leaders</div>` : ''}</div>`;
  }
  function headerPill(label, strong) { return `<div class="panel-kicker">${escape(label)}${strong ? ` <strong>${escape(strong)}</strong>` : ''}</div>`; }
  function teacherControls() {
    const buttons = [];
    if (view.status === 'lobby') buttons.push('<button type="button" class="btn btn-accent full" data-action="start">▶ Start the race <span>→</span></button>');
    if (view.status === 'playing') buttons.push(`<button type="button" class="btn btn-outline full" data-action="pause" ${view.pendingMatch ? 'disabled title="Wait for the next card"' : ''}>⏸ Pause game</button>`);
    if (view.status === 'paused') buttons.push('<button type="button" class="btn btn-accent full" data-action="pause">▶ Resume game</button>');
    if (view.status === 'finished') buttons.push('<button type="button" class="btn btn-accent full" data-action="start">↻ Race again (same settings)</button>');
    if (view.status !== 'lobby') buttons.push('<button type="button" class="btn btn-quiet full" data-action="reset">↩ Return to lobby / change cards</button>');
    return buttons.join('');
  }
  function renderLanding() {
    screen.innerHTML = `<div class="home-hub">
      <section class="home-panel">
        <div class="home-panel-head">
          <div>
            <div class="eyebrow">READY TO PLAY <span class="eyebrow-dot">●</span> HOST OR JOIN</div>
            <h1>Start a game or join one.</h1>
            <p class="home-subtitle">Everything you need is right here — no intro page, no extra clicks.</p>
          </div>
          <div class="landing-address home-address"><small>STUDENTS OPEN THIS WEBSITE</small><strong>${escape(location.host || 'spot-sprint-classroom.onrender.com')}</strong></div>
        </div>
        <div class="home-grid">
          <div class="home-card host-card">
            <div class="option-tag">👩‍🏫 FOR THE TEACHER</div>
            <h2>Host a new game</h2>
            <p>Create a room, project the teacher screen and start the race.</p>
            <button class="btn btn-accent full" type="button" data-action="create" ${creating ? 'disabled' : ''}>${creating ? 'Creating room…' : 'Create game'} <span>→</span></button>
            <div class="mini-note">Students join from the same website using your 6-character room code.</div>
          </div>
          <div class="home-card join-card">
            <div class="option-tag">🎒 FOR STUDENTS</div>
            <h2>Join a game</h2>
            <p>Type the room code from your teacher's screen and enter your name.</p>
            <form id="join-form" class="join-form">
              <label for="room-code">Game code</label>
              <input id="room-code" name="code" class="code-input" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" required value="${escape(joinDraft.code)}" />
              <label for="player-name">Your name</label>
              <input id="player-name" name="name" class="name-input" maxlength="22" placeholder="e.g. Alex" autocomplete="off" required value="${escape(joinDraft.name)}" />
              <button class="btn btn-white full" type="submit" ${joining ? 'disabled' : ''}>${joining ? 'Joining…' : 'Join game'} <span>→</span></button>
            </form>
          </div>
          <div class="home-card preview-card">
            <div class="option-tag">⚡ QUICK PREVIEW</div>
            <h2>How it works</h2>
            <p>Every two cards share exactly one picture. Find it first and clear your deck.</p>
            <div class="home-preview-wrap">${symbolCard(preview, { small: true })}</div>
            <div class="preview-pills"><span>8 pictures</span><span>1 perfect match</span></div>
          </div>
        </div>
      </section>
    </div>`;
  }
  function renderTeacher() {
    const playing = ['playing','paused'].includes(view.status);
    const done = view.status === 'finished';
    const winner = view.players.find(p => p.id === view.winnerId);
    const celebrating = Boolean(view.pendingMatch);
    screen.innerHTML = `<div class="room-header">
      <div><div class="eyebrow">TEACHER DASHBOARD <span class="eyebrow-dot">●</span> ${view.status.toUpperCase()}</div>
      <h1>${done ? 'We have a winner!' : playing ? 'Find the matching picture!' : 'Your classroom is ready.'}</h1>
      <p>${done ? 'The race is complete. Give your champion a round of applause!' : playing ? 'Each correct tap changes this card for everybody. Watch the race unfold.' : 'Students join from the website and code shown here.'}</p></div>
      <div class="join-steps" aria-label="How to join the game">
        <div class="join-website-box"><div class="join-instruction"><b>1</b> STUDENTS: OPEN THIS WEBSITE</div>
          <strong class="join-website-address">${escape(location.host || 'spot-sprint-classroom.onrender.com')}</strong>
          <button type="button" data-action="copy-link">🔗 Copy student link</button>
        </div>
        <div class="room-code-box"><div class="join-instruction"><b>2</b> THEN ENTER CODE</div><strong>${escape(view.code)}</strong></div>
      </div>
    </div>
    ${done && winner ? `<div class="winner-banner"><span class="trophy">🏆</span><div><small>CLASS CHAMPION</small><strong>${escape(winner.name)}</strong><span>First to ${view.cardsToWin} matching pictures!</span></div><span class="banner-star">✦</span></div>` : ''}
    <div class="game-grid teacher-grid">
      <section class="board-panel ${playing ? 'active-board' : ''}">
        <div class="panel-heading"><div>${headerPill('THE BIG-SCREEN CARD', playing ? 'LIVE' : 'SPOT SPRINT')}<h2>${playing || done ? 'Match this card' : 'Shared card preview'}</h2></div><span class="board-badge">${celebrating ? '✨ NEW CARD IN 2.5s' : playing ? '⚡ MATCH NOW' : done ? '🏁 FINISHED' : '🎮 PREVIEW'}</span></div>
        <div class="stage ${view.status === 'paused' ? 'stage-paused' : ''}">${symbolCard(view.teacherCard || preview, { faded: !view.teacherCard })}${celebrating ? `<div class="celebration-overlay" role="status" aria-live="assertive"><div class="celebration-spark">✨ ⭐ ✨</div><div class="celebration-label">GREAT SPOT!</div><strong class="celebration-name">${escape(view.pendingMatch.playerName)}!</strong><div class="celebration-symbol">${escape(view.pendingMatch.symbol)} MATCHED!</div><div class="celebration-next">Next card in <span class="celebration-countdown">2.5s</span></div><div class="celebration-progress"></div></div>` : ''}${view.status === 'paused' ? '<div class="pause-overlay"><strong>⏸ PAUSED</strong><span>Teacher will resume soon</span></div>' : ''}</div>
        <div class="board-bottom">${playing && view.lastEvent ? `<span class="last-score">✨ <b>${escape(view.lastEvent.playerName)}</b> spotted ${escape(view.lastEvent.symbol)} — ${view.lastEvent.points}/${view.cardsToWin}</span>` : `<span>Each pair of different cards has exactly <b>one</b> picture in common.</span>`}<span class="board-hint">👀 Look closely!</span></div>
      </section>
      <aside class="sidebar">
        <section class="sidebar-section lobby-setup">
          <div class="sidebar-title"><h2>⚙ Game controls</h2><span class="status-pill status-${view.status}">${view.status.toUpperCase()}</span></div>
          ${view.status === 'lobby' ? `<p class="hint">How many cards must a student clear to win?</p><div class="stepper"><button type="button" data-action="decrease" aria-label="Decrease cards" ${view.cardsToWin <= 1 ? 'disabled' : ''}>−</button><div><strong>${view.cardsToWin}</strong><span>cards to win</span></div><button type="button" data-action="increase" aria-label="Increase cards" ${view.cardsToWin >= 30 ? 'disabled' : ''}>+</button></div><div class="presets"><button type="button" data-action="preset" data-value="5" class="${view.cardsToWin === 5 ? 'selected' : ''}">Quick · 5</button><button type="button" data-action="preset" data-value="10" class="${view.cardsToWin === 10 ? 'selected' : ''}">Classic · 10</button><button type="button" data-action="preset" data-value="20" class="${view.cardsToWin === 20 ? 'selected' : ''}">Long · 20</button></div>` : `<p class="hint">First student to <strong>${view.cardsToWin}</strong> correct matches wins the race.</p>`}
          ${view.status === 'lobby' ? `<button class="lobby-music-toggle" type="button" data-action="lobby-music" aria-label="Toggle waiting room music">${!musicEnabled || localMuted ? '▶ Play lobby music' : '♫ Lobby music playing · Pause'}</button>` : ''}
          <div class="control-buttons">${teacherControls()}</div>
        </section>
        <section class="sidebar-section"><div class="sidebar-title"><h2>🏁 Leaderboard</h2><span class="player-count">${view.players.filter(p => p.online).length} joined</span></div>${playerList()}</section>
        <section class="sidebar-section tip-panel"><strong>💡 Teacher tip</strong><p>${view.status === 'lobby' ? 'Project this page and keep the website address and room code visible while students join.' : 'Every correct answer changes the shared card for everyone, so keep the class focused on the big screen.'}</p></section>
      </aside>
    </div>`;
    if (done && view.lastEvent?.id !== winningEventShown) {
      winningEventShown = view.lastEvent?.id;
      launchConfetti();
    }
  }
  function renderStudent() {
    const playing = ['playing', 'paused'].includes(view.status);
    const inRace = Boolean(view.me?.inRound);
    const done = view.status === 'finished';
    const winner = view.players.find(p => p.id === view.winnerId);
    if (view.status === 'lobby' || (playing && !inRace)) {
      screen.innerHTML = `<div class="waiting-screen"><div class="waiting-glow">${symbolCard(preview, { small: true, faded: true })}</div>
      <div class="waiting-info"><div class="eyebrow">✓ YOU'RE IN THE GAME</div><h1>Hi, ${escape(view.me.name)}! <span>👋</span></h1>
      <p>${playing ? 'The current race has already started. You will play in the next round.' : "You are on the list. The teacher will start the race soon."}</p>
      <div class="waiting-pills"><span>ROOM <b>${escape(view.code)}</b></span><span>${view.cardsToWin} matches to win</span></div><div class="pulse-text"><span class="live-dot"></span>${playing ? 'Waiting for the next race…' : 'Waiting for your teacher to start…'}</div>
      <div class="waiting-students"><strong>Players in room (${view.players.length})</strong><div class="avatar-stack">${view.players.slice(0, 15).map(p => `<span title="${escape(p.name)}">${escape(p.name.slice(0,1).toUpperCase())}</span>`).join('')}</div></div>
      <button class="btn btn-quiet" data-action="leave" type="button">Leave game</button></div></div>`;
      return;
    }
    const myPoints = view.me?.points || 0;
    const celebrating = Boolean(view.pendingMatch);
    const penaltyActive = Boolean(view.me?.lockedOut || (penaltyTurn && penaltyTurn === view.cardTurn));
    screen.innerHTML = `<div class="student-header"><div><div class="eyebrow">ROOM ${escape(view.code)} <span class="eyebrow-dot">●</span> ${done ? 'RACE OVER' : 'LIVE MATCH RACE'}</div><h1>${done ? (view.winnerId === view.me.id ? 'You won the race! 🏆' : 'Race finished!') : `Your turn, ${escape(view.me.name)}!`}</h1><p>${done ? (view.winnerId === view.me.id ? 'Incredible spotting! You cleared every card first.' : `${escape(winner?.name || 'A classmate')} cleared their cards first. Great effort!`) : 'Tap the picture on YOUR card that also appears on the shared card.'}</p></div>
      <div class="personal-score"><small>YOUR SCORE</small><strong>${myPoints}<span>/${view.cardsToWin}</span></strong><div class="tiny-progress"><span style="width:${myPoints / view.cardsToWin * 100}%"></span></div></div></div>
      ${done ? `<div class="student-result"><span>${view.winnerId === view.me.id ? '🏆' : '🎉'}</span><h2>${view.winnerId === view.me.id ? 'You are the champion!' : `Well played, ${escape(view.me.name)}!`}</h2><p>${view.winnerId === view.me.id ? 'You were the first to clear your deck.' : `You scored ${myPoints} out of ${view.cardsToWin} before the winner finished.`}</p><div class="result-details">${playerList()}</div><p class="small-muted">Wait for the teacher to start another race.</p></div>` : `<div class="game-grid student-grid"><section class="board-panel personal-board"><div class="panel-heading"><div>${headerPill('YOUR CARD', 'TAP THE MATCH')}<h2>Find it. Tap it. Score!</h2></div><span class="board-badge">⚡ ${view.cardsToWin - myPoints} LEFT</span></div>
       <div class="stage student-stage ${view.status === 'paused' ? 'stage-paused' : ''} ${penaltyActive ? 'stage-wrong-lock' : ''}">${symbolCard(view.myCard || preview, { interactive: view.status === 'playing' && !celebrating && !penaltyActive })}${penaltyActive ? '<div class="wrong-lock-overlay"><div class="wrong-lock-badge">✖ Bad luck!</div><div class="wrong-lock-text">No more guesses until the next card appears.</div></div>' : ''}${view.status === 'paused' ? '<div class="pause-overlay"><strong>⏸ PAUSED</strong><span>Eyes up to the teacher</span></div>' : ''}</div>
       <div class="board-bottom"><span id="guess-feedback">${penaltyActive ? '✖ Bad luck — wait for the next card before trying again.' : celebrating ? (view.pendingMatch.playerName === view.me.name ? '✨ Great match! New card coming in 2.5 seconds…' : `✨ ${escape(view.pendingMatch.playerName)} scored! New card in 2.5 seconds…`) : view.status === 'paused' ? 'Game paused by teacher.' : 'One of these 8 pictures is on both cards.'}</span><span class="board-hint">${penaltyActive ? '🚫 Locked until next card' : '👆 Tap the picture!'}</span></div>
       </section><aside class="sidebar student-sidebar"><section class="sidebar-section shared-card-section"><div class="sidebar-title"><h2>📺 Shared teacher card</h2><span class="status-pill status-playing">LIVE</span></div><p class="hint">Also showing on your teacher's screen</p><div class="mini-stage">${symbolCard(view.teacherCard, { small: true })}</div><p class="hint centered">Compare this with your big card.</p></section><section class="sidebar-section"><div class="sidebar-title"><h2>🏁 Leaderboard</h2><span class="player-count">${view.players.length} players</span></div>${playerList()}</section></aside></div>`}
    ${done ? '<div class="leave-row"><button class="btn btn-quiet" data-action="leave" type="button">Leave game</button></div>' : ''}`;
    if (done && view.lastEvent?.id !== winningEventShown) {
      winningEventShown = view.lastEvent?.id;
      launchConfetti();
    }
  }
  function render() {
    if (!view) renderLanding();
    else if (view.role === 'teacher') renderTeacher();
    else renderStudent();
    setSoundUI();
  }
  function updateView(next, initial = false) {
    if (!next) return;
    const old = view;
    view = next;
    if (old && next.cardTurn !== old.cardTurn) penaltyTurn = null;
    if (next.me?.lockedOut) penaltyTurn = next.cardTurn;
    if (!initial && next.lastEvent?.id && next.lastEvent.id !== lastEventId) {
      if (next.role === 'teacher') playSound('celebrate');
      else if (next.lastEvent.playerId === next.me?.id) playSound('correct');
    } else if (!initial && old?.status === 'lobby' && next.status === 'playing') {
      playSound('start');
    }
    if (!initial && old?.status !== 'finished' && next.status === 'finished') playSound('win');
    lastEventId = next.lastEvent?.id || null;
    if (next.status !== 'finished') winningEventShown = null;
    render();
    syncMusic();
  }
  function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-layer';
    container.setAttribute('aria-hidden', 'true');
    const colors = ['#ffd76f', '#fe749c', '#98ecdb', '#aab0ff', '#ffffff'];
    for (let i = 0; i < 64; i++) {
      const piece = document.createElement('i');
      piece.style.left = `${Math.random()*100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random()*1.3}s`;
      piece.style.animationDuration = `${2.6+Math.random()*1.8}s`;
      piece.style.transform = `rotate(${Math.random()*360}deg)`;
      container.appendChild(piece);
    }
    document.body.appendChild(container);
    setTimeout(() => container.remove(), 5800);
  }
  async function resume() {
    if (!session) { render(); return; }
    const result = await send('room:resume', session);
    if (result?.ok) {
      socket.setRoom(session);
      updateView(result.view, true);
      if (session.role === 'student' && !suggestedCode) history.replaceState(null, '', `/?room=${encodeURIComponent(session.code)}`);
    } else {
      clearSession();
      render();
      if (result.error && result.error !== 'That session is no longer available.') toast(result.error, true);
    }
  }
  socket.on('connect', () => {
    connection.innerHTML = '<span class="live-dot"></span>Connected';
    connection.classList.remove('not-connected');
    resume();
  });
  socket.on('disconnect', () => {
    connection.innerHTML = '<span class="live-dot"></span>Reconnecting…';
    connection.classList.add('not-connected');
  });
  socket.on('room:update', data => updateView(data));
  socket.on('session:replaced', () => {
    clearSession();
    render();
    toast('This game was opened in another tab or device.', true);
  });

  async function handleAction(button) {
    const action = button.dataset.action;
    unlockAudio();
    if (action === 'fullscreen') {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          await exit?.call(document);
        } else {
          const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
          if (!enter) throw new Error('Unsupported browser');
          await enter.call(document.documentElement);
        }
      } catch {
        toast('Full screen is unavailable here. Press F11 in Chrome instead.', true);
      }
      updateFullscreenUI();
      return;
    }
    if (action === 'sound') {
      localMuted = !localMuted;
      localStorage.setItem(SOUND_KEY, String(localMuted));
      unlockAudio();
      setSoundUI();
      syncMusic();
      if (view?.role === 'teacher') render();
      return;
    }
    if (action === 'lobby-music') {
      const wasAudible = musicEnabled && !localMuted;
      if (localMuted) {
        localMuted = false;
        localStorage.setItem(SOUND_KEY, 'false');
      }
      musicEnabled = !wasAudible;
      localStorage.setItem(MUSIC_KEY, String(musicEnabled));
      unlockAudio();
      setSoundUI();
      syncMusic();
      render();
      return;
    }
    if (action === 'music') {
      musicEnabled = !musicEnabled;
      localStorage.setItem(MUSIC_KEY, String(musicEnabled));
      unlockAudio();
      setSoundUI();
      syncMusic();
      if (view?.role === 'teacher') render();
      return;
    }
    if (action === 'create') {
      if (creating) return;
      creating = true;
      render();
      const r = await send('room:create');
      creating = false;
      if (!r.ok) { toast(r.error, true); render(); return; }
      saveSession('teacher', r.code, r.token);
      updateView(r.view, true);
      return;
    }
    if (action === 'copy-link' && view) {
      const url = `${location.origin}/?room=${encodeURIComponent(view.code)}`;
      try {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          toast('For student devices, first open this page using your computer’s Wi-Fi IP address.', true);
          return;
        }
        await navigator.clipboard.writeText(url); toast('Student join link copied!');
      }
      catch { toast(`Share this website and code ${view.code}`); }
      return;
    }
    if (action === 'leave') { clearSession(); history.replaceState(null, '', '/'); render(); return; }
    if (!view) return;
    if (action === 'increase' || action === 'decrease' || action === 'preset') {
      const n = action === 'preset' ? Number(button.dataset.value) : view.cardsToWin + (action === 'increase' ? 1 : -1);
      const r = await send('room:settings', { cardsToWin: n });
      if (!r.ok) toast(r.error, true);
      return;
    }
    if (action === 'start') {
      const r = await send('room:start');
      if (!r.ok) toast(r.error, true);
      return;
    }
    if (action === 'pause') {
      const r = await send('room:pause');
      if (!r.ok) toast(r.error, true);
      return;
    }
    if (action === 'reset') {
      const ok = confirm('Return everybody to the waiting room? Current scores will be cleared.');
      if (!ok) return;
      const r = await send('room:reset');
      if (!r.ok) toast(r.error, true);
      return;
    }
    if (action === 'guess') {
      if (choiceLocked || view.status !== 'playing' || !view.myCard || view.pendingMatch) return;
      choiceLocked = true;
      button.classList.add('guess-pending');
      const symbol = Number(button.dataset.symbol);
      const r = await send('game:match', { symbol, cardTurn: view.cardTurn, cardId: view.myCard.id });
      choiceLocked = false;
      if (!r.ok) {
        if (!r.stale && !r.cooldown) toast(r.error || 'Try again.', true);
        return;
      }
      if (!r.correct) {
        playSound('wrong');
        penaltyTurn = r.cardTurn || view.cardTurn;
        button.classList.remove('guess-pending');
        button.classList.add('guess-wrong');
        const feedback = document.getElementById('guess-feedback');
        if (feedback) feedback.textContent = '✖ Bad luck — you are locked until the next card appears.';
        if (wrongFlashTimeout) clearTimeout(wrongFlashTimeout);
        wrongFlashTimeout = setTimeout(() => { if (view && penaltyTurn === view.cardTurn) render(); }, 560);
        render();
        await new Promise(resolve => setTimeout(resolve, 510));
        button.classList.remove('guess-wrong');
      }
    }
  }

  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (button) handleAction(button);
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'join-form') return;
    e.preventDefault();
    unlockAudio();
    if (joining) return;
    const formData = new FormData(e.target);
    const code = String(formData.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const name = String(formData.get('name') || '').trim().slice(0, 22);
    joinDraft = { code, name };
    joining = true;
    render();
    const r = await send('room:join', { code, name });
    joining = false;
    if (!r.ok) { toast(r.error, true); render(); return; }
    saveSession('student', r.code, r.token);
    history.replaceState(null, '', `/?room=${encodeURIComponent(r.code)}`);
    updateView(r.view, true);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'room-code') joinDraft.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (e.target.id === 'player-name') joinDraft.name = e.target.value;
  });
  document.addEventListener('fullscreenchange', () => { updateFullscreenUI(); if (view?.role === 'teacher') render(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFullscreenUI(); if (view?.role === 'teacher') render(); });
  window.addEventListener('resize', () => { if (document.fullscreenElement && view?.role === 'teacher') render(); });
  updateFullscreenUI();
  setSoundUI();
  render();
})();
