'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const bank=require('./jump-questions');
const Motion=require('./public/jump-motion');
const {C,bounds,platformX}=Motion;
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function world(km,count,seed=randomInt(1e9)){const random=rng(seed),height=C.metre*1000*km,width=Math.max(1500,Math.min(4800,count*150)),platforms=[],items=[],hazards=[];let y=0,row=0;const types=['spring','jet','net','spring','water','jet'];
 let previous=[];
 while(y<height){y=Math.min(height,y+92+22*y/height+random()*22);const [left,right]=bounds({height,width},y);const lanes=y===height?1:Math.max(2,Math.ceil((right-left)/310));const next=[];
 for(let l=0;l<lanes;l++){
  let x=left+(l+.5)*(right-left)/lanes+(y===height?0:(random()-.5)*135);
  const parent=previous.length?previous.reduce((a,b)=>Math.abs(a.x-x)<Math.abs(b.x-x)?a:b):null;
  if(parent)x=clamp(x,parent.x-95,parent.x+95);
  x=clamp(x,left+55,right-55);
  const py=y===height?height:Math.min(height-35,Math.max(45,y+(random()-.5)*14));
  const p={id:platforms.length,x:Math.round(x),y:Math.round(py),w:y===height?230:Math.round(110-82*y/height+random()*8),move:y>height*.5&&random()<.30?22:0,phase:random()*6.28,row,parentId:parent?.id??null};
  platforms.push(p);next.push(p);
  if(row%12===2&&(l+Math.floor(row/12))%2===0)items.push({id:items.length,pid:p.id,x:p.x,y:p.y+26,type:types[(Math.floor(row/12)+Math.floor(l/2))%types.length]});
 }
 previous=next;
 if(row%9===6){const b=bounds({height,width},y);hazards.push({id:hazards.length,x:(b[0]+b[1])/2+(random()-.5)*(b[1]-b[0])*.6,y:y+28,range:60+100*y/height,r:12+15*y/height,speed:.5+1.5*y/height,phase:random()*6.28});}row++;}
 // Widely spaced, globally contested golden rockets. Their locations appear on teacher overview.
 for(let n=0;n<km;n++){const target=(n+.55)*C.metre*1000;const p=platforms.reduce((a,b)=>Math.abs(a.y-target)+Math.abs(a.x-width/2)*.05<Math.abs(b.y-target)+Math.abs(b.x-width/2)*.05?a:b);items.push({id:items.length,pid:p.id,x:p.x,y:p.y+26,type:'gold'});}
 // Expand the existing course, without creating extra platforms.
 for(const p of platforms){p.x*=1.25;if(p.y<height*.5&&p.id%7===3)p.move=16;}
 for(const item of items)item.x=platforms[item.pid].x;
 for(const h of hazards){h.x*=1.25;h.range*=1.25;}
 for(const metres of [325,375,425,475])hazards.push({id:hazards.length,type:'plane',y:metres*C.metre,r:26,speed:340,direction:metres%100===25?1:-1,phase:metres*7});
 const portals=[];
 for(const fraction of [.16,.43,.70]){let best=null;for(const a of platforms.filter(p=>Math.abs(p.y-height*fraction)<500&&!items.some(i=>i.pid===p.id))){for(const b of platforms){const error=Math.abs(b.y-a.y-100*C.metre);if(error<2&&(!best||error<best.error))best={a,b,error};}}if(!best){const a=platforms.reduce((a,b)=>Math.abs(a.y-height*fraction)<Math.abs(b.y-height*fraction)?a:b);const b=platforms.reduce((b,c)=>Math.abs(b.y-a.y-100*C.metre)<Math.abs(c.y-a.y-100*C.metre)?b:c);best={a,b};}portals.push({id:portals.length,fromPid:best.a.id,toPid:best.b.id});}
 return {id:randomUUID(),km,height,width:width*1.25,scale:1.25,seed,platforms,items,hazards,portals,rows:row};}
function makePlayer(player,i,count,w){return {id:player.id,name:player.name,character:player.character??i%30,x:(i+.5)*w.width/count,y:0,vy:0,vx:0,face:1,ground:true,stand:0,groundId:null,best:0,seq:-1,input:{left:false,right:false,jump:false,shoot:false},inputAt:0,spring:0,jet:0,jetCapacity:8,nets:0,water:0,waterCapacity:100,immune:2,stun:0,cool:0,used:new Set(),question:null,feedback:null,finish:null,golden:0,goldenTarget:0,shot:false,hit:0,netFlash:0,dazed:0,recoil:0,kickVX:0,checkpoint:0,checkpointLock:0,knockFloor:null,portalUsed:new Set(),portalEvent:0};}
function create(km,players){const w=world(km,players.length);return {world:w,t:0,players:new Map(players.map((p,i)=>[p.id,makePlayer(p,i,players.length,w)])),goldTaken:new Set(),portalExpires:{},finished:[],required:players.length>15?3:1,done:false};}
function questionFor(s,item,history){let available=bank.filter(q=>!history.has(q.id));if(!available.length){history.clear();available=bank;}const q=available[randomInt(available.length)];history.add(q.id);const answers=[q.answer,...q.wrong];for(let i=answers.length-1;i>0;i--){let j=randomInt(i+1);[answers[i],answers[j]]=[answers[j],answers[i]];}
 s.question={id:randomUUID(),bankId:q.id,itemId:item.id,type:item.type,prompt:q.prompt,flag:q.flag,options:answers,correct:answers.indexOf(q.answer),explanation:q.explanation};s.vx=0;s.shot=false;}
function input(s,data,time){if(!Number.isSafeInteger(data.seq)||data.seq<=s.seq)return false;s.seq=data.seq;s.input={left:data.left===true,right:data.right===true,jump:data.jump===true,shoot:data.shoot===true};s.inputAt=time;return true;}
function award(r,s,type){if(type==='spring')s.spring+=C.spring;if(type==='jet'){s.jet+=C.jet;s.jetCapacity=Math.max(C.jet,s.jet);}if(type==='net')s.nets+=2;if(type==='water'){s.water+=C.water;s.waterCapacity=Math.max(C.water,s.water);}if(type==='gold'){s.goldenTarget=Math.min(r.world.height-90,s.y+180*C.metre);s.golden=Math.max(.1,(s.goldenTarget-s.y)/1100);s.immune=Math.max(s.immune,s.golden+2);}}
function answer(r,s,data){const q=s.question;if(!q||data.id!==q.id||!Number.isInteger(data.choice)||data.choice<0||data.choice>=q.options.length)return {ok:false,error:'That question is no longer active.'};const correct=data.choice===q.correct;let type=q.type;let text=correct?['Great job!','Brilliant!','Nice thinking!','You nailed it!'][randomInt(4)]:'Answer: '+q.options[q.correct];if(correct){if(type==='gold'&&r.goldTaken.has(q.itemId)){type='jet';text='Rocket already claimed — jet fuel instead!';}else if(type==='gold')r.goldTaken.add(q.itemId);award(r,s,type);}s.used.add(q.itemId);s.question=null;s.feedback={text,correct,explanation:q.explanation,remaining:correct?.5:1.8};s.immune=Math.max(s.immune,2);return {ok:true,correct,reward:correct?type:null};}
function step(r,dt,now,histories=new Map()){if(r.done)return;dt=Math.min(.05,dt);r.t+=dt;const w=r.world;
 for(const s of r.players.values()){
  s.shot=false;if(s.finish!==null)continue;if(s.question)continue;if(s.feedback){s.feedback.remaining-=dt;if(s.feedback.remaining>0)continue;s.feedback=null;}
  const keys=now-s.inputAt<900?s.input:{left:false,right:false,jump:false,shoot:false};if(Motion.advance(w,s,keys,dt,r.t))continue;
  if(s.y>=w.height-2&&Math.abs(s.x-w.width/2)<200){s.finish=r.finished.length+1;r.finished.push(s.id);s.y=w.height;s.vy=0;s.ground=true;if(r.finished.length>=r.required){r.done=true;}continue;}
  if(s.immune===0){for(const h of w.hazards){const hx=Motion.hazardX(w,h,r.t);if(Math.abs(s.y+17-h.y)<h.r+14&&Math.abs(s.x-hx)<h.r+13){s.kickVX=(s.x>=hx?1:-1)*280;s.recoil=.24;s.dazed=4;s.vy=0;s.ground=false;s.groundId=null;s.immune=4.6;s.hit=.5;break;}}}
  if(s.dazed>0)continue;
  if(keys.shoot&&s.water>0&&s.stun===0){s.shot=true;s.water=Math.max(0,s.water-C.waterDrain*dt);for(const other of r.players.values()){if(other===s||other.question||other.feedback||other.finish!==null||other.immune>0)continue;const dx=(other.x-s.x)*s.face;if(dx>0&&dx<230&&Math.abs(other.y-s.y)<40){other.knockFloor=Math.max(0,other.y-75*C.metre);other.checkpoint=Math.min(other.checkpoint,other.knockFloor);other.checkpointLock=other.best+1;other.vy=-1100;other.ground=false;other.immune=4;other.stun=.25;other.hit=.6;}}}
  for(const portal of w.portals||[]){if(s.portalUsed.has(portal.id)||(r.portalExpires[portal.id]!=null&&r.t>=r.portalExpires[portal.id]))continue;const a=w.platforms[portal.fromPid];if(Math.abs(s.x-platformX(a,r.t))<30&&Math.abs(s.y-a.y-26)<36){const b=w.platforms[portal.toPid];s.x=platformX(b,r.t);s.y=b.y;s.vy=0;s.ground=true;s.groundId=b.id;s.stand=b.y;s.best=Math.max(s.best,s.y);s.immune=2;s.knockFloor=null;s.portalUsed.add(portal.id);s.portalEvent++;r.portalExpires[portal.id]??=r.t+2;break;}}
  for(const item of w.items){if(s.used.has(item.id)||item.type==='gold'&&r.goldTaken.has(item.id))continue;const p=w.platforms[item.pid];if(Math.abs(s.x-platformX(p,r.t))<28&&Math.abs(s.y-item.y)<32){const history=histories.get(s.id)||new Set();histories.set(s.id,history);questionFor(s,item,history);break;}}
 }
}
function privateState(s){return {motion:Motion.snapshot(s),portalEvent:s.portalEvent,spring:s.spring,jet:s.jet,jetCapacity:s.jetCapacity,nets:s.nets,water:s.water,waterCapacity:s.waterCapacity,used:[...s.used],question:s.question?{id:s.question.id,type:s.question.type,prompt:s.question.prompt,options:s.question.options,flag:s.question.flag}:null,feedback:s.feedback,finish:s.finish};}
function frame(r){return {id:r.world.id,t:r.t,required:r.required,finished:r.finished,goldTaken:[...r.goldTaken],portalExpires:r.portalExpires,players:[...r.players.values()].map(s=>({id:s.id,name:s.name,character:s.character,x:Math.round(s.x*10)/10,y:Math.round(s.y*10)/10,vx:s.vx,vy:s.vy,face:s.face,best:Math.round(s.best),finish:s.finish,question:!!s.question,spring:s.spring>0,jet:s.jet>0,golden:s.golden>0,water:s.water>0,shot:s.shot,dazed:s.dazed>0,hit:s.hit>0,netFlash:s.netFlash>0}))};}
module.exports={C,world,bounds,platformX,create,input,answer,step,frame,privateState,award};
