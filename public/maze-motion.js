(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MazeMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]},STEP=1/60;
function open(w,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w.width&&y<w.height&&w.grid[y*w.width+x]===0;}
function inside(b,x,y){return !!b&&x>=b.x1-.45&&x<=b.x2+.45&&y>=b.y1-.45&&y<=b.y2+.45;}
function allowed(w,p,x,y){return open(w,x,y)&&!inside(p.team==='cop'?w.safehouse:p.team==='robber'?w.station:null,x,y);}
function speed(p){return p.team==='cop'?5.2:4.6;}
function snapshot(p){return {x:p.x,y:p.y,tx:p.tx,ty:p.ty,dir:p.dir,team:p.team};}
// Pac-Man steering: continue forward; buffer an early turn until the next opening.
// Opposite input reverses inside a tile, without snapping sideways or waiting.
function move(w,p,wanted,dt,rate=speed(p)){
 let distance=Math.max(0,dt)*rate;
 if(wanted==='stop'){p.dir=null;if(p.tx==null)return;}
 if(p.tx!=null&&dirs[wanted]&&dirs[p.dir]&&dirs[wanted][0]===-dirs[p.dir][0]&&dirs[wanted][1]===-dirs[p.dir][1]){p.tx-=dirs[p.dir][0];p.ty-=dirs[p.dir][1];p.dir=wanted;}
 while(distance>1e-8){if(p.tx==null){const x=Math.round(p.x),y=Math.round(p.y);let dir=dirs[wanted]&&allowed(w,p,x+dirs[wanted][0],y+dirs[wanted][1])?wanted:p.dir;if(!dirs[dir]||!allowed(w,p,x+dirs[dir][0],y+dirs[dir][1])){p.dir=null;return;}p.dir=dir;p.tx=x+dirs[dir][0];p.ty=y+dirs[dir][1];}
 const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),amount=Math.min(d,distance);if(d>0){p.x+=dx/d*amount;p.y+=dy/d*amount;}distance-=amount;if(d<=amount+1e-8){p.x=p.tx;p.y=p.ty;p.tx=null;p.ty=null;}else return;}
}
return {dirs,open,move,inside,allowed,speed,snapshot,STEP};});
