'use strict';
// Midnight Heist: server-authoritative movement, loot ownership and question duels.
const {randomInt,randomUUID}=require('node:crypto'),bank=require('./jump-questions'),M=require('./public/maze-motion');
const LOOT=[{type:'cash',name:'Money pile',value:25000},{type:'diamonds',name:'Diamonds',value:100000},{type:'car',name:'Ferrari',value:250000},{type:'chain',name:'Gold chain',value:50000},{type:'vault',name:'Bank vault',value:500000},{type:'sneakers',name:'Sneakers',value:10000}];
const RULES={duration:300,briefing:8,questionTime:20,jailTime:8,protection:4,respawn:8};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function world(count){const width=39,height=25,grid=Array(width*height).fill(1),stack=[[1,1]];grid[width+1]=0;
 while(stack.length){const[x,y]=stack.at(-1),next=Object.values(M.dirs).filter(([dx,dy])=>!dx||!dy).map(([dx,dy])=>[x+dx*2,y+dy*2,dx,dy]).filter(([a,b])=>a>0&&b>0&&a<width-1&&b<height-1&&grid[b*width+a]);if(!next.length){stack.pop();continue;}const[a,b,dx,dy]=next[randomInt(next.length)];grid[(y+dy)*width+x+dx]=grid[b*width+a]=0;stack.push([a,b]);}
 // Loops offer escape choices instead of forcing every chase into dead ends.
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(grid[y*width+x]&&randomInt(3)===0&&((!grid[y*width+x-1]&&!grid[y*width+x+1])||(!grid[(y-1)*width+x]&&!grid[(y+1)*width+x])))grid[y*width+x]=0;
 const cy=(height-1)/2,cx=(width-1)/2;
 const safehouse={x:2,y:cy,x1:1,x2:3,y1:cy-2,y2:cy+2},station={x:width-3,y:cy,x1:width-4,x2:width-2,y1:cy-2,y2:cy+2},jail={x:cx,y:cy};
 for(const b of [safehouse,station])for(let y=b.y1-1;y<=b.y2+1;y++)for(let x=b.x1;x<=b.x2;x++)grid[y*width+x]=0;
 for(const y of [cy-3,cy+3])for(let x=1;x<width-1;x++)grid[y*width+x]=0;
 for(let y=cy-2;y<=cy+2;y++)for(let x=cx-1;x<=cx+1;x++)grid[y*width+x]=0;
 return {id:randomUUID(),width,height,grid,safehouse,station,jail,rules:RULES,lootTypes:LOOT};
}
function protectedZone(r,p){return M.inside(p.team==='cop'?r.world.station:r.world.safehouse,p.x,p.y);}
function carrying(r,p){return r.items.find(k=>k.holder===p.id);}
function haul(r,p){return r.items.filter(k=>k.holder===p.id);}
function retire(r,items){for(const item of items)Object.assign(item,{holder:null,reservedBy:null,availableAt:r.t+RULES.respawn,relocate:true});}
function relocate(r,item){const w=r.world,cells=[];for(let y=1;y<w.height-1;y++)for(let x=6;x<w.width-6;x++)if(M.open(w,x,y)&&Math.hypot(x-w.jail.x,y-w.jail.y)>2&&!r.items.some(k=>k!==item&&k.holder==null&&k.availableAt<=r.t&&Math.hypot(k.x-x,k.y-y)<2)&&![...r.players.values()].some(p=>Math.hypot(p.x-x,p.y-y)<1.3))cells.push({x,y});const point=cells[randomInt(cells.length)]||{x:7,y:1};Object.assign(item,point,{holder:null,reservedBy:null,availableAt:r.t});}
function spawnBolt(r,b){const cells=[];for(let y=1;y<r.world.height-1;y++)for(let x=4;x<r.world.width-4;x++)if(M.open(r.world,x,y)&&(x!==b.x||y!==b.y)&&!r.bolts.some(k=>k!==b&&Math.hypot(k.x-x,k.y-y)<4)&&!r.items.some(k=>k.holder==null&&k.x===x&&k.y===y)&&![...r.players.values()].some(p=>Math.hypot(p.x-x,p.y-y)<2))cells.push({x,y});if(cells.length)Object.assign(b,cells[randomInt(cells.length)]);b.availableAt=0;}
function askContest(r,c,message){const cop=r.players.get(c.cop),robber=r.players.get(c.robber),q=pick([cop,robber]);c.retryAt=0;c.ends=r.t+RULES.questionTime;for(const p of [cop,robber]){p.feedback=null;stop(p);p.question={...q,kind:'contest',contest:c.id,ends:c.ends,answered:false,opponent:p===cop?robber.name:cop.name,copName:cop.name,robberName:robber.name,message};}}
function retryContest(r,c,message){c.retryAt=r.t+2;c.ends=c.retryAt+RULES.questionTime;for(const id of [c.cop,c.robber]){const p=r.players.get(id);p.question.answered=true;p.question.message=message;p.feedback={text:message,until:c.retryAt};}}
function create(players){const w=world(players.length),r={world:w,t:0,round:1,brief:0,players:new Map(),items:[],bolts:[],contests:new Map(),scores:{cop:0,robber:0},winner:null,winners:[],winningTeam:null,done:false,events:[]};const order=shuffle([...players]),cops=players.length<2?0:Math.max(1,Math.floor(players.length/2));
 for(const [i,p]of order.entries()){const team=i<cops?'cop':'robber',base=team==='cop'?w.station:w.safehouse;r.players.set(p.id,{id:p.id,name:p.name,character:p.character||0,avatar:i%30,team,firstTeam:team,firstPoints:0,x:base.x,y:base.y+(i%3-1),tx:null,ty:null,dir:null,input:null,inputAt:0,seq:-1,immune:4,lootCount:0,boostTicks:0,jailUntil:0,question:null,feedback:null,points:0,arrests:0,deliveries:0,correct:0,history:new Set(),retry:new Map(),epoch:0,motionTick:0,clockTick:0,timeline:false,inputSteps:new Map()});}
 for(let i=0;i<Math.max(12,Math.min(30,Math.ceil(players.length*.8/6)*6));i++){const item={id:i,...LOOT[i%LOOT.length],x:-100,y:-100,holder:null,reservedBy:null,availableAt:0};r.items.push(item);relocate(r,item);}for(let i=0;i<3;i++){const bolt={id:i,x:-1,y:-1,availableAt:0};r.bolts.push(bolt);spawnBolt(r,bolt);}return r;}
function stop(p){p.input=null;p.dir=null;p.tx=null;p.ty=null;p.track=null;p.epoch++;p.motionTick=p.clockTick||0;p.inputSteps?.clear();}
function input(p,d,now){if(p.onBreak||(d.epoch!=null&&d.epoch!==p.epoch)||!Number.isSafeInteger(d.seq)||d.seq<=p.seq)return false;p.seq=d.seq;p.input=p.question||p.feedback||p.travel||p.jailUntil>0?'stop':(M.dirs[d.dir]?d.dir:d.dir==='stop'?'stop':null);p.inputAt=now;
 if(Array.isArray(d.steps)&&d.epoch===p.epoch&&!p.question&&!p.feedback&&!p.travel&&!p.jailUntil){if(!p.timeline){p.timeline=true;if(Number.isInteger(d.baseTick)&&d.baseTick>=0&&d.baseTick<=p.clockTick)p.motionTick=d.baseTick;}const batch=d.steps.slice(-90);if(batch.length===90&&Number.isInteger(batch[0].tick)&&batch[0].tick>p.motionTick+1&&batch[0].tick<=p.clockTick){p.motionTick=batch[0].tick-1;p.inputSteps.clear();p.track=null;}for(const h of batch)if(Number.isInteger(h.tick)&&h.tick>p.motionTick&&h.tick<=p.clockTick+30&&p.inputSteps.size<120)p.inputSteps.set(h.tick,M.dirs[h.dir]?h.dir:h.dir==='stop'?'stop':null);}
 return true;}

const newFlags=[['dk','Denmark'],['is','Iceland'],['ua','Ukraine'],['at','Austria']];
const duelBank=bank.concat(newFlags.map(([flag,answer])=>({id:'heist-flag-'+flag,flag,answer,prompt:'Which country does this flag represent?',wrong:newFlags.map(x=>x[1]).filter(name=>name!==answer)})));
function pick(players){const pool=duelBank;let choices=pool.filter(q=>players.every(p=>!p.history.has(q.id)));if(!choices.length){for(const p of players)for(const q of pool)p.history.delete(q.id);choices=pool;}const q=choices[randomInt(choices.length)];for(const p of players)p.history.add(q.id);const options=shuffle([q.answer,...q.wrong]);return {id:randomUUID(),prompt:q.prompt,flag:q.flag,image:q.image,options,correct:options.indexOf(q.answer)};}
function notice(r,text){r.events.unshift({id:randomUUID(),text,t:r.t});r.events=r.events.slice(0,4);}
function feedback(r,p,text,duration=.8){p.feedback={text,until:r.t+duration};}
// A single compact route is sent with snapshots; clients animate it without extra messages.
function returnTrip(r,p,to){const from={x:p.x,y:p.y},w=r.world,start=Math.round(from.y)*w.width+Math.round(from.x),end=to.y*w.width+to.x,queue=[start],prev=new Map([[start,null]]);for(let i=0;i<queue.length&&!prev.has(end);i++){const k=queue[i],x=k%w.width,y=Math.floor(k/w.width);for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy,n=ny*w.width+nx;if(M.open(w,nx,ny)&&!prev.has(n)){prev.set(n,k);queue.push(n);}}}let path=[];if(prev.has(end)){for(let k=end;k!=null;k=prev.get(k))path.push({x:k%w.width,y:Math.floor(k/w.width)});path.reverse();}else path=[from,{x:to.x,y:to.y}];path[0]=from;const duration=Math.max(.3,Math.min(1.8,path.length/34));p.travel={start:r.t,end:r.t+duration,path};Object.assign(p,{x:to.x,y:to.y});}
function reset(r,p){const b=p.team==='cop'?r.world.station:r.world.safehouse;stop(p);returnTrip(r,p,b);Object.assign(p,{question:null,immune:RULES.protection,jailUntil:0});}
function releaseItem(r,p,delay=0){const items=haul(r,p);for(const item of items)Object.assign(item,{holder:null,reservedBy:null,x:Math.round(p.x),y:Math.round(p.y),availableAt:r.t+delay});return items;}
function endContest(r,c,winner){if(!r.contests.has(c.id))return;const cop=r.players.get(c.cop),robber=r.players.get(c.robber);
 if(winner){const loser=winner===cop?robber:cop,q=loser.question;loser.lastBattle=q&&!q.answered?{id:q.id,correct:q.correct,until:r.t+1.5,winner:winner.name,round:r.round}:null;}
 for(const p of [cop,robber]){p.question=null;p.immune=RULES.protection;stop(p);}const items=haul(r,robber);
 if(winner===cop){const value=items.reduce((sum,k)=>sum+k.value,0);robber.lootCount=0;cop.points+=value;cop.arrests++;r.scores.cop+=value;retire(r,items);returnTrip(r,robber,r.world.jail);robber.jailUntil=robber.travel.end+RULES.jailTime;feedback(r,cop,'You beat '+robber.name+'! +'+M.money(value)+' recovered.',3);feedback(r,robber,cop.name+' recovered your haul. Banked money is safe. Eight seconds in jail.',3);notice(r,cop.name+' caught '+robber.name+' · '+M.money(value));}
 else if(winner===robber){reset(r,cop);feedback(r,cop,robber.name+' won! You lost this battle. Back to the station.',3);robber.feedback=null;robber.resultNotice={text:'You beat '+cop.name+'! Four seconds of protection — make your getaway.',until:r.t+3};notice(r,robber.name+' outsmarted '+cop.name);}
 else{releaseItem(r,robber);reset(r,cop);feedback(r,cop,'No correct answer. No points. Back to the station.');feedback(r,robber,'No correct answer. Loot dropped; you may escape.');robber.retry.set('loot',r.t+3);}
 r.contests.delete(c.id);
}
function swapRoles(r){
 r.round=2;r.brief=RULES.briefing;r.contests.clear();r.events=[];
 for(const p of r.players.values()){
  p.firstPoints=p.points;p.team=p.team==='cop'?'robber':'cop';
  const base=p.team==='cop'?r.world.station:r.world.safehouse;
  stop(p);Object.assign(p,{x:base.x,y:base.y+(p.avatar%3-1),question:null,feedback:null,resultNotice:null,lastBattle:null,travel:null,jailUntil:0,boostTicks:0,lootCount:0,immune:4,timeline:false,onBreak:true,clockTick:Math.round(r.t/M.STEP),motionTick:Math.round(r.t/M.STEP)});p.retry.clear();
 }
 for(const item of r.items){item.relocate=false;relocate(r,item);}
 for(const b of r.bolts)spawnBolt(r,b);
}
function standings(r){
 const rows=[...r.players.values()].map(p=>({id:p.id,name:p.name,points:p.points,correct:p.correct,cop:p.firstTeam==='cop'?p.firstPoints:p.points-p.firstPoints,robber:p.firstTeam==='robber'?p.firstPoints:p.points-p.firstPoints})).sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
 rows.forEach((p,i)=>{const prev=rows[i-1];p.rank=prev&&p.points===prev.points?prev.rank:i+1;});return rows;
}
function finish(r){r.done=true;r.standings=standings(r);r.winners=r.standings.filter(p=>p.rank===1).map(p=>p.id);r.winner=r.winners[0]||null;for(const p of r.players.values()){p.question=null;p.feedback=null;p.input=null;}for(const k of r.items)k.reservedBy=null;r.contests.clear();}
function answer(r,p,d){const q=p.question,late=p.lastBattle;
 if(!r.done&&!q&&late&&late.id===d.id&&r.t<=late.until&&late.round===r.round&&Number.isInteger(d.choice)&&d.choice>=0&&d.choice<4){
  p.lastBattle=null;const correct=d.choice===late.correct;
  const text=correct?'Too slow! You were correct, but '+late.winner+' answered correctly first.':late.winner+' won the battle. Your answer was incorrect.';
  feedback(r,p,text+' '+(p.feedback?.text||''),3);return {ok:true,correct,tooSlow:correct,winner:late.winner};
 }
 if(r.done||!q||q.id!==d.id||q.answered||r.t>=q.ends||r.t>=RULES.duration||!Number.isInteger(d.choice)||d.choice<0||d.choice>=q.options.length)return {ok:false,error:'That question is no longer active.'};const correct=d.choice===q.correct;p.input=null;if(correct)p.correct++;
 if(q.kind==='contest'){const c=r.contests.get(q.contest);if(!c)return {ok:false,error:'The chase has ended.'};q.answered=true;if(correct)endContest(r,c,p);else{feedback(r,p,'Not quite. Your answer is locked.',RULES.questionTime);if([c.cop,c.robber].every(id=>r.players.get(id).question?.answered))retryContest(r,c,'You both got it wrong. Try again in 2 seconds…');}}

 return {ok:true,correct};}
function remember(p){
 const history=p.track||(p.track=new Array(48));
 for(const point of p.trace)history[((point.tick%48)+48)%48]=point;
}
// Compare the two paths the server actually advanced this frame. A client
// without an input batch stays at its authoritative position for the sweep.
function sweptFrame(a,b,entry){
 const A=a.trace,B=b.trace,m=A.length-1,n=B.length-1;
 if(Math.abs(a.x-b.x)>5||Math.abs(a.y-b.y)>5)return false;
 const first=b.carrySince>B[0].tick?B.findIndex(p=>p.tick>=b.carrySince):0;
 if(first<0)return false;
 const start=n?first/n:0,end=entry<0?1:entry/Math.max(n,1);
 if(start>end)return false;
 function at(path,count,t,key){const u=t*count,i=Math.floor(u),v=path[i][key];return v+((path[i+1]?.[key]??v)-v)*(u-i);}
 let t=start,x=at(A,m,t,'x')-at(B,n,t,'x'),y=at(A,m,t,'y')-at(B,n,t,'y');
 if(x*x+y*y<=.64)return true;
 while(t<end){const next=Math.min(end,(Math.floor(t*m+1e-8)+1)/(m||1),(Math.floor(t*n+1e-8)+1)/(n||1));
 const xx=at(A,m,next,'x')-at(B,n,next,'x'),yy=at(A,m,next,'y')-at(B,n,next,'y'),dx=xx-x,dy=yy-y;
 const u=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));
 if((x+u*dx)**2+(y+u*dy)**2<=.64)return true;
 t=next;x=xx;y=yy;}return false;
}
function crossed(a,b,since,until){
 if(!a.track||!b.track)return false;
 const hi=Math.min(a.motionTick,b.motionTick,until),lo=Math.max(hi-22,a.clockTick-30,since);
 for(let t=hi;t>=lo;t--){
  const at=a.track[(t+48)%48],bt=b.track[(t+48)%48];if(at?.tick!==t||bt?.tick!==t)continue;
  const dx=at.x-bt.x,dy=at.y-bt.y;if(dx*dx+dy*dy<.49)return true;
  if(t<=lo)continue;const ap=a.track[(t+47)%48],bp=b.track[(t+47)%48];if(ap?.tick!==t-1||bp?.tick!==t-1)continue;
  const vx=ap.x-bp.x-dx,vy=ap.y-bp.y-dy,u=Math.min(1,Math.max(0,-(dx*vx+dy*vy)/(vx*vx+vy*vy||1)));
  if((dx+vx*u)**2+(dy+vy*u)**2<.49)return true;
 }
 return false;
}
function step(r,dt,now){if(r.done)return;dt=Math.min(.05,Math.max(0,dt));if(r.brief>0){r.brief=Math.max(0,r.brief-dt);if(r.brief<1e-8){r.brief=0;for(const p of r.players.values())p.onBreak=false;}return;}
 r.t+=dt;if(r.round===1&&r.t>=RULES.duration/2-1e-8){r.t=RULES.duration/2;swapRoles(r);return;}if(r.t>=RULES.duration-1e-8){r.t=RULES.duration;finish(r);return;}
 for(const c of [...r.contests.values()]){if(c.retryAt&&r.t>=c.retryAt)askContest(r,c,'Rematch — first correct answer wins!');else if(!c.retryAt&&r.t>=c.ends)retryContest(r,c,'No correct answer in time. New question in 2 seconds…');}
 for(const b of r.bolts)if(b.availableAt>0&&r.t>=b.availableAt)spawnBolt(r,b);
 for(const k of r.items)if(k.relocate&&r.t>=k.availableAt){k.relocate=false;relocate(r,k);}
 for(const p of r.players.values()){p.clockTick=Math.round(r.t/M.STEP);p.trace=[{x:p.x,y:p.y,tick:p.motionTick}];if(!p.travel)p.immune=p.immune<=dt+1e-8?0:p.immune-dt;if(p.feedback&&r.t>=p.feedback.until){p.feedback=null;stop(p);}
 if(p.travel){p.motionTick=p.clockTick;if(r.t<p.travel.end)continue;p.travel=null;stop(p);}
 if(p.jailUntil){p.motionTick=p.clockTick;if(r.t>=p.jailUntil){reset(r,p);feedback(r,p,'Released! Back to the safehouse.');}continue;}
 if(p.question){p.motionTick=p.clockTick;continue;}
 if(p.feedback){p.motionTick=p.clockTick;continue;}if(p.timeline){for(let n=0;n<18;n++){const tick=p.motionTick+1;if(!p.inputSteps.has(tick))break;M.move(r.world,p,p.inputSteps.get(tick),M.STEP);p.inputSteps.delete(tick);p.motionTick=tick;p.trace.push({x:p.x,y:p.y,tick:p.motionTick});}}else{M.move(r.world,p,now-p.inputAt<700?p.input:'stop',dt);p.motionTick=p.clockTick;p.trace.push({x:p.x,y:p.y,tick:p.motionTick});}

 }
 const ready=p=>!p.question&&!p.feedback&&!p.travel&&!p.jailUntil;
 for(const p of r.players.values())if(ready(p))for(const b of r.bolts){if(b.availableAt>r.t)continue;if(p.trace.some(t=>(t.x-b.x)**2+(t.y-b.y)**2<.36)){p.boostTicks=7/M.STEP;b.availableAt=r.t+5;}}
 for(const p of r.players.values())if(ready(p)&&(p.team==='cop'||!p.immune))remember(p);else p.track=null;
 const cops=[...r.players.values()].filter(p=>p.team==='cop'&&ready(p)),robbers=[...r.players.values()].filter(p=>p.team==='robber'&&ready(p));
 for(const robber of robbers){if(!ready(robber))continue;
 const entry=robber.trace.findIndex(t=>protectedZone(r,{team:'robber',x:t.x,y:t.y}));

 if(r.t>=(robber.retry.get('loot')||0))
 for(const item of r.items){if(item.holder!=null||item.availableAt>r.t||item.relocate)continue;const hit=robber.trace.find((t,i)=>(entry<0||i<entry)&&(t.x-item.x)**2+(t.y-item.y)**2<.36);if(hit){if(!robber.lootCount)robber.carrySince=hit.tick;item.holder=robber.id;item.reservedBy=null;robber.lootCount++;}}
 const cop=robber.immune===0&&carrying(r,robber)?cops.find(p=>ready(p)&&((entry!==0&&sweptFrame(p,robber,entry))||crossed(p,robber,robber.carrySince??0,entry<0?Infinity:robber.trace[entry].tick-1))):null;
 if(cop){const id=randomUUID(),c={id,cop:cop.id,robber:robber.id};r.contests.set(id,c);askContest(r,c);continue;}
 const p=robber;const items=haul(r,p);if(items.length&&entry>=0){const value=items.reduce((sum,k)=>sum+k.value,0);p.points+=value;p.deliveries++;r.scores.robber+=value;retire(r,items);p.lootCount=0;feedback(r,p,'Banked '+items.length+' items! +'+M.money(value)+'.');stop(p);notice(r,p.name+' banked '+items.length+' items · '+M.money(value));}
 }
}
function privateState(p){const q=p.question;return {motion:M.snapshot(p),motionTick:p.motionTick,epoch:p.epoch,question:q?{id:q.id,prompt:q.prompt,options:q.options,flag:q.flag,image:q.image,kind:q.kind,ends:q.ends,answered:q.answered,itemName:q.itemName,itemType:q.itemType,value:q.value,opponent:q.opponent,copName:q.copName,robberName:q.robberName,message:q.message}:null,feedback:p.feedback||(p.resultNotice?.until>p.clockTick*M.STEP?p.resultNotice:null),seq:p.seq};}
function frame(r){return {id:r.world.id,t:r.t,round:r.round,brief:r.brief,roundRemaining:Math.max(0,RULES.duration*r.round/2-r.t),standings:r.standings,remaining:Math.max(0,RULES.duration-r.t),done:r.done,winningTeam:r.winningTeam,winner:r.winner,winners:r.winners,scores:{...r.scores},events:r.events,bolts:r.bolts.map(b=>({...b,hidden:b.availableAt>r.t})),items:r.items.map(({reservedBy,relocate,...k})=>({...k,busy:!!reservedBy,hidden:!!relocate||k.availableAt>r.t})),players:[...r.players.values()].map(p=>{const items=haul(r,p);return ({id:p.id,name:p.name,character:p.character,avatar:p.avatar,team:p.team,motionTick:p.motionTick,x:p.x,y:p.y,dir:p.dir,tx:p.tx,ty:p.ty,epoch:p.epoch,travel:p.travel||null,boost:p.boostTicks*M.STEP,immune:p.immune>0,jail:Math.max(0,p.jailUntil-r.t),question:!!p.question,blocked:!!p.onBreak||!!p.travel||!!p.question||!!p.feedback||p.jailUntil>r.t,points:p.points,arrests:p.arrests,deliveries:p.deliveries,correct:p.correct,loot:items[0]?.id??null,lootIds:items.map(k=>k.id),lootCount:items.length,lootValue:items.reduce((sum,k)=>sum+k.value,0)});})};}
module.exports={world,create,input,answer,step,frame,privateState,reset,carrying,haul,RULES,LOOT};
