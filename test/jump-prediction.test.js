const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../public/jump-motion'),J=require('../jump-engine');
// Run the shipped browser reconciliation and animation physics, not a copy of
// their algorithms. Canvas painting and audio are excluded from this harness.
function client(){
 const source=fs.readFileSync('public/map-hub.js','utf8');
 const reconcile=source.slice(source.indexOf('function reconcile('),source.indexOf('\nfunction frame('));
 const tick=source.slice(source.indexOf('function draw(now)'),source.indexOf('updateGauges();const box='))+'}';
 const r=J.create(1,[{id:'test',name:'Test'}]);r.world.platforms=[];r.world.items=[];r.world.hazards=[];r.world.portals=[];
 const motion=M.snapshot(r.players.get('test'));Object.assign(motion,{x:900,y:600,vy:500,ground:false,groundId:null});
 const c=vm.createContext({JumpMotion:M,w:r.world,frames:[],predicted:{...motion},offset:{x:0,y:0},history:[],predictionT:0,rtt:160,previous:null,keys:{},f:{t:0,self:{motion}},canvas:{},drawTime:0,drawDebt:0,lastFrame:0,sound(){},blocked(){return false;}});
 vm.runInContext(reconcile+'\n'+tick,c);
 return {c,motion,update(m,t,now){c.lastFrame=now;c.f={t,self:{motion:m},players:[]};c.reconcile(c.f,now);},tick(now,keys){c.keys=keys;c.draw(now);return c.predicted.x+c.offset.x;}};
}
for(const hz of [60,120])for(const mode of ['vertical','right','left','release','reverse'])test(`no sideways wobble at ${hz}Hz: ${mode}, delayed/jittered snapshots`,()=>{
 const h=client(),{c}=h;let x=c.predicted.x,maxError=0;
 for(let i=1;i<=hz*2;i++){
  const elapsed=i/hz,dir=mode==='right'?1:mode==='left'?-1:mode==='release'?(elapsed<.7?1:0):mode==='reverse'?(elapsed<.7?1:-1):0;
  const keys={right:dir===1,left:dir===-1,jump:true};
  // Alternating delayed snapshots reproduce correction jitter around the same
  // trajectory. Update intervals vary, with 80–200 ms of simulated lag.
  if(i%7===0||i%11===0){const lag=[.08,.2,.13][i%3];const motion={...c.predicted,x:c.predicted.x+(i%2?1:-1)*35};h.update(motion,Math.max(0,c.predictionT-lag),elapsed*1000);assert.equal(c.predicted.x,x,'snapshot must not move local x');}
  const beforeTime=c.predictionT;const next=h.tick(elapsed*1000,keys);
  const expected=dir*M.C.speed*(c.predictionT-beforeTime);maxError=Math.max(maxError,Math.abs(next-x-expected));
  if(!dir)assert.equal(next,x,'straight jump/released key must have zero sideways drift');
  else assert((next-x)*dir>=-1e-8,'must not reverse against the held direction');
  x=next;
 }
 assert(maxError<1e-8,`horizontal path error ${maxError}`);
});
test('portals, water knockback and large recovery resets remain authoritative',()=>{
 for(const effect of ['portal','water','reset']){const h=client();const state={...h.c.predicted,x:h.c.predicted.x+(effect==='reset'?300:60)};
  if(effect==='water')state.strikeTargetId=0;
  const data={t:0,self:{motion:state,portalEvent:effect==='portal'?1:0},players:[]};h.c.reconcile(data,0);assert.equal(h.c.predicted.x,state.x);assert.equal(h.c.offset.x,0);
 }
});
test('late server landing cannot attach an airborne local player to an invisible ledge',()=>{const h=client(),c=h.c;Object.assign(c.predicted,{x:900,y:125,vy:-100,ground:false,groundId:null});const motion={...c.predicted,x:840,y:100,vy:0,ground:true,groundId:0};c.w.platforms=[{id:0,x:840,y:100,w:40,move:0}];h.update(motion,0,0);assert.equal(c.predicted.x,900);assert.equal(c.predicted.y,125);assert.equal(c.predicted.ground,false);assert.equal(c.offset.y,0);h.tick(16.67,{});assert(c.predicted.y<125);});
test('grounded local rider and platform retain one simulation clock across updates',()=>{const h=client(),c=h.c;c.w.platforms=[{id:0,x:900,y:100,w:80,move:22,phase:0}];Object.assign(c.predicted,{x:900,y:100,vy:0,ground:true,groundId:0});for(let i=1;i<100;i++){const motion={...c.predicted,x:c.predicted.x-10,y:90,ground:false,groundId:null};const before=c.predictionT;h.update(motion,Math.max(0,before-.08),i*1000/60);assert.equal(c.predictionT,before);h.tick(i*1000/60,{});assert.equal(c.predicted.y,100);assert.equal(c.offset.y,0);assert(Math.abs(c.predicted.x-M.platformX(c.w.platforms[0],c.predictionT))<1e-8);}});
test('delayed falling snapshots cannot pull an ordinary local jump down after 400px divergence',()=>{const h=client(),c=h.c;Object.assign(c.predicted,{y:1600,vy:350,ground:false});const before={...c.predicted};h.update({...c.predicted,y:800,vy:-600},0,0);assert.equal(c.predicted.y,before.y);assert.equal(c.predicted.vy,before.vy);});
test('late checkpoint recovery below the local player cannot pull them down',()=>{const h=client(),c=h.c;Object.assign(c.predicted,{y:1600,vy:350});h.update({...c.predicted,y:900,vy:0,recoveryEvent:1},0,0);assert.equal(c.predicted.y,1600);});
