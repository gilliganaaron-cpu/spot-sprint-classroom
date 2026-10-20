'use strict';
// BOLTSS terminology: NSW Education, BOLTSS and scale.
// Heritage locations: UNESCO World Heritage List. Illustrations are bundled SVGs.
const questions=[];
function add(topic,prompt,answer,wrong,explanation,image){questions.push({id:'explore-'+questions.length,topic,prompt,answer,wrong,explanation:explanation||answer+' is the correct answer.',...(image?{image}:{})});}
const elements=[['B','Border','A line enclosing the map'],['O','Orientation','A north arrow or compass directions'],['L','Legend','An explanation of symbols and colours'],['T','Title','A heading explaining what the map shows'],['first S','Scale','The relationship between map and real distances'],['second S','Source','Where the map information came from']];
for(const [letter,name,meaning] of elements){const others=elements.filter(x=>x[1]!==name).slice(0,3).map(x=>x[1]);add('boltss',`In BOLTSS, what does the ${letter} stand for?`,name,others,`${name}: ${meaning.toLowerCase()}.`);add('boltss',`Which BOLTSS feature provides this: ${meaning.toLowerCase()}?`,name,others,`${name} is the BOLTSS feature that provides this information.`);}
const skills=[
['You see a blue triangle on a map. Which BOLTSS feature explains it?','Legend','Title|Border|Source'],
['You want to know who collected the map data. Which feature helps?','Source','Orientation|Border|Scale'],
['Your map has no clue which direction is north. What is missing?','Orientation','Legend|Title|Source'],
['Which BOLTSS feature helps you estimate the length of a journey?','Scale','Source|Border|Title'],
['Which title best describes a map of Australian rainfall?','Average annual rainfall in Australia','My favourite map|The world|Australia is big'],
['Why should a map include its data source?','So readers can check where the information came from','So the map looks colourful|To replace the scale|To show north'],
['What does a scale of 1:100,000 mean?','1 cm on the map represents 1 km on the ground','1 cm represents 100 km|1 cm represents 100 m|1 cm represents 10 km'],
['A map scale shows 1 cm = 2 km. Two places are 4 cm apart. How far apart are they?','8 km','2 km|4 km|6 km'],
['If 2 cm on a map represents 10 km, what does 1 cm represent?','5 km','2 km|10 km|20 km'],
['A map is enlarged on a photocopier. Which scale remains useful if enlarged with it?','A graphic scale bar','An unchanged written ratio|The map title alone|The source alone'],
['Which list gives BOLTSS in the correct order?','Border, Orientation, Legend, Title, Scale, Source','Border, Ocean, Latitude, Title, Size, South|Border, Orientation, Location, Time, Scale, Source|Border, Outline, Legend, Title, Source, Season'],
['A map has a border, title, legend, scale and source. What is missing?','Orientation','Population|Photographs|Temperature'],
['Which item belongs in a map legend?','A railway symbol and its meaning','Only the map creator’s name|Only a north arrow|Only a page number'],
['What should a useful map title tell you?','The place and subject shown','Only the author’s favourite colour|Only the paper size|Only the compass direction'],
['A map uses the same symbol for a hospital and a school. What needs improving?','The symbols and legend','The border thickness only|The date only|The north arrow only'],
['You draw a map from council traffic data. Where should you acknowledge the council?','Source','Scale|Orientation|Border'],
['On a north-up map, which side is west?','Left','Right|Top|Bottom'],
['You travel southeast. Which two main directions are you moving between?','South and east','South and west|North and east|North and west']
];for(const [p,a,w] of skills)add('boltss',p,a,w.split('|'));
const landmarks=[
['Eiffel Tower','France','An iron tower in Paris','eiffel'],
['Taj Mahal','India','A white marble mausoleum in Agra'],
['Petra','Jordan','An ancient city with buildings carved into rose-coloured rock'],
['Machu Picchu','Peru','An Inca site high in the Andes'],
['Great Wall','China','A famous historic system of walls and fortifications'],
['Colosseum','Italy','An ancient amphitheatre in Rome'],
['Pyramids of Giza','Egypt','Ancient pyramids near Cairo','pyramids'],
['Sydney Opera House','Australia','A harbour-side performing arts building with shell-shaped roofs','opera'],
['Angkor Wat','Cambodia','A huge temple complex near Siem Reap'],
['Stonehenge','United Kingdom','A prehistoric stone circle in southern England'],
['Chichén Itzá','Mexico','A Maya archaeological site on the Yucatán Peninsula'],
['Acropolis of Athens','Greece','A hilltop ancient site containing the Parthenon'],
['Borobudur','Indonesia','A vast Buddhist temple in central Java'],
['Statue of Liberty','United States','A statue holding a torch in New York Harbor'],
['Christ the Redeemer','Brazil','A statue with outstretched arms above Rio de Janeiro'],
['Sagrada Família','Spain','A basilica in Barcelona associated with Antoni Gaudí'],
['Great Barrier Reef','Australia','A vast coral reef system off Queensland'],
['Grand Canyon','United States','A deep canyon carved largely by the Colorado River'],
['Mount Fuji','Japan','A famous cone-shaped volcano on Honshu','fuji'],
['Mount Kilimanjaro','Tanzania','Africa’s highest mountain'],
['Uluru','Australia','A large sandstone formation in the Northern Territory'],
['Ha Long Bay','Vietnam','A bay famous for limestone islands and pillars'],
['Giant’s Causeway','United Kingdom','Interlocking basalt columns on the coast of Northern Ireland'],
['Salar de Uyuni','Bolivia','A vast salt flat high in the Andes'],
['Table Mountain','South Africa','A flat-topped mountain overlooking Cape Town'],
['Yellowstone National Park','United States','A national park known for geysers such as Old Faithful'],
['Serengeti National Park','Tanzania','A savanna park famous for migrating wildebeest'],
['Galápagos Islands','Ecuador','Pacific islands famous for distinctive wildlife'],
['Komodo National Park','Indonesia','An island park home to Komodo dragons'],
['The Twelve Apostles','Australia','Limestone sea stacks on Victoria’s coast']
];
const countries=[...new Set(landmarks.map(x=>x[1]))];
for(let i=0;i<landmarks.length;i++){const [name,country,clue,image]=landmarks[i];add('landmarks',`In which country would you find ${name}?`,country,countries.filter(c=>c!==country).filter((_,j)=>j%3===i%3).slice(0,3),`${name} is in ${country}. ${clue}.`,image);add('landmarks',`Which landmark fits this clue: ${clue.toLowerCase()}?`,name,[1,7,13].map(n=>landmarks[(i+n)%landmarks.length][0]),`${name} is in ${country}.`);}
const nature=[
['Victoria Falls lies on which river?','Zambezi','Nile|Amazon|Murray'],
['Victoria Falls is on the border of which two countries?','Zambia and Zimbabwe','Kenya and Tanzania|Egypt and Sudan|Peru and Brazil'],
['Mount Everest is part of which mountain range?','Himalayas','Andes|Alps|Rockies'],
['Mount Everest lies on the border of Nepal and which country?','China','India|Pakistan|Bhutan'],
['Iguazú Falls lies on the border of which two countries?','Argentina and Brazil','Chile and Peru|Mexico and Guatemala|Bolivia and Ecuador'],
['Which is a human-made landmark?','The Eiffel Tower','Uluru|Mount Fuji|The Grand Canyon'],
['Which is a natural landmark?','The Great Barrier Reef','The Taj Mahal|The Colosseum|The Sydney Opera House'],
['Which process helped form the Grand Canyon over millions of years?','River erosion','Building with concrete|Coral growth|Glacial ice covering Australia'],
['What kind of rock forms from cooled lava?','Igneous rock','Plastic|Wood|Coral'],
['What mainly forms coral reefs?','Colonies of tiny coral animals','Piles of sand only|Frozen seawater|Tree roots'],
['Why can heavy visitor traffic damage a natural landmark?','It can cause erosion and disturb wildlife','It always creates new habitats|It stops all weathering|It makes every species grow faster'],
['Why are many heritage places protected?','To conserve cultural or natural significance','To stop people learning about them|To remove their history|To make every site identical'],
['Which ocean surrounds the Galápagos Islands?','Pacific Ocean','Atlantic Ocean|Arctic Ocean|Indian Ocean'],
['The Andes run along which side of South America?','Western side','Eastern side|Northern coastline only|Southern coastline only'],
['The Sahara is mainly in which part of Africa?','North Africa','Southern Africa|Central Africa only|Madagascar'],
['Which country contains most of the Amazon rainforest?','Brazil','Canada|Egypt|Japan'],
['Which city is linked to the Golden Gate Bridge?','San Francisco','Rome|Paris|Bangkok'],
['Which city is linked to the Burj Khalifa?','Dubai','London|Tokyo|Cairo'],
['Which city is linked to the Leaning Tower?','Pisa','Venice|Madrid|Athens'],
['Which Australian state contains the Great Ocean Road?','Victoria','Queensland|Tasmania|Western Australia']
];for(const [p,a,w] of nature)add('landmarks',p,a,w.split('|'));
module.exports=questions;
