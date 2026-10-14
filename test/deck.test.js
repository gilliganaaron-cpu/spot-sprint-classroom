const test = require('node:test');
const assert = require('node:assert/strict');
const { DECK, SYMBOLS, getSharedSymbol } = require('../deck');

test('57 distinct cards with 8 unique symbols each', () => {
  assert.equal(DECK.length, 57);
  assert.equal(SYMBOLS.length, 57);
  for (const card of DECK) {
    assert.equal(card.length, 8);
    assert.equal(new Set(card).size, 8);
  }
  assert.equal(new Set(DECK.map(card => [...card].sort((a, b) => a - b).join(','))).size, 57);
});

test('every pair of distinct cards shares exactly one picture', () => {
  for (let a = 0; a < DECK.length; a++) {
    for (let b = a + 1; b < DECK.length; b++) {
      const matches = DECK[a].filter(x => DECK[b].includes(x));
      assert.equal(matches.length, 1, `cards ${a}, ${b}`);
      assert.equal(getSharedSymbol(a, b), matches[0]);
    }
  }
});
