'use strict';
// Midnight Heist: server-authoritative movement, loot ownership and question duels.
const {randomInt,randomUUID}=require('node:crypto'),bank=require('./jump-questions'),M=require('./public/maze-motion');
const LOOT=[{type:'cash',name:'Money pile',value:25000},{type:'diamonds',name:'Diamonds',value:100000},{type:'car',name:'Ferrari',value:250000},{type:'chain',name:'Gold chain',value:50000},{type:'vault',name:'Bank vault',value:500000},{type:'sneakers',name:'Sneakers',value:10000}];
const RULES={duration:300,questionTime:20,jailTime:8,protection:4,respawn:8,arrestBonus:50000};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function world(count){const width=35,height=23,grid=Array(width*height).fill(1),stack=[[1,1]];grid[width+1]=0;
 while(stack.length){const[x,y]=stack.at(-1),next=Object.values(M.dirs).map(([dx,dy])=>[x+dx*2,y+dy*2,dx,dy]).filter(([a,b])=>a>0&&b>0&&a<width-1&&b<height-1&&grid[b*width+a]);if(!next.length){stack.pop();continue;}const[a,b,dx,dy]=next[randomInt(next.length)];grid[(y+dy)*width+x+dx]=grid[b*width+a]=0;stack.push([a,b]);}
 // Loops offer escape choices instead of forcing every chase into dead ends.
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(grid[y*width+x]&&randomInt(3)===0&&((!grid[y*width+x-1]&&!grid[y*width+x+1])||(!grid[(y-1)*width+x]&&!grid[(y+1)*width+x])))grid[y*width+x]=0;
 const safehouse={x:2,y:11,x1:1,x2:3,y1:9,y2:13},station={x:32,y:11,x1:31,x2:33,y1:9,y2:13},jail={x:17,y:11};
 for(const b of [safehouse,station])for(let y=9;y<=13;y++)for(let x=b.x1;x<=b.x2;x++)grid[y*width+x]=0;
 for(const y of [9,13])for(let x=1;x<width-1;x++)grid[y*width+x]=0;
 for(let y=10;y<=12;y++)for(let x=16;x<=18;x++)grid[y*width+x]=0;
 grid[9*width+17]=grid[13*width+17]=0;
 return {id:randomUUID(),width,height,grid,safehouse,station,jail,rules:RULES,lootTypes:LOOT};
}
function protectedZone(r,p){return M.inside(p.team==='cop'?r.world.station:r.world.safehouse,p.x,p.y);}
function carrying(r,p){return r.items.find(k=>k.holder===p.id);}
function relocate(r,item){const w=r.world,cells=[];for(let y=1;y<w.height-1;y++)for(let x=6;x<w.width-6;x++)if(M.open(w,x,y)&&Math.hypot(x-w.jail.x,y-w.jail.y)>2&&!r.items.some(k=>k!==item&&k.holder==null&&k.availableAt<=r.t&&Math.hypot(k.x-x,k.y-y)<2)&&![...r.players.values()].some(p=>Math.hypot(p.x-x,p.y-y)<1.3))cells.push({x,y});const point=cells[randomInt(cells.length)]||{x:7,y:1};Object.assign(item,point,{holder:null,reservedBy:null,availableAt:r.t});}
function create(players){const w=world(players.length),r={world:w,t:0,players:new Map(),items:[],contests:new Map(),scores:{cop:0,robber:0},winner:null,winners:[],winningTeam:null,done:false,events:[]};const order=shuffle([...players]),cops=players.length<2?0:Math.max(1,Math.floor(players.length/2));
 for(const [i,p]of order.entries()){const team=i<cops?'cop':'robber',base=team==='cop'?w.station:w.safehouse;r.players.set(p.id,{id:p.id,name:p.name,character:p.character||0,avatar:i%30,team,x:base.x,y:base.y+(i%3-1),tx:null,ty:null,dir:null,input:null,inputAt:0,seq:-1,immune:4,jailUntil:0,question:null,feedback:null,points:0,arrests:0,deliveries:0,correct:0,history:new Set(),retry:new Map(),epoch:0,motionTick:0,clockTick:0,timeline:false,inputSteps:new Map()});}
 for(let i=0;i<Math.max(12,Math.min(30,Math.ceil(players.length*.8/6)*6));i++){const item={id:i,...LOOT[i%LOOT.length],x:-100,y:-100,holder:null,reservedBy:null,availableAt:0};r.items.push(item);relocate(r,item);}return r;}
function stop(p){p.input=null;p.dir=null;p.tx=null;p.ty=null;p.x=Math.round(p.x);p.y=Math.round(p.y);p.epoch++;p.motionTick=p.clockTick||0;p.inputSteps?.clear();}
function input(p,d,now){if(!Number.isSafeInteger(d.seq)||d.seq<=p.seq)return false;p.seq=d.seq;p.input=p.question||p.feedback||p.jailUntil>0?'stop':(M.dirs[d.dir]?d.dir:d.dir==='stop'?'stop':null);p.inputAt=now;
 if(Array.isArray(d.steps)&&d.epoch===p.epoch&&!p.question&&!p.feedback&&!p.jailUntil){if(!p.timeline){p.timeline=true;if(Number.isInteger(d.baseTick)&&d.baseTick>=0&&d.baseTick<=p.clockTick)p.motionTick=d.baseTick;}for(const h of d.steps.slice(-90))if(Number.isInteger(h.tick)&&h.tick>p.motionTick&&h.tick<=p.clockTick+30&&p.inputSteps.size<120)p.inputSteps.set(h.tick,M.dirs[h.dir]?h.dir:h.dir==='stop'?'stop':null);}
 return true;}

function pick(players){let choices=bank.filter(q=>players.every(p=>!p.history.has(q.id)));if(!choices.length){for(const p of players)p.history.clear();choices=bank;}const q=choices[randomInt(choices.length)];for(const p of players)p.history.add(q.id);const options=shuffle([q.answer,...q.wrong]);return {id:randomUUID(),prompt:q.prompt,flag:q.flag,image:q.image,options,correct:options.indexOf(q.answer)};}
function notice(r,text){r.events.unshift({id:randomUUID(),text,t:r.t});r.events=r.events.slice(0,4);}
function feedback(r,p,text,duration=.8){p.feedback={text,until:r.t+duration};}
function reset(r,p){const b=p.team==='cop'?r.world.station:r.world.safehouse;stop(p);Object.assign(p,{x:b.x,y:b.y,question:null,immune:RULES.protection,jailUntil:0});}
function releaseItem(r,p,delay=0){const item=carrying(r,p);if(item){Object.assign(item,{holder:null,reservedBy:null,x:Math.round(p.x),y:Math.round(p.y),availableAt:r.t+delay});}return item;}
function endContest(r,c,winner){if(!r.contests.has(c.id))return;const cop=r.players.get(c.cop),robber=r.players.get(c.robber);for(const p of [cop,robber]){p.question=null;p.immune=RULES.protection;stop(p);}const item=carrying(r,robber);
 if(winner===cop){const value=(item?.value||0)+RULES.arrestBonus;cop.points+=value;cop.arrests++;r.scores.cop+=value;if(item){item.holder=null;item.reservedBy=null;item.availableAt=r.t+RULES.respawn;item.relocate=true;}Object.assign(robber,{x:r.world.jail.x,y:r.world.jail.y,jailUntil:r.t+RULES.jailTime});feedback(r,cop,'Busted! +$'+(value/1000)+'K recovered.');feedback(r,robber,'Caught! Eight seconds in the central jail.');notice(r,cop.name+' caught '+robber.name+' · $'+value/1000+'K');}
 else if(winner===robber){reset(r,cop);feedback(r,cop,'Outsmarted! Back to the station.');feedback(r,robber,'Clean getaway! Four seconds of protection.');notice(r,robber.name+' outsmarted '+cop.name);}
 else{releaseItem(r,robber);reset(r,cop);feedback(r,cop,'No correct answer. No points. Back to the station.');feedback(r,robber,'No correct answer. Loot dropped; you may escape.');robber.retry.set('loot',r.t+3);}
 r.contests.delete(c.id);
}
function finish(r){r.done=true;r.winningTeam=r.scores.cop===r.scores.robber?null:r.scores.cop>r.scores.robber?'cop':'robber';r.winners=r.winningTeam?[...r.players.values()].filter(p=>p.team===r.winningTeam).map(p=>p.id):[];r.winner=r.winners[0]||null;for(const p of r.players.values()){p.question=null;p.feedback=null;p.input=null;}for(const k of r.items)k.reservedBy=null;r.contests.clear();}
function answer(r,p,d){const q=p.question;if(r.done||!q||q.id!==d.id||q.answered||r.t>=q.ends||r.t>=RULES.duration||!Number.isInteger(d.choice)||d.choice<0||d.choice>=q.options.length)return {ok:false,error:'That question is no longer active.'};const correct=d.choice===q.correct;p.input=null;if(correct)p.correct++;
 if(q.kind==='contest'){const c=r.contests.get(q.contest);if(!c)return {ok:false,error:'The chase has ended.'};q.answered=true;if(correct)endContest(r,c,p);else{feedback(r,p,'Not quite. Your answer is locked.',RULES.questionTime);if([c.cop,c.robber].every(id=>r.players.get(id).question?.answered))endContest(r,c,null);}}
 else{const item=r.items.find(k=>k.id===q.itemId);p.question=null;stop(p);if(item?.reservedBy===p.id){item.reservedBy=null;if(correct&&!carrying(r,p)){item.holder=p.id;p.immune=2;feedback(r,p,'Got the '+item.name+'! Return to the safehouse.');}else{p.retry.set(item.id,r.t+5);feedback(r,p,'Not quite. Try another item or retry in five seconds.');}}}
 return {ok:true,correct};}
function step(r,dt,now){if(r.done)return;dt=Math.min(.05,Math.max(0,dt));r.t+=dt;if(r.t>=RULES.duration){finish(r);return;}
 for(const c of [...r.contests.values()])if(r.t>=c.ends)endContest(r,c,null);
 for(const k of r.items)if(k.relocate&&r.t>=k.availableAt){k.relocate=false;relocate(r,k);}
 for(const p of r.players.values()){p.clockTick=Math.round(r.t/M.STEP);p.trace=[{x:p.x,y:p.y}];p.immune=Math.max(0,p.immune-dt);if(p.feedback&&r.t>=p.feedback.until){p.feedback=null;stop(p);}
 if(p.jailUntil){p.motionTick=p.clockTick;if(r.t>=p.jailUntil){reset(r,p);feedback(r,p,'Released! Back to the safehouse.');}continue;}
 if(p.question){p.motionTick=p.clockTick;if(p.question.kind==='loot'&&r.t>=p.question.ends){const item=r.items.find(k=>k.id===p.question.itemId);if(item?.reservedBy===p.id)item.reservedBy=null;p.retry.set(p.question.itemId,r.t+5);p.question=null;stop(p);feedback(r,p,'Time’s up. Try another item.');}continue;}
 if(p.feedback){p.motionTick=p.clockTick;continue;}if(p.timeline){for(let n=0;n<18;n++){const tick=p.motionTick+1;if(!p.inputSteps.has(tick))break;M.move(r.world,p,p.inputSteps.get(tick),M.STEP);p.inputSteps.delete(tick);p.motionTick=tick;p.trace.push({x:p.x,y:p.y});}}else{M.move(r.world,p,now-p.inputAt<700?p.input:'stop',dt);p.motionTick=p.clockTick;p.trace.push({x:p.x,y:p.y});}if(protectedZone(r,p))p.immune=Math.max(p.immune,2);
 // A deposit is final and atomic; the item respawns elsewhere after eight seconds.
 const item=carrying(r,p);if(p.team==='robber'&&item&&protectedZone(r,p)){p.points+=item.value;p.deliveries++;r.scores.robber+=item.value;item.holder=null;item.availableAt=r.t+RULES.respawn;item.relocate=true;feedback(r,p,'Banked! +$'+item.value/1000+'K for the robbers.');stop(p);notice(r,p.name+' banked '+item.name+' · $'+item.value/1000+'K');}
 }
 const ready=p=>!p.question&&!p.feedback&&!p.jailUntil;
 const cops=[...r.players.values()].filter(p=>p.team==='cop'&&ready(p)&&p.immune===0),robbers=[...r.players.values()].filter(p=>p.team==='robber'&&ready(p));
 for(const robber of robbers){if(!ready(robber)||protectedZone(r,robber))continue;
 const cop=robber.immune===0?cops.find(p=>ready(p)&&p.immune===0&&(robber.trace||[robber]).some(t=>Math.hypot(p.x-t.x,p.y-t.y)<.7)):null;
 if(cop){const q=pick([cop,robber]),id=randomUUID(),c={id,cop:cop.id,robber:robber.id,ends:r.t+RULES.questionTime};r.contests.set(id,c);for(const p of [cop,robber]){stop(p);p.question={...q,kind:'contest',contest:id,ends:c.ends,answered:false,opponent:p===cop?robber.name:cop.name};}continue;}
 if(carrying(r,robber)||r.t<(robber.retry.get('loot')||0))continue;
 const item=r.items.find(k=>!k.holder&&!k.reservedBy&&k.availableAt<=r.t&&!k.relocate&&r.t>=(robber.retry.get(k.id)||0)&&(robber.trace||[robber]).some(t=>Math.hypot(t.x-k.x,t.y-k.y)<.6));
 if(item){item.reservedBy=robber.id;const contact=(robber.trace||[robber]).find(t=>Math.hypot(t.x-item.x,t.y-item.y)<.6);if(contact){robber.x=contact.x;robber.y=contact.y;}stop(robber);robber.question={...pick([robber]),kind:'loot',itemId:item.id,itemName:item.name,itemType:item.type,value:item.value,ends:r.t+RULES.questionTime,answered:false};}
 }
}
function privateState(p){const q=p.question;return {motion:M.snapshot(p),motionTick:p.motionTick,epoch:p.epoch,question:q?{id:q.id,prompt:q.prompt,options:q.options,flag:q.flag,image:q.image,kind:q.kind,ends:q.ends,answered:q.answered,itemName:q.itemName,itemType:q.itemType,value:q.value,opponent:q.opponent}:null,feedback:p.feedback,seq:p.seq};}
function frame(r){return {id:r.world.id,t:r.t,remaining:Math.max(0,RULES.duration-r.t),done:r.done,winningTeam:r.winningTeam,winner:r.winner,winners:r.winners,scores:{...r.scores},events:r.events,items:r.items.map(({reservedBy,relocate,...k})=>({...k,busy:!!reservedBy,hidden:!!relocate||k.availableAt>r.t})),players:[...r.players.values()].map(p=>({id:p.id,name:p.name,character:p.character,avatar:p.avatar,team:p.team,x:p.x,y:p.y,dir:p.dir,tx:p.tx,ty:p.ty,epoch:p.epoch,immune:p.immune>0,jail:Math.max(0,p.jailUntil-r.t),question:!!p.question,blocked:!!p.question||!!p.feedback||p.jailUntil>r.t,points:p.points,arrests:p.arrests,deliveries:p.deliveries,correct:p.correct,loot:carrying(r,p)?.id??null}))};}
module.exports={world,create,input,answer,step,frame,privateState,reset,carrying,RULES,LOOT};
