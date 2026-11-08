// Compact, self-contained public snapshots. A slow connection can skip frames safely.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HeistStream=factory();})(globalThis,()=>{
 const fields='id name character avatar team motionTick x y dir epoch travel boost immune jail question blocked points arrests deliveries correct loot lootCount lootValue'.split(' ');
 function pack(players){return players.map(p=>fields.map(k=>k==='x'||k==='y'?Math.round(p[k]*1000)/1000:p[k]));}
 function unpack(rows){return rows.map(row=>Object.fromEntries(fields.map((k,i)=>[k,row[i]])));}
 // Render between movement samples, not packet arrivals. Repeated stationary
 // snapshots never introduce a false pause between two batches of input.
 class Tracks{
  constructor(){this.players=new Map();}
  record(p,time){const tick=p.motionTick??Math.round(time*60);let h=this.players.get(p.id);
   if(!h||h.epoch!==p.epoch){this.players.set(p.id,{epoch:p.epoch,samples:[{tick,x:p.x,y:p.y}],cursor:tick-9,last:null});return;}
   const tail=h.samples.at(-1);if(tick<=tail.tick)return;
   h.samples.push({tick,x:p.x,y:p.y});if(h.samples.length>18)h.samples.shift();
  }
  position(p,now){const h=this.players.get(p.id);if(!h||h.epoch!==p.epoch)return p;
   const s=h.samples,last=s.at(-1),dt=h.last===null?0:Math.max(0,Math.min(100,now-h.last))*.06;h.last=now;
   const ahead=last.tick-h.cursor;h.cursor=Math.min(last.tick,Math.max(s[0].tick,h.cursor+dt*(ahead>15?1.12:ahead<4?.90:1)));
   let i=1;while(i<s.length&&s[i].tick<h.cursor)i++;
   if(i>=s.length)return {...p,x:last.x,y:last.y};
   const a=s[i-1],b=s[i],u=(h.cursor-a.tick)/(b.tick-a.tick);return {...p,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};
  }
 }
 return {pack,unpack,Tracks};
});
