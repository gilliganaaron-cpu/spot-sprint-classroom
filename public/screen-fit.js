(()=>{'use strict';let timer=0,stage=null;const screen=document.getElementById('screen');if(!screen)return;
// Observe actual size changes, not score text, gauges, or animation updates.
const sizes=new WeakMap(),observer=new ResizeObserver(entries=>{let changed=false;for(const e of entries){const size=e.contentRect.width+':'+e.contentRect.height;if(sizes.get(e.target)!==size){sizes.set(e.target,size);changed=true;}}if(changed)schedule();});
function fit(){timer=0;const next=screen.querySelector(':scope > .arcade-fit-stage');if(!next&&screen.children.length){observer.disconnect();stage=document.createElement('div');stage.className='arcade-fit-stage';while(screen.firstChild)stage.appendChild(screen.firstChild);screen.appendChild(stage);observer.observe(stage);observer.observe(screen);}else stage=next;if(!stage)return;
const available=Math.max(160,window.innerHeight-screen.getBoundingClientRect().top-8),width=screen.clientWidth;
if(screen.style.height!==available+'px')screen.style.height=available+'px';if(stage.style.width!==width+'px')stage.style.width=width+'px';
const natural=Math.max(stage.scrollHeight,stage.offsetHeight,1),scale=Math.min(1,available/natural),transform=`scale(${scale})`,margin=width*(1-scale)/2+'px';
if(stage.style.transform!==transform)stage.style.transform=transform;if(stage.style.marginLeft!==margin)stage.style.marginLeft=margin;}
function schedule(){if(!timer)timer=setTimeout(fit,80);}new MutationObserver(schedule).observe(screen,{childList:true});window.addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);document.fonts?.ready.then(schedule);schedule();})();
