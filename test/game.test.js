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
  assert.equal(call('room:settings', { cardsToWin:3 }, tAuth).ok, true);
  const r = rooms.get(teacher.code);
  // A stream is an online connection; keep it harmless for this game-logic test.
  r.hostStream = { write() {}, writableEnded:false, destroyed:false };
  r.players.get(s.token).stream = { write() {}, writableEnded:false, destroyed:false };
  assert.equal(call('room:start', {}, tAuth).ok, true);
  assert.equal(r.status, 'playing');
  for (let i=0; i<3; i++) {
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
    // Wait off the brief wrong-answer cooldown without delaying the test.
    p.lockUntil = 0;
    const oldTurn=r.cardTurn;
    const result=call('game:match', { symbol:matching,cardTurn:oldTurn,cardId:own }, sAuth);
    assert.equal(result.correct, true);
    assert.equal(p.points, i+1);
    assert.equal(r.cardTurn, oldTurn, 'shared card must remain unchanged during celebration');
    assert.equal(r.teacherCard.id, before);
    assert.ok(r.pendingMatch);
    assert.equal(call('game:match', {symbol:matching, cardTurn:oldTurn,cardId:own},sAuth).ok,false, 'a second guess cannot interrupt the celebration');
    assert.equal(finalizeMatch(r, r.pendingMatch.eventId), true);
    if (i<2) {
      assert.equal(r.cardTurn,oldTurn+1);
      assert.notEqual(r.teacherCard.id,before);
    }
  }
  assert.equal(CELEBRATION_MS, 2500);
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
  assert.equal(call('room:settings',{cardsToWin:100},tAuth).ok,false);
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
