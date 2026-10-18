(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MazeMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const dirs={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
function open(w,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w.width&&y<w.height&&w.grid[y*w.width+x]===0;}
function move(w,p,wanted,dt,speed=4.2){let distance=dt*speed;while(distance>1e-8){if(p.tx==null){const x=Math.round(p.x),y=Math.round(p.y);let dir=dirs[wanted]&&open(w,x+dirs[wanted][0],y+dirs[wanted][1])?wanted:p.dir;if(!wanted)dir=null;if(!dirs[dir]||!open(w,x+dirs[dir][0],y+dirs[dir][1])){p.dir=null;return;}p.dir=dir;p.tx=x+dirs[dir][0];p.ty=y+dirs[dir][1];}const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy),amount=Math.min(d,distance);if(d>0){p.x+=dx/d*amount;p.y+=dy/d*amount;}distance-=amount;if(d<=amount+1e-8){p.x=p.tx;p.y=p.ty;p.tx=null;p.ty=null;}else return;}}
return {dirs,open,move};});
