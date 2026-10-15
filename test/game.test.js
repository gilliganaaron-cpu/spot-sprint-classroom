const test = require('node:test');
const assert = require('node:assert/strict');
const { action, rooms, finalizeMatch, CELEBRATION_MS } = require('../server');
const { DECK, getSharedSymbol } = require('../deck');

const call = (actionName, data, session = null) => action({ action: actionName, data, session });
function skipCountdown(room) { clearTimeout(room.startTimer); room.startTimer = null; room.status = 'playing'; room.countdownEndsAt = null; }

test('teacher creates room, student joins, correct taps clear cards and declare a winner', () => {
  const teacher = call('room:create', {});
  assert.equal(teacher.ok, true);
  assert.match(teacher.code, /^[A-HJ-NP-Z]{4}$/);
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
  assert.equal(r.status, 'countdown');
  const blockedDuringStart = call('game:match', { symbol:DECK[r.players.get(s.token).hand[0].id][0], cardTurn:r.cardTurn, cardId:r.players.get(s.token).hand[0].id }, sAuth);
  assert.equal(blockedDuringStart.ok, false, 'countdown blocks early guesses');
  skipCountdown(r); // test real countdown separately; exercise live game deterministically.
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
  assert.equal(CELEBRATION_MS, 1500);
  assert.equal(r.status,'finished');
  assert.equal(r.winnerId,s.token);
  assert.equal(call('room:start',{},tAuth).ok,true);
  assert.equal(r.status,'countdown');
  assert.equal(r.players.get(s.token).points,0);
  skipCountdown(r);
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
  skipCountdown(room);
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
  skipCountdown(room);
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


test('every student receives the matching player celebration for 1.5 seconds', () => {
 const teacher=call('room:create',{});
 const alpha=call('room:join',{code:teacher.code,name:'Alex'});
 const beta=call('room:join',{code:teacher.code,name:'Jordan'});
 const room=rooms.get(teacher.code);
 const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
 const aAuth={role:'student',code:teacher.code,token:alpha.token};
 const bAuth={role:'student',code:teacher.code,token:beta.token};
 for(const p of room.players.values())p.stream={write(){}, writableEnded:false,destroyed:false};
 call('room:start',{},tAuth);
 skipCountdown(room);
 const own=room.players.get(alpha.token).hand[0].id;
 const matching=getSharedSymbol(room.teacherCard.id,own);
 assert.equal(call('game:match',{symbol:matching,cardTurn:room.cardTurn,cardId:own},aAuth).correct,true);
 const other=call('room:resume',bAuth).view;
 assert.equal(other.pendingMatch.playerName,'Alex');
 assert.equal(other.cardTurn,room.cardTurn);
 assert.equal(other.pendingMatch.endsAt> Date.now()+1200,true);
 assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
 call('room:reset',{},tAuth);
 rooms.delete(teacher.code);
});


test('new round preserves joined students, code and their existing tokens through reconnection', () => {
  const teacher = call('room:create', {});
  const a = call('room:join', { code: teacher.code, name:'Jamie' });
  const b = call('room:join', { code: teacher.code, name:'Alex' });
  const room = rooms.get(teacher.code);
  const tAuth = { role:'teacher', code:teacher.code, token:teacher.token };
  const aAuth = { role:'student', code:teacher.code, token:a.token };
  const bAuth = { role:'student', code:teacher.code, token:b.token };
  // Simulate Alex's browser going offline just before the teacher starts.
  room.players.get(a.token).stream = {write(){}, writableEnded:false, destroyed:false};
  room.players.get(b.token).stream = null;
  assert.equal(call('room:start',{},tAuth).ok,true);
  assert.equal(room.status,'countdown');
  assert.equal(call('room:resume', aAuth).view.myCard,null, 'first card is hidden until countdown completes');
  assert.equal(call('room:resume', bAuth).view.myCard,null);
  assert.equal(call('game:match',{symbol:1,cardId:1,cardTurn:1},aAuth).ok,false);
  skipCountdown(room);
  const firstA=call('room:resume',aAuth).view;
  const firstB=call('room:resume',bAuth).view;
  assert.equal(firstA.myCard.symbols.length,8);
  assert.equal(firstB.myCard.symbols.length,8);
  assert.equal(firstA.code,teacher.code);
  assert.equal(firstB.code,teacher.code);
  const next = call('room:restart',{},tAuth);
  assert.equal(next.ok,true);
  assert.equal(next.status,'countdown');
  assert.equal(room.players.size,2);
  assert.equal(room.players.get(a.token).points,0);
  assert.equal(room.players.get(b.token).points,0);
  assert.equal(call('room:resume',aAuth).ok,true);
  assert.equal(call('room:resume',bAuth).ok,true, 'student rejoins using the same session token');
  skipCountdown(room);
  assert.equal(call('room:resume',bAuth).view.myCard.symbols.length,8);
  assert.equal(call('room:reset',{},tAuth).ok,true);
  assert.equal(room.players.size,2,'return to lobby does not kick students');
  assert.equal(call('room:resume',bAuth).view.status,'lobby');
  rooms.delete(teacher.code);
});

test('theme selection propagates identical symbols to teacher and student and persists across rounds', () => {
  const { THEME_SYMBOLS, getSharedSymbol } = require('../deck');
  assert.equal(THEME_SYMBOLS.festive.length,57, 'festive atlas provides all 57 symbols');
  assert.equal(new Set(THEME_SYMBOLS.festive.map(([picture]) => picture)).size,57,'no duplicate festive pictures');
  const teacher = call('room:create', {});
  const student = call('room:join', { code:teacher.code, name:'Theme Tester' });
  const room = rooms.get(teacher.code);
  const teacherAuth = { role:'teacher', code:teacher.code, token:teacher.token };
  const studentAuth = { role:'student', code:teacher.code, token:student.token };
  for (const theme of ['sports','animals','emojis','scifi','festive','mixed']) {
    const settingReply = call('room:settings',{cardsToWin:5,theme},teacherAuth);
    assert.equal(settingReply.ok,true);
    assert.equal(settingReply.view.theme,theme);
    assert.equal(settingReply.view.cardsToWin,5);
    assert.equal(room.theme,theme);
    assert.equal(call('room:start',{},teacherAuth).ok,true);
    assert.equal(room.status,'countdown');
    clearTimeout(room.startTimer);
    room.startTimer = null;
    room.status='playing';
    const shared = getSharedSymbol(room.teacherCard.id,room.players.get(student.token).hand[0].id);
    const expected = THEME_SYMBOLS[theme][shared];
    const hostSymbol = room.teacherCard.symbols.find(s=>s.id === shared);
    const studentSymbol = room.players.get(student.token).hand[0].symbols.find(s=>s.id === shared);
    assert.ok(hostSymbol && studentSymbol);
    assert.equal(hostSymbol.label, expected[1]);
    assert.equal(studentSymbol.label,expected[1]);
    assert.equal(hostSymbol.emoji,expected[0]);
    assert.equal(studentSymbol.emoji,expected[0]);
    assert.equal(call('room:reset',{},teacherAuth).ok,true);
  }
  assert.equal(call('room:settings',{cardsToWin:5,theme:'invalid'},teacherAuth).ok,false);
  rooms.delete(teacher.code);
});


test('three consecutive correct matches trigger a 2-second fire celebration for everyone, while revealing each learner’s own match', () => {
  const { FIRE_CELEBRATION_MS } = require('../server');
  assert.equal(FIRE_CELEBRATION_MS, 2000);
  const teacher = call('room:create',{});
  const scorer = call('room:join',{code:teacher.code,name:'Aaron'});
  const observer = call('room:join',{code:teacher.code,name:'Sophie'});
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:teacher.code,token:scorer.token};
  const oAuth={role:'student',code:teacher.code,token:observer.token};
  const room=rooms.get(teacher.code);
  assert.equal(call('room:settings',{cardsToWin:5,theme:'festive'},tAuth).ok,true);
  assert.equal(call('room:start',{},tAuth).ok,true);
  skipCountdown(room);
  for (let turn=1;turn<=3;turn++) {
    const myCard=room.players.get(scorer.token).hand[0].id;
    const otherCard=room.players.get(observer.token).hand[0].id;
    const center=room.teacherCard.id;
    const myMatch=getSharedSymbol(center,myCard);
    const otherMatch=getSharedSymbol(center,otherCard);
    const oldTurn=room.cardTurn;
    const result=call('game:match',{symbol:myMatch,cardTurn:oldTurn,cardId:myCard},sAuth);
    assert.equal(result.correct,true);
    assert.equal(result.streak,turn);
    assert.equal(result.onFire,turn>=3);
    assert.equal(result.celebrationMs,turn===3 ? 2000 : 1500);
    const otherView=call('room:resume',oAuth).view;
    const scorerView=call('room:resume',sAuth).view;
    const teacherView=call('room:resume',tAuth).view;
    assert.equal(otherView.pendingMatch.playerName,'Aaron');
    assert.equal(otherView.pendingMatch.streak,turn);
    assert.equal(otherView.pendingMatch.celebrationMs,result.celebrationMs);
    assert.equal(otherView.pendingMatch.onFire,turn>=3);
    assert.equal(otherView.pendingMatch.matchSymbolId,otherMatch,
      'other student gets the match for their OWN card, not necessarily Aaron’s');
    assert.equal(scorerView.pendingMatch.matchSymbolId,myMatch);
    assert.equal(teacherView.pendingMatch.symbolId,myMatch);
    assert.equal(otherView.myCard.symbols.filter(s=>s.id===otherMatch).length,1);
    assert.equal(otherView.teacherCard.symbols.filter(s=>s.id===otherMatch).length,1);
    assert.equal(room.cardTurn,oldTurn,'card does not change until the announcement ends');
    assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
    assert.equal(room.cardTurn,oldTurn+1);
  }
  // Another student scoring interrupts Aaron’s fire streak.
  const otherHand=room.players.get(observer.token).hand[0].id;
  const match=getSharedSymbol(room.teacherCard.id,otherHand);
  const answer=call('game:match',{symbol:match,cardId:otherHand,cardTurn:room.cardTurn},oAuth);
  assert.equal(answer.correct,true);
  assert.equal(answer.streak,1);
  assert.equal(answer.onFire,false);
  assert.equal(answer.celebrationMs,1500);
  assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
  // Another game keeps all participants, but resets the streak completely.
  assert.equal(call('room:restart',{},tAuth).ok,true);
  assert.equal(room.streakCount,0);
  assert.equal(room.streakPlayerId,null);
  assert.equal(room.players.size,2);
  assert.equal(call('room:reset',{},tAuth).ok,true);
  rooms.delete(teacher.code);
});

test('an incorrect guess breaks a winning streak before three in a row', () => {
  const teacher=call('room:create',{});
  const scorer=call('room:join',{code:teacher.code,name:'Morgan'});
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:teacher.code,token:scorer.token};
  const room=rooms.get(teacher.code);
  call('room:start',{},tAuth);
  skipCountdown(room);
  for (let i=0;i<2;i++) {
    const own=room.players.get(scorer.token).hand[0].id;
    const correct=getSharedSymbol(room.teacherCard.id,own);
    assert.equal(call('game:match',{symbol:correct,cardId:own,cardTurn:room.cardTurn},sAuth).correct,true);
    assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
  }
  assert.equal(room.streakCount,2);
  const own=room.players.get(scorer.token).hand[0].id;
  const correct=getSharedSymbol(room.teacherCard.id,own);
  const wrong=DECK[own].find(id=>id!==correct);
  assert.equal(call('game:match',{symbol:wrong,cardId:own,cardTurn:room.cardTurn},sAuth).correct,false);
  assert.equal(room.streakCount,0);
  // In the real game a miss locks you out until the card changes.
  const p=room.players.get(scorer.token);
  p.blockedTurn=0;p.lockUntil=0;
  const response=call('game:match',{symbol:correct,cardId:own,cardTurn:room.cardTurn},sAuth);
  assert.equal(response.correct,true);
  assert.equal(response.streak,1);
  assert.equal(response.onFire,false);
  assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
  assert.equal(call('room:reset',{},tAuth).ok,true);
  rooms.delete(teacher.code);
});
