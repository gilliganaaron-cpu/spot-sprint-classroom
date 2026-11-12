'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('teacher score updates and card changes keep the fitted dashboard mounted',()=>{
 const src=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 const node=()=>({writes:0,set innerHTML(v){this.html=v;this.writes++;},classList:{toggle(){}},style:{setProperty(){}}});
 const card=node(),status=node(),area=Object.assign(node(),{firstElementChild:card,lastElementChild:status}),ladder=node();
 const dash={querySelector:q=>({'.classroom-card-area':area,'.arcade-leaderboard':ladder}[q])};
 const view={status:'playing',teacherCard:{id:1},players:[{online:true,points:0}]};
 const env={view,screen:{querySelector:q=>q==='.classroom-dashboard'?dash:null,set innerHTML(_){assert.fail('destroyed fitted stage')}},symbolCard:c=>String(c.id),playerList:()=>String(view.players[0].points),startCountdownOverlay:()=>'',escape:String};
 vm.createContext(env);vm.runInContext(src.slice(src.indexOf('  function renderTeacher()'),src.indexOf('  function studentCelebration()')),env);
 env.renderTeacher();view.players[0].points++;env.renderTeacher();assert.equal(card.writes,1);assert.equal(ladder.writes,2);
 view.pendingMatch={playerName:'Sam',symbol:'moon',celebrationMs:1500};env.renderTeacher();env.renderTeacher();assert.equal(card.writes,2);assert.match(card.html,/GREAT SPOT/);
 view.pendingMatch=null;view.teacherCard={id:2};view.lastEvent={playerName:'Sam'};env.renderTeacher();assert.equal(card.html,'2');assert.match(status.textContent,/Sam/);
});
