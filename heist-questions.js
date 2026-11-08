'use strict';
// Practice geography with decisions, rather than just recalling place names.
const result=[];
function add(topic,prompt,answer,wrong,explanation){result.push({id:'field-'+result.length,topic,prompt,answer,wrong,explanation});}
const directions=['north','northeast','east','southeast','south','southwest','west','northwest'];
for(const [i,from] of directions.entries())for(const turn of [2,-2,4]){
 const j=(i+turn+8)%8;
 add('navigation',`You face ${from} and turn ${turn===4?'half a turn':turn>0?'a quarter turn clockwise':'a quarter turn anticlockwise'}. Which way do you face?`,directions[j],[1,3,5].map(n=>directions[(j+n)%8]),'A quarter turn is 90°; a half turn is 180°.');
}
for(const scale of [2,4,5,8,10,20])for(const length of [3,6,9]){
 const distance=scale*length;
 add('fieldwork',`A walking route measures ${length} cm on a map. Each centimetre stands for ${scale} km. How long is the route?`,distance+' km',[distance/2,distance*2,distance+1].map(n=>n+' km'),`${length} × ${scale} = ${distance} km.`);
}
for(const [topic,prompt,answer,b,c,d,explanation] of [
 ['interconnections','A shirt is sewn overseas and shipped to Adelaide. Which link does this show?','International trade','River erosion','Urban heat','Plate movement','Goods connect producers and consumers across borders.'],
 ['interconnections','A flood closes the only bridge to a town. Which change is most immediate?','Deliveries take longer','Latitude changes','The climate zone moves','The time zone changes','Transport links affect how easily people and goods can reach a place.'],
 ['interconnections','Which pair of places would you connect to trace food miles?','Farm and consumer','Equator and pole','Source and tributary','Summit and snowline','Food miles measure how far food travels to reach consumers.'],
 ['interconnections','Which is an example of a service being traded internationally?','An overseas designer creates a school logo','A farmer sells wheat next door','A port loads steel','A mine ships copper','Design work is a service rather than a physical good.'],
 ['fieldwork','Which survey best compares pedestrian traffic at two bus stops?','Count for the same time at both','Count only the busier stop','Count cars at one stop','Use different weekdays and durations','Keeping the method consistent makes the counts comparable.'],
 ['fieldwork','Which is primary data for your beach study?','Your own beach-width measurements','A textbook diagram','A published tourism report','A downloaded census table','Primary data is collected first-hand for the investigation.'],
 ['fieldwork','Which map would best help plan a hike with a gentle climb?','Topographic map','Time-zone map','Electoral map','Language map','Contour lines show changes in elevation.'],
 ['fieldwork','Which chart best shows how rainfall changes month by month?','A time-series chart','A street directory','A compass rose','A population pyramid','A time series places observations in chronological order.'],
 ['fieldwork','Which detail is essential when comparing two rainfall maps?','Whether their legends use the same ranges','Whether their titles use the same font','Whether both use blue borders','Whether their sheets weigh the same','The same colour can mean different amounts on different legends.'],
 ['coasts','A dune fence keeps walkers on a path. What is it protecting?','Plants that hold sand in place','The tide timetable','Offshore water pressure','The depth of the ocean basin','Dune plants help stabilise sand with their roots.'],
 ['coasts','Why might sediment build up behind a dam?','Slower water deposits what it carries','Water stops evaporating','Gravity becomes weaker','Salt turns into gravel','Slower water can carry less sediment.'],
 ['biomes','Why does clearing vegetation on a steep slope increase erosion?','Fewer roots hold the soil','The slope loses gravity','The latitude shifts','Rain becomes saltier','Roots help bind soil and vegetation slows runoff.'],
 ['biomes','Which strategy would most directly reconnect two isolated habitat patches?','Plant a wildlife corridor','Build a wider fence','Drain the wetland','Remove roadside trees','A corridor helps organisms move between habitat patches.'],
 ['settlements','Why is building on a floodplain a planning trade-off?','Flat land can be useful but can flood','Flat land has no soil','Rivers always flow uphill','Floodplains are never fertile','Floodplains offer usable land but can be inundated when rivers rise.'],
 ['settlements','A city replaces a paved yard with a rain garden. What will it usually reduce?','Surface runoff','Day length','Latitude','Distance from the sea','Water can soak into planted soil rather than immediately running off paving.'],
 ['mapping','Two villages share a latitude. What do they have in common?','Angular distance north or south of the Equator','Elevation','Local rainfall','Population density','Latitude measures position north or south of the Equator.']
])add(topic,prompt,answer,[b,c,d],explanation);
module.exports=result;
