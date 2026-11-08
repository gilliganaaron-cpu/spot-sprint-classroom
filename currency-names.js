'use strict';
const tails=new Set('dollar kina yen yuan rupee rupiah baht đồng tögrög riyal tenge rial won euro pound krone krona złoty peso quetzal balboa lempira córdoba real sol boliviano bolívar rand shilling naira dirham dinar ariary birr franc kwanza'.split(' '));
function bare(value){const token=value.toLowerCase().split(' ').find(t=>tails.has(t));if(!token)throw Error('Unknown currency: '+value);return token[0].toUpperCase()+token.slice(1);}
function choices(answer,wrong){return [...new Set([...wrong.map(bare),'Baht','Yen','Euro','Real','Peso','Dinar'])].filter(v=>v!==answer).slice(0,3);}
module.exports={bare,choices};
