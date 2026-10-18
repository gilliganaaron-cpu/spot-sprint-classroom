/* Shared deterministic movement: client prediction never awards items or scores. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JumpMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const C={gravity:1100,jump:600,speed:300,metre:43.2,spring:30,jet:8,jetSpeed:500,water:100,waterDrain:18,netDrop:180,step:1/60};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function bounds(w,y){const width=500+(w.width-500)*Math.pow(1-clamp(y/w.height,0,1),.8);return[(w.width-width)/2,(w.width+width)/2];}
function platformX(p,t){return p.x+(p.move?Math.sin(t*.9+p.phase)*p.move:0);}
const fields=['x','y','vx','vy','face','ground','stand','groundId','best','spring','jet','jetCapacity','nets','water','waterCapacity','immune','stun','cool','golden','goldenTarget','hit','netFlash','checkpoint','seq'];
function snapshot(s){return Object.fromEntries(fields.map(k=>[k,s[k]]));}
function advance(w,s,keys,dt,t){
 for(const k of ['immune','stun','cool','hit','netFlash'])s[k]=Math.max(0,(s[k]||0)-dt);
 if(s.golden>0){s.golden=Math.max(0,s.golden-dt);s.y=Math.min(s.goldenTarget,s.y+1100*dt);s.vy=0;s.ground=false;s.best=Math.max(s.best,s.y);return true;}
 s.spring=Math.max(0,s.spring-dt);const jet=s.jet>0&&keys.jump&&s.stun===0;
 s.vx=s.stun>0?0:((keys.right?1:0)-(keys.left?1:0))*C.speed;if(s.vx)s.face=Math.sign(s.vx);s.x+=s.vx*dt;
 const oldY=s.y;
 if(jet){s.jet=Math.max(0,s.jet-dt);s.vy=C.jetSpeed;s.ground=false;}
 else {
  if(s.ground&&s.groundId!==null){const p=w.platforms[s.groundId];if(!p||Math.abs(s.x-platformX(p,t))>p.w/2+10){s.ground=false;s.groundId=null;}}
  if(keys.jump&&s.ground&&s.cool===0&&s.stun===0){s.vy=C.jump*(s.spring>0?Math.sqrt(3):1);s.ground=false;s.groundId=null;}
  if(!s.ground)s.vy-=C.gravity*dt;
 }
 s.y+=s.vy*dt;const [lo,hi]=bounds(w,s.y);s.x=clamp(s.x,lo+16,hi-16);
 if(s.vy<0&&!jet){
  if(s.nets>0&&s.y<s.stand-C.netDrop){s.nets--;s.vy=C.jump*Math.sqrt(3);s.stand=s.y;s.immune=2;s.netFlash=.7;}
  else {let landing=null;for(const p of w.platforms){if(p.y<s.y-2||p.y>oldY+2||Math.abs(s.x-platformX(p,t))>=p.w/2+10)continue;if(!landing||p.y>landing.y)landing=p;}
   if(landing){s.y=landing.y;s.vy=0;s.ground=true;s.stand=landing.y;s.groundId=landing.id;s.cool=.035;}}
 }
 if(s.y<=0){s.y=0;s.vy=0;s.ground=true;s.groundId=null;s.stand=0;}
 const checkpoint=Math.floor(s.best/(100*C.metre))*100*C.metre;s.checkpoint=Math.max(s.checkpoint,checkpoint);
 if(s.y<s.checkpoint-500){const candidates=w.platforms.filter(p=>p.y<=s.checkpoint&&p.y>s.checkpoint-180);const p=candidates.sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];if(p){s.x=platformX(p,t);s.y=p.y;s.vy=0;s.ground=true;s.groundId=p.id;s.stand=p.y;s.immune=3;}}
 s.best=Math.max(s.best,s.y);return false;
}
return {C,bounds,platformX,snapshot,advance};
});
