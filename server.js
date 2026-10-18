'use strict';
// Zero third-party dependencies: native Node HTTP + Server-Sent Events (SSE).
// Browser actions travel over HTTP; all teacher/student screens receive live SSE updates.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { THEME_SYMBOLS, symbolsForTheme, DECK, getSharedSymbol } = require('./deck');

const { createWeave, createSearch, validatePath, TOPICS } = require('./wordgames');
const Jump=require('./jump-engine');
const rooms = new Map();
const MAX_PLAYERS = 40;
const CELEBRATION_MS = 1500;
const FIRE_CELEBRATION_MS = 2000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

function randomCode() {
  let code;
  do { code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function token() { return crypto.randomBytes(24).toString('hex'); }
function shuffle(original) {
  const items = [...original];
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function cardView(id, theme = 'mixed') {
  const symbols = symbolsForTheme(theme);
  return { id, symbols: shuffle(DECK[id]).map(n => ({ id: n, emoji: symbols[n][0], label: symbols[n][1] })) };
}

function topCard(player) { return player.hand.length ? player.hand[0] : null; }
function chooseCenter(room, former) {
  const taken = new Set([...room.players.values()].filter(p => p.inRound && p.hand.length).map(p => topCard(p).id));
  let options = DECK.map((_, i) => i).filter(i => !taken.has(i) && i !== former);
  if (!options.length) options = DECK.map((_, i) => i).filter(i => !taken.has(i));
  return cardView(options[crypto.randomInt(options.length)], room.theme);
}

function playerList(room) {
  return [...room.players.values()].map(p => ({
    id:p.id, name:p.name, character:p.character||0, points:p.points, online:Boolean(p.stream),
    inRound:p.inRound, joinedAt:p.joinedAt
  })).sort((a,b) => b.points - a.points || a.joinedAt - b.joinedAt);
}
function view(room, role, playerId) {
  const p = role === 'student' ? room.players.get(playerId) : null;
  return {
    geoSettings:room.geoSettings, geo:room.geo?{world:room.geo.world,...Jump.frame(room.geo),self:p&&room.geo.players.has(p.id)?Jump.privateState(room.geo.players.get(p.id)):null}:null, code:room.code, role, gameType:room.gameType || 'spot', wordSettings:room.wordSettings, puzzle:room.puzzle && !['lobby','countdown'].includes(room.status) ? {id:room.puzzle.id, size:room.puzzle.size, grid:room.puzzle.grid, words:room.puzzle.words || [], solutionCount:room.puzzle.solutions?.size || 0, answers:room.status === 'finished' && room.gameType === 'weave' ? [...room.puzzle.solutions.keys()].sort((a,b)=>b.length-a.length || a.localeCompare(b)) : []} : null, foundWords:p?.foundWords || [], foundPaths:p?.foundPaths || [], status:room.status, revision:room.revision || 0, cardsToWin:room.cardsToWin, gameMode:room.gameMode, timeLimitSec:room.timeLimitSec, timeEndsAt:room.timeEndsAt, timeRemainingMs:room.timeRemainingMs, winnerIds:room.winnerIds || [], theme: room.theme, availableThemes: Object.keys(THEME_SYMBOLS),
    players:playerList(room), teacherOnline:Boolean(room.hostStream),
    teacherCard:room.status === 'countdown' ? null : room.teacherCard, cardTurn:room.cardTurn,
    countdownEndsAt:room.status === 'countdown' ? room.countdownEndsAt : null,
    myCard:p?.inRound && room.status !== 'countdown' ? topCard(p) : null,
    me:p ? { id:p.id, name:p.name, character:p.character||0, points:p.points, inRound:p.inRound, lockedOut:Boolean(p.blockedTurn && p.blockedTurn === room.cardTurn) } : null,
    winnerId:room.winnerId, lastEvent:room.lastEvent,
    pendingMatch:room.pendingMatch ? {
      eventId:room.pendingMatch.eventId,
      playerName:room.pendingMatch.playerName,
      symbol:room.pendingMatch.symbol,
      symbolId:room.pendingMatch.symbolId,
      streak:room.pendingMatch.streak,
      onFire:room.pendingMatch.onFire,
      celebrationMs:room.pendingMatch.celebrationMs,
      endsAt:room.pendingMatch.endsAt,
      // Each student's own card has a unique matching symbol against the
      // teacher card; this is not always the same as the scorer's picture.
      matchSymbolId:p?.inRound && p.hand.length && room.teacherCard ?
        getSharedSymbol(room.teacherCard.id,topCard(p).id) : null
    } : null,
    startedAt:room.startedAt, endedAt:room.endedAt
  };
}
function writeEvent(stream, payload, event = 'message') {
  if (!stream || stream.writableEnded || stream.destroyed) return;
  try { stream.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { /* closed */ }
}
function broadcast(room) {
  room.revision = (room.revision || 0) + 1;
  room.updatedAt = Date.now();
  if (room.hostStream) writeEvent(room.hostStream, view(room, 'teacher'));
  for (const p of room.players.values()) {
    if (p.stream) writeEvent(p.stream, view(room, 'student', p.id));
  }
}
// Timed races end at the authoritative server deadline, even when a student
// is watching a match celebration. Scores awarded before the deadline count.
function finishTimedRound(room) {
  if (room.status !== 'playing' || room.gameMode !== 'timed') return false;
  clearTimeout(room.timeTimer); room.timeTimer = null;
  clearTimeout(room.pendingTimer); room.pendingTimer = null;
  clearTimeout(room.wrongTurnTimer); room.wrongTurnTimer = null;
  room.pendingMatch = null;
  room.timeEndsAt = null;
  room.timeRemainingMs = 0;
  room.status = 'finished';
  room.endedAt = Date.now();
  const ranked = playerList(room).filter(p => p.inRound);
  const best = Math.max(0, ...ranked.map(p => p.points));
  room.winnerIds = best > 0 ? ranked.filter(p => p.points === best).map(p => p.id) : [];
  room.winnerId = room.winnerIds.length === 1 ? room.winnerIds[0] : null;
  broadcast(room);
  return true;
}
function scheduleTimedFinish(room) {
  clearTimeout(room.timeTimer);
  if (room.gameMode !== 'timed' || room.status !== 'playing') return;
  const wait = Math.max(0, room.timeEndsAt - Date.now());
  room.timeTimer = setTimeout(() => {
    room.timeTimer = null;
    if (rooms.get(room.code) === room && room.status === 'playing' && room.gameMode === 'timed')
      finishTimedRound(room);
  }, wait);
}
// Only the server can advance the shared card: 1.5 seconds normally or 2 on fire.
// A single pending match per room prevents overlapping celebrations or stale guesses.
function finalizeMatch(room, eventId) {
  if (!room.pendingMatch || room.pendingMatch.eventId !== eventId || rooms.get(room.code) !== room) return false;
  const pending = room.pendingMatch;
  clearTimeout(room.pendingTimer);
  room.pendingTimer = null;
  room.pendingMatch = null;
  const player = room.players.get(pending.playerId);
  if (!player) return false;
  player.hand.shift();
  if (pending.won && room.gameMode === 'cards') {
    room.status = 'finished';
    room.winnerId = player.id;
    room.winnerIds = [player.id];
    room.endedAt = Date.now();
  } else {
    if (room.gameMode === 'timed' && !player.hand.length) {
      const refill = shuffle(DECK.map((_,i)=>i).filter(i=>i!==room.teacherCard.id));
      player.hand = refill.slice(0,25).map(id=>cardView(id,room.theme));
    }
    room.teacherCard = chooseCenter(room, pending.oldCenter);
    room.cardTurn++;
  }
  broadcast(room);
  return true;
}
// A fresh round always keeps the same room, player IDs, names and SSE streams.
// Students temporarily offline stay registered and rejoin their active round.
function startRound(room) {
  if (room.players.size === 0) return failure('Wait for at least one student to join.');
  const nextPuzzle = room.gameType === 'weave' ? createWeave(room.wordSettings) : room.gameType === 'search' ? createSearch(room.wordSettings) : null;
  clearTimeout(room.geoTimer);room.geoTimer=null;
  room.geo=room.gameType==='geo'?Jump.create(room.geoSettings.km,[...room.players.values()]):null;
  clearTimeout(room.pendingTimer);
  clearTimeout(room.wrongTurnTimer);
  clearTimeout(room.startTimer);
  clearTimeout(room.timeTimer);
  room.pendingTimer = room.wrongTurnTimer = room.startTimer = room.timeTimer = null;
  room.pendingMatch = null;
  room.status = 'countdown';
  room.winnerId = null;
  room.winnerIds = [];
  room.timeEndsAt = null;
  room.timeRemainingMs = room.timeLimitSec * 1000;
  room.startedAt = Date.now();
  room.countdownEndsAt = room.startedAt + 3000;
  room.endedAt = null;
  room.cardTurn = 1;
  room.lastEvent = null;
  room.streakPlayerId = null;
  room.streakCount = 0;
  const initial = crypto.randomInt(DECK.length);
  room.puzzle = nextPuzzle;
  room.teacherCard = (nextPuzzle || room.gameType==='geo') ? null : cardView(initial, room.theme);
  for (const student of room.players.values()) {
    student.inRound = true;
    student.foundWords = []; student.foundPaths = []; student.lastWordAt = 0;
    student.points = 0;
    student.lockUntil = 0;
    student.blockedTurn = 0;
    student.hand = (nextPuzzle || room.gameType==='geo') ? [] : shuffle(DECK.map((_, i) => i).filter(i => i !== initial)).slice(0, room.gameMode === 'timed' ? 25 : room.cardsToWin).map(id => cardView(id, room.theme));
  }
  broadcast(room);
  const code = room.code;
  const end = room.countdownEndsAt;
  room.startTimer = setTimeout(() => {
    room.startTimer = null;
    if (rooms.get(code) !== room || room.status !== 'countdown' || room.countdownEndsAt !== end) return;
    room.status = 'playing';
    room.countdownEndsAt = null;
    if(room.gameType==='geo')beginGeo(room);
    if (room.gameMode === 'timed' && room.gameType!=='geo') {
      room.timeEndsAt = Date.now() + room.timeRemainingMs;
      scheduleTimedFinish(room);
    }
    broadcast(room);
  }, 3000);
  return success({ status:'countdown', code:room.code, countdownEndsAt:end, view:view(room,'teacher') });
}

// Simulation is authoritative; clients send controls, never positions or scores.
function beginGeo(room) {
 clearInterval(room.geoTimer);let last=performance.now(),accumulator=0,lastPush=last;room.jumpHistories ||= new Map();
 room.geoTimer=setInterval(()=>{
  if(rooms.get(room.code)!==room||!room.geo){clearInterval(room.geoTimer);return;}
  const now=performance.now(),elapsed=Math.min(.15,(now-last)/1000);last=now;
  if(room.status!=='playing'){accumulator=0;return;}
  accumulator+=elapsed;
  while(accumulator>=Jump.C.step&&!room.geo.done){Jump.step(room.geo,Jump.C.step,Date.now(),room.jumpHistories);accumulator-=Jump.C.step;}
  if(room.geo.done){finishGeo(room);return;}
  if(now-lastPush>=50){lastPush=now;
   for(const [id,s] of room.geo.players){const p=room.players.get(id);if(p)p.points=Math.floor(s.y/Jump.C.metre);}
   const f={...Jump.frame(room.geo),status:room.status};if(room.hostStream)writeEvent(room.hostStream,f,'jump:frame');
   for(const p of room.players.values())if(p.stream)writeEvent(p.stream,{...f,self:room.geo.players.has(p.id)?Jump.privateState(room.geo.players.get(p.id)):null},'jump:frame');
  }
 },1000/120);room.geoTimer.unref?.();
}
function finishGeo(room){clearInterval(room.geoTimer);room.geoTimer=null;room.status='finished';room.endedAt=Date.now();room.winnerIds=[room.geo.finished[0]].filter(Boolean);room.winnerId=room.winnerIds[0]||null;for(const [id,s] of room.geo.players){const p=room.players.get(id);if(p)p.points=Math.floor(s.best/Jump.C.metre);}broadcast(room);}
function revealGeo(){return false;}

function resolveAuth(body, role) {
  const room = rooms.get(String(body?.session?.code || '').toUpperCase());
  if (!room || body?.session?.role !== role) return null;
  if (role === 'teacher') return room.hostToken === body.session.token ? { room } : null;
  const p = room.players.get(body.session.token);
  return p ? { room, p } : null;
}
function cleanName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g,' ').slice(0,22);
  return n.length >= 2 ? n : null;
}
function failure(error, extra = {}) { return { ok:false, error, ...extra }; }
function success(extra = {}) { return { ok:true, ...extra }; }

function action(body) {
  const command = body?.action;
  const data = body?.data || {};
  let auth;
  let room;
  let p;

  if (command === 'room:create') {
    const oldHost = data?.previousHost;
    const previousRoom = oldHost?.role === 'teacher' ? rooms.get(String(oldHost.code || '').toUpperCase()) : null;
    const canReplace = Boolean(previousRoom && previousRoom.hostToken === oldHost.token);
    if (rooms.size > 200 && !canReplace) return failure('The server has too many rooms. Try again shortly.');
    // Generate the new code BEFORE closing the old room: never reuse its code.
    const code = randomCode();
    room = {
      code, hostToken:token(), hostStream:null, players:new Map(),
      geoSettings:{km:1},geo:null,geoTimer:null,gameType:'spot', wordSettings:{gridSize:4,minLength:3,duration:180,wordCount:10,topic:'mixed',difficulty:'normal'}, puzzle:null, spotSettings:null, status:'lobby', revision:0, cardsToWin:10, gameMode:'cards', timeLimitSec:120, timeEndsAt:null, timeRemainingMs:120000, timeTimer:null, winnerIds:[], theme:'scifi', teacherCard:null, cardTurn:0,
      winnerId:null, lastEvent:null, eventNumber:0, streakPlayerId:null, streakCount:0, kickedTokens:new Set(), pendingMatch:null, pendingTimer:null, wrongTurnTimer:null,
      startedAt:null, endedAt:null, countdownEndsAt:null, startTimer:null, createdAt:Date.now(), updatedAt:Date.now()
    };
    rooms.set(code, room);
    if (canReplace) {
      // A new class needs a new, empty room. Students do not carry over.
      for (const timer of ['startTimer','timeTimer','pendingTimer','wrongTurnTimer','geoTimer'])
        clearTimeout(previousRoom[timer]);
      previousRoom.status = 'closed';
      const message = { reason:'This class session has ended. Ask your teacher for the new game code.' };
      for (const student of previousRoom.players.values()) {
        if (student.stream) {
          writeEvent(student.stream, message, 'room-closed');
          student.stream.end();
          student.stream = null;
        }
      }
      if (previousRoom.hostStream) {
        writeEvent(previousRoom.hostStream, message, 'room-closed');
        previousRoom.hostStream.end();
        previousRoom.hostStream = null;
      }
      previousRoom.players.clear();
      rooms.delete(previousRoom.code);
    }
    return success({ code, token:room.hostToken, view:view(room, 'teacher') });
  }
  if (command === 'room:join') {
    const code = String(data?.code || '').toUpperCase().trim();
    room = rooms.get(code);
    const name = cleanName(data?.name);
    if (!room) return failure('Game code not found. Check the teacher screen.');
    if (!name) return failure('Enter a name with at least 2 characters.');
    if (room.players.size >= MAX_PLAYERS) return failure('This game is full (40 players).');
    if ([...room.players.values()].some(x => x.name.toLowerCase() === name.toLowerCase())) {
      return failure('That name is taken. Add an initial to your name.');
    }
    p = { id:token(), name, character:room.players.size%30, stream:null, points:0, hand:[], inRound:false, joinedAt:Date.now(), lockUntil:0, blockedTurn:0 };
    room.players.set(p.id,p);
    broadcast(room);
    return success({ code, token:p.id, view:view(room, 'student', p.id) });
  }
  if (command === 'room:resume') {
    const staleRoom = rooms.get(String(data?.code || '').toUpperCase());
    if (data?.role === 'student' && staleRoom?.kickedTokens?.has(data.token))
      return failure('The teacher removed this name. Join again with a different name.', { removed:true });
    auth = resolveAuth({ session: data }, data?.role);
    if (!auth) return failure('That session is no longer available.');
    room = auth.room;
    return success({ code:room.code, view:view(room, data.role, auth.p?.id) });
  }

  const role = ['game:match','word:submit','jump:input','jump:answer','jump:character'].includes(command) ? 'student' : 'teacher';
  auth = resolveAuth(body, role);
  if (!auth) return failure('This game session has expired. Refresh and join again.');
  room = auth.room;
  p = auth.p;

  if (command === 'room:remove-player') {
    if (room.status !== 'lobby') return failure('You can only remove names before a round starts.');
    const playerId = String(data.playerId || '');
    const player = room.players.get(playerId);
    if (!player) return failure('That student is no longer in this room.');
    room.kickedTokens.add(playerId);
    room.players.delete(playerId);
    if (player.stream) {
      writeEvent(player.stream, {
        reason:'The teacher removed this name. Join again using a different name.',
        code:room.code
      }, 'removed');
      player.stream.end();
      player.stream = null;
    }
    broadcast(room);
    return success({ removedPlayerId:playerId, view:view(room,'teacher') });
  }
  if (command === 'room:select-game') {
    if (!['lobby','finished'].includes(room.status)) return failure('Return to the lobby before changing games.');
    if (!['spot','weave','search','geo'].includes(data.gameType)) return failure('Choose a game from the picker.');
    if (room.gameType === 'spot') room.spotSettings={cardsToWin:room.cardsToWin,gameMode:room.gameMode,timeLimitSec:room.timeLimitSec,theme:room.theme};
    for (const timer of ['startTimer','timeTimer','pendingTimer','wrongTurnTimer','geoTimer']) { clearTimeout(room[timer]); room[timer]=null; }
    room.gameType=data.gameType;
    if (room.gameType === 'spot') Object.assign(room,room.spotSettings || {cardsToWin:10,gameMode:'cards',timeLimitSec:120,theme:'scifi'});
    else { room.gameMode=room.gameType==='weave'?'timed':'cards'; room.timeLimitSec=room.wordSettings.duration; room.cardsToWin=room.wordSettings.wordCount; }
    room.timeRemainingMs=room.timeLimitSec*1000; room.timeEndsAt=null; room.countdownEndsAt=null;
    room.status='lobby'; room.geo=null; room.puzzle=null; room.teacherCard=null; room.pendingMatch=null; room.lastEvent=null;
    room.winnerId=null; room.winnerIds=[]; room.startedAt=null; room.endedAt=null;
    for (const student of room.players.values()) {student.points=0;student.inRound=false;student.hand=[];student.foundWords=[];student.foundPaths=[];student.blockedTurn=0;}
    broadcast(room);
    return success({view:view(room,'teacher')});
  }
  if(command==='room:geo-settings') {
    if(room.gameType!=='geo'||room.status!=='lobby'||![1,2,3].includes(data.km))return failure('Choose a 1, 2 or 3 km dash in the lobby.');
    room.geoSettings={km:data.km};broadcast(room);return success({view:view(room,'teacher')});
  }
  if(command==='jump:character'){
    if(room.status!=='lobby'||!Number.isInteger(data.character)||data.character<0||data.character>=30)return failure('Choose your character in the lobby.');
    p.character=data.character;broadcast(room);return success({view:view(room,'student',p.id)});
  }
  if(command==='jump:input'||command==='jump:answer'){
    const s=room.geo?.players.get(p.id);
    if(room.gameType!=='geo'||room.status!=='playing'||!s)return failure('Wait for the race to start.');
    if(command==='jump:input'){Jump.input(s,data,Date.now());return success({});}
    return Jump.answer(room.geo,s,data);
  }
  if (command === 'room:word-settings') {
    if (room.status !== 'lobby' || !['weave','search'].includes(room.gameType)) return failure('Choose a word game in the lobby first.');
    const next={...room.wordSettings,...data};
    if (![4,5].includes(next.gridSize) || ![3,4].includes(next.minLength) || ![60,120,180,240,300,360].includes(next.duration) || ![5,10,15,20].includes(next.wordCount) || !Object.hasOwn(TOPICS,next.topic) || !['easy','normal','hard'].includes(next.difficulty)) return failure('Choose one of the available game settings.');
    room.wordSettings={gridSize:next.gridSize,minLength:next.minLength,duration:next.duration,wordCount:next.wordCount,topic:next.topic,difficulty:next.difficulty};
    room.timeLimitSec=next.duration;room.timeRemainingMs=next.duration*1000;room.cardsToWin=next.wordCount;
    broadcast(room);return success({view:view(room,'teacher')});
  }
  if (command === 'word:submit') {
    if (!['weave','search'].includes(room.gameType) || room.status!=='playing' || !p.inRound || !room.puzzle) return failure('Wait for your teacher to start.');
    if (room.gameType==='weave' && Date.now()>=room.timeEndsAt) {finishTimedRound(room);return failure('Time is up!');}
    if (data.puzzleId!==room.puzzle.id) return failure('The puzzle has changed. Try the new grid.');
    if (Date.now()-(p.lastWordAt||0)<180) return failure('One word at a time.');
    p.lastWordAt=Date.now();
    const result=validatePath(room.puzzle,data.path,room.gameType,room.wordSettings.minLength);
    if (result.error) return failure(result.error);
    if (p.foundWords.includes(result.word)) return failure('You have already found that word.');
    p.foundWords.push(result.word);p.foundPaths.push({word:result.word,path:[...data.path]});p.points+=result.points;
    room.lastEvent={id:++room.eventNumber,playerId:p.id,playerName:p.name,word:result.word,points:p.points};
    if (room.gameType==='search' && p.foundWords.length===room.puzzle.words.length) {room.status='finished';room.winnerId=p.id;room.winnerIds=[p.id];room.endedAt=Date.now();}
    broadcast(room);return success({word:result.word,points:result.points,view:view(room,'student',p.id)});
  }
  if (command === 'room:settings') {
    if (room.status !== 'lobby' || room.gameType !== 'spot') return failure('Change Spot Sprint options in its lobby.');
    const n = Number(data.cardsToWin);
    if (!Number.isInteger(n) || n < 5 || n > 25) return failure('Choose between 5 and 25 cards.');
    const theme = String(data.theme || room.theme || 'mixed');
    if (!Object.hasOwn(THEME_SYMBOLS, theme)) return failure('Choose a valid card set.');
    const gameMode = String(data.gameMode || room.gameMode || 'cards');
    const timeLimitSec = Number(data.timeLimitSec ?? room.timeLimitSec ?? 120);
    if (!['cards','timed'].includes(gameMode)) return failure('Choose Cards or Timed.');
    if (!Number.isInteger(timeLimitSec) || timeLimitSec < 60 || timeLimitSec > 360 || timeLimitSec % 60 !== 0) return failure('Choose a whole number of minutes between 1 and 6.');
    room.cardsToWin = n;
    room.gameMode = gameMode;
    room.timeLimitSec = timeLimitSec;
    room.timeRemainingMs = timeLimitSec * 1000;
    room.theme = theme;
    broadcast(room);
    return success({ view:view(room,'teacher') });
  }
  if (command === 'room:start') {
    if (!['lobby','finished'].includes(room.status)) return failure('A race is already running.');
    return startRound(room);
  }
  if (command === 'room:restart') {
    // Explicit 'new round' keeps everyone in the existing session / code.
    return startRound(room);
  }
  if (command === 'room:pause') {
    if (!['playing','paused'].includes(room.status)) return failure('The race is not running.');
    if (room.pendingMatch) return failure('Wait for the new card before pausing.');
    if (room.status === 'playing') {
      
      if (room.gameMode === 'timed') {
        room.timeRemainingMs = Math.max(0,room.timeEndsAt - Date.now());
        room.timeEndsAt = null;
        clearTimeout(room.timeTimer);
        room.timeTimer = null;
      }
      room.status = 'paused';
    } else {
      room.status = 'playing';
      
      if (room.gameMode === 'timed') {
        room.timeEndsAt = Date.now() + room.timeRemainingMs;
        scheduleTimedFinish(room);
      }
    }
    broadcast(room);
    return success();
  }
  if (command === 'room:reset') {
    clearTimeout(room.geoTimer);room.geoTimer=null;room.geo=null;
    clearTimeout(room.pendingTimer);
    clearTimeout(room.wrongTurnTimer);
    clearTimeout(room.startTimer);
    clearTimeout(room.timeTimer);
    room.timeTimer = null;
    room.timeEndsAt = null;
    room.timeRemainingMs = room.timeLimitSec * 1000;
    room.winnerIds = [];
    room.startTimer = null;
    room.countdownEndsAt = null;
    room.pendingTimer = null;
    room.wrongTurnTimer = null;
    room.pendingMatch = null;
    room.status = 'lobby';
    room.puzzle = null;
    room.teacherCard = null;
    room.winnerId = null;
    room.lastEvent = null;
    room.streakPlayerId = null;
    room.streakCount = 0;
    room.startedAt = null;
    room.endedAt = null;
    room.cardTurn = 0;
    for (const student of room.players.values()) {
      student.points=0; student.inRound=false; student.hand=[]; student.blockedTurn=0; student.foundWords=[]; student.foundPaths=[];
    }
    broadcast(room);
    return success();
  }
  if (command === 'game:match') {
    if (room.gameType !== 'spot') return failure('This is a word game.');
    if (room.status !== 'playing' || !p.inRound || !p.hand.length) return failure('The race is not active.');
    if (room.pendingMatch) return failure('Get ready for the next picture!', { cooldown:true });
    if ((p.blockedTurn && p.blockedTurn === room.cardTurn) || Date.now() < p.lockUntil) return failure('Wait for the next card.',{ cooldown:true, locked:true });
    const own = topCard(p);
    if (data.cardTurn !== room.cardTurn || data.cardId !== own.id) return failure('The card has changed.',{ stale:true });
    const correct = getSharedSymbol(room.teacherCard.id, own.id);
    if (Number(data.symbol) !== correct) {
      // A missed guess breaks this player's consecutive-correct streak.
      if (room.streakPlayerId === p.id) {
        room.streakPlayerId = null;
        room.streakCount = 0;
      }
      p.lockUntil = Date.now() + 500;
      p.blockedTurn = room.cardTurn;
      // If everyone makes a mistake, advance the shared card automatically.
      // Otherwise a whole class (or a solo test player) could get stuck forever.
      const active = [...room.players.values()].filter(x => x.inRound && x.hand.length);
      if (active.length && active.every(x => x.blockedTurn === room.cardTurn) && !room.wrongTurnTimer) {
        const missedTurn = room.cardTurn;
        room.wrongTurnTimer = setTimeout(() => {
          room.wrongTurnTimer = null;
          if (rooms.get(room.code) !== room || room.status !== 'playing' || room.cardTurn !== missedTurn || room.pendingMatch) return;
          room.teacherCard = chooseCenter(room, room.teacherCard.id);
          room.cardTurn++;
          broadcast(room);
        }, CELEBRATION_MS);
      }
      return { ok:true, correct:false, lockedUntilNextCard:true, cardTurn: room.cardTurn };
    }
    // Award the point immediately, but HOLD the shared card for the full celebration.
    // Leave all player cards in place until the flip so everybody stays in sync.
    p.points++;
    const won = room.gameMode === 'cards' && p.points >= room.cardsToWin;
    room.eventNumber++;
    const eventId = room.eventNumber;
    const streak = room.streakPlayerId === p.id ? room.streakCount + 1 : 1;
    room.streakPlayerId = p.id;
    room.streakCount = streak;
    const onFire = streak >= 3;
    const celebrationMs = onFire ? FIRE_CELEBRATION_MS : CELEBRATION_MS;
    const endsAt = Date.now() + celebrationMs;
    const symbols = symbolsForTheme(room.theme);
    room.lastEvent = { id:eventId, playerId:p.id, playerName:p.name, symbol:symbols[correct][1], points:p.points, won, streak, onFire };
    room.pendingMatch = {
      eventId, playerId:p.id, playerName:p.name, symbol:symbols[correct][1],
      symbolId:correct, oldCenter:room.teacherCard.id, won, endsAt,
      celebrationMs, streak, onFire
    };
    broadcast(room);
    room.pendingTimer = setTimeout(() => finalizeMatch(room, eventId), celebrationMs);
    return { ok:true, correct:true, won, celebrationMs, streak, onFire };
  }
  return failure('Unknown game action.');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(payload));
}
function receiveJson(req, res) {
  let size=0;
  const data=[];
  req.on('data',chunk => {
    size += chunk.length;
    if (size > 12000) { sendJson(res,413,failure('Request is too large.')); req.destroy(); return; }
    data.push(chunk);
  });
  req.on('end',() => {
    if (res.writableEnded) return;
    try { sendJson(res,200,action(JSON.parse(Buffer.concat(data).toString('utf8')))); }
    catch(e) { console.error('Action error:', e.message); sendJson(res,400,failure('Invalid request.')); }
  });
}
function connectEvents(req, res, url) {
  const code=String(url.searchParams.get('code')||'').toUpperCase();
  const secret=url.searchParams.get('token');
  const role=url.searchParams.get('role');
  const room=rooms.get(code);
  if (!room) return sendJson(res,404,failure('Game not found.'));
  let p=null;
  if (role==='teacher') {
    if (room.hostToken !== secret) return sendJson(res,403,failure('Not allowed.'));
  } else if (role==='student') {
    p=room.players.get(secret);
    if (!p) return sendJson(res,403,failure('Not allowed.'));
  } else return sendJson(res,403,failure('Not allowed.'));
  res.writeHead(200, {
    'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive',
    'X-Accel-Buffering':'no', 'X-Content-Type-Options':'nosniff'
  });
  res.write('retry: 1000\n\n');
  const old = p ? p.stream : room.hostStream;
  if (old && old !== res) {
    writeEvent(old, { reason:'Opened in another tab or device.' }, 'replaced');
    old.end();
  }
  if (p) p.stream=res; else room.hostStream=res;
  broadcast(room);
  res.on('close',() => {
    if (p && p.stream===res) p.stream=null;
    if (!p && room.hostStream===res) room.hostStream=null;
    broadcast(room);
  });
}
const allowFiles = {
  '/':'index.html', '/index.html':'index.html',
  '/jump-motion.js':'jump-motion.js','/geo-jump.webp':'geo-jump.webp','/map-hub.js':'map-hub.js','/map-hub.css':'map-hub.css','/map-data.js':'map-data.js','/map-dash.webp':'map-dash.webp',
  '/flags/jp.svg':'flags/jp.svg','/flags/fr.svg':'flags/fr.svg','/flags/it.svg':'flags/it.svg','/flags/de.svg':'flags/de.svg','/flags/br.svg':'flags/br.svg','/flags/ca.svg':'flags/ca.svg','/flags/au.svg':'flags/au.svg','/flags/nz.svg':'flags/nz.svg','/flags/in.svg':'flags/in.svg','/flags/za.svg':'flags/za.svg','/flags/gb.svg':'flags/gb.svg','/flags/kr.svg':'flags/kr.svg','/flags/mx.svg':'flags/mx.svg','/flags/ch.svg':'flags/ch.svg','/flags/se.svg':'flags/se.svg','/flags/es.svg':'flags/es.svg',
  '/word-hub.js':'word-hub.js', '/word-hub.css':'word-hub.css', '/word-weave.webp':'word-weave.webp', '/find-a-word.webp':'find-a-word.webp',
  '/app.js':'app.js', '/realtime.js':'realtime.js', '/style.css':'style.css', '/symbols.webp':'symbols.webp', '/symbols-sports.webp':'symbols-sports.webp', '/symbols-animals.webp':'symbols-animals.webp', '/symbols-emojis.webp':'symbols-emojis.webp', '/symbols-scifi.webp':'symbols-scifi.webp', '/symbols-festive.webp':'symbols-festive.webp', '/logo-mark.svg':'logo-mark.svg', '/start-rocket.webp':'start-rocket.webp', '/cosmic-sky-bg.jpg':'cosmic-sky-bg.jpg', '/spot-sprint-wordmark.webp':'spot-sprint-wordmark.webp', '/arcade-mountains.webp':'arcade-mountains.webp'
};
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webp':'image/webp', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png' };
for(const file of fs.readdirSync(path.join(publicDir,'flags')))if(/^[a-z]{2}\.svg$/.test(file))allowFiles['/flags/'+file]='flags/'+file;
const server = http.createServer((req,res) => {
  const url=new URL(req.url,'http://localhost');
  if (req.method==='GET' && url.pathname==='/health') return sendJson(res,200,{ok:true,service:'spot-sprint'});
  if (req.method==='POST' && url.pathname==='/api/action') return receiveJson(req,res);
  if (req.method==='GET' && url.pathname==='/events') return connectEvents(req,res,url);
  if (req.method==='GET' && Object.hasOwn(allowFiles,url.pathname)) {
    const file=path.join(publicDir,allowFiles[url.pathname]);
    if (!fs.existsSync(file)) return sendJson(res,404,failure('Asset unavailable.'));
    res.writeHead(200,{
      'Content-Type':mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control':'no-store, max-age=0', 'X-Content-Type-Options':'nosniff'
    });
    fs.createReadStream(file).on('error', error => {
      console.error('Static asset read failed:', file, error.message);
      res.destroy(error);
    }).pipe(res);
    return;
  }
  if (req.method==='GET' && url.pathname==='/favicon.ico') { res.writeHead(204); res.end(); return; }
  sendJson(res,404,failure('Not found.'));
});

setInterval(() => {
  const now=Date.now();
  for (const [code,room] of rooms) {
    const online=Boolean(room.hostStream) || [...room.players.values()].some(p=>p.stream);
    if (room.hostStream) room.hostStream.write(': heartbeat\n\n');
    for (const p of room.players.values()) if (p.stream) p.stream.write(': heartbeat\n\n');
    if (now - room.createdAt > 8*60*60*1000 || (!online && now - room.updatedAt > 45*60*1000)) {
      if (room.hostStream) room.hostStream.end();
      for (const p of room.players.values()) if (p.stream) p.stream.end();
      for(const k of ['geoTimer','startTimer','timeTimer','pendingTimer','wrongTurnTimer'])clearTimeout(room[k]);
      rooms.delete(code);
    }
  }
},15000).unref();

if (require.main===module) server.listen(PORT,'0.0.0.0',()=>console.log(`Spot Sprint ready at http://localhost:${PORT}`));
module.exports = { server, action, rooms, view, finalizeMatch, finishTimedRound, revealGeo, CELEBRATION_MS, FIRE_CELEBRATION_MS };
