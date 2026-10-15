'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms } = require('../server');
const { getSharedSymbol } = require('../deck');

// Browser-like regression: a student who is already waiting must receive
// countdown AND playing via the same live server stream, with no rejoin.
test('joined student receives countdown and first playable card on the same live session', {timeout:14000}, async t => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();
  t.after(async () => {
    abort.abort();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const post=async (action,data={},session=null) => {
    const r=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data,session})});
    return r.json();
  };
  const teacher=await post('room:create');
  const student=await post('room:join',{code:teacher.code,name:'Lena'});
  assert.ok(teacher.ok && student.ok);
  const tAuth={role:'teacher',code:teacher.code,token:teacher.token};
  const sAuth={role:'student',code:student.code,token:student.token};
  const response=await fetch(`${base}/events?code=${student.code}&role=student&token=${student.token}`,{signal:abort.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader();
  let buffer='';
  const decoder=new TextDecoder();
  const nextStatus=async wanted => {
    while (true) {
      const boundary=buffer.indexOf('\n\n');
      if(boundary>=0) {
        const packet=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
        const dataLine=packet.split('\n').find(x=>x.startsWith('data: '));
        if(dataLine) {const payload=JSON.parse(dataLine.slice(6));if(payload.status===wanted)return payload;}
        continue;
      }
      const {done,value}=await reader.read();
      if(done) throw new Error(`Stream ended while waiting for ${wanted}`);
      buffer+=decoder.decode(value,{stream:true});
    }
  };
  const waiting=await nextStatus('lobby');
  assert.equal(waiting.me.name,'Lena');
  const start=await post('room:start',{},tAuth);
  assert.equal(start.ok,true);
  assert.equal(start.status,'countdown');
  assert.equal(start.view.status,'countdown','teacher receives authoritative start state without relying on SSE');
  const counting=await nextStatus('countdown');
  assert.equal(counting.me.inRound,true);
  assert.equal(counting.myCard,null);
  const playing=await nextStatus('playing');
  assert.equal(playing.me.inRound,true);
  assert.equal(playing.myCard.symbols.length,8);
  assert.equal(playing.teacherCard.symbols.length,8);
  assert.equal(playing.code,waiting.code);
  assert.equal(playing.me.id,waiting.me.id);
  assert.ok(playing.revision>counting.revision);
  const match=getSharedSymbol(playing.myCard.id,playing.teacherCard.id);
  const own=playing.myCard.symbols.find(x=>x.id===match);
  const shared=playing.teacherCard.symbols.find(x=>x.id===match);
  assert.deepEqual({id:own.id,emoji:own.emoji,label:own.label},{id:shared.id,emoji:shared.emoji,label:shared.label},'match uses identical source picture metadata on student and teacher');
  const answer=await post('game:match',{symbol:match,cardId:playing.myCard.id,cardTurn:playing.cardTurn},sAuth);
  assert.equal(answer.correct,true);
  rooms.delete(teacher.code);
});
