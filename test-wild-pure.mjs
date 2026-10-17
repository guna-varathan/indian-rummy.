import {
  isPureSequence,
  isPrintedJoker,
  findWinningGrouping,
  autoGroupHand,
  validateFullRummyHand
} from './gameLogic.js';

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`PASS: ${desc}`);
    passed++;
  } else {
    console.error(`FAIL: ${desc}`);
    failed++;
  }
}

let cardCounter = 0;
const c = (rank, suit) => ({
  id: `card_${rank}_${suit}_${cardCounter++}`,
  rank,
  suit,
  isJoker: false,
  displayName: `${rank} of ${suit}`,
  group: 0,
  isSelected: false
});

const makePrintedJoker = () => ({
  id: `joker_${cardCounter++}`,
  rank: null,
  suit: null,
  isJoker: true,
  displayName: 'Printed Joker',
  group: 0,
  isSelected: false
});

console.log('=== Running test-wild-pure.mjs ===');

// a) isPureSequence([6♦,7♦,8♦], '7') === true
{
  const seq = [c('6', 'Diamonds'), c('7', 'Diamonds'), c('8', 'Diamonds')];
  assert("a) isPureSequence([6♦,7♦,8♦], '7') === true", isPureSequence(seq, '7') === true);
}

// b) isPureSequence([6♦,7♦,8♦], 'Ace') === true, and still false if any card is a Printed Joker
{
  const seq = [c('6', 'Diamonds'), c('7', 'Diamonds'), c('8', 'Diamonds')];
  assert("b1) isPureSequence([6♦,7♦,8♦], 'Ace') === true", isPureSequence(seq, 'Ace') === true);

  const seqWithPrinted = [c('6', 'Diamonds'), makePrintedJoker(), c('8', 'Diamonds')];
  assert("b2) isPureSequence([6♦,PrintedJoker,8♦], '7') === false", isPureSequence(seqWithPrinted, '7') === false);
  assert("b3) isPureSequence([6♦,PrintedJoker,8♦], 'Ace') === false", isPureSequence(seqWithPrinted, 'Ace') === false);
}

// c) isPureSequence([6♦,7♥,8♦], '7') === false (different suit)
{
  const diffSuit = [c('6', 'Diamonds'), c('7', 'Hearts'), c('8', 'Diamonds')];
  assert("c) isPureSequence([6♦,7♥,8♦], '7') === false (different suit)", isPureSequence(diffSuit, '7') === false);
}

// d) Screenshot hand with wild = '7' must be a valid winning hand:
// 7♠ 6♥ 8♥ 9♥ | 6♠ 8♠ PrintedJoker | 4♣ 5♣ 7♣ | 6♦ 7♦ 8♦
// autoGroupHand(...) must give pureSeqCount >= 1, totalSeqCount >= 2, unmatchedCards.length === 0.
// Also check findWinningGrouping returns a non-null result.
{
  const hand = [
    // Group 1 (impure hearts, 7♠ is wild joker): 7♠ 6♥ 8♥ 9♥
    c('7', 'Spades'), c('6', 'Hearts'), c('8', 'Hearts'), c('9', 'Hearts'),
    // Group 2 (impure spades, PrintedJoker is joker): 6♠ 8♠ PrintedJoker
    c('6', 'Spades'), c('8', 'Spades'), makePrintedJoker(),
    // Group 3 (impure clubs, 7♣ is wild joker): 4♣ 5♣ 7♣
    c('4', 'Clubs'), c('5', 'Clubs'), c('7', 'Clubs'),
    // Group 4 (pure diamonds, 7♦ is natural card in sequence): 6♦ 7♦ 8♦
    c('6', 'Diamonds'), c('7', 'Diamonds'), c('8', 'Diamonds')
  ];

  const grouped = autoGroupHand(hand, '7');
  assert("d1) Screenshot hand has unmatchedCards.length === 0", grouped && grouped.unmatchedCards.length === 0);
  assert("d2) Screenshot hand has pureSeqCount >= 1", grouped && grouped.pureSeqCount >= 1);
  assert("d3) Screenshot hand has totalSeqCount >= 2", grouped && grouped.totalSeqCount >= 2);

  const winGroup = findWinningGrouping(hand, '7');
  assert("d4) findWinningGrouping returns non-null for screenshot hand", winGroup !== null);
  if (winGroup) {
    assert("d5) validateFullRummyHand validates the winning groups", validateFullRummyHand(winGroup, '7') === true);
  }
}

// e) A hand with no natural pure sequence (only impure with jokers) must still be rejected.
{
  // 3 impure sequences + 1 set, using jokers to bridge all sequences:
  // - Impure Hearts: 4♥, 6♥, 7♠ (wild joker 7♠ as 5♥)
  // - Impure Spades: 2♠, 4♠, PrintedJoker (PrintedJoker as 3♠)
  // - Impure Clubs: 9♣, J♣, 7♣ (wild joker 7♣ as 10♣)
  // - Set: K♠, K♦, K♣, 7♦ (wild joker 7♦ as 4th King)
  // No suit contains 3 consecutive natural cards, so there are 0 pure sequences.
  const handNoPure = [
    c('4', 'Hearts'), c('6', 'Hearts'), c('7', 'Spades'),
    c('2', 'Spades'), c('4', 'Spades'), makePrintedJoker(),
    c('9', 'Clubs'), c('Jack', 'Clubs'), c('7', 'Clubs'),
    c('King', 'Spades'), c('King', 'Diamonds'), c('King', 'Clubs'), c('7', 'Diamonds')
  ];

  const groupedNoPure = autoGroupHand(handNoPure, '7');
  assert("e1) Hand with no pure sequence has pureSeqCount === 0", groupedNoPure && groupedNoPure.pureSeqCount === 0);

  const winGroupNoPure = findWinningGrouping(handNoPure, '7');
  assert("e2) findWinningGrouping returns null when no pure sequence exists", winGroupNoPure === null);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  } else {
    throw new Error(`${failed} test(s) failed in test-wild-pure.mjs`);
  }
} else {
  console.log('ALL TEST-WILD-PURE TESTS PASSED SUCCESSFULLY.');
}
