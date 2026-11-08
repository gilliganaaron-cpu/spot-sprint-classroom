// Country facts retain their ODbL attribution in data/COUNTRY-DATA-LICENSE.txt.
const {bare,choices}=require('./currency-names');
module.exports=[...require('./data/jump-question-bank.json').map(q=>{if(!/currenc(?:y|ies)/i.test(q.prompt))return q;const answer=bare(q.answer);return {...q,answer,wrong:choices(answer,q.wrong)};}),...require('./jump-extra-questions'),...require('./jump-landmark-questions'),...require('./heist-questions')];
