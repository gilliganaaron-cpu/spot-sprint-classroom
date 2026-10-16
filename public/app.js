(() => {
  'use strict';
  const socket = io({ reconnection: true, timeout: 10000 });
  const screen = document.getElementById('screen');
  const alertBox = document.getElementById('alert');
  const connection = document.getElementById('connection');
  const musicBtn = document.getElementById('music-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const teacherHeaderInfo = document.getElementById('teacher-header-info');
  const teacherHeaderActions = document.getElementById('teacher-header-actions');
  const studentHeaderInfo = document.getElementById('student-header-info');
  const ENTRY_KEY = 'spotsprint:session';
  const HOST_KEY = 'spotsprint:teacherSession';
  const PREVIOUS_HOST_KEY = 'spotsprint:previousTeacherRoom';
  const SOUND_KEY = 'spotsprint:muted';
  const MUSIC_KEY = 'spotsprint:musicEnabled';
  const query = new URLSearchParams(location.search);
  const suggestedCode = (query.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
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

  const THEME_META = {
    mixed: { label: 'General (Mixed)', icon: '✨' },
    sports: { label: 'Sports', icon: '🏅' },
    animals: { label: 'Animals', icon: '🐾' },
    emojis: { label: 'Emojis', icon: '😄' },
    'sci-fi': { label: 'Sci-Fi', icon: '🚀' },
    scifi: { label: 'Sci-Fi', icon: '🚀' },
    festive: { label: 'Festive (All Holidays)', icon: '🎄' }
  };
  const THEME_SPRITES = {
    mixed: '/symbols.webp?v=20261015-14',
    sports: '/symbols-sports.webp?v=20261015-14',
    animals: '/symbols-animals.webp?v=20261015-14',
    emojis: '/symbols-emojis.webp?v=20261015-14',
    festive: '/symbols-festive.webp?v=20261015-22',
    scifi: '/symbols-scifi.webp?v=20261015-14',
    'sci-fi': '/symbols-scifi.webp?v=20261015-14'
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
    const theme = view?.theme || 'mixed';
    const sprite = THEME_SPRITES[theme] || THEME_SPRITES.mixed;
    return `<span class="symbol-art" aria-hidden="true" style="--symbol-sheet:url('${sprite}');background-position:${x.toFixed(5)}% ${y.toFixed(5)}%"></span>`;
  }
  let view = null;
  let session = readSession();
  let localMuted = false;
  let musicEnabled = localStorage.getItem(MUSIC_KEY) !== 'false';
  let musicTimer = null;
  let musicBus = null;
  let musicStep = 0;
  let nextMusicTime = 0;
  let musicDucked = false;
  let musicMode = null;
  let audio = null;
  // Suno's direct MP3 stream replaces the synthesised LOBBY tune only.
  // Keep the existing synthesised playing/countdown track and all effects.
  const LOBBY_SUNO_AUDIO_URL = 'https://cdn1.suno.ai/a01ed800-735e-4d8e-a615-7a453928f9af.mp3';
  let lobbyAudio = null;
  let lobbyAudioUnavailable = false;
  let lobbyAudioBlocked = false;
  let lobbyAudioStarting = false;
  let lastEventId = null;
  let winningEventShown = null;
  let toastTimeout = null;
  let choiceLocked = false;
  let joinDraft = { code: suggestedCode || '', name: '' };
  let creating = false;
  let joining = false;
  let penaltyTurn = null;
  let wrongFlashTimeout = null;
  let countdownRerender = null;
  let lastServerPushAt = 0;
  let syncBusy = false;
  let syncTimer = null;

  function readSession() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ENTRY_KEY) || 'null');
      if (stored?.role === 'student') return stored; // Students may refresh without losing their place.
      // Only an explicitly requested host resume bypasses the entry screen.
      if (stored?.role === 'teacher' && query.get('host') === 'resume') return stored;
    } catch { /* no saved session */ }
    return null;
  }
  function saveSession(role, code, token) {
    session = { role, code, token };
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(session));
    if (role === 'teacher') {
      localStorage.setItem(HOST_KEY, JSON.stringify(session));
      localStorage.removeItem(PREVIOUS_HOST_KEY);
    }
    lastServerPushAt = 0;
    socket.setRoom(session);
  }
  function clearSession() {
    const previousSession = session;
    session = null;
    sessionStorage.removeItem(ENTRY_KEY);
    if (previousSession?.role === 'teacher') localStorage.removeItem(HOST_KEY);
    socket.clearRoom();
    lastServerPushAt = 0;
    view = null;
    penaltyTurn = null;
    if (wrongFlashTimeout) clearTimeout(wrongFlashTimeout);
    if (countdownRerender) clearTimeout(countdownRerender);
    stopLobbyAudio();
    stopMusic();
  }
  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function unlockAudio() {
    if (localMuted && !musicEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audio) audio = new AudioContext();
      if (audio.state === 'suspended') audio.resume().then(() => syncMusic()).catch(() => {});
    } catch { /* Browser has no Web Audio support. The game still works. */ }
  }
  function tone(frequency, delay, duration, volume = .07, type = 'sine', destination = null) {
    if (!audio || (localMuted && !destination)) return;
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
  // Original royalty-free chip-synth score. The teacher's browser synthesises
  // two distinct arrangements in real time — students only hear scoring cues.
  // Audio only starts after a user interaction (browser autoplay requirement).
  let musicNoiseBuffer = null;
  function chipVoice(freq, delay, duration, volume, voice = 'lead') {
    if (!audio || !musicBus || !freq) return;
    const t = audio.currentTime + Math.max(0, delay);
    const osc = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const bass = voice === 'bass';
    const pad = voice === 'pad';
    osc.type = bass ? 'sawtooth' : pad ? 'triangle' : voice === 'bell' ? 'sine' : 'square';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(bass ? 600 : pad ? 1300 : voice === 'bell' ? 3600 : 2400, t);
    filter.Q.value = bass ? 1.2 : .7;
    const attack = pad ? .04 : .006;
    const release = pad ? .19 : bass ? .10 : .055;
    const hold = Math.max(.01, duration - release);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + attack);
    gain.gain.setValueAtTime(Math.max(.0002, volume * (pad ? .83 : .7)), t + hold);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    osc.start(t);
    osc.stop(t + duration + .025);
  }
  function chipDrum(kind, delay, level = 1) {
    if (!audio || !musicBus) return;
    const t = audio.currentTime + Math.max(0, delay);
    if (kind === 'kick') {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(148, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + .12);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(.085 * level, t + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, t + .17);
      osc.connect(gain); gain.connect(musicBus);
      osc.start(t); osc.stop(t + .19);
      return;
    }
    if (!musicNoiseBuffer) {
      musicNoiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * .22), audio.sampleRate);
      const samples = musicNoiseBuffer.getChannelData(0);
      // Deterministic noise for predictable levels from session to session.
      let seed = 11821;
      for (let i = 0; i < samples.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        samples[i] = (seed / 2147483648 - 1) * .8;
      }
    }
    const source = audio.createBufferSource();
    const highpass = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = musicNoiseBuffer;
    highpass.type = 'highpass';
    highpass.frequency.value = kind === 'snare' ? 1300 : 6000;
    const length = kind === 'snare' ? .14 : .048;
    const volume = (kind === 'snare' ? .038 : .012) * level;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, t + length);
    source.connect(highpass);highpass.connect(gain);gain.connect(musicBus);
    source.start(t); source.stop(t + length + .01);
  }
  const TRACKS = {
    lobby: {
      bpm: 116,
      // Bright C-major hooks and a relaxed bouncy bass.
      melody: [
        659, 784, 988, null, 1047, 988, 784, 659,
        587, 659, 784, 880, 784, 659, 587, null,
        659, 784, 1047, 1175, 1047, 988, 880, 784,
        698, 784, 880, 784, 659, 587, 523, null
      ],
      bass: [131,196,147,220,165,247,147,220],
      chords: [
        [262,330,392], [294,349,440], [330,392,494], [294,370,440],
        [262,330,392], [247,330,392], [294,349,440], [220,330,392]
      ],
      arp: [523,659,784,1047,659,784,988,784]
    },
    playing: {
      bpm: 148,
      // A minor-key, rising-action race theme, distinct from the lobby melody.
      melody: [
        659, 784, 988, 784, 1175, 988, 784, null,
        698, 831, 988, 1109, 988, 831, 698, null,
        784, 988, 1175, 1319, 1175, 988, 880, 784,
        659, 784, 988, 1175, 1047, 988, 784, null
      ],
      bass: [82.4,123.5,98,146.8,110,164.8,98,146.8],
      chords: [
        [330,392,494], [349,415,523], [392,494,587], [330,415,494],
        [330,392,494], [294,370,440], [392,494,587], [330,392,494]
      ],
      arp: [659,784,988,1175,988,784,740,988]
    }
  };
  function scheduleMusic() {
    if (!audio || !musicBus || !musicMode) return;
    const track = TRACKS[musicMode];
    const racing = musicMode === 'playing';
    const stepDuration = 30 / track.bpm;  // Eighth-note sequence.
    while (nextMusicTime < audio.currentTime + .24) {
      const n = musicStep % track.melody.length;
      const eighth = n % 8;
      const delay = Math.max(0, nextMusicTime - audio.currentTime);
      const melody = track.melody[n];
      if (melody) chipVoice(melody, delay, racing ? .17 : .21,
        racing ? .017 : .016, 'lead');
      // Bass provides the rhythmic pulse, with a softer syncopated pickup.
      if (eighth % 2 === 0) {
        chipVoice(track.bass[Math.floor(n / 4) % track.bass.length], delay,
          stepDuration * (racing ? 1.55 : 1.72), racing ? .043 : .033, 'bass');
      } else if (racing && eighth === 7) {
        chipVoice(track.bass[Math.floor(n / 4) % track.bass.length] * 1.5,
          delay, .09, .014, 'bass');
      }
      // Sustained chord pads stay behind the lead so the melody is clear.
      if (eighth === 0 || (racing && eighth === 4)) {
        const chord = track.chords[Math.floor(n / 4) % track.chords.length];
        chord.forEach((f,i)=>chipVoice(f, delay, racing ? .43 : .63,
          racing ? .0070 - i * .0005 : .0090 - i * .0009, 'pad'));
      }
      // Short, quiet arpeggios add depth without cluttering the melody.
      if (eighth % 2 === 1 || (racing && eighth === 6)) {
        const arp = track.arp[(n + (racing ? 2 : 0)) % track.arp.length];
        chipVoice(arp, delay + .025, .13, racing ? .008 : .006, 'bell');
      }
      if (eighth === 0 || eighth === 4 || (racing && eighth === 6)) {
        chipDrum('kick',delay,eighth === 0 ? 1 : .8);
      }
      if (eighth === 2 || eighth === 6) chipDrum('snare',delay,racing ? 1 : .78);
      if (racing || eighth % 2 === 0) chipDrum('hat',delay,racing ? .8 : .6);
      if (racing && eighth % 2 === 0) chipDrum('hat',delay + stepDuration * .5,.37);
      // Little high notes at the ends of phrases give the score an arcade feel.
      if (eighth === 7 && n % 16 === 15)
        chipVoice(racing ? 1760 : 1568,delay,.18,.009,'bell');
      musicStep++;
      nextMusicTime += stepDuration;
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
  // Browser audio elements can stream Suno MP3s without CORS. This plays only
  // on the teacher's device and needs a click to satisfy autoplay policies.
  function ensureLobbyAudio() {
    if (lobbyAudioUnavailable || !window.Audio) return false;
    if (lobbyAudio) return true;
    try {
      lobbyAudio = new Audio(LOBBY_SUNO_AUDIO_URL);
      lobbyAudio.loop = true;
      lobbyAudio.preload = 'auto';
      lobbyAudio.volume = .46; // Gentle lobby level, independent of effects.
      lobbyAudio.addEventListener('error', () => {
        lobbyAudioUnavailable = true;
        stopLobbyAudio();
        syncMusic(); // If Suno cannot load, use the original lobby score.
      });
      return true;
    } catch {
      lobbyAudioUnavailable = true;
      return false;
    }
  }
  function stopLobbyAudio() {
    if (!lobbyAudio) return;
    lobbyAudio.pause();
    try { lobbyAudio.currentTime = 0; } catch { /* Stream not yet seekable. */ }
  }
  function startLobbyAudio() {
    if (!ensureLobbyAudio() || lobbyAudioBlocked) return false;
    if (lobbyAudio.paused && !lobbyAudioStarting) {
      lobbyAudioStarting = true;
      try {
        const result = lobbyAudio.play();
        if (result && typeof result.then === 'function') {
          result.then(() => {
            lobbyAudioStarting = false;
            // An in-flight play must never leak into the actual race.
            if (!musicEnabled || view?.role !== 'teacher' || !['lobby'].includes(view.status)) {
              // The create-room click plays before the server reply, which
              // momentarily leaves the teacher view empty; only stop if we
              // are definitely in a different active screen.
              if (view?.role === 'student' || (view?.role === 'teacher' && view.status !== 'lobby') || !musicEnabled)
                stopLobbyAudio();
            }
          }).catch(err => {
            lobbyAudioStarting = false;
            if (err?.name === 'AbortError') return; // Deliberately stopped.
            lobbyAudioBlocked = true;
            syncMusic(); // Audio permission/stream issue: synthesised fallback.
          });
        } else lobbyAudioStarting = false;
      } catch {
        lobbyAudioStarting = false;
        lobbyAudioBlocked = true;
        return false;
      }
    }
    return true;
  }
  function syncMusic() {
    const mode = view?.role === 'teacher' && ['lobby','playing','countdown'].includes(view.status) && musicEnabled
      ? (view.status === 'countdown' ? 'playing' : view.status)
      : null;
    if (!mode) { stopLobbyAudio(); stopMusic(); return; }

    if (mode === 'lobby' && !lobbyAudioUnavailable && !lobbyAudioBlocked) {
      stopMusic(); // Do not layer the synth lobby score over the song.
      if (startLobbyAudio()) return;
    } else {
      stopLobbyAudio(); // Stop the MP3 at the very start of countdown/game.
    }

    // Original Web Audio score: active race, or fallback if Suno is unavailable.
    if (!audio || audio.state !== 'running') { stopMusic(); return; }
    if (musicMode !== mode) stopMusic();
    if (!musicTimer) {
      musicMode = mode;
      musicBus = audio.createGain();
      musicBus.gain.value = .0001;
      const outputCompressor = audio.createDynamicsCompressor();
      outputCompressor.threshold.value = -20;
      outputCompressor.knee.value = 18;
      outputCompressor.ratio.value = 3.2;
      outputCompressor.attack.value = .008;
      outputCompressor.release.value = .16;
      musicBus.connect(outputCompressor);
      outputCompressor.connect(audio.destination);
      musicStep = 0;
      nextMusicTime = audio.currentTime + .08;
      musicTimer = setInterval(scheduleMusic, 95);
      scheduleMusic();
    }
    const duck = Boolean(view.pendingMatch);
    if (musicDucked !== duck || musicBus.gain.value < .05) {
      musicBus.gain.setTargetAtTime(duck ? .18 : (mode === 'lobby' ? .80 : .84), audio.currentTime, .12);
      musicDucked = duck;
    }
  }
  function setSoundUI() {
    musicBtn.hidden = view?.role !== 'teacher';
    fullscreenBtn.hidden = !view || !['teacher','student'].includes(view.role);
    const name = view?.status === 'lobby' ? 'Game Start! lobby music' : 'Game music';
    musicBtn.textContent = '♫';
    musicBtn.title = musicEnabled ? `Turn ${name.toLowerCase()} off` : `Turn ${name.toLowerCase()} on`;
    musicBtn.setAttribute('aria-label', musicBtn.title);
    musicBtn.setAttribute('aria-pressed', String(musicEnabled));
  }
  function updateFullscreenUI() {
    const on = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    document.documentElement.classList.toggle('fullscreen-mode', on);
    fullscreenBtn.innerHTML = view?.role === 'student' ? (on ? '⤢' : '⛶') : (on ? '⤢ <span>Exit full screen</span>' : '⛶ <span>Full screen</span>');
    fullscreenBtn.setAttribute('aria-pressed', String(on));
    fullscreenBtn.setAttribute('title', on ? 'Exit full screen' : 'Show the game without scrolling');
    const studentGameFullscreenBtn = document.getElementById('student-game-fullscreen-btn');
    if (studentGameFullscreenBtn) {
      studentGameFullscreenBtn.textContent = on ? '⤢' : '⛶';
      studentGameFullscreenBtn.setAttribute('aria-pressed', String(on));
      studentGameFullscreenBtn.setAttribute('title', on ? 'Exit full screen' : 'Enter full screen');
    }
  }
  function toast(message, error = false) {
    clearTimeout(toastTimeout);
    alertBox.className = `toast visible ${error ? 'toast-error' : ''}`;
    alertBox.textContent = message;
    toastTimeout = setTimeout(() => alertBox.classList.remove('visible'), 3200);
  }
  function send(event, data = {}) {
    return new Promise(resolve => {
      socket.timeout(8000).emit(event, data, (err, answer) => {
        resolve(err ? { ok: false, error: 'No reply from the game server. Please try again.' } : answer);
      });
    });
  }
  function symbolCard(card, { small = false, interactive = false, faded = false, highlightSymbolId = null } = {}) {
    const symbols = card?.symbols || preview.symbols;
    const cardId = Number(card?.id ?? 1);
    const baseClasses = `picture-card ${small ? 'picture-card-small' : ''} ${interactive ? 'picture-card-clickable' : ''} ${faded ? 'picture-card-faded' : ''}`;
    return `<div class="${baseClasses}" role="group" aria-label="${interactive ? 'Your card. Select the matching picture.' : 'Picture matching card'}">
      ${symbols.map((item, index) => {
        const [x, y] = positions[index];
        // Changing sizes and small rotations create the Spot It challenge without
        // ever changing a picture's actual artwork or identity.
        const scale = (0.72 + cardVariation(cardId, item.id, index, 6129) * .67).toFixed(2);
        const rotate = Math.round((cardVariation(cardId, item.id, index, 19031) - .5) * 34);
        const style = `--x:${x}%;--y:${y}%;--s:${scale};--rotate:${rotate}deg`;
        const glowing = highlightSymbolId !== null && item.id === highlightSymbolId;
        const matchClass = glowing ? ' spot-match-reveal' : '';
        const label = escape(item.label);
        const art = artwork(item.id);
        return interactive
          ? `<button class="symbol symbol-button${matchClass}" style="${style}" type="button" data-action="guess" data-symbol="${item.id}" aria-label="Picture: ${label}" title="${label}">${art}</button>`
          : `<span class="symbol${matchClass}" style="${style}" role="img" aria-label="Picture: ${label}">${art}</span>`;
      }).join('')}
    </div>`;
  }

  function stackedCard(cardHtml, remaining, small = false, wrong = false) {
    const depth = Math.max(0, Math.min(4, Number(remaining || 1) - 1));
    return `<div class="card-stack ${small ? 'card-stack-small' : ''}" data-depth="${depth}">${Array.from({ length: depth }, (_, i) => `<span class="stack-layer stack-layer-${i + 1}" aria-hidden="true"></span>`).join('')}<div class="stack-top">${cardHtml}</div>${wrong ? '<div class="card-wrong-cover" role="alert"><span>Bad luck!<small>Wait for next card</small></span></div>' : ''}</div>`;
  }
  function startCountdownMs() {
    if (!view || view.status !== 'countdown' || !view.countdownEndsAt) return 0;
    return Math.max(0, view.countdownEndsAt - Date.now());
  }
  function startCountdownNumber() {
    const ms = startCountdownMs();
    return ms ? Math.ceil(ms / 1000) : 0;
  }
  function startCountdownOverlay(kind = 'teacher') {
    const n = startCountdownNumber();
    if (!n && view?.status !== 'countdown') return '';
    return `<div class="start-countdown-overlay ${kind === 'student' ? 'student-countdown' : ''}" role="status" aria-live="assertive"><div class="countdown-kicker">${kind === 'student' ? 'Get ready!' : 'Race begins in'}</div><strong class="countdown-number">${n || "GO!"}</strong><div class="countdown-caption">${kind === 'student' ? 'Tap only when the first card goes live.' : 'The first card appears after the countdown.'}</div></div>`;
  }
  function captureLeaderboardPositions() {
    const map = new Map();
    document.querySelectorAll('.player-row[data-player-id]').forEach(el => map.set(el.dataset.playerId, el.getBoundingClientRect().top));
    return map;
  }
  function animateLeaderboardRows(before) {
    document.querySelectorAll('.player-row[data-player-id]').forEach(el => {
      const oldTop = before.get(el.dataset.playerId);
      const rect = el.getBoundingClientRect();
      if (oldTop == null) {
        el.animate([{ opacity: .3, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 280, easing: 'ease-out' });
        return;
      }
      const dy = oldTop - rect.top;
      if (Math.abs(dy) > 1) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
  }
  function queueCountdownRefresh() {
    if (countdownRerender) clearTimeout(countdownRerender);
    const ms = startCountdownMs();
    if (ms > 1) countdownRerender = setTimeout(() => render(), Math.min(310, ms + 5));
  }

  function playerList(showProgress = true) {
    // In projector fullscreen, fit a useful leaderboard preview without
    // overflowing the screen, even for a 40-student classroom.
    const compact = document.documentElement.classList.contains('fullscreen-mode') && view.role === 'teacher';
    const cols = window.innerWidth >= 1100 ? 2 : 1;
    const maxVisible = view.status === 'lobby' ? view.players.length : (compact ? Math.max(5, Math.min(40, Math.floor((window.innerHeight - 450) / 35) * cols)) : view.players.length);
    const listed = view.players.slice(0, maxVisible);
    const more = view.players.length - listed.length;
    if (!view.players.length) return `<div class="empty-players"><span>👀</span><strong>No players yet</strong><small>Students enter the room code to join.</small></div>`;
    return `<div class="player-list">${listed.map((p, i) => `<div class="player-row ${p.id === view.me?.id ? 'self' : ''} ${p.id === view.winnerId ? 'winner-row' : ''} ${!p.online ? 'offline' : ''}" data-player-id="${p.id}" data-rank="${i+1}">
      <span class="rank">${view.status === 'lobby' ? '●' : (i + 1)}</span>
      <div class="player-details"><div class="player-name">${escape(p.name)} ${p.id === view.winnerId ? '👑' : ''}${!p.online ? '<span class="offline-label">offline</span>' : ''}${!p.inRound && ['playing','paused'].includes(view.status) ? '<span class="offline-label">next round</span>' : ''}</div>
      ${showProgress && view.status !== 'lobby' && p.inRound ? `<div class="tiny-progress"><span style="width:${(p.points / (view.gameMode === 'timed' ? Math.max(1,view.players[0]?.points || 1) : view.cardsToWin)) * 100}%"></span></div>` : ''}</div>
      ${showProgress && view.status !== 'lobby' && p.inRound ? `<b class="score">${p.points}${view.gameMode === "timed" ? "" : `<small>/${view.cardsToWin}</small>`}</b>` : ''}
      ${view.role === 'teacher' && view.status === 'lobby' ? `<button type="button" class="player-remove" data-action="remove-player" data-player-id="${escape(p.id)}" title="Delete inappropriate name" aria-label="Delete inappropriate name: ${escape(p.name)}">×</button>` : ''}
      </div>`).join('')}${more ? `<div class="more-players">+ ${more} more players · showing leaders</div>` : ''}</div>`;
  }
  function headerPill(label, strong) { return `<div class="panel-kicker">${escape(label)}${strong ? ` <strong>${escape(strong)}</strong>` : ''}</div>`; }
  // Only the server determines when a timed race ends.
  function roundClockMs() {
    if (view?.gameMode !== 'timed') return 0;
    if (view.status === 'playing' && view.timeEndsAt)
      return Math.max(0,view.timeEndsAt - Date.now());
    if (view.status === 'paused') return Math.max(0,view.timeRemainingMs || 0);
    if (view.status === 'finished') return 0;
    return view.timeLimitSec * 1000;
  }
  function roundClockLabel() {
    const n = Math.ceil(roundClockMs() / 1000);
    return Math.floor(n/60) + ':' + String(n%60).padStart(2,'0');
  }
  function updateClockDisplay() {
    if (view?.gameMode !== 'timed') return;
    document.querySelectorAll('[data-round-clock]').forEach(el => el.textContent = roundClockLabel());
    const ratio = Math.max(0,Math.min(1,roundClockMs()/(view.timeLimitSec * 1000)));
    document.querySelectorAll('[data-time-progress]').forEach(el => el.style.width = Math.round(ratio*100) + '%');
  }
  setInterval(updateClockDisplay,250);
  function teacherControls() {
    const buttons = [];
    if (view.status === 'lobby') buttons.push('<button type="button" class="header-start-game header-start-compact" data-action="start" aria-label="Start game">START</button>');
    if (view.status === 'countdown') buttons.push('<span class="header-countdown">3 · 2 · 1</span>');
    if (view.status === 'playing') buttons.push(`<button type="button" class="header-round-control" data-action="pause" ${view.pendingMatch ? 'disabled title="Wait for the next card"' : ''}>⏸ Pause</button>`);
    if (view.status === 'paused') buttons.push('<button type="button" class="header-start-game" data-action="pause">▶ Resume</button>');
    if (view.status === 'finished') buttons.push('<button type="button" class="header-start-game" data-action="start">↻ PLAY AGAIN</button>');
    if (['playing','paused'].includes(view.status)) buttons.push('<button type="button" class="header-round-control" data-action="restart">↻ New round</button>');
    if (!['lobby','countdown'].includes(view.status)) buttons.push('<button type="button" class="header-round-control" data-action="reset">↩ Lobby</button>');
    return buttons.join('');
  }
  function updateStudentHeader() {
    const active = view?.role === 'student' &&
      !(view.status === 'lobby' || (['playing','paused'].includes(view.status) && !view.me?.inRound));
    studentHeaderInfo.hidden = !active;
    document.documentElement.classList.toggle('student-active', Boolean(active));
    if (!active) { studentHeaderInfo.innerHTML = ''; return; }
    const scored = view.me?.points || 0;
    const timed = view.gameMode === 'timed';
    const maximum = Math.max(1, view.cardsToWin || 10);
    const left = Math.max(0, maximum - scored);
    const finished = view.status === 'finished';
    studentHeaderInfo.innerHTML = `<div class="student-live-intro"><div class="student-live-room">ROOM ${escape(view.code)} <span>•</span> ${finished ? 'RACE OVER' : (timed ? 'TIMED CHALLENGE' : 'LIVE MATCH RACE')}</div><strong>${finished ? ((view.winnerId === view.me?.id || (view.winnerIds || []).includes(view.me?.id)) ? 'You won! 🏆' : 'Race finished!') : `Your turn, ${escape(view.me?.name || 'player')}!`}</strong><div class="student-live-hint">${finished ? 'Great spotting!' : 'Match a picture on your card below to a picture on the shared teacher card to your right, or the main classroom screen'}</div></div>`;
  }
  // Keep teacher settings mounted while a room stays in the lobby.
  // Server push messages must not replace the range input mid-drag.
  let sliderEditing = false;
  let settingsSavePending = false;
  let queuedSettings = null;
  function syncHeaderSettings(slider, themePicker) {
    if (sliderEditing || settingsSavePending || queuedSettings) return;
    if (slider) {
      const cards = String(view.cardsToWin);
      if (slider.value !== cards) slider.value = cards;
      slider.style.setProperty('--range-fill', String((view.cardsToWin-5)*5) + '%');
      const count = teacherHeaderInfo.querySelector('#cards-range-value');
      if (count) count.textContent = cards;
    }
    const timePicker = teacherHeaderInfo.querySelector('#time-limit');
    if (timePicker) {
      const minutes = Math.max(1, Math.min(6, Math.round(view.timeLimitSec / 60)));
      if (timePicker.value !== String(minutes)) timePicker.value = String(minutes);
      timePicker.style.setProperty('--range-fill', String((minutes - 1) * 20) + '%');
      const label = teacherHeaderInfo.querySelector('#time-range-value');
      if (label) label.textContent = minutes + (minutes === 1 ? ' min' : ' mins');
    }
    if (document.activeElement !== themePicker && themePicker.value !== view.theme)
      themePicker.value = view.theme;
  }
  async function flushGameSettings() {
    if (settingsSavePending) return;
    settingsSavePending = true;
    try {
      while (queuedSettings && view?.role === 'teacher' && view.status === 'lobby') {
        const change = queuedSettings;
        queuedSettings = null;
        const result = await send('room:settings', change);
        if (!result.ok) toast(result.error || 'Could not update game settings.', true);
        else if (result.view) updateView(result.view);
      }
    } finally {
      settingsSavePending = false;
      sliderEditing = false;
      if (view?.role === 'teacher' && view.status === 'lobby') render();
    }
  }
  function updateTeacherHeader() {
    const isTeacher = view?.role === 'teacher';
    teacherHeaderInfo.hidden = !isTeacher;
    teacherHeaderActions.hidden = !isTeacher;
    document.documentElement.classList.toggle('teacher-active', isTeacher);
    if (!isTeacher) { teacherHeaderInfo.innerHTML = ''; teacherHeaderActions.innerHTML = ''; return; }
    // Updating a scoreboard or receiving a network ping must not destroy the
    // control with which the teacher is currently interacting.

    const currentSlider = teacherHeaderInfo.querySelector('#cards-to-win');
    const currentTheme = teacherHeaderInfo.querySelector('#theme-select');
    if (view.status === 'lobby' && teacherHeaderInfo.dataset.roomCode === view.code &&
      teacherHeaderInfo.dataset.gameMode === view.gameMode && currentTheme) {
      syncHeaderSettings(currentSlider,currentTheme);
      teacherHeaderActions.innerHTML = teacherControls();
      return;
    }
    const timed = view.gameMode === 'timed';
    const modeControls = '<div class="challenge-mode-toggle" role="group" aria-label="Win condition">' +
      '<button type="button" data-action="set-mode" data-mode="cards" class="' + (timed ? '' : 'selected') +
      '" aria-pressed="' + (!timed) + '">Cards</button><span>or</span>' +
      '<button type="button" data-action="set-mode" data-mode="timed" class="' + (timed ? 'selected' : '') +
      '" aria-pressed="' + timed + '">⏱ Timed</button></div>';
    const cardsControl = '<div class="challenge-control-row"><label for="cards-to-win">Number of cards</label>' +
      '<strong id="cards-range-value">' + view.cardsToWin + '</strong></div>' +
      '<input id="cards-to-win" class="cards-range" type="range" min="5" max="25" step="1" value="' + view.cardsToWin +
      '" aria-label="Number of cards to win" style="--range-fill:' + ((view.cardsToWin-5)*5) + '%">';
    const minutes = Math.max(1, Math.min(6, Math.round(view.timeLimitSec / 60)));
    const secondsControl = '<div class="challenge-control-row"><label for="time-limit">Time limit</label>' +
      '<strong id="time-range-value">' + minutes + (minutes === 1 ? ' min' : ' mins') + '</strong></div>' +
      '<input id="time-limit" class="cards-range timed-range" type="range" min="1" max="6" step="1" value="' +
      minutes + '" aria-label="Timed challenge length in minutes" style="--range-fill:' + ((minutes - 1) * 20) + '%">';
    const themeControl = '<div class="theme-panel"><label for="theme-select" class="cards-range-heading"><span>Card set</span></label>' +
      '<div class="theme-select-wrap"><select id="theme-select" class="theme-select" aria-label="Choose card set theme">' +
      (view.availableThemes || ['mixed','sports','animals','emojis','scifi','festive']).map(key =>
      '<option value="' + key + '"' + (key === view.theme ? ' selected' : '') + '>' +
      escape(THEME_META[key]?.icon || '✨') + ' ' + escape(THEME_META[key]?.label || key) + '</option>').join('') +
      '</select><span class="theme-chevron">▾</span></div></div>';
    const topSettings = view.status === 'lobby'
      ? '<div class="cards-range-panel challenge-panel" data-win-mode="' + view.gameMode + '">' +
        modeControls + (timed ? secondsControl : cardsControl) + '</div>' + themeControl
      : '<div class="game-status-settings"><span>' + escape(THEME_META[view.theme]?.icon || '✨') +
        ' ' + escape(THEME_META[view.theme]?.label || 'Mixed') + '</span><b>' +
        (timed ? '⏱ <span data-round-clock>' + roundClockLabel() + '</span>' : 'First to ' + view.cardsToWin + ' cards') + '</b></div>';
    teacherHeaderInfo.innerHTML = `<div class="header-join-site"><span class="join-globe" aria-hidden="true">🌐</span><div><strong class="fitted-join-url">${escape(location.host || 'spot-sprint.onrender.com')}</strong></div></div><div class="header-room-code"><span class="join-gamepad" aria-hidden="true">🎮</span><div><small>Game code</small><strong>${escape(view.code)}</strong></div></div><div class="header-game-settings" aria-label="Game options">${topSettings}</div>`;
    teacherHeaderInfo.dataset.roomCode = view.code;
    teacherHeaderInfo.dataset.gameMode = view.gameMode;
    teacherHeaderActions.innerHTML = teacherControls();
  }
  function renderLanding() {
    screen.innerHTML = `<div class="home-hub">
      <section class="home-panel">
        <div class="home-panel-head">
          <div>
            <div class="eyebrow">READY TO PLAY <span class="eyebrow-dot">●</span> HOST OR JOIN</div>
            <h1>Start a game or join one.</h1>
          </div>
        </div>
        <div class="home-grid">
          <div class="home-card join-card join-card-hero">
            <div class="option-tag">🎒 FOR STUDENTS</div>
            <h2>Join a game</h2>
            <p>Type the room code from your teacher's screen and enter your name.</p>
            <form id="join-form" class="join-form">
              <label for="room-code">Game code</label>
              <input id="room-code" name="code" class="code-input" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" required value="${escape(joinDraft.code)}" />
              <label for="player-name">Your name</label>
              <input id="player-name" name="name" class="name-input" maxlength="22" placeholder="e.g. Alex" autocomplete="off" required value="${escape(joinDraft.name)}" />
              <button class="btn btn-white full" type="submit" ${joining ? 'disabled' : ''}>${joining ? 'Joining…' : 'Join game'} <span>→</span></button>
            </form>
            <div class="mini-note">Enter the 4-letter room code from your teacher and you are in.</div>
          </div>
          <div class="home-card host-card">
            <div class="option-tag">👩‍🏫 FOR THE TEACHER</div>
            <h2>Host a new game</h2>
            <p>Create a room, project the teacher screen and start the race.</p>
            <button class="btn btn-accent full" type="button" data-action="create" ${creating ? 'disabled' : ''}>${creating ? 'Creating room…' : 'Create game'} <span>→</span></button>
            <div class="mini-note">Students join from the same website using your 4-letter room code.</div>
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
    const playing = ['playing','paused','countdown'].includes(view.status);
    const done = view.status === 'finished';
    const winner = view.players.find(p => p.id === view.winnerId);
    const celebrating = Boolean(view.pendingMatch);
    const countdownActive = view.status === 'countdown';
    const champions = view.players.filter(p => (view.winnerIds || []).includes(p.id));
    screen.innerHTML = `<div class="classroom-dashboard">
      ${done && (winner || view.gameMode === 'timed') ? `<div class="winner-banner"><span class="trophy">🏆</span><div><small>${view.gameMode === 'timed' ? (champions.length > 1 ? 'JOINT CHAMPIONS' : 'TIME IS UP!') : 'CLASS CHAMPION'}</small><strong>${champions.length ? champions.map(p=>escape(p.name)).join(' & ') : (winner ? escape(winner.name) : 'Great effort!')}</strong><span>${view.gameMode === 'timed' ? `Highest score after ${view.timeLimitSec} seconds` : `First to ${view.cardsToWin} matching pictures!`}</span></div><span class="banner-star">✦</span></div>` : ''}
      <div class="classroom-game-grid">
        <div class="classroom-left-column">
          <section class="classroom-card-area ${playing ? 'active-board' : ''}" aria-label="Shared matching card">
            <div class="classroom-card-stage ${view.status === 'paused' ? 'stage-paused' : ''}" style="--spot-celebration-ms:${view.pendingMatch?.celebrationMs || 1500}ms">${countdownActive ? '<div class="countdown-card-placeholder" aria-hidden="true"></div>' : symbolCard(view.teacherCard || preview, { faded: !view.teacherCard, highlightSymbolId: view.pendingMatch?.symbolId ?? null })}${startCountdownOverlay('teacher')}${celebrating ? `<div class="celebration-overlay" role="status" aria-live="assertive"><div class="celebration-spark">✨ ⭐ ✨</div><div class="celebration-label">${view.pendingMatch.onFire ? '🔥 THREE IN A ROW!' : 'GREAT SPOT!'}</div><strong class="celebration-name">${view.pendingMatch.onFire ? `${escape(view.pendingMatch.playerName)}'s on fire! 🔥` : `${escape(view.pendingMatch.playerName)}!`}</strong><div class="celebration-symbol">${escape(view.pendingMatch.symbol)} MATCHED!</div><div class="celebration-next">Next card in <span class="celebration-countdown">${(view.pendingMatch.celebrationMs / 1000).toFixed(1)}s</span></div><div class="celebration-progress" style="--spot-celebration-ms:${view.pendingMatch.celebrationMs}ms"></div></div>` : ''}${view.status === 'paused' ? '<div class="pause-overlay"><strong>⏸ PAUSED</strong><span>Teacher will resume soon</span></div>' : ''}</div>
            <div class="classroom-card-status">${playing && view.lastEvent ? `✨ ${escape(view.lastEvent.playerName)} spotted the match!` : ''}</div>
          </section>
        </div>
        <aside class="arcade-leaderboard" aria-label="Leaderboard">
          <div class="sidebar-title"><h2>🏆 Leaderboard</h2><span class="player-count">${view.players.filter(p => p.online).length} players</span></div>
          ${playerList()}
        </aside>
      </div>
    </div>`;
    if (done && view.lastEvent?.id !== winningEventShown) {
      winningEventShown = view.lastEvent?.id;
      launchConfetti();
    }
  }
  function studentCelebration() {
    if (!view?.pendingMatch) return '';
    const match = view.pendingMatch;
    const theirName = escape(match.playerName);
    const yours = match.playerName === view.me?.name;
    const onFire = Boolean(match.onFire);
    return `<div class="student-score-celebration ${onFire ? 'student-streak-fire' : ''}" role="status" aria-live="assertive" style="--spot-celebration-ms:${match.celebrationMs}ms">
      <div class="student-score-burst" aria-hidden="true">${onFire ? '🔥 ✦ 🔥' : '✦ ✧ ★ ✦'}</div>
      <div class="student-score-kicker">${onFire ? 'THREE CORRECT IN A ROW!' : (yours ? 'YOU SPOTTED IT!' : 'SOMEONE GOT THE MATCH!')}</div>
      <strong class="student-score-name">${onFire ? `${theirName}'s on fire! 🔥` : `${theirName}!`}</strong>
      <div class="student-score-caption">${onFire ? 'Unstoppable spotting!' : (yours ? 'Brilliant spotting!' : 'Brilliant spotting — congratulations!')} ${onFire ? '🔥' : '🎉'}</div>
      <div class="student-score-next">Next card in <b>${(match.celebrationMs / 1000).toFixed(1)} seconds</b></div>
      <div class="student-score-timer" aria-hidden="true"><span></span></div>
    </div>`;
  }
  function renderStudent() {
    const playing = ['playing', 'paused'].includes(view.status);
    const inRace = Boolean(view.me?.inRound);
    const done = view.status === 'finished';
    const winner = view.players.find(p => p.id === view.winnerId);
    const isWinner = view.winnerId === view.me?.id || (view.winnerIds || []).includes(view.me?.id);
    const isTie = (view.winnerIds || []).length > 1;
    if (view.status === 'lobby' || (playing && !inRace)) {
      screen.innerHTML = `<div class="waiting-screen"><div class="waiting-glow">${symbolCard(preview, { small: true, faded: true })}</div>
      <div class="waiting-info"><div class="eyebrow">✓ YOU'RE IN THE GAME</div><h1>Hi, ${escape(view.me.name)}! <span>👋</span></h1>
      <p>${playing ? 'The current race has already started. You will play in the next round.' : "You are on the list. The teacher will start the race soon."}</p>
      <div class="waiting-pills"><span>ROOM <b>${escape(view.code)}</b></span><span>${view.gameMode === 'timed' ? view.timeLimitSec + '-second challenge' : view.cardsToWin + ' matches to win'}</span></div><div class="pulse-text"><span class="live-dot"></span>${playing ? 'Waiting for the next race…' : 'Waiting for your teacher to start…'}</div>
      <div class="waiting-students"><strong>Players in room (${view.players.length})</strong><div class="avatar-stack">${view.players.slice(0, 15).map(p => `<span title="${escape(p.name)}">${escape(p.name.slice(0,1).toUpperCase())}</span>`).join('')}</div></div>
      <button class="btn btn-quiet" data-action="leave" type="button">Leave game</button></div></div>${studentCelebration()}`;
      return;
    }
    const myPoints = view.me?.points || 0;
    const timed = view.gameMode === 'timed';
    const cardsLeft = Math.max(0, view.cardsToWin - myPoints);
    const celebrating = Boolean(view.pendingMatch);
    const countdownActive = view.status === 'countdown';
    const penaltyActive = !celebrating && Boolean(view.me?.lockedOut || (penaltyTurn && penaltyTurn === view.cardTurn));
    screen.innerHTML = `<div class="student-game-content" style="--spot-celebration-ms:${view.pendingMatch?.celebrationMs || 1500}ms">
      ${done ? `<div class="student-result"><span>${isWinner ? '🏆' : '🎉'}</span><h2>${isWinner ? (isTie ? 'Joint champion!' : 'You are the champion!') : `Well played, ${escape(view.me.name)}!`}</h2><p>${isWinner ? (timed ? `You scored ${myPoints} matches in ${view.timeLimitSec} seconds!` : 'You were the first to clear your deck.') : (timed ? `You scored ${myPoints} matches in ${view.timeLimitSec} seconds.` : `You scored ${myPoints} out of ${view.cardsToWin} before the winner finished.`)}</p><div class="result-details">${playerList()}</div><p class="small-muted">Wait for the teacher to start another race.</p></div>` : `<div class="game-grid student-grid"><section class="board-panel personal-board"><div class="panel-heading"><div>${headerPill('YOUR CARD', 'TAP THE MATCH')}<h2>Find it. Tap it. Score!</h2></div><div class="student-panel-actions"><button id="student-game-fullscreen-btn" class="student-game-fullscreen-btn" type="button" data-action="fullscreen" aria-label="Toggle full screen" aria-pressed="false" title="Enter full screen">⛶</button><div class="student-live-score" aria-label="Your score ${myPoints} points"><small>${timed ? "TIME LEFT" : "YOUR SCORE"}</small>${timed ? `<strong data-round-clock>${roundClockLabel()}</strong><div class="student-live-track"><span data-time-progress style="width:${Math.round(roundClockMs()/(view.timeLimitSec * 1000)*100)}%"></span></div><small>${myPoints} points</small>` : `<strong>${myPoints}<span>/${view.cardsToWin}</span></strong><div class="student-live-track" role="progressbar" aria-label="Cards remaining" aria-valuemin="0" aria-valuemax="${view.cardsToWin}" aria-valuenow="${cardsLeft}"><span style="width:${Math.round(cardsLeft / view.cardsToWin * 100)}%"></span></div>`}</div><span class="board-badge student-remain-badge">⚡ ${timed ? myPoints + " PTS" : cardsLeft + " LEFT"} <span class="remaining-track" role="progressbar" aria-label="${timed ? "Time remaining" : "Cards remaining"}" aria-valuemin="0" aria-valuemax="${timed ? view.timeLimitSec : view.cardsToWin}" aria-valuenow="${timed ? Math.ceil(roundClockMs()/1000) : cardsLeft}"><span class="remaining-fill" ${timed ? "data-time-progress" : ""} style="width:${timed ? Math.round(roundClockMs()/(view.timeLimitSec*1000)*100) : Math.round(cardsLeft/view.cardsToWin*100)}%"></span></span></span></div></div>
       <div class="stage student-stage ${view.status === 'paused' ? 'stage-paused' : ''} ${penaltyActive ? 'stage-wrong-lock' : ''} ${celebrating ? 'stage-match-celebrating' : ''}" style="--spot-celebration-ms:${view.pendingMatch?.celebrationMs || 1500}ms">${countdownActive ? '<div class="countdown-card-placeholder" aria-hidden="true"></div>' : stackedCard(symbolCard(view.myCard || preview, { interactive: view.status === 'playing' && !celebrating && !penaltyActive, highlightSymbolId: view.pendingMatch?.matchSymbolId ?? null }), timed ? 25 : cardsLeft, false, penaltyActive)}${startCountdownOverlay('student')}${view.status === 'paused' ? '<div class="pause-overlay"><strong>⏸ PAUSED</strong><span>Eyes up to the teacher</span></div>' : ''}</div>
       <div class="board-bottom"><span id="guess-feedback">${countdownActive ? `⏳ Race starts in ${startCountdownNumber()}…` : penaltyActive ? '✖ Bad luck — wait for the next card before trying again.' : celebrating ? (view.pendingMatch.playerName === view.me.name ? `✨ Great match! New card coming in ${(view.pendingMatch.celebrationMs / 1000).toFixed(1)} seconds…` : `✨ ${escape(view.pendingMatch.playerName)} scored! New card in ${(view.pendingMatch.celebrationMs / 1000).toFixed(1)} seconds…`) : view.status === 'paused' ? 'Game paused by teacher.' : 'One of these 8 pictures is on both cards.'}</span><span class="board-hint">${countdownActive ? '⏳ Get ready…' : penaltyActive ? '🚫 Locked until next card' : '👆 Tap the picture!'}</span></div>
       </section><aside class="sidebar student-sidebar"><section class="sidebar-section shared-card-section"><div class="sidebar-title"><h2>📺 Shared teacher card</h2><span class="status-pill status-playing">LIVE</span></div><p class="hint">Also showing on your teacher's screen</p><div class="mini-stage">${symbolCard(view.teacherCard, { small: true, highlightSymbolId: view.pendingMatch?.matchSymbolId ?? null })}</div><p class="hint centered">Compare this with your big card.</p></section><section class="sidebar-section"><div class="sidebar-title"><h2>🏁 Leaderboard</h2><span class="player-count">${view.players.length} players</span></div>${playerList()}</section></aside></div>`}
    ${done ? '<div class="leave-row"><button class="btn btn-quiet" data-action="leave" type="button">Leave game</button></div>' : ''}</div>${studentCelebration()}`;
    if (done && view.lastEvent?.id !== winningEventShown) {
      winningEventShown = view.lastEvent?.id;
      launchConfetti();
    }
  }
  let joinFitFrame;
  function fitJoinAddress() {
    cancelAnimationFrame(joinFitFrame);
    joinFitFrame = requestAnimationFrame(() => {
      const text = document.querySelector('.fitted-join-url');
      if (!text) return;
      const box = text.closest('.header-join-site');
      const available = box.clientHeight - 10;
      let low = 10, high = 70;
      for (let i = 0; i < 10; i++) {
        const size = (low + high) / 2;
        text.style.setProperty('font-size', size + 'px', 'important');
        if (text.scrollWidth <= text.clientWidth && text.offsetHeight <= available) low = size;
        else high = size;
      }
      text.style.setProperty('font-size', low + 'px', 'important');
    });
  }
  window.addEventListener('resize', fitJoinAddress);
  document.fonts?.ready.then(fitJoinAddress);
  function render() {
    document.documentElement.classList.toggle('student-card-view', Boolean(view?.role === 'student' && ['countdown','playing','paused'].includes(view.status) && (view.status === 'countdown' || view.me?.inRound)));
    document.documentElement.classList.toggle('teacher-lobby', Boolean(view?.role === 'teacher' && view.status === 'lobby'));
    updateTeacherHeader();
    updateStudentHeader();
    if (!view) renderLanding();
    else if (view.role === 'teacher') renderTeacher();
    else renderStudent();
    fitJoinAddress();
    updateClockDisplay();
    setSoundUI();
    updateFullscreenUI();
    queueCountdownRefresh();
  }
  function updateView(next, initial = false) {
    if (!next) return;
    const old = view;
    if (old?.code === next.code && typeof next.revision === 'number' && typeof old.revision === 'number' && next.revision < old.revision) return;
    view = next;
    if (next.role === 'student' && ['countdown','playing'].includes(next.status) &&
        (!old || !['countdown','playing'].includes(old.status)) &&
        !document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (enter) Promise.resolve(enter.call(document.documentElement)).catch(() => {});
      } catch { /* Browser may require a tap; Full screen control is available. */ }
    }
    if (old && next.cardTurn !== old.cardTurn) penaltyTurn = null;
    if (next.me?.lockedOut) penaltyTurn = next.cardTurn;
    if (!initial && next.lastEvent?.id && next.lastEvent.id !== lastEventId) {
      if (next.role === 'teacher') playSound('celebrate');
      else playSound('correct'); // All students hear a short cue, not just the scorer.
    } else if (!initial && next.status === 'countdown' && old?.status !== 'countdown') {
      playSound('start');
    }
    if (!initial && old?.status !== 'finished' && next.status === 'finished') playSound('win');
    lastEventId = next.lastEvent?.id || null;
    if (next.status !== 'finished') winningEventShown = null;
    const ranksChanged = Boolean(old && ['playing','paused','finished'].includes(next.status) && old.players && next.players && old.players.some((p,i) => next.players[i]?.id !== p.id));
    const beforeRanks = ranksChanged ? captureLeaderboardPositions() : null;
    const editingTheme = next.role === 'teacher' && next.status === 'lobby' &&
      document.activeElement?.id === 'theme-select';
    if (!editingTheme) {
      render();
      if (beforeRanks) animateLeaderboardRows(beforeRanks);
    }
    syncMusic();
  }
  async function syncIfLiveUpdatesMissed() {
    if (!session || !view || syncBusy || !['lobby','countdown','playing','paused','finished'].includes(view.status)) return;
    // SSE is primary. Poll only when no game event has arrived recently.
    if (lastServerPushAt && Date.now() - lastServerPushAt < (view.status === 'countdown' ? 1300 : 2200)) return;
    const current = session;
    syncBusy = true;
    try {
      const response = await fetch('/api/action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'room:resume',data:current,session:current}),
        cache:'no-store'
      });
      if (!response.ok) return;
      const result = await response.json();
      // A room change or stale request must not overwrite a newer session.
      if (result.ok && session?.token === current.token && session?.code === current.code) {
        updateView(result.view);
      } else if (result.removed && session?.token === current.token) {
        handleTeacherRemoval(result.error);
      }
    } catch { /* SSE will reconnect, and the next poll can retry. */ }
    finally { syncBusy = false; }
  }
  syncTimer = setInterval(syncIfLiveUpdatesMissed, 1350);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncIfLiveUpdatesMissed();
  });
  window.addEventListener('focus', syncIfLiveUpdatesMissed);

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
    } else if (result.removed) {
      handleTeacherRemoval(result.error);
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
  socket.on('room:update', data => { lastServerPushAt = Date.now(); updateView(data); });
  function handleTeacherRemoval(message) {
    if (session?.role !== 'student') return;
    const code = session.code;
    clearSession();
    joinDraft = { code, name:'' };
    history.replaceState(null, '', '/?room=' + encodeURIComponent(code));
    render();
    toast(message || 'Your name was removed by the teacher. Please join again with a different name.', true);
  }
  socket.on('session:removed', data => {
    handleTeacherRemoval(data?.reason);
  });
  socket.on('room:closed', data => {
    if (session?.role !== 'student') return;
    clearSession();
    joinDraft = { code:'', name:'' };
    history.replaceState(null, '', '/');
    render();
    toast(data?.reason || 'The class session has ended. Ask for the new code.', true);
  });
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
    if (action === 'music') {
      musicEnabled = !musicEnabled;
      if (musicEnabled) lobbyAudioBlocked = false; // This click permits another play attempt.
      localStorage.setItem(MUSIC_KEY, String(musicEnabled));
      unlockAudio();
      setSoundUI();
      syncMusic();
      if (view?.role === 'teacher') render();
      return;
    }
    if (action === 'create') {
      if (creating) return;
      // Prime the streamed lobby song directly on the Create-game click;
      // invoking play only after the async server reply can be autoplay-blocked.
      if (musicEnabled) startLobbyAudio();

      // Fullscreen must be requested directly in the user click, before the
      // asynchronous network request (otherwise browsers refuse it).
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        try {
          const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
          if (enter) Promise.resolve(enter.call(document.documentElement)).catch(() => {
            toast('Use Full screen in the top right if your browser blocks automatic fullscreen.');
          });
        } catch { /* Manual fullscreen button remains available. */ }
      }
      creating = true;
      render();
      // Create Game on the MAIN screen always starts a NEW CLASS.
      let previousHost = null;
      try {
        previousHost = JSON.parse(localStorage.getItem(PREVIOUS_HOST_KEY) ||
          localStorage.getItem(HOST_KEY) || 'null');
      } catch { /* malformed/stale host credentials */ }
      const r = await send('room:create',
        { previousHost: previousHost?.role === 'teacher' ? previousHost : null });
      creating = false;
      if (!r.ok) { stopLobbyAudio(); toast(r.error, true); render(); return; }
      saveSession('teacher', r.code, r.token);
      updateView(r.view, true);
      return;
    }
    if (action === 'set-mode') {
      if (view?.role !== 'teacher' || view.status !== 'lobby') return;
      const mode = button.dataset.mode;
      if (!['cards','timed'].includes(mode) || mode === view.gameMode || settingsSavePending) return;
      queuedSettings = {
        cardsToWin:Number(document.getElementById('cards-to-win')?.value || view.cardsToWin),
        timeLimitSec:Number(document.getElementById('time-limit')?.value || Math.round(view.timeLimitSec / 60) || 2) * 60,
        gameMode:mode,
        theme:document.getElementById('theme-select')?.value || view.theme
      };
      void flushGameSettings();
      return;
    }
    if (action === 'remove-player') {
      if (view?.role !== 'teacher' || view.status !== 'lobby') return;
      const playerId = button.dataset.playerId;
      const player = view.players.find(p => p.id === playerId);
      if (!player) return;
      if (!confirm(`Remove "${player.name}" from this room? They must join again with a different name.`)) return;
      button.disabled = true;
      const result = await send('room:remove-player', { playerId });
      if (!result.ok) {
        button.disabled = false;
        toast(result.error || 'Could not remove that name.', true);
      } else if (result.view) {
        updateView(result.view);
      }
      return;
    }
    if (action === 'leave') {
      // Remember teacher credentials only to close the old class if New Game is clicked.
      const formerHost = session?.role === 'teacher' ? session : null;
      clearSession();
      if (formerHost) localStorage.setItem(PREVIOUS_HOST_KEY, JSON.stringify(formerHost));
      history.replaceState(null, '', '/');
      render();
      return;
    }
    if (!view) return;
    if (action === 'start') {
      if (settingsSavePending || queuedSettings) { toast('Saving your game options. Try Start again in a moment.'); return; }
      button.disabled = true;
      const r = await send('room:start');
      if (!r.ok) { button.disabled = false; toast(r.error || 'Could not start the race.', true); }
      else if (r.view) updateView(r.view);
      return;
    }
    if (action === 'restart') {
      if (!confirm('Start a fresh round? Scores reset, but all students stay connected using the SAME room code.')) return;
      const r = await send('room:restart');
      if (!r.ok) toast(r.error || 'Could not restart the round.', true);
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
    // Enter the immersive view on the user's Join tap, before any await.
    // Browsers prohibit unprompted fullscreen on later live game events.
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (enter) Promise.resolve(enter.call(document.documentElement)).catch(() => {
          // The student can use the top-right Full screen button instead.
        });
      } catch { /* Fullscreen unavailable on this device. */ }
    }
    const formData = new FormData(e.target);
    const code = String(formData.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
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
    if (e.target.id === 'cards-to-win') {
      sliderEditing = true;
      const n = Number(e.target.value);
      const valueDisplay = document.getElementById('cards-range-value');
      if (valueDisplay) valueDisplay.textContent = String(n);
      e.target.style.setProperty('--range-fill', `${(n-5)*5}%`);
    }
    if (e.target.id === 'time-limit') {
      sliderEditing = true;
      const minutes = Number(e.target.value);
      const text = document.getElementById('time-range-value');
      if (text) text.textContent = minutes + (minutes === 1 ? ' min' : ' mins');
      e.target.style.setProperty('--range-fill', String((minutes - 1) * 20) + '%');
    }
    if (e.target.id === 'room-code') joinDraft.code = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0,4);
    if (e.target.id === 'player-name') joinDraft.name = e.target.value;
  });
  document.addEventListener('change', async e => {
    if (!['cards-to-win','theme-select','time-limit'].includes(e.target.id)) return;
    if (view?.role !== 'teacher' || view.status !== 'lobby') return;
    const n = Number(document.getElementById('cards-to-win')?.value || view.cardsToWin);
    const theme = document.getElementById('theme-select')?.value || view.theme || 'mixed';
    // Input updates the number immediately. One request saves on release;
    // a newer change supersedes any queued setting, so dragging feels stable.
    sliderEditing = true;
    queuedSettings = { cardsToWin: n, theme, gameMode:view.gameMode, timeLimitSec:Number(document.getElementById('time-limit')?.value || Math.round(view.timeLimitSec / 60) || 2) * 60 };
    void flushGameSettings();
  });
  document.addEventListener('focusout', e => {
    if (e.target.id === 'theme-select' && view?.role === 'teacher' && view.status === 'lobby') {
      // defer so that a simultaneous change event can submit the final choice
      setTimeout(() => { if (document.activeElement?.id !== 'theme-select') render(); }, 50);
    }
  });
  document.addEventListener('fullscreenchange', () => { updateFullscreenUI(); if (view?.role === 'teacher') render(); else if (view?.role === 'student') updateStudentHeader(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFullscreenUI(); if (view?.role === 'teacher') render(); else if (view?.role === 'student') updateStudentHeader(); });
  window.addEventListener('resize', () => { if (document.fullscreenElement && view?.role === 'teacher') render(); });
  updateFullscreenUI();
  setSoundUI();
  render();
})();
