/* Shared deterministic movement: client prediction never awards items or scores. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JumpMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const C={gravity:1100,jump:600,speed:300,metre:43.2,spring:30,jet:8,jetSpeed:500,water:100,waterDrain:18,netDrop:180,step:1/60};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function bounds(w,y){const summit=500*(w.scale||1),width=summit+(w.width-summit)*Math.pow(1-clamp(y/w.height,0,1),.8);return[(w.width-width)/2,(w.width+width)/2];}
function platformX(p,t){return p.x+(p.move?Math.sin(t*2.1+p.phase)*p.move:0);}
function hazardX(w,h,t){if(h.type==='plane'){const [left,right]=bounds(w,h.y),span=right-left+160,travel=((t*h.speed+h.phase)%span+span)%span;return h.direction<0?right+80-travel:left-80+travel;}return h.x+Math.sin(t*h.speed+h.phase)*h.range;}
const fields=['x','y','vx','vy','face','ground','stand','groundId','best','spring','jet','jetCapacity','nets','water','waterCapacity','immune','stun','cool','golden','goldenTarget','hit','netFlash','lightningCharges','lightningTime','lightningHeld','lightningCycle','strikeTargetId','dazed','recoil','kickVX','checkpoint','checkpointLock','knockFloor','seq'];
function snapshot(s){return Object.fromEntries(fields.map(k=>[k,s[k]]));}
function advance(w,s,keys,dt,t){
 for(const k of ['immune','stun','cool','hit','netFlash'])s[k]=Math.max(0,(s[k]||0)-dt);
 if(s.strikeTargetId!=null){const p=w.platforms[s.strikeTargetId],targetY=p?.y||0,targetX=p?platformX(p,t):s.x;const remaining=Math.max(1,s.y-targetY);s.x+=(targetX-s.x)*Math.min(1,1100*dt/remaining);s.y=Math.max(targetY,s.y-1100*dt);s.vy=-1100;s.ground=false;if(s.y<=targetY){s.x=targetX;s.vy=0;s.ground=true;s.groundId=p?.id??null;s.stand=targetY;s.strikeTargetId=null;s.cool=.15;s.immune=Math.max(s.immune,1);}return true;}
 if(s.dazed>0){s.dazed=Math.max(0,s.dazed-dt);const recoil=Math.min(dt,s.recoil||0);if(recoil>0){s.x+=(s.kickVX||0)*recoil;s.y+=160*recoil;s.recoil=Math.max(0,s.recoil-dt);}const [left,right]=bounds(w,s.y);s.x=clamp(s.x,left+16,right-16);s.vx=0;s.vy=0;s.ground=false;s.groundId=null;return true;}
 s.lightningTime=Math.max(0,(s.lightningTime||0)-dt);
 if(keys.lightning&&!s.lightningHeld&&s.lightningCharges>0&&s.lightningTime===0){s.lightningCharges--;s.lightningTime=5;s.lightningCycle=(s.lightningCycle||0)+1;}
 s.lightningHeld=!!keys.lightning;
 if(s.golden>0){s.golden=Math.max(0,s.golden-dt);s.y=Math.min(s.goldenTarget,s.y+1100*dt);s.vy=0;s.ground=false;s.best=Math.max(s.best,s.y);return true;}
 if(s.ground&&s.groundId!=null){const p=w.platforms[s.groundId];if(p)s.x+=platformX(p,t)-platformX(p,t-dt);}
 s.spring=Math.max(0,s.spring-dt);const jet=s.jet>0&&keys.jump&&s.stun===0&&s.knockFloor==null;
 s.vx=s.stun>0?0:((keys.right?1:0)-(keys.left?1:0))*C.speed;if(s.vx)s.face=Math.sign(s.vx);s.x+=s.vx*dt;
 const oldY=s.y;
 if(s.knockFloor!=null){s.vy=-1100;s.ground=false;}
 else if(jet){s.jet=Math.max(0,s.jet-dt);s.vy=C.jetSpeed;s.ground=false;}
 else {
  if(s.ground&&s.groundId!==null){const p=w.platforms[s.groundId];if(!p||Math.abs(s.x-platformX(p,t))>p.w/2+10){s.ground=false;s.groundId=null;}}
  if(keys.jump&&s.ground&&s.cool===0&&s.stun===0){s.vy=C.jump*(s.spring>0?Math.sqrt(3):1);s.ground=false;s.groundId=null;}
  if(!s.ground)s.vy-=C.gravity*dt;
 }
 s.y+=s.vy*dt;
 if(jet){let ceiling=null;for(const p of w.platforms){const underside=p.y-14;if(oldY+40<=underside+.01&&s.y+40>=underside&&Math.abs(s.x-platformX(p,t))<p.w/2+12&&(!ceiling||p.y<ceiling.y))ceiling=p;}if(ceiling){s.y=ceiling.y-54;s.vy=0;}}
 const [lo,hi]=bounds(w,s.y);s.x=clamp(s.x,lo+16,hi-16);
 if(s.vy<0&&!jet){
  if(s.nets>0&&s.y<s.stand-C.netDrop){s.knockFloor=null;s.nets--;s.vy=C.jump*Math.sqrt(3);s.stand=s.y;s.immune=2;s.netFlash=.7;}
  else {let landing=null;for(const p of w.platforms){if(p.y<s.y-2||p.y>oldY+2||Math.abs(s.x-platformX(p,t))>=p.w/2+10)continue;if(!landing||p.y>landing.y)landing=p;}
   if(landing){s.knockFloor=null;s.y=landing.y;s.vy=0;s.ground=true;s.stand=landing.y;s.groundId=landing.id;s.cool=.035;}}
 }
 if(s.knockFloor!=null&&s.y<=s.knockFloor){s.y=s.knockFloor;s.knockFloor=null;s.vy=0;}
 if(s.y<=0){s.y=0;s.vy=0;s.ground=true;s.groundId=null;s.stand=0;}
 const checkpoint=Math.floor(s.best/(100*C.metre))*100*C.metre;if(s.best>=(s.checkpointLock||0))s.checkpoint=Math.max(s.checkpoint,checkpoint);
 if(s.knockFloor==null&&s.y<s.checkpoint-500){const candidates=w.platforms.filter(p=>p.y<=s.checkpoint&&p.y>s.checkpoint-180);const p=candidates.sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];if(p){s.x=platformX(p,t);s.y=p.y;s.vy=0;s.ground=true;s.groundId=p.id;s.stand=p.y;s.immune=3;}}
 s.best=Math.max(s.best,s.y);return false;
}
return {C,bounds,platformX,hazardX,snapshot,advance};
});
