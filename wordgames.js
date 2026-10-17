'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const dictionary=new Set(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'data/words.txt.gz'))).toString('utf8').trim().split(/\s+/).map(w=>w.toUpperCase()));
const trie={};
for(const word of dictionary){let n=trie;for(const c of word)n=n[c]||(n[c]={});n.$=word;}
const pick=a=>a[crypto.randomInt(a.length)];
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
const TOPICS={
 animals:'TIGER LION ZEBRA OTTER PANDA KOALA WOMBAT DINGO EAGLE SHARK WHALE DOLPHIN TURTLE RABBIT HORSE DONKEY MONKEY GIRAFFE ELEPHANT PENGUIN POSSUM LIZARD PARROT OCTOPUS FALCON GECKO BADGER FOX WOLF SEAL'.split(' '),
 science:'ENERGY ATOM FORCE LIGHT SOUND WATER SOLID LIQUID GAS PLANET ORBIT GRAVITY MAGNET CELL OXYGEN CARBON METAL HEAT EARTH SPACE STARS MOON SOLAR CIRCUIT FOSSIL ROCK CRYSTAL MOTION MASS REACTION'.split(' '),
 geography:'RIVER OCEAN FOREST DESERT VALLEY ISLAND CLIMATE BIOME COAST MOUNTAIN GLACIER WEATHER EQUATOR MAP SCALE LEGEND NORTH SOUTH EAST WEST FARM CROP SOIL TRADE EXPORT IMPORT HABITAT REGION CITY COUNTRY'.split(' '),
 mixed:'PUZZLE SCHOOL FRIEND BRIGHT WONDER LEARN CREATE EXPLORE GARDEN SUMMER WINTER SPRING AUTUMN MUSIC COLOUR DREAM TRAVEL BOOK STORY LAUGH SMILE SPORT FAMILY NATURE CLOUD RAINBOW CASTLE BRIDGE ROCKET MAGIC'.split(' ')
};
const DICE=['AAEEGN','ABBJOO','ACHOPS','AFFKPS','AOOTTW','CIMOTU','DEILRX','DELRVY','DISTTY','EEGHNW','EEINSU','EHRTVW','EIOSST','ELRTTY','HIMNQU','HLNNRZ'];
function neighbours(index,size){const a=[];const r=Math.floor(index/size),c=index%size;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const y=r+dy,x=c+dx;if(y>=0&&y<size&&x>=0&&x<size)a.push(y*size+x);}return a;}
function solve(grid,size,min=3){const found=new Map();const near=grid.map((_,i)=>neighbours(i,size));
 function walk(i,node,used,route){let next=node;for(const c of grid[i]){next=next[c];if(!next)return;}const path=[...route,i];if(next.$&&next.$.length>=min)found.set(next.$,path);if(path.length>=12)return;const flags=used|(1<<i);for(const j of near[i])if(!(flags&(1<<j)))walk(j,next,flags,path);}
 for(let i=0;i<grid.length;i++)walk(i,trie,0,[]);return found;
}
function createWeave(settings){const size=settings.gridSize||4,min=settings.minLength||3;let best=null;
 for(let attempt=0;attempt<35;attempt++){const grid=shuffle(Array.from({length:size*size},(_,i)=>pick(DICE[i%DICE.length]))).map(c=>c==='Q'?'QU':c);const solutions=solve(grid,size,min);const puzzle={id:crypto.randomUUID(),size,grid,solutions};if(!best||solutions.size>best.solutions.size)best=puzzle;if(solutions.size>=(min===4?25:50))break;}
 return best;
}
function createSearch(settings){const count=settings.wordCount||10,difficulty=settings.difficulty||'normal';const words=shuffle(TOPICS[settings.topic]||TOPICS.mixed).slice(0,count);const size=Math.max(count>15?15:count>10?13:11,...words.map(w=>w.length+1));
 const dirs=difficulty==='easy'?[[0,1],[1,0]]:difficulty==='hard'?[[0,1],[1,0],[1,1],[1,-1],[0,-1],[-1,0],[-1,-1],[-1,1]]:[[0,1],[1,0],[1,1]];
 for(let attempt=0;attempt<40;attempt++){let grid=Array(size*size).fill(''),paths={};let failed=false;
  for(const word of [...words].sort((a,b)=>b.length-a.length)){let placed=false;for(const start of shuffle(grid.map((_,i)=>i))){for(const [dy,dx] of shuffle(dirs)){const r=Math.floor(start/size),c=start%size;const route=[];let ok=true;for(let k=0;k<word.length;k++){const y=r+dy*k,x=c+dx*k,index=y*size+x;if(y<0||y>=size||x<0||x>=size||(grid[index]&&grid[index]!==word[k])){ok=false;break;}route.push(index);}if(ok){route.forEach((n,i)=>grid[n]=word[i]);paths[word]=route;placed=true;break;}}if(placed)break;}if(!placed){failed=true;break;}}
  if(!failed)return {id:crypto.randomUUID(),size,grid:grid.map(c=>c||pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ')),words:words.sort(),paths};
 }throw new Error('Unable to create word search');
}
function validatePath(puzzle,route,game,min=3){if(!Array.isArray(route)||route.length<2||route.length>puzzle.grid.length||route.some(n=>!Number.isInteger(n)||n<0||n>=puzzle.grid.length)||new Set(route).size!==route.length)return {error:'Choose a valid path of letters.'};
 const word=route.map(n=>puzzle.grid[n]).join('');
 if(game==='weave'){if(word.length<min)return {error:`Find a word with at least ${min} letters.`};for(let i=1;i<route.length;i++)if(!neighbours(route[i-1],puzzle.size).includes(route[i]))return {error:'Letters must touch, including diagonally.'};if(!puzzle.solutions.has(word))return {error:'That word is not in our classroom dictionary.'};return {word,points:word.length<=4?1:word.length===5?2:word.length===6?3:word.length===7?5:11};}
 const r0=Math.floor(route[0]/puzzle.size),c0=route[0]%puzzle.size,r1=Math.floor(route[1]/puzzle.size),c1=route[1]%puzzle.size;const dy=r1-r0,dx=c1-c0;
 if(Math.max(Math.abs(dy),Math.abs(dx))!==1)return {error:'Select letters in one straight line.'};
 for(let i=1;i<route.length;i++)if(Math.floor(route[i]/puzzle.size)!==r0+dy*i||route[i]%puzzle.size!==c0+dx*i)return {error:'Select letters in one straight line.'};
 const match=puzzle.words.includes(word)?word:puzzle.words.includes([...word].reverse().join(''))?[...word].reverse().join(''):null;
 return match?{word:match,points:1}:{error:'That is not one of the hidden words.'};
}
module.exports={TOPICS,createWeave,createSearch,validatePath,solve,dictionary};
