const test = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms, finalizeMatch } = require('../server');
const { getSharedSymbol } = require('../deck');

test('real HTTP join, live stream, game progress, and win condition', async t => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const controller=new AbortController();
  t.after(async () => {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const post = async (action,data={},session=null) => {
    const r=await fetch(base+'/api/action',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,data,session})
    });
    return r.json();
  };
  const sky=await fetch(base+'/cosmic-sky-bg.jpg');
  assert.equal(sky.status,200, 'background request must not crash the server');
  assert.equal(sky.headers.get('content-type'),'image/jpeg');
  assert.ok((await sky.arrayBuffer()).byteLength > 10000);
  assert.equal((await fetch(base+'/health')).status,200, 'server survives image request');
  const festiveAtlas=await fetch(base+'/symbols-festive.webp');
  assert.equal(festiveAtlas.status,200,'festive artwork must load on student and teacher screens');
  assert.equal(festiveAtlas.headers.get('content-type'),'image/webp');
  assert.ok((await festiveAtlas.arrayBuffer()).byteLength > 10000);
  const atlas=await fetch(base+'/symbols.webp');
  assert.equal(atlas.status,200, 'same source image must be served to all screens');
  assert.equal(atlas.headers.get('content-type'),'image/webp');
  assert.ok((await atlas.arrayBuffer()).byteLength > 10000);
  const tRoom=await post('room:create');
  const sRoom=await post('room:join',{code:tRoom.code,name:'Alex'});
  assert.equal(tRoom.ok,true);
  assert.equal(sRoom.ok,true);
  const tAuth={role:'teacher',code:tRoom.code,token:tRoom.token};
  const sAuth={role:'student',code:sRoom.code,token:sRoom.token};
  const stream = auth => `${base}/events?code=${auth.code}&role=${auth.role}&token=${auth.token}`;
  const [teacherEvents,studentEvents]=await Promise.all([
    fetch(stream(tAuth),{signal:controller.signal}),
    fetch(stream(sAuth),{signal:controller.signal})
  ]);
  assert.equal(teacherEvents.headers.get('content-type').startsWith('text/event-stream'),true);
  assert.equal(studentEvents.headers.get('content-type').startsWith('text/event-stream'),true);
  const initialStudentEvent=await studentEvents.body.getReader().read();
  assert.equal(new TextDecoder().decode(initialStudentEvent.value).includes('event: message'),true);
  assert.equal((await post('room:settings',{cardsToWin:5},tAuth)).ok,true);
  assert.equal((await post('room:start',{},tAuth)).ok,true);
  const liveRoom = rooms.get(tRoom.code);
  const during=(await post('room:resume',sAuth)).view;
  assert.equal(during.status,'countdown');
  assert.equal(during.myCard,null,'server hides first card until start countdown completes');
  assert.equal((await post('game:match',{symbol:1,cardId:0,cardTurn:1},sAuth)).ok,false);
  await new Promise(resolve=>setTimeout(resolve,3110));
  const current=(await post('room:resume',sAuth)).view;
  assert.equal(current.status,'playing');
  assert.equal(current.myCard.symbols.length,8);
  assert.equal(current.teacherCard.symbols.length,8);
  const firstMatching=getSharedSymbol(current.teacherCard.id,current.myCard.id);
  const first=await post('game:match',{symbol:firstMatching,cardTurn:current.cardTurn,cardId:current.myCard.id},sAuth);
  assert.equal(first.correct,true);
  const next=(await post('room:resume',sAuth)).view;
  assert.equal(next.me.points,1);
  assert.equal(next.teacherCard.id,current.teacherCard.id, 'card must not flip during celebration');
  assert.equal(next.cardTurn,current.cardTurn);
  assert.ok(next.pendingMatch);
  assert.equal(next.pendingMatch.playerName,'Alex');
  assert.ok(next.pendingMatch.endsAt > Date.now()+1200);
  const blocked=await post('game:match',{symbol:firstMatching,cardTurn:next.cardTurn,cardId:next.myCard.id},sAuth);
  assert.equal(blocked.ok,false,'no guesses can be accepted during the delay');
  await new Promise(resolve=>setTimeout(resolve,1650));
  const afterWait=(await post('room:resume',sAuth)).view;
  assert.equal(afterWait.pendingMatch,null);
  assert.notEqual(afterWait.teacherCard.id,current.teacherCard.id);
  // Fast-forward intermediate server timers so the HTTP suite stays quick.
  let currentTurn=afterWait;
  for(let i=0;i<4;i++) {
    const matching=getSharedSymbol(currentTurn.teacherCard.id,currentTurn.myCard.id);
    const answer=await post('game:match',{symbol:matching,cardTurn:currentTurn.cardTurn,cardId:currentTurn.myCard.id},sAuth);
    assert.equal(answer.correct,true);
    assert.equal(answer.won,i===3);
    if(i<3) {
      const room=rooms.get(tRoom.code);
      assert.equal(finalizeMatch(room,room.pendingMatch.eventId),true);
      currentTurn=(await post('room:resume',sAuth)).view;
    }
  }
  const finished=(await post('room:resume',sAuth)).view;
  assert.equal(finished.status,'playing', 'winner animation gets full 1.5 seconds too');
  assert.ok(finished.pendingMatch);
  await new Promise(resolve=>setTimeout(resolve,2150));
  const final=(await post('room:resume',sAuth)).view;
  assert.equal(final.status,'finished');
  assert.equal(final.winnerId,sRoom.token);
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(), /spot-sprint-wordmark\.webp/);
  const js=await fetch(base+'/realtime.js');
  assert.equal(js.status,200);
});
