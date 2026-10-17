'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const bank=require('./jump-questions');
const C={gravity:1100,jump:430,speed:255,metre:43.2,spring:30,jet:20,jetSpeed:600,water:100,waterDrain:18,netDrop:145,step:1/30};
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function bounds(world,y){const half=world.width/2;const w=500+(world.width-500)*Math.pow(1-clamp(y/world.height,0,1),.8);return [half-w/2,half+w/2];}
function platformX(p,t){return p.x+(p.move?Math.sin(t*.9+p.phase)*p.move:0);}
function world(km,count,seed=randomInt(1e9)){const random=rng(seed),height=C.metre*1000*km,width=Math.max(1500,Math.min(4800,count*150)),platforms=[],items=[],hazards=[];let y=0,row=0;const types=['spring','jet','net','spring','water','jet'];
 while(y<height){y=Math.min(height,y+58+16*y/height);const [left,right]=bounds({height,width},y);const lanes=Math.max(3,Math.floor((right-left)/170));for(let l=0;l<lanes;l++){const x=left+(l+.5)*(right-left)/lanes+Math.sin(row*.8+l)*22;const p={id:platforms.length,x:Math.round(x),y:Math.round(y),w:Math.round(125-45*y/height),move:y>height*.5&&random()<.1?18:0,phase:random()*6.28,row};platforms.push(p);if(row%16===2&&l%2===row%3%2){items.push({id:items.length,pid:p.id,x:p.x,y:p.y+26,type:types[((row/16|0)+Math.floor(l/2))%types.length]});}}
 if(row%13===8){const b=bounds({height,width},y);hazards.push({id:hazards.length,x:(b[0]+b[1])/2+(random()-.5)*(b[1]-b[0])*.6,y:y+28,range:60+100*y/height,r:12+15*y/height,speed:.5+1.5*y/height,phase:random()*6.28});}row++;}
 // Widely spaced, globally contested golden rockets. Their locations appear on teacher overview.
 for(let n=0;n<km;n++){const target=(n+.55)*C.metre*1000;const p=platforms.reduce((a,b)=>Math.abs(a.y-target)+Math.abs(a.x-width/2)*.05<Math.abs(b.y-target)+Math.abs(b.x-width/2)*.05?a:b);items.push({id:items.length,pid:p.id,x:p.x,y:p.y+26,type:'gold'});}
 return {id:randomUUID(),km,height,width,seed,platforms,items,hazards,rows:row};}
function makePlayer(player,i,count,w){return {id:player.id,name:player.name,character:player.character??i%30,x:(i+.5)*w.width/count,y:0,vy:0,vx:0,face:1,ground:true,stand:0,groundId:null,best:0,seq:-1,input:{left:false,right:false,jump:false,shoot:false},inputAt:0,spring:0,jet:0,nets:0,water:0,immune:2,stun:0,cool:0,used:new Set(),question:null,feedback:null,finish:null,golden:0,goldenTarget:0,shot:false,hit:0,netFlash:0,checkpoint:0};}
function create(km,players){const w=world(km,players.length);return {world:w,t:0,players:new Map(players.map((p,i)=>[p.id,makePlayer(p,i,players.length,w)])),goldTaken:new Set(),finished:[],required:players.length>15?3:1,done:false};}
function questionFor(s,item,history){let available=bank.filter(q=>!history.has(q.id));if(!available.length){history.clear();available=bank;}const q=available[randomInt(available.length)];history.add(q.id);const answers=[q.answer,...q.wrong];for(let i=answers.length-1;i>0;i--){let j=randomInt(i+1);[answers[i],answers[j]]=[answers[j],answers[i]];}
 s.question={id:randomUUID(),bankId:q.id,itemId:item.id,type:item.type,prompt:q.prompt,flag:q.flag,options:answers,correct:answers.indexOf(q.answer),explanation:q.explanation};s.vx=0;s.shot=false;}
function input(s,data,time){if(!Number.isSafeInteger(data.seq)||data.seq<=s.seq)return false;s.seq=data.seq;s.input={left:data.left===true,right:data.right===true,jump:data.jump===true,shoot:data.shoot===true};s.inputAt=time;return true;}
function award(r,s,type){if(type==='spring')s.spring+=C.spring;if(type==='jet')s.jet+=C.jet;if(type==='net')s.nets+=2;if(type==='water')s.water+=C.water;if(type==='gold'){s.goldenTarget=Math.min(r.world.height-90,s.y+180*C.metre);s.golden=Math.max(.1,(s.goldenTarget-s.y)/1100);s.immune=Math.max(s.immune,s.golden+2);}}
function answer(r,s,data){const q=s.question;if(!q||data.id!==q.id||!Number.isInteger(data.choice)||data.choice<0||data.choice>=q.options.length)return {ok:false,error:'That question is no longer active.'};const correct=data.choice===q.correct;let type=q.type;let text=correct?['Great job!','Brilliant!','Nice thinking!','You nailed it!'][randomInt(4)]:'Answer: '+q.options[q.correct];if(correct){if(type==='gold'&&r.goldTaken.has(q.itemId)){type='jet';text='Rocket already claimed — jet fuel instead!';}else if(type==='gold')r.goldTaken.add(q.itemId);award(r,s,type);}s.used.add(q.itemId);s.question=null;s.feedback={text,correct,explanation:q.explanation,remaining:correct?.5:1.8};s.immune=Math.max(s.immune,2);return {ok:true,correct,reward:correct?type:null};}
function landPlatforms(w,s,oldY,t){const low=s.y-3,high=oldY+3;for(const p of w.platforms){if(p.y<low||p.y>high)continue;const x=platformX(p,t);if(Math.abs(s.x-x)<p.w/2+10){s.y=p.y;s.vy=0;s.ground=true;s.stand=p.y;s.groundId=p.id;s.cool=.16;return;}}}
function step(r,dt,now,histories=new Map()){if(r.done)return;dt=Math.min(.05,dt);r.t+=dt;const w=r.world;
 for(const s of r.players.values()){
  s.shot=false;if(s.finish!==null)continue;if(s.question)continue;if(s.feedback){s.feedback.remaining-=dt;if(s.feedback.remaining>0)continue;s.feedback=null;}
  const keys=now-s.inputAt<900?s.input:{left:false,right:false,jump:false,shoot:false};s.immune=Math.max(0,s.immune-dt);s.stun=Math.max(0,s.stun-dt);s.cool=Math.max(0,s.cool-dt);s.hit=Math.max(0,s.hit-dt);s.netFlash=Math.max(0,s.netFlash-dt);
  if(s.golden>0){s.golden-=dt;s.y=Math.min(s.goldenTarget,s.y+1100*dt);s.vy=0;s.ground=false;s.best=Math.max(s.best,s.y);continue;}
  s.spring=Math.max(0,s.spring-dt);const jetActive=s.jet>0&&keys.jump&&s.stun===0;const spring=s.spring>0;s.vx=s.stun>0?0:((keys.right?1:0)-(keys.left?1:0))*C.speed;if(s.vx)s.face=Math.sign(s.vx);s.x+=s.vx*dt;
  const oldY=s.y;if(jetActive){s.jet=Math.max(0,s.jet-dt);s.vy=C.jetSpeed;s.ground=false;}else{if(s.ground&&s.groundId!==null){const p=w.platforms[s.groundId];if(Math.abs(s.x-platformX(p,r.t))>p.w/2+10){s.ground=false;s.groundId=null;}}if(keys.jump&&s.ground&&s.cool===0&&s.stun===0){s.vy=C.jump*(spring?Math.sqrt(3):1);s.ground=false;s.groundId=null;}if(!s.ground)s.vy-=C.gravity*dt;}
  s.y+=s.vy*dt;let [lo,hi]=bounds(w,s.y);s.x=clamp(s.x,lo+16,hi-16);
  if(s.vy<0&&!jetActive){if(s.nets>0&&s.y<s.stand-C.netDrop){s.nets--;s.vy=C.jump*Math.sqrt(3);s.stand=s.y;s.immune=2;s.netFlash=.7;}else landPlatforms(w,s,oldY,r.t);}
  if(s.y<=0){s.y=0;s.vy=0;s.ground=true;s.groundId=null;s.stand=0;}
  // A fall cannot erase the whole session: an altitude checkpoint every 100 metres.
  const checkpoint=Math.floor(s.best/(100*C.metre))*100*C.metre;if(checkpoint>s.checkpoint)s.checkpoint=checkpoint;
  if(s.y<s.checkpoint-500){const candidates=w.platforms.filter(p=>p.y<=s.checkpoint&&p.y>s.checkpoint-100);const p=candidates.sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];if(p){s.x=p.x;s.y=p.y;s.vy=0;s.ground=true;s.groundId=p.id;s.stand=p.y;s.immune=3;}}
  s.best=Math.max(s.best,s.y);
  if(s.y>=w.height-2&&Math.abs(s.x-w.width/2)<200){s.finish=r.finished.length+1;r.finished.push(s.id);s.y=w.height;s.vy=0;s.ground=true;if(r.finished.length>=r.required){r.done=true;}continue;}
  if(s.immune===0){for(const h of w.hazards){const hx=h.x+Math.sin(r.t*h.speed+h.phase)*h.range;if(Math.abs(s.y+17-h.y)<h.r+14&&Math.abs(s.x-hx)<h.r+13){s.vy=-300;s.ground=false;s.immune=2;s.stun=.3;s.hit=.5;break;}}}
  if(keys.shoot&&s.water>0&&s.stun===0){s.shot=true;s.water=Math.max(0,s.water-C.waterDrain*dt);for(const other of r.players.values()){if(other===s||other.question||other.feedback||other.finish!==null||other.immune>0)continue;const dx=(other.x-s.x)*s.face;if(dx>0&&dx<230&&Math.abs(other.y-s.y)<40){other.vy=-370;other.ground=false;other.immune=2.2;other.stun=.5;other.hit=.6;}}}
  for(const item of w.items){if(s.used.has(item.id)||item.type==='gold'&&r.goldTaken.has(item.id))continue;const p=w.platforms[item.pid];if(Math.abs(s.x-platformX(p,r.t))<28&&Math.abs(s.y-item.y)<32){const history=histories.get(s.id)||new Set();histories.set(s.id,history);questionFor(s,item,history);break;}}
 }
}
function privateState(s){return {spring:s.spring,jet:s.jet,nets:s.nets,water:s.water,used:[...s.used],question:s.question?{id:s.question.id,type:s.question.type,prompt:s.question.prompt,options:s.question.options,flag:s.question.flag}:null,feedback:s.feedback,finish:s.finish};}
function frame(r){return {id:r.world.id,t:r.t,required:r.required,finished:r.finished,goldTaken:[...r.goldTaken],players:[...r.players.values()].map(s=>({id:s.id,name:s.name,character:s.character,x:Math.round(s.x*10)/10,y:Math.round(s.y*10)/10,vx:s.vx,vy:s.vy,face:s.face,best:Math.round(s.best),finish:s.finish,question:!!s.question,spring:s.spring>0,jet:s.jet>0,golden:s.golden>0,water:s.water>0,shot:s.shot,hit:s.hit>0,netFlash:s.netFlash>0}))};}
module.exports={C,world,bounds,platformX,create,input,answer,step,frame,privateState,award};
