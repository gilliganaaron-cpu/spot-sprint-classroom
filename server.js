'use strict';
// Zero third-party dependencies: native Node HTTP + Server-Sent Events (SSE).
// Browser actions travel over HTTP; all teacher/student screens receive live SSE updates.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SYMBOLS, DECK, getSharedSymbol } = require('./deck');

const rooms = new Map();
const MAX_PLAYERS = 40;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

function randomCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); }
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
function cardView(id) {
  return { id, symbols: shuffle(DECK[id]).map(n => ({ id: n, emoji: SYMBOLS[n][0], label: SYMBOLS[n][1] })) };
}
function topCard(player) { return player.hand.length ? player.hand[0] : null; }
function chooseCenter(room, former) {
  const taken = new Set([...room.players.values()].filter(p => p.inRound && p.hand.length).map(p => topCard(p).id));
  let options = DECK.map((_, i) => i).filter(i => !taken.has(i) && i !== former);
  if (!options.length) options = DECK.map((_, i) => i).filter(i => !taken.has(i));
  return cardView(options[crypto.randomInt(options.length)]);
}
function playerList(room) {
  return [...room.players.values()].map(p => ({
    id:p.id, name:p.name, points:p.points, online:Boolean(p.stream),
    inRound:p.inRound, joinedAt:p.joinedAt
  })).sort((a,b) => b.points - a.points || a.joinedAt - b.joinedAt);
}
function view(room, role, playerId) {
  const p = role === 'student' ? room.players.get(playerId) : null;
  return {
    code:room.code, role, status:room.status, cardsToWin:room.cardsToWin,
    players:playerList(room), teacherOnline:Boolean(room.hostStream),
    teacherCard:room.teacherCard, cardTurn:room.cardTurn,
    myCard:p?.inRound ? topCard(p) : null,
    me:p ? { id:p.id, name:p.name, points:p.points, inRound:p.inRound } : null,
    winnerId:room.winnerId, lastEvent:room.lastEvent,
    startedAt:room.startedAt, endedAt:room.endedAt
  };
}
function writeEvent(stream, payload, event = 'message') {
  if (!stream || stream.writableEnded || stream.destroyed) return;
  try { stream.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { /* closed */ }
}
function broadcast(room) {
  room.updatedAt = Date.now();
  if (room.hostStream) writeEvent(room.hostStream, view(room, 'teacher'));
  for (const p of room.players.values()) {
    if (p.stream) writeEvent(p.stream, view(room, 'student', p.id));
  }
}
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
    if (rooms.size > 200) return failure('The server has too many rooms. Try again shortly.');
    const code = randomCode();
    room = {
      code, hostToken:token(), hostStream:null, players:new Map(),
      status:'lobby', cardsToWin:7, teacherCard:null, cardTurn:0,
      winnerId:null, lastEvent:null, eventNumber:0,
      startedAt:null, endedAt:null, createdAt:Date.now(), updatedAt:Date.now()
    };
    rooms.set(code, room);
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
    p = { id:token(), name, stream:null, points:0, hand:[], inRound:false, joinedAt:Date.now(), lockUntil:0 };
    room.players.set(p.id,p);
    broadcast(room);
    return success({ code, token:p.id, view:view(room, 'student', p.id) });
  }
  if (command === 'room:resume') {
    auth = resolveAuth({ session: data }, data?.role);
    if (!auth) return failure('That session is no longer available.');
    room = auth.room;
    return success({ code:room.code, view:view(room, data.role, auth.p?.id) });
  }

  const role = command === 'game:match' ? 'student' : 'teacher';
  auth = resolveAuth(body, role);
  if (!auth) return failure('This game session has expired. Refresh and join again.');
  room = auth.room;
  p = auth.p;

  if (command === 'room:settings') {
    if (room.status !== 'lobby') return failure('Change this before starting a race.');
    const n = Number(data.cardsToWin);
    if (!Number.isInteger(n) || n < 1 || n > 30) return failure('Choose between 1 and 30 cards.');
    room.cardsToWin = n;
    broadcast(room);
    return success();
  }
  if (command === 'room:start') {
    if (!['lobby','finished'].includes(room.status)) return failure('A race is already running.');
    const connected = [...room.players.values()].filter(x => x.stream);
    if (!connected.length) return failure('Wait for at least one student to join.');
    room.status = 'playing';
    room.winnerId = null;
    room.startedAt = Date.now();
    room.endedAt = null;
    room.cardTurn = 1;
    room.lastEvent = null;
    const initial = crypto.randomInt(DECK.length);
    room.teacherCard = cardView(initial);
    for (const student of room.players.values()) {
      student.inRound = Boolean(student.stream);
      student.points = 0;
      student.lockUntil = 0;
      student.hand = student.inRound
        ? shuffle(DECK.map((_,i) => i).filter(i => i !== initial)).slice(0, room.cardsToWin).map(cardView)
        : [];
    }
    broadcast(room);
    return success();
  }
  if (command === 'room:pause') {
    if (!['playing','paused'].includes(room.status)) return failure('The race is not running.');
    room.status = room.status === 'playing' ? 'paused' : 'playing';
    broadcast(room);
    return success();
  }
  if (command === 'room:reset') {
    room.status = 'lobby';
    room.teacherCard = null;
    room.winnerId = null;
    room.lastEvent = null;
    room.startedAt = null;
    room.endedAt = null;
    room.cardTurn = 0;
    for (const student of room.players.values()) {
      student.points=0; student.inRound=false; student.hand=[];
    }
    broadcast(room);
    return success();
  }
  if (command === 'game:match') {
    if (room.status !== 'playing' || !p.inRound || !p.hand.length) return failure('The race is not active.');
    if (Date.now() < p.lockUntil) return failure('Try again in a moment.',{ cooldown:true });
    const own = topCard(p);
    if (data.cardTurn !== room.cardTurn || data.cardId !== own.id) return failure('The card has changed.',{ stale:true });
    const correct = getSharedSymbol(room.teacherCard.id, own.id);
    if (Number(data.symbol) !== correct) {
      p.lockUntil = Date.now() + 500;
      return { ok:true, correct:false };
    }
    const oldCenter = room.teacherCard.id;
    p.hand.shift();
    p.points++;
    const won = p.points >= room.cardsToWin;
    if (won) {
      room.status = 'finished'; room.winnerId = p.id; room.endedAt = Date.now();
    } else {
      room.teacherCard = chooseCenter(room, oldCenter);
      room.cardTurn++;
    }
    room.eventNumber++;
    room.lastEvent = { id:room.eventNumber, playerId:p.id, playerName:p.name, symbol:SYMBOLS[correct][0], points:p.points, won };
    broadcast(room);
    return { ok:true, correct:true, won };
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
  '/app.js':'app.js', '/realtime.js':'realtime.js', '/style.css':'style.css'
};
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
const server = http.createServer((req,res) => {
  const url=new URL(req.url,'http://localhost');
  if (req.method==='GET' && url.pathname==='/health') return sendJson(res,200,{ok:true,service:'spot-sprint'});
  if (req.method==='POST' && url.pathname==='/api/action') return receiveJson(req,res);
  if (req.method==='GET' && url.pathname==='/events') return connectEvents(req,res,url);
  if (req.method==='GET' && Object.hasOwn(allowFiles,url.pathname)) {
    const file=path.join(publicDir,allowFiles[url.pathname]);
    res.writeHead(200,{
      'Content-Type':mime[path.extname(file)],
      'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'
    });
    fs.createReadStream(file).pipe(res);
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
      rooms.delete(code);
    }
  }
},15000).unref();

if (require.main===module) server.listen(PORT,'0.0.0.0',()=>console.log(`Spot Sprint ready at http://localhost:${PORT}`));
module.exports = { server, action, rooms, view };
