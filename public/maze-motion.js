(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MazeMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1],upleft:[-1,-1],upright:[1,-1],downleft:[-1,1],downright:[1,1]},STEP=1/60;
function open(w,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w.width&&y<w.height&&w.grid[y*w.width+x]===0;}
function inside(b,x,y){return !!b&&x>=b.x1-.45&&x<=b.x2+.45&&y>=b.y1-.45&&y<=b.y2+.45;}
function allowed(w,p,x,y){return open(w,x,y)&&!(p.team==='cop'?x===w.safehouse?.x&&y===w.safehouse?.y:p.team==='robber'&&inside(w.station,x,y));}
function canStep(w,p,x,y,dir){const d=dirs[dir];return !!d&&allowed(w,p,x+d[0],y+d[1])&&(!d[0]||!d[1]||(allowed(w,p,x+d[0],y)&&allowed(w,p,x,y+d[1])));}
function steering(keys){const values=keys.map(k=>dirs[k]).filter(Boolean);const x=Math.sign(values.reduce((n,d)=>n+d[0],0)),y=Math.sign(values.reduce((n,d)=>n+d[1],0));return Object.keys(dirs).find(k=>dirs[k][0]===x&&dirs[k][1]===y)||'stop';}
function speed(p){return (p.team==='cop'?5.2:5.1*(.55+.45/(1+.16*Math.max(0,p.lootCount||0))))*(p.boostTicks>0?1.28:1);}
function snapshot(p){return {x:p.x,y:p.y,tx:p.tx,ty:p.ty,dir:p.dir,team:p.team,lootCount:p.lootCount||0,boostTicks:p.boostTicks||0};}
// Direct steering: no queued turns, continuation, auto-centering or inertia.
// A compact hitbox and short swept steps prevent crossing walls at boosted speeds.
function fits(w,p,x,y){const radius=.24;for(let yy=Math.floor(y+.5-radius);yy<=Math.floor(y+.5+radius);yy++)for(let xx=Math.floor(x+.5-radius);xx<=Math.floor(x+.5+radius);xx++)if(!allowed(w,p,xx,yy))return false;return true;}
function move(w,p,wanted,dt,rate=speed(p)){
 const duration=Math.max(0,dt),d=dirs[wanted];p.boostTicks=Math.max(0,(p.boostTicks||0)-duration/STEP);
 p.tx=null;p.ty=null;if(!d||!duration)return;
 p.dir=wanted;const distance=duration*rate,parts=Math.max(1,Math.ceil(distance/.08)),scale=distance/parts/Math.hypot(d[0],d[1]),dx=d[0]*scale,dy=d[1]*scale;
 for(let i=0;i<parts;i++){if(dx&&fits(w,p,p.x+dx,p.y))p.x+=dx;if(dy&&fits(w,p,p.x,p.y+dy))p.y+=dy;}
}

function money(n){const v=Math.abs(n),m=v>=1e6;return (n<0?'−':'')+'$'+(m?Number((v/1e6).toFixed(2))+'M':v>=1000?Number((Math.floor(v/10)/100).toFixed(2))+'K':v);}
return {money,dirs,steering,canStep,fits,open,move,inside,allowed,speed,snapshot,STEP};});
