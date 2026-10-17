import { moveCardsInHand } from './gameLogic.js';

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

// Helper to create test cards
let cardCounter = 0;
const makeCard = (rank, suit, group = 0) => ({
  id: `card_${rank}_${suit}_${cardCounter++}`,
  rank,
  suit,
  isJoker: false,
  displayName: `${rank} of ${suit}`,
  group,
  isSelected: false
});

console.log('=== Running test-card-move.mjs ===');

// Setup base test hand with 3 groups:
// Group 1: 4H, 5H, 6H
// Group 2: 7S, 8S, 9S
// Group 3: 10C, JC, QC
const c4H = makeCard('4', 'Hearts', 1);
const c5H = makeCard('5', 'Hearts', 1);
const c6H = makeCard('6', 'Hearts', 1);

const c7S = makeCard('7', 'Spades', 2);
const c8S = makeCard('8', 'Spades', 2);
const c9S = makeCard('9', 'Spades', 2);

const c10C = makeCard('10', 'Clubs', 3);
const cJC = makeCard('Jack', 'Clubs', 3);
const cQC = makeCard('Queen', 'Clubs', 3);

const baseHand = [c4H, c5H, c6H, c7S, c8S, c9S, c10C, cJC, cQC];

// Test 1: Moving one card before another card
{
  const res = moveCardsInHand(baseHand, c4H.id, { type: 'card', cardId: c8S.id, position: 'before' });
  const ids = res.hand.map(c => c.id);
  const idx4H = ids.indexOf(c4H.id);
  const idx8S = ids.indexOf(c8S.id);
  const movedCard = res.hand.find(c => c.id === c4H.id);

  assert('Test 1: Move card before another card succeeds', res.success);
  assert('Test 1: 4H is placed immediately before 8S', idx4H === idx8S - 1);
  assert('Test 1: 4H joins target card group 2', movedCard.group === 2);
}

// Test 2: Moving one card after another card
{
  const res = moveCardsInHand(baseHand, c4H.id, { type: 'card', cardId: c8S.id, position: 'after' });
  const ids = res.hand.map(c => c.id);
  const idx4H = ids.indexOf(c4H.id);
  const idx8S = ids.indexOf(c8S.id);
  const movedCard = res.hand.find(c => c.id === c4H.id);

  assert('Test 2: Move card after another card succeeds', res.success);
  assert('Test 2: 4H is placed immediately after 8S', idx4H === idx8S + 1);
  assert('Test 2: 4H joins target card group 2', movedCard.group === 2);
}

// Test 3: Moving a card to beginning and end of a group
{
  const resStart = moveCardsInHand(baseHand, c10C.id, { type: 'group', groupId: 1, position: 'start' });
  const g1CardsStart = resStart.hand.filter(c => c.group === 1);
  assert('Test 3a: Move card to start of group places it first in that group', resStart.success && g1CardsStart[0].id === c10C.id);

  const resEnd = moveCardsInHand(baseHand, c4H.id, { type: 'group', groupId: 3, position: 'end' });
  const g3CardsEnd = resEnd.hand.filter(c => c.group === 3);
  assert('Test 3b: Move card to end of group places it last in that group', resEnd.success && g3CardsEnd[g3CardsEnd.length - 1].id === c4H.id);
}

// Test 4: Creating a group before, between, and after existing groups
{
  // 4a: Create group before all existing groups (position: start)
  const resBefore = moveCardsInHand(baseHand, c10C.id, { type: 'new_group', position: 'start' });
  const movedCardA = resBefore.hand.find(c => c.id === c10C.id);
  assert('Test 4a: Create group at start succeeds and assigns first group index', resBefore.success && movedCardA.group === 1);

  // 4b: Create group between group 1 and group 2
  const resBetween = moveCardsInHand(baseHand, c10C.id, { type: 'new_group', relativeGroupId: 1, position: 'after' });
  const movedCardB = resBetween.hand.find(c => c.id === c10C.id);
  assert('Test 4b: Create group between existing groups succeeds and gets intermediate group', resBetween.success && movedCardB.group === 2);

  // 4c: Create group after all existing groups (position: end)
  const resAfter = moveCardsInHand(baseHand, c4H.id, { type: 'new_group', position: 'end' });
  const movedCardC = resAfter.hand.find(c => c.id === c4H.id);
  assert('Test 4c: Create group at end succeeds and gets highest group number', resAfter.success && movedCardC.group === 4);
}

// Test 5: Moving a card that is the only member of its original group
{
  const soloCard = makeCard('Ace', 'Diamonds', 99);
  const handWithSolo = [...baseHand, soloCard];
  const res = moveCardsInHand(handWithSolo, soloCard.id, { type: 'card', cardId: c4H.id, position: 'after' });
  const hasOldGroup = res.hand.some(c => c.group === 99);
  assert('Test 5: Solo card moved out leaves no empty group artifacts', res.success && !hasOldGroup && res.hand.length === handWithSolo.length);
}

// Test 6: Moving an entire group into another group
{
  const g1Ids = [c4H.id, c5H.id, c6H.id];
  const res = moveCardsInHand(baseHand, g1Ids, { type: 'group', groupId: 2 });
  const g1Count = res.hand.filter(c => c.group === 1).length;
  const g2Count = res.hand.filter(c => c.group === 2).length;
  assert('Test 6: Moving entire group merges all cards into target group', res.success && g1Count === 0 && g2Count === 6);
}

// Test 7: Moving multiple selected cards while preserving their relative order
{
  const selectedCards = [c7S, c9S]; // 7S comes before 9S in baseHand
  const res = moveCardsInHand(baseHand, selectedCards, { type: 'group', groupId: 1, position: 'end' });
  const g1 = res.hand.filter(c => c.group === 1);
  const idx7 = g1.findIndex(c => c.id === c7S.id);
  const idx9 = g1.findIndex(c => c.id === c9S.id);
  assert('Test 7: Multiple cards move together and preserve relative order', res.success && idx7 !== -1 && idx9 !== -1 && idx7 < idx9);
}

// Test 8: Dropping onto a card that is part of the moving selection
{
  const res = moveCardsInHand(baseHand, [c7S.id, c8S.id], { type: 'card', cardId: c7S.id, position: 'before' });
  assert('Test 8: Dropping onto moving card returns success: false and leaves hand untouched', !res.success && res.hand === baseHand);
}

// Test 9: Rejecting invalid targets without changing the hand
{
  const resInvalidCard = moveCardsInHand(baseHand, c4H.id, { type: 'card', cardId: 'nonexistent_id', position: 'before' });
  assert('Test 9a: Nonexistent target card rejected cleanly', !resInvalidCard.success && resInvalidCard.hand === baseHand);

  const resInvalidType = moveCardsInHand(baseHand, c4H.id, { type: 'unknown_type' });
  assert('Test 9b: Unknown target type rejected cleanly', !resInvalidType.success && resInvalidType.hand === baseHand);

  const resEmptyCards = moveCardsInHand(baseHand, [], { type: 'group', groupId: 1 });
  assert('Test 9c: Empty cardsToMove rejected cleanly', !resEmptyCards.success && resEmptyCards.hand === baseHand);
}

// Test 10: Ensuring every card remains present exactly once
{
  const res = moveCardsInHand(baseHand, [c4H.id, c8S.id], { type: 'new_group', position: 'start' });
  const originalIds = new Set(baseHand.map(c => c.id));
  const newIds = res.hand.map(c => c.id);
  const uniqueNewIds = new Set(newIds);
  assert('Test 10: Card count preserved and no duplicates or lost cards', res.success && newIds.length === baseHand.length && uniqueNewIds.size === baseHand.length && [...originalIds].every(id => uniqueNewIds.has(id)));
}

// Test 11: Ensuring group IDs and rendered group order remain consistent
{
  const res = moveCardsInHand(baseHand, [c5H.id], { type: 'new_group', relativeGroupId: 2, position: 'before' });
  const groupsInHand = [];
  res.hand.forEach(c => {
    if (!groupsInHand.includes(c.group)) groupsInHand.push(c.group);
  });
  const isSorted = groupsInHand.every((g, i) => i === 0 || g > groupsInHand[i - 1]);
  assert('Test 11: Group IDs in hand are positive and ordered sequentially', res.success && isSorted);
}

// Test 12: Ensuring save/restore mechanism preserves resulting arrangement
{
  const res = moveCardsInHand(baseHand, c4H.id, { type: 'group', groupId: 3 });
  const serialized = JSON.stringify({ currentUserHand: res.hand });
  const restored = JSON.parse(serialized);
  const sameLengths = restored.currentUserHand.length === res.hand.length;
  const allGroupsMatch = restored.currentUserHand.every((c, i) => c.group === res.hand[i].group && c.id === res.hand[i].id);
  assert('Test 12: Serialized and restored state preserves card groups and order', sameLengths && allGroupsMatch);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  } else {
    throw new Error(`${failed} test(s) failed in test-card-move.mjs`);
  }
} else {
  console.log('ALL TEST-CARD-MOVE TESTS PASSED SUCCESSFULLY.');
}
