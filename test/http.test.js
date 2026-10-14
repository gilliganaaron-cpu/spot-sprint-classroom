const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');
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
  assert.equal((await post('room:settings',{cardsToWin:2},tAuth)).ok,true);
  assert.equal((await post('room:start',{},tAuth)).ok,true);
  const current=(await post('room:resume',sAuth)).view;
  assert.equal(current.status,'playing');
  assert.equal(current.myCard.symbols.length,8);
  assert.equal(current.teacherCard.symbols.length,8);
  const firstMatching=getSharedSymbol(current.teacherCard.id,current.myCard.id);
  const first=await post('game:match',{symbol:firstMatching,cardTurn:current.cardTurn,cardId:current.myCard.id},sAuth);
  assert.equal(first.correct,true);
  const next=(await post('room:resume',sAuth)).view;
  assert.equal(next.me.points,1);
  assert.notEqual(next.teacherCard.id,current.teacherCard.id);
  const secondMatching=getSharedSymbol(next.teacherCard.id,next.myCard.id);
  const second=await post('game:match',{symbol:secondMatching,cardTurn:next.cardTurn,cardId:next.myCard.id},sAuth);
  assert.equal(second.won,true);
  const finished=(await post('room:resume',sAuth)).view;
  assert.equal(finished.status,'finished');
  assert.equal(finished.winnerId,sRoom.token);
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(), /class="brand-pop">SPRINT/);
  const js=await fetch(base+'/realtime.js');
  assert.equal(js.status,200);
});
