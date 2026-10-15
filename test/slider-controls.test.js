'use strict';
// Regression: reconnects, lobby broadcasts and fullscreen updates must not
// replace the teacher's active number-of-cards slider.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('teacher card-count slider remains mounted during a drag and saves the released value', async () => {
  const app = fs.readFileSync(path.join(__dirname,'../public/app.js'), 'utf8');
  const start = app.indexOf('  let sliderEditing = false;');
  const end = app.indexOf('  function renderLanding() {', start);
  assert.ok(start > 0 && end > start, 'slider-safe header code is present');
  const code = app.slice(start, end);
  const simulation = new Function(`
    const slider = { value:'23', style:{setProperty(k,v){this[k]=v}} };
    const theme = { value:'mixed' };
    const count = { textContent:'23' };
    let replacements = 0;
    const sends = [];
    const teacherHeaderInfo = {
      hidden:false,
      dataset:{roomCode:'ABCD'},
      querySelector(sel) {
        return sel === '#cards-to-win' ? slider :
          sel === '#theme-select' ? theme :
          sel === '#cards-range-value' ? count : null;
      },
      set innerHTML(v) { replacements++;this._html=v; },
      get innerHTML() { return this._html; }
    };
    const teacherHeaderActions = { hidden:false, innerHTML:'' };
    const document = { documentElement:{classList:{toggle(){}}}, activeElement:slider };
    let view = {role:'teacher', code:'ABCD', status:'lobby', cardsToWin:10,theme:'mixed'};
    const location = {host:'spot-sprint.onrender.com'};
    const THEME_META = { mixed:{label:'Mixed',icon:'✨'} };
    function escape(s){return s;}
    function teacherControls(){return '<button>Start</button>';}
    function toast(message){throw Error(message);}
    async function send(event,data){
      sends.push({event,data});
      return {ok:true,view:{...view,...data}};
    }
    function updateView(next){view=next;updateTeacherHeader();}
    function render(){updateTeacherHeader();}
    ${code}
    sliderEditing=true;
    updateTeacherHeader();
    if (replacements!==0) throw Error('Active slider was replaced by update');
    if (slider.value!=='23') throw Error('Slider reset during a drag');
    queuedSettings={cardsToWin:23, theme:'mixed'};
    return flushGameSettings().then(()=>{
      if (replacements!==0) throw Error('Slider replaced during save');
      if (sends.length!==1 || sends[0].data.cardsToWin!==23)
        throw Error('Released value was not saved');
      if (view.cardsToWin!==23 || sliderEditing || settingsSavePending)
        throw Error('Slider failed to settle after save');
      return true;
    });
  `);
  assert.equal(await simulation(),true);
});
