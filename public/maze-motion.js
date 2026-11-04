(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MazeMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1],upleft:[-1,-1],upright:[1,-1],downleft:[-1,1],downright:[1,1]},STEP=1/60;
function open(w,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w.width&&y<w.height&&w.grid[y*w.width+x]===0;}
function inside(b,x,y){return !!b&&x>=b.x1-.45&&x<=b.x2+.45&&y>=b.y1-.45&&y<=b.y2+.45;}
function allowed(w,p,x,y){return open(w,x,y)&&!inside(p.team==='cop'?w.safehouse:p.team==='robber'?w.station:null,x,y);}
function canStep(w,p,x,y,dir){const d=dirs[dir];return !!d&&allowed(w,p,x+d[0],y+d[1])&&(!d[0]||!d[1]||(allowed(w,p,x+d[0],y)&&allowed(w,p,x,y+d[1])));}
function steering(keys){const values=keys.map(k=>dirs[k]).filter(Boolean);const x=Math.sign(values.reduce((n,d)=>n+d[0],0)),y=Math.sign(values.reduce((n,d)=>n+d[1],0));return Object.keys(dirs).find(k=>dirs[k][0]===x&&dirs[k][1]===y)||'stop';}
function speed(p){return (p.team==='cop'?5.2:5.1*(1-Math.min(.10,.02*(p.lootCount||0))))*(p.boostTicks>0?1.28:1);}
function snapshot(p){return {x:p.x,y:p.y,tx:p.tx,ty:p.ty,dir:p.dir,team:p.team,lootCount:p.lootCount||0,boostTicks:p.boostTicks||0};}
// Hold-to-move steering; release freezes the exact position, even between tiles.
// Opposite input reverses inside a tile, without snapping sideways or waiting.
function move(w,p,wanted,dt,rate=speed(p)){
 let distance=Math.max(0,dt)*rate;
 p.boostTicks=Math.max(0,(p.boostTicks||0)-Math.max(0,dt)/STEP);
 if(!dirs[wanted])return;
 if(p.tx!=null&&dirs[wanted]&&dirs[p.dir]&&dirs[wanted][0]===-dirs[p.dir][0]&&dirs[wanted][1]===-dirs[p.dir][1]){p.tx-=dirs[p.dir][0];p.ty-=dirs[p.dir][1];p.dir=wanted;}
 while(distance>1e-8){if(p.tx==null){const x=Math.round(p.x),y=Math.round(p.y);const d=dirs[wanted];let dir=canStep(w,p,x,y,wanted)?wanted:d[0]&&d[1]?([p.dir,d[0]<0?'left':'right',d[1]<0?'up':'down'].find(k=>dirs[k]&&((dirs[k][0]===d[0]&&!dirs[k][1])||(dirs[k][1]===d[1]&&!dirs[k][0]))&&canStep(w,p,x,y,k))):p.dir;if(!canStep(w,p,x,y,dir)){p.dir=null;return;}p.dir=dir;p.tx=x+dirs[dir][0];p.ty=y+dirs[dir][1];}
 const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),amount=Math.min(d,distance);if(d>0){p.x+=dx/d*amount;p.y+=dy/d*amount;}distance-=amount;if(d<=amount+1e-8){p.x=p.tx;p.y=p.ty;p.tx=null;p.ty=null;}else return;}
}
return {dirs,steering,canStep,open,move,inside,allowed,speed,snapshot,STEP};});
