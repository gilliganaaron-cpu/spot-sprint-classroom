'use strict';

// A finite projective plane of order seven. Every pair of different cards
// has exactly ONE common picture, like a mathematical matching deck.
const ORDER = 7;
const THEME_SYMBOLS = {
  mixed: [
    ['🐶', 'dog'], ['🐱', 'cat'], ['🦊', 'fox'], ['🐻', 'bear'],
    ['🐼', 'panda'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🦁', 'lion'],
    ['🐯', 'tiger'], ['🐮', 'cow'], ['🐷', 'pig'], ['🐔', 'chicken'],
    ['🐧', 'penguin'], ['🦉', 'owl'], ['🦋', 'butterfly'], ['🐝', 'bee'],
    ['🐢', 'turtle'], ['🐙', 'octopus'], ['🐬', 'dolphin'], ['🦀', 'crab'],
    ['🦄', 'unicorn'], ['🦕', 'dinosaur'], ['🌵', 'cactus'], ['🌻', 'sunflower'],
    ['🍎', 'apple'], ['🍌', 'banana'], ['🍇', 'grapes'], ['🍉', 'watermelon'],
    ['🍓', 'strawberry'], ['🍒', 'cherries'], ['🥑', 'avocado'], ['🥕', 'carrot'],
    ['🍕', 'pizza'], ['🍩', 'doughnut'], ['🍦', 'ice cream'], ['🎸', 'guitar'],
    ['🎺', 'trumpet'], ['🎧', 'headphones'], ['🎲', 'dice'], ['🎯', 'target'],
    ['🎨', 'paint palette'], ['🎁', 'present'], ['🚗', 'car'], ['🚀', 'rocket'],
    ['🚲', 'bicycle'], ['✈️', 'airplane'], ['🚁', 'helicopter'], ['⚓', 'anchor'],
    ['🏀', 'basketball'], ['⚽', 'soccer ball'], ['🏈', 'football'], ['🎾', 'tennis ball'],
    ['🏓', 'table tennis'], ['🏸', 'badminton'], ['🏆', 'trophy'], ['⭐', 'star'],
    ['🌈', 'rainbow']
  ],
  sports: [
    ["⚽", "soccer"],
    ["🏀", "basketball"],
    ["🏈", "football"],
    ["⚾", "baseball"],
    ["🥎", "softball"],
    ["🎾", "tennis"],
    ["🏐", "volleyball"],
    ["🏉", "rugby ball"],
    ["🥏", "frisbee"],
    ["🎱", "eight ball"],
    ["🪀", "yo-yo"],
    ["🏓", "table tennis"],
    ["🏸", "badminton"],
    ["🥅", "goal net"],
    ["🏒", "ice hockey"],
    ["🏑", "field hockey"],
    ["🥍", "lacrosse"],
    ["🏏", "cricket"],
    ["🪃", "boomerang"],
    ["⛳", "golf flag"],
    ["🏹", "archery"],
    ["🎣", "fishing"],
    ["🥊", "boxing gloves"],
    ["🥋", "martial arts"],
    ["🎽", "running top"],
    ["🛹", "skateboard"],
    ["🛼", "roller skate"],
    ["🛷", "sled"],
    ["⛸", "ice skate"],
    ["🎿", "skis"],
    ["⛷", "skier"],
    ["🏂", "snowboarder"],
    ["🪂", "parachute"],
    ["🏋", "weightlifter"],
    ["🤸", "gymnast"],
    ["🤼", "wrestlers"],
    ["🤺", "fencer"],
    ["🤾", "handball"],
    ["🏌", "golfer"],
    ["🏇", "horse racing"],
    ["🏄", "surfer"],
    ["🚣", "rowboat"],
    ["🏊", "swimmer"],
    ["🚴", "cyclist"],
    ["🚵", "mountain biker"],
    ["🏆", "trophy"],
    ["🥇", "gold medal"],
    ["🥈", "silver medal"],
    ["🥉", "bronze medal"],
    ["🏅", "sports medal"],
    ["🎖", "award medal"],
    ["🏟", "stadium"],
    ["🎯", "bullseye"],
    ["🚲", "bicycle"],
    ["🛶", "canoe"],
    ["⛵", "sailboat"],
    ["🧗", "climber"]
  ],
  animals: [
    ["🐶", "dog"],
    ["🐱", "cat"],
    ["🦊", "fox"],
    ["🐻", "bear"],
    ["🐼", "panda"],
    ["🐸", "frog"],
    ["🐵", "monkey"],
    ["🦁", "lion"],
    ["🐯", "tiger"],
    ["🐮", "cow"],
    ["🐷", "pig"],
    ["🐔", "chicken"],
    ["🐧", "penguin"],
    ["🦉", "owl"],
    ["🦋", "butterfly"],
    ["🐝", "bee"],
    ["🐢", "turtle"],
    ["🐙", "octopus"],
    ["🐬", "dolphin"],
    ["🦀", "crab"],
    ["🐰", "rabbit"],
    ["🐨", "koala"],
    ["🦌", "deer"],
    ["🐴", "horse"],
    ["🐑", "sheep"],
    ["🐐", "goat"],
    ["🦆", "duck"],
    ["🦢", "swan"],
    ["🦅", "eagle"],
    ["🦚", "peacock"],
    ["🦈", "shark"],
    ["🐳", "whale"],
    ["🦭", "seal"],
    ["🦞", "lobster"],
    ["🐌", "snail"],
    ["🐜", "ant"],
    ["🐞", "ladybug"],
    ["🕷", "spider"],
    ["🐪", "camel"],
    ["🦓", "zebra"],
    ["🦒", "giraffe"],
    ["🐘", "elephant"],
    ["🦏", "rhino"],
    ["🦛", "hippo"],
    ["🦔", "hedgehog"],
    ["🦝", "raccoon"],
    ["🦦", "otter"],
    ["🦜", "parrot"],
    ["🐓", "rooster"],
    ["🦙", "llama"],
    ["🐿", "squirrel"],
    ["🦇", "bat"],
    ["🐊", "crocodile"],
    ["🦎", "lizard"],
    ["🐹", "hamster"],
    ["🫎", "moose"],
    ["🦫", "beaver"]
  ],
  emojis: [
    ["😀", "grinning face"],
    ["😃", "smiling face"],
    ["😄", "big smile"],
    ["😁", "beaming face"],
    ["😆", "laughing face"],
    ["😅", "nervous laugh"],
    ["🤣", "rolling laughter"],
    ["😂", "tears of joy"],
    ["🙂", "slight smile"],
    ["🙃", "upside-down smile"],
    ["😉", "wink"],
    ["😊", "blush"],
    ["😇", "angel"],
    ["🥰", "hearts around face"],
    ["😍", "heart eyes"],
    ["🤩", "star struck"],
    ["😘", "blowing kiss"],
    ["😋", "yummy"],
    ["😛", "tongue out"],
    ["😜", "winking tongue"],
    ["🤪", "silly face"],
    ["😎", "cool face"],
    ["🤓", "nerd face"],
    ["🧐", "curious face"],
    ["🤔", "thinking"],
    ["🤨", "raised eyebrow"],
    ["😐", "neutral face"],
    ["😑", "flat expression"],
    ["😶", "speechless"],
    ["😏", "smirk"],
    ["😒", "unimpressed"],
    ["🙄", "eye roll"],
    ["😬", "grimace"],
    ["😮", "surprised"],
    ["😲", "astonished"],
    ["😳", "embarrassed"],
    ["🥺", "puppy eyes"],
    ["😢", "sad tear"],
    ["😭", "crying loudly"],
    ["😤", "frustrated"],
    ["😠", "angry"],
    ["😡", "furious"],
    ["🤯", "mind blown"],
    ["😱", "screaming"],
    ["😨", "scared"],
    ["😰", "anxious sweat"],
    ["😴", "sleepy"],
    ["🥱", "yawning"],
    ["🤤", "drooling"],
    ["😵", "dizzy"],
    ["🥳", "party face"],
    ["🤠", "cowboy"],
    ["👻", "ghost"],
    ["👽", "alien face"],
    ["🤖", "robot face"],
    ["💀", "skull"],
    ["😈", "smiling devil"]
  ],
  festive: [
    [
        "🎄",
        "Christmas tree"
    ],
    [
        "🎅",
        "Santa Claus"
    ],
    [
        "🤶",
        "Mrs Claus"
    ],
    [
        "🎁",
        "wrapped present"
    ],
    [
        "🦌",
        "reindeer"
    ],
    [
        "🔔",
        "Christmas bell"
    ],
    [
        "⭐",
        "gold star"
    ],
    [
        "⛄",
        "snowman"
    ],
    [
        "❄",
        "snowflake"
    ],
    [
        "🧣",
        "winter scarf"
    ],
    [
        "🧤",
        "winter gloves"
    ],
    [
        "🧦",
        "Christmas stocking"
    ],
    [
        "🕯",
        "candle"
    ],
    [
        "🍪",
        "cookie"
    ],
    [
        "🥛",
        "glass of milk"
    ],
    [
        "🛷",
        "sleigh"
    ],
    [
        "🎀",
        "gift ribbon"
    ],
    [
        "🪄",
        "magic wand"
    ],
    [
        "🍬",
        "candy"
    ],
    [
        "🐰",
        "Easter bunny"
    ],
    [
        "🐇",
        "rabbit"
    ],
    [
        "🥚",
        "Easter egg"
    ],
    [
        "🐣",
        "hatching chick"
    ],
    [
        "🐤",
        "baby chick"
    ],
    [
        "🌷",
        "tulip"
    ],
    [
        "🌼",
        "daisy"
    ],
    [
        "🌸",
        "pink blossom"
    ],
    [
        "🪺",
        "nest with eggs"
    ],
    [
        "🧺",
        "Easter basket"
    ],
    [
        "🍫",
        "chocolate"
    ],
    [
        "🍭",
        "lollipop"
    ],
    [
        "🦋",
        "butterfly"
    ],
    [
        "🐝",
        "bee"
    ],
    [
        "🌱",
        "spring seedling"
    ],
    [
        "🥕",
        "carrot"
    ],
    [
        "🌈",
        "rainbow"
    ],
    [
        "🐑",
        "spring lamb"
    ],
    [
        "🐦",
        "blue bird"
    ],
    [
        "🎃",
        "jack-o-lantern"
    ],
    [
        "👻",
        "ghost"
    ],
    [
        "🧙",
        "witch"
    ],
    [
        "🦇",
        "bat"
    ],
    [
        "🕷",
        "spider"
    ],
    [
        "🕸",
        "spider web"
    ],
    [
        "🧛",
        "vampire"
    ],
    [
        "🧟",
        "zombie"
    ],
    [
        "💀",
        "skull"
    ],
    [
        "☠",
        "skull and crossbones"
    ],
    [
        "🪦",
        "grave stone"
    ],
    [
        "🐈",
        "cat"
    ],
    [
        "🧹",
        "witch broom"
    ],
    [
        "🔮",
        "crystal ball"
    ],
    [
        "⚰",
        "coffin"
    ],
    [
        "🌙",
        "crescent moon"
    ],
    [
        "🧪",
        "potion bottle"
    ],
    [
        "🦂",
        "scorpion"
    ],
    [
        "🪲",
        "beetle"
    ]
],
  scifi: [
    ["🚀", "rocket"],
    ["🛸", "flying saucer"],
    ["🤖", "robot"],
    ["👽", "alien"],
    ["🪐", "ringed planet"],
    ["🌟", "glowing star"],
    ["🌕", "full moon"],
    ["🌒", "crescent moon"],
    ["☀", "sun"],
    ["☄", "comet"],
    ["🌌", "milky way"],
    ["🌠", "shooting star"],
    ["⭐", "star"],
    ["✨", "sparkles"],
    ["💫", "dizzy stars"],
    ["⚡", "lightning"],
    ["🔮", "crystal ball"],
    ["🔋", "energy battery"],
    ["🛰", "satellite"],
    ["📡", "dish antenna"],
    ["🔭", "telescope"],
    ["🧬", "dna helix"],
    ["⚛", "atom"],
    ["🧲", "magnet"],
    ["🧪", "test tube"],
    ["🧫", "petri dish"],
    ["🧯", "extinguisher"],
    ["🛡", "shield"],
    ["🔦", "flashlight"],
    ["💡", "light bulb"],
    ["🔬", "microscope"],
    ["🦾", "robotic arm"],
    ["🦿", "robotic leg"],
    ["🖥", "monitor"],
    ["⌨", "keyboard"],
    ["🎮", "controller"],
    ["💻", "laptop"],
    ["🕹", "joystick"],
    ["🎛", "control knobs"],
    ["🎚", "volume slider"],
    ["🪄", "magic wand"],
    ["🌈", "rainbow"],
    ["🌀", "vortex"],
    ["💎", "crystal"],
    ["🧿", "blue amulet"],
    ["🪞", "mirror"],
    ["⏳", "hourglass"],
    ["⌛", "sand timer"],
    ["⏰", "alarm"],
    ["⌚", "watch"],
    ["📟", "pager"],
    ["📱", "device"],
    ["☎", "phone"],
    ["🔌", "plug"],
    ["🧰", "toolkit"],
    ["🛠", "tools"],
    ["🚁", "helicopter"]
  ],
};
const SYMBOLS = THEME_SYMBOLS.mixed;
const point = (x, y) => x * ORDER + y;
const infinitySlope = m => ORDER * ORDER + m;
const infinityVertical = ORDER * ORDER + ORDER;
const DECK = [];
for (let slope = 0; slope < ORDER; slope++) {
  for (let intercept = 0; intercept < ORDER; intercept++) {
    const card = [];
    for (let x = 0; x < ORDER; x++) card.push(point(x, (slope * x + intercept) % ORDER));
    card.push(infinitySlope(slope));
    DECK.push(card);
  }
}
for (let x = 0; x < ORDER; x++) {
  const card = [];
  for (let y = 0; y < ORDER; y++) card.push(point(x, y));
  card.push(infinityVertical);
  DECK.push(card);
}
const infinityCard = [];
for (let slope = 0; slope < ORDER; slope++) infinityCard.push(infinitySlope(slope));
infinityCard.push(infinityVertical);
DECK.push(infinityCard);
function getSharedSymbol(id1, id2) {
  if (id1 === id2) return null;
  const inSecond = new Set(DECK[id2]);
  return DECK[id1].find(symbol => inSecond.has(symbol));
}
function symbolsForTheme(theme) { return THEME_SYMBOLS[theme] || THEME_SYMBOLS.mixed; }
module.exports = { ORDER, SYMBOLS, THEME_SYMBOLS, symbolsForTheme, DECK, getSharedSymbol };
