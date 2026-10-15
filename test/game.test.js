const test = require('node:test');
const assert = require('node:assert/strict');
const { action, rooms, finalizeMatch, CELEBRATION_MS } = require('../server');
const { DECK, getSharedSymbol } = require('../deck');

const call = (actionName, data, session = null) => action({ action: actionName, data, session });

test('teacher creates room, student joins, correct taps clear cards and declare a winner', () => {
  const teacher = call('room:create', {});
  assert.equal(teacher.ok, true);
  assert.match(teacher.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const s = call('room:join', { code:teacher.code, name:'Sam' });
  assert.equal(s.ok, true);
  const tAuth = { role:'teacher', code:teacher.code, token:teacher.token };
  const sAuth = { role:'student', code:s.code, token:s.token };
  assert.equal(call('room:settings', { cardsToWin:5 }, tAuth).ok, true);
  const r = rooms.get(teacher.code);
  // A stream is an online connection; keep it harmless for this game-logic test.
  r.hostStream = { write() {}, writableEnded:false, destroyed:false };
  r.players.get(s.token).stream = { write() {}, writableEnded:false, destroyed:false };
  assert.equal(call('room:start', {}, tAuth).ok, true);
  assert.equal(r.status, 'playing');
  const blockedDuringStart = call('game:match', { symbol:DECK[r.players.get(s.token).hand[0].id][0], cardTurn:r.cardTurn, cardId:r.players.get(s.token).hand[0].id }, sAuth);
  assert.equal(blockedDuringStart.ok, false, 'countdown blocks early guesses');
  r.startedAt -= 3100; // Fast-forward the opening countdown in this logic test.
  for (let i=0; i<5; i++) {
    const p = r.players.get(s.token);
    const before = r.teacherCard.id;
    const own = p.hand[0].id;
    const matching = getSharedSymbol(before, own);
    assert.notEqual(before, own);
    assert.equal(DECK[before].filter(x=>DECK[own].includes(x)).length, 1);
    const wrong = DECK[own].find(x => x !== matching);
    const incorrect = call('game:match', { symbol:wrong,cardTurn:r.cardTurn,cardId:own }, sAuth);
    assert.equal(incorrect.correct, false);
    assert.equal(p.points, i);
    // Clear local penalty state for the logic test so the correct-match path can still be exercised.
    p.lockUntil = 0;
    p.blockedTurn = 0;
    const oldTurn=r.cardTurn;
    const result=call('game:match', { symbol:matching,cardTurn:oldTurn,cardId:own }, sAuth);
    assert.equal(result.correct, true);
    assert.equal(p.points, i+1);
    assert.equal(r.cardTurn, oldTurn, 'shared card must remain unchanged during celebration');
    assert.equal(r.teacherCard.id, before);
    assert.ok(r.pendingMatch);
    assert.equal(call('game:match', {symbol:matching, cardTurn:oldTurn,cardId:own},sAuth).ok,false, 'a second guess cannot interrupt the celebration');
    assert.equal(finalizeMatch(r, r.pendingMatch.eventId), true);
    if (i<4) {
      assert.equal(r.cardTurn,oldTurn+1);
      assert.notEqual(r.teacherCard.id,before);
    }
  }
  assert.equal(CELEBRATION_MS, 2000);
  assert.equal(r.status,'finished');
  assert.equal(r.winnerId,s.token);
  assert.equal(call('room:start',{},tAuth).ok,true);
  assert.equal(r.status,'playing');
  assert.equal(r.players.get(s.token).points,0);
  assert.equal(call('room:pause',{},tAuth).ok,true);
  assert.equal(r.status,'paused');
  assert.equal(call('room:pause',{},tAuth).ok,true);
  assert.equal(call('room:reset',{},tAuth).ok,true);
  assert.equal(r.status,'lobby');
  rooms.delete(teacher.code);
});

test('settings are restricted, and duplicate student names are rejected', () => {
  const teacher=call('room:create', {});
  const s=call('room:join',{code:teacher.code,name:'Sam'});
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:s.code,token:s.token};
  assert.equal(call('room:join',{code:teacher.code,name:'sAm'}).ok,false);
  assert.equal(call('room:settings',{cardsToWin:4},tAuth).ok,false);
  assert.equal(call('room:settings',{cardsToWin:26},tAuth).ok,false);
  assert.equal(call('room:settings',{cardsToWin:5},tAuth).ok,true);
  assert.equal(call('room:settings',{cardsToWin:25},tAuth).ok,true);
  assert.equal(call('room:settings',{cardsToWin:8},sAuth).ok,false);
  assert.equal(call('room:resume', tAuth).ok,true);
  rooms.delete(teacher.code);
});

test('reset during celebration cancels pending card change, and pause is blocked', () => {
  const teacher=call('room:create',{});
  const student=call('room:join',{code:teacher.code,name:'Jamie'});
  const room=rooms.get(teacher.code);
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:teacher.code,token:student.token};
  room.players.get(student.token).stream={write(){},writableEnded:false,destroyed:false};
  call('room:start',{},tAuth);
  room.startedAt -= 3100;
  const card=room.players.get(student.token).hand[0].id;
  const symbol=getSharedSymbol(room.teacherCard.id,card);
  assert.equal(call('game:match',{symbol,cardTurn:room.cardTurn,cardId:card},sAuth).correct,true);
  const eventId=room.pendingMatch.eventId;
  assert.equal(call('room:pause',{},tAuth).ok,false);
  assert.equal(call('room:reset',{},tAuth).ok,true);
  assert.equal(room.pendingMatch,null);
  assert.equal(finalizeMatch(room,eventId),false,'reset cancels delayed flip');
  assert.equal(room.status,'lobby');
  rooms.delete(teacher.code);
});

test('one wrong guess locks a player until the shared card flips', () => {
  const teacher = call('room:create',{});
  const student = call('room:join',{code:teacher.code,name:'Alex'});
  const helper = call('room:join',{code:teacher.code,name:'Taylor'});
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:teacher.code,token:student.token};
  const hAuth={role:'student',code:teacher.code,token:helper.token};
  const room=rooms.get(teacher.code);
  for (const player of room.players.values()) player.stream={write(){},writableEnded:false,destroyed:false};
  assert.equal(call('room:start',{},tAuth).ok,true);
  room.startedAt -= 3100;
  const p=room.players.get(student.token);
  const card=p.hand[0].id;
  const center=room.teacherCard.id;
  const shared=getSharedSymbol(center,card);
  const wrong=DECK[card].find(symbol=>symbol!==shared);
  const turn=room.cardTurn;
  const missed=call('game:match',{symbol:wrong,cardTurn:turn,cardId:card},sAuth);
  assert.equal(missed.correct,false);
  assert.equal(missed.lockedUntilNextCard,true);
  assert.equal(call('room:resume',sAuth).view.me.lockedOut,true);
  const retry=call('game:match',{symbol:shared,cardTurn:turn,cardId:card},sAuth);
  assert.equal(retry.ok,false);
  assert.equal(retry.locked,true);
  const h=room.players.get(helper.token);
  const helperCard=h.hand[0].id;
  const helperShared=getSharedSymbol(center,helperCard);
  assert.equal(call('game:match',{symbol:helperShared,cardTurn:turn,cardId:helperCard},hAuth).correct,true);
  assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
  assert.equal(room.cardTurn,turn+1);
  assert.equal(call('room:resume',sAuth).view.me.lockedOut,false);
  call('room:reset',{},tAuth);
  rooms.delete(teacher.code);
});


test('every student receives the matching player celebration for 2 seconds', () => {
 const teacher=call('room:create',{});
 const alpha=call('room:join',{code:teacher.code,name:'Alex'});
 const beta=call('room:join',{code:teacher.code,name:'Jordan'});
 const room=rooms.get(teacher.code);
 const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
 const aAuth={role:'student',code:teacher.code,token:alpha.token};
 const bAuth={role:'student',code:teacher.code,token:beta.token};
 for(const p of room.players.values())p.stream={write(){}, writableEnded:false,destroyed:false};
 call('room:start',{},tAuth);
 room.startedAt -= 3100;
 const own=room.players.get(alpha.token).hand[0].id;
 const matching=getSharedSymbol(room.teacherCard.id,own);
 assert.equal(call('game:match',{symbol:matching,cardTurn:room.cardTurn,cardId:own},aAuth).correct,true);
 const other=call('room:resume',bAuth).view;
 assert.equal(other.pendingMatch.playerName,'Alex');
 assert.equal(other.cardTurn,room.cardTurn);
 assert.equal(other.pendingMatch.endsAt> Date.now()+1750,true);
 assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
 call('room:reset',{},tAuth);
 rooms.delete(teacher.code);
});
