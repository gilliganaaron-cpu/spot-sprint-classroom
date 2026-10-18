const J=require('../jump-engine');
function sim(boost){let r=J.create(1,[{id:'a',name:'Bot'}]),s=r.players.get('a'),hist=new Map(),elapsed=0,qtime=0,n=0,target=null; if(!boost)r.world.items=[];
for(let tick=0;tick<30*1800&&!r.done;tick++){elapsed=tick/30;
 if(s.question){qtime+=1/30;if(qtime>=5){J.answer(r,s,{id:s.question.id,choice:++n%5===0?(s.question.correct+1)%4:s.question.correct});qtime=0;}J.step(r,1/30,elapsed*1000,hist);continue;}
 if(s.ground||!target||target.y<s.y-100){const max=s.jet>0?350:s.spring>0?460:157;const options=r.world.platforms.filter(p=>p.y>s.y+5&&p.y<s.y+max&&Math.abs(J.platformX(p,r.t)-s.x)<220);target=options.sort((a,b)=>b.y-a.y||Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0]||r.world.platforms.filter(p=>p.y>=s.y-80&&p.y<=s.y+157).sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];}
 let x=target?J.platformX(target,r.t):r.world.width/2;
 if(s.jet>0){const items=r.world.items.filter(i=>!s.used.has(i.id)&&i.y>s.y&&i.y<s.y+500);const item=items.sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];if(item)x=item.x;}

 J.input(s,{seq:tick,left:x<s.x-8,right:x>s.x+8,jump:true},elapsed*1000);J.step(r,1/30,elapsed*1000,hist);
}return {boost,seconds:Math.round(elapsed),metres:Math.round(s.best/J.C.metre),questions:n,finished:r.done};}
console.log(sim(false));console.log(sim(true));
