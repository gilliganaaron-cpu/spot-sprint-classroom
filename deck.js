'use strict';

// A finite projective plane of order seven. Every pair of different cards
// has exactly ONE common picture, like a mathematical matching deck.
const ORDER = 7;
const SYMBOLS = [
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
];

const point = (x, y) => x * ORDER + y;
const infinitySlope = m => ORDER * ORDER + m;
const infinityVertical = ORDER * ORDER + ORDER;
const DECK = [];

for (let slope = 0; slope < ORDER; slope++) {
  for (let intercept = 0; intercept < ORDER; intercept++) {
    const card = [];
    for (let x = 0; x < ORDER; x++) {
      card.push(point(x, (slope * x + intercept) % ORDER));
    }
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
  if (id1 === id2) return null; // An identical card would have eight matches.
  const inSecond = new Set(DECK[id2]);
  return DECK[id1].find(symbol => inSecond.has(symbol));
}

module.exports = { ORDER, SYMBOLS, DECK, getSharedSymbol };
