const test=require('node:test'),assert=require('node:assert/strict'),H=require('../maze-engine'),S=require('../public/heist-stream'),M=require('../public/maze-motion');
function scenario(){const r=H.create([{id:'a',name:'Alex'},{id:'b',name:'Blair'}]);r.world.grid.fill(0);r.items.forEach(i=>{i.x=25;i.y=13});const cop=[...r.players.values()].find(p=>p.team==='cop'),robber=[...r.players.values()].find(p=>p.team==='robber');for(const p of [cop,robber])Object.assign(p,{x:9,y:9,immune:0});return {r,cop,robber};}
test('empty-handed encounter is safe; a pickup at contact starts exactly one named duel',()=>{const {r,cop,robber}=scenario();H.step(r,.02,0);assert(!robber.question);Object.assign(r.items[0],{x:9,y:9});H.step(r,.02,20);assert.equal(r.contests.size,1);assert.equal(robber.question.opponent,cop.name);assert.equal(cop.question.opponent,robber.name);});
test('crossing paths in staggered movement batches catches a carrier despite separated endpoints',()=>{const {r,cop,robber}=scenario();r.items[0].holder=robber.id;Object.assign(cop,{x:8,y:9,timeline:true,boostTicks:400});Object.assign(robber,{x:8.9,y:8.1,timeline:true,boostTicks:400});for(let i=1;i<=18;i++)cop.inputSteps.set(i,'right');H.step(r,M.STEP,0);assert(!cop.question);for(let i=1;i<=18;i++)robber.inputSteps.set(i,'down');H.step(r,M.STEP,17);assert(robber.question);assert(Math.hypot(cop.x-robber.x,cop.y-robber.y)>.7);});
test('two correct answers name the quicker opponent, never pay or credit a win twice',()=>{for(const first of ['cop','robber']){const {r,cop,robber}=scenario();r.items[0].holder=robber.id;H.step(r,.02,0);const [win,lose]=first==='cop'?[cop,robber]:[robber,cop],q=win.question,d={id:q.id,choice:q.correct};H.answer(r,win,d);const scores={...r.scores};assert(H.answer(r,lose,d).tooSlow);assert.match(H.privateState(lose).feedback.text,/Too slow!/);assert(H.privateState(lose).feedback.text.includes(win.name));assert.deepEqual(r.scores,scores);assert(!H.answer(r,lose,d).ok);}});
test('remote display advances monotonically between batched input snapshots and never interpolates through a respawn',()=>{const tracks=new S.Tracks(),p={id:'a',epoch:0,x:0,y:0};let prev=0,active=0;for(let t=0;t<150;t++){if(t%6===0&&t%30!==18){p.motionTick=t;p.x=t*.07;tracks.record(p,t/60);}const x=tracks.position(p,t*1000/60).x;assert(x>=prev&&x<=p.x);if(x>prev)active++;prev=x;}assert(active>120);p.epoch++;p.x=32;tracks.record(p,2.5);assert.equal(tracks.position(p,2517).x,32);});
test('classroom snapshots retain public data and reduce bytes',()=>{const r=H.create(Array.from({length:30},(_,i)=>({id:''+i,name:'Student '+i}))),f=H.frame(r),rows=S.pack(f.players),ps=S.unpack(JSON.parse(JSON.stringify(rows)));for(let i=0;i<30;i++){for(const k of Object.keys(ps[i]))assert.deepEqual(ps[i][k],f.players[i][k]);}assert(JSON.stringify(rows).length<JSON.stringify(f.players).length*.5);});
test('currency questions have bare, distinct denominations and no demonyms in reverse clues',()=>{const bank=require('../jump-questions'),curr=bank.filter(q=>/currenc(?:y|ies)/i.test(q.prompt));assert(curr.length>90);for(const q of curr){const options=[q.answer,...q.wrong];assert(options.every(x=>!x.includes(' ')));assert.equal(new Set(options).size,4);}assert(!bank.some(q=>q.prompt.startsWith('You are spending')));});
test('30-player room: delayed stationary clients and boosted passes start one private duel per pair',()=>{
 const r=H.create(Array.from({length:30},(_,i)=>({id:String(i),name:'Student '+i})));r.world.grid.fill(0);r.t=10;
 const cops=[...r.players.values()].filter(p=>p.team==='cop'),robbers=[...r.players.values()].filter(p=>p.team==='robber');
 for(let i=0;i<15;i++){
  const x=7+(i%5)*5,y=4+Math.floor(i/5)*6,c=cops[i],b=robbers[i];
  Object.assign(b,{x,y,immune:0,timeline:true,motionTick:540,lootCount:1});
  Object.assign(c,{x:x-.90,y,immune:2,timeline:true,motionTick:600,boostTicks:400});
  for(let j=1;j<=18;j++)c.inputSteps.set(600+j,'right');
  r.items[i].holder=b.id;
 }
 H.step(r,.05,0);assert.equal(r.contests.size,15);
 for(let i=0;i<15;i++){assert.equal(H.privateState(cops[i]).question.id,H.privateState(robbers[i]).question.id);assert.equal(cops[i].question.opponent,robbers[i].name);assert(cops[i].x-robbers[i].x>.8);}
 H.step(r,.05,50);assert.equal(r.contests.size,15);
});
test('contact before safehouse arrival wins over banking in the same movement batch',()=>{
 const {r,cop,robber}=scenario(),base=r.world.safehouse;Object.assign(cop,{x:4.5,y:base.y});
 Object.assign(robber,{x:4.6,y:base.y,timeline:true,boostTicks:400,lootCount:1});
 r.items[0].holder=robber.id;for(let i=1;i<=18;i++)robber.inputSteps.set(i,'left');
 H.step(r,.05,0);assert(robber.x<base.x2+.45);assert(cop.question);assert.equal(robber.points,0);assert.equal(r.items[0].holder,robber.id);
});
test('first and fifth shared duels show different local flags with four country choices; bystanders only get battle markers',()=>{
 const {r,cop,robber}=scenario(),fs=require('node:fs'),path=require('node:path'),seen=new Set();
 r.items[0].holder=robber.id;
 for(let i=0;i<5;i++){
  for(const p of [cop,robber])Object.assign(p,{x:9,y:9,immune:0,travel:null,feedback:null});
  H.step(r,.02,20*i);const q=H.privateState(robber).question;
  assert.equal(q.id,H.privateState(cop).question.id);assert.equal(!!q.flag,i%4===0);
  if(q.flag){assert(!seen.has(q.flag));seen.add(q.flag);assert.equal(new Set(q.options).size,4);assert(fs.existsSync(path.join(__dirname,'../public/flags',q.flag+'.svg')));}
  assert(H.frame(r).players.every(p=>p.question===true));H.answer(r,robber,{id:q.id,choice:robber.question.correct});assert(H.frame(r).players.every(p=>p.question===false));
 }
});
