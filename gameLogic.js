/**
 * Game logic module for Indian Rummy.
 * Handles card dealing and wildcard open joker selection.
 */

/**
 * Deals 13 cards to each player by popping from the deck.
 * Ensures the deck contains sufficient cards for all players.
 *
 * @param {Array} deck - The card deck array.
 * @param {number} numPlayers - Total number of players (user + bots).
 * @returns {{ hands: Array<Array>, remainingDeck: Array }} An object containing the player hands and the remaining deck.
 */
export function dealCards(deck, numPlayers) {
  const neededCards = (numPlayers * 13) + 1;
  while (deck.length < neededCards) {
    const clone = deck.map(c => ({ ...c }));
    deck.unshift(...clone);
  }

  const hands = [];

  for (let p = 0; p < numPlayers; p++) {
    const hand = [];
    for (let i = 0; i < 13; i++) {
      if (deck.length > 0) {
        const card = deck.pop();
        if (!card.id) {
          card.id = `card_dealt_${p}_${i}_${Math.random().toString(36).substr(2, 6)}`;
        }
        card.group = 0;
        card.isSelected = false;
        hand.push(card);
      }
    }
    hands.push(hand);
  }

  return {
    hands,
    remainingDeck: deck
  };
}

/**
 * Pops one card from the deck to serve as the Open Joker.
 *
 * @param {Array} deck - The remaining card deck.
 * @returns {Object|null} The popped card object serving as the open joker.
 */
export function getOpenJoker(deck) {
  if (!deck || deck.length === 0) {
    return null;
  }
  return deck.pop();
}

// Numeric rank ordering for sequence validation (Ace=1, Jack=11, Queen=12, King=13)
const rankValues = {
  Ace: 1,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  Jack: 11,
  Queen: 12,
  King: 13
};

/**
 * Determines the Wild Joker rank for the game based on the Open Joker.
 * In Indian Rummy, if the Open Joker is a Printed Joker (or has no rank),
 * 'Ace' becomes the Wild Joker for the game. Otherwise, openJoker.rank is used.
 *
 * @param {Object|string|null} openJoker - The open joker card object or rank string
 * @returns {string|null} The rank string of the wild joker (e.g., 'Ace', '7', etc.)
 */
export function getWildJokerRank(openJoker) {
  if (!openJoker) return null;
  if (typeof openJoker === 'string') return openJoker;
  if (openJoker.isJoker || openJoker.displayName === 'Printed Joker' || !openJoker.rank) {
    return 'Ace';
  }
  return openJoker.rank;
}

/**
 * Determines whether a card is considered a Joker (printed joker or matches wild joker rank).
 *
 * @param {Object} card - Card object to test
 * @param {Object|string|null} wildJokerRank - Wild joker rank or open joker card object
 * @returns {boolean} True if card acts as a joker, false otherwise
 */
export function isJokerCard(card, wildJokerRank) {
  if (!card) return false;
  if (card.isJoker || card.displayName === 'Printed Joker') return true;
  const wildRank = getWildJokerRank(wildJokerRank);
  if (wildRank) {
    if (card.rank === wildRank) return true;
    if (wildRank === 'Ace' && card.rank === 'A') return true;
    if (wildRank === 'A' && card.rank === 'Ace') return true;
  }
  return false;
}

/**
 * Validates whether a group of cards forms a valid Pure Sequence in Indian Rummy.
 * Rules:
 * a. groupOfCards.length must be >= 3.
 * b. All cards must have the exact same suit.
 * c. None of the cards can be a Joker (neither printed nor wild joker rank).
 * d. None of the cards can have the wild joker rank (cannot use wild joker as a wild card here).
 * e. The cards must be consecutive in rank. Sort them by rank (A=1, J=11, Q=12, K=13) or high Ace (Q-K-A).
 *
 * @param {Array} groupOfCards - Array of card objects in the group.
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object.
 * @returns {boolean} True if the group is a valid pure sequence, false otherwise.
 */
export function isPureSequence(groupOfCards, wildJokerRank) {
  if (!Array.isArray(groupOfCards) || groupOfCards.length < 3) {
    return false;
  }

  const wildRank = getWildJokerRank(wildJokerRank);

  // c. None of the cards can be a Joker. Also ensure valid card objects.
  for (const card of groupOfCards) {
    if (!card || card.isJoker || card.displayName === 'Printed Joker' || !card.suit || !card.rank) {
      return false;
    }
    // d. None of the cards can have the wild joker rank
    if (wildRank) {
      if (card.rank === wildRank) return false;
      if (wildRank === 'Ace' && card.rank === 'A') return false;
      if (wildRank === 'A' && card.rank === 'Ace') return false;
    }
  }

  // b. All cards must have the exact same suit.
  const firstSuit = groupOfCards[0].suit;
  const allSameSuit = groupOfCards.every(card => card.suit === firstSuit);
  if (!allSameSuit) {
    return false;
  }

  // e. The cards must be consecutive in rank. Sort them by rank.
  const numericRanks = groupOfCards.map(card => rankValues[card.rank]);
  if (numericRanks.some(val => typeof val !== 'number' || isNaN(val))) {
    return false;
  }

  numericRanks.sort((a, b) => a - b);

  // Check low Ace consecutive: sorted[i] + 1 === sorted[i+1]
  let isConsecutiveLow = true;
  for (let i = 0; i < numericRanks.length - 1; i++) {
    if (numericRanks[i] + 1 !== numericRanks[i + 1]) {
      isConsecutiveLow = false;
      break;
    }
  }
  if (isConsecutiveLow) return true;

  // Check high Ace consecutive (A as 14, e.g. Q-K-A or 10-J-Q-K-A)
  if (numericRanks.includes(1)) {
    const highRanks = numericRanks.map(r => (r === 1 ? 14 : r)).sort((a, b) => a - b);
    let isConsecutiveHigh = true;
    for (let i = 0; i < highRanks.length - 1; i++) {
      if (highRanks[i] + 1 !== highRanks[i + 1]) {
        isConsecutiveHigh = false;
        break;
      }
    }
    if (isConsecutiveHigh) return true;
  }

  return false;
}

/**
 * Validates whether a group of cards forms a valid Impure Sequence in Indian Rummy.
 * Rules:
 * a. group.length must be >= 3.
 * b. Uses at least 1 joker (printed joker or card matching wild joker rank).
 * c. Has at least 1 natural card to define the sequence suit.
 * d. All natural cards have the same suit and unique ranks.
 * e. Natural cards can be bridged/extended by jokers into a consecutive sequence.
 *
 * @param {Array} group - Array of card objects
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object
 * @returns {boolean} True if the group is a valid impure sequence, false otherwise
 */
export function isImpureSequence(group, wildJokerRank) {
  if (!Array.isArray(group) || group.length < 3) {
    return false;
  }

  const wildRank = getWildJokerRank(wildJokerRank);
  const jokers = group.filter(c => isJokerCard(c, wildRank));
  const naturalCards = group.filter(c => !isJokerCard(c, wildRank));

  if (jokers.length === 0) return false;
  if (naturalCards.length === 0) return false;

  const firstSuit = naturalCards[0].suit;
  if (!firstSuit || !naturalCards.every(c => c && c.suit === firstSuit)) {
    return false;
  }

  const naturalRanks = naturalCards.map(c => rankValues[c.rank]);
  if (naturalRanks.some(r => typeof r !== 'number' || isNaN(r))) {
    return false;
  }
  if (new Set(naturalRanks).size !== naturalRanks.length) {
    return false;
  }

  const k = naturalRanks.length;
  const J = jokers.length;
  const groupLen = group.length;

  if (k === 1) {
    return groupLen <= 13;
  }

  function checkFit(ranks, maxRank) {
    const sortedR = [...ranks].sort((a, b) => a - b);
    const rMin = sortedR[0];
    const rMax = sortedR[sortedR.length - 1];
    const span = rMax - rMin + 1;
    if (span > groupLen) return false;
    const missing = span - k;
    if (J < missing) return false;
    const extra = J - missing;
    const availSpan = Math.min(maxRank, rMax + extra) - Math.max(1, rMin - extra) + 1;
    return availSpan >= groupLen;
  }

  if (checkFit(naturalRanks, 13)) {
    return true;
  }

  if (naturalRanks.includes(1) || naturalRanks.some(r => r >= 10)) {
    const highRanks = naturalRanks.map(r => (r === 1 ? 14 : r));
    if (checkFit(highRanks, 14)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates whether a group of cards forms a valid Set in Indian Rummy.
 * Rules:
 * a. group.length must be 3 or 4 cards.
 * b. Natural cards must all have the same rank.
 * c. Natural cards must all have different suits (no duplicate suits).
 * d. Jokers (printed or wild matching wild joker rank) can substitute for missing cards.
 *
 * @param {Array} group - Array of card objects
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object
 * @returns {boolean} True if the group is a valid set, false otherwise
 */
export function isSet(group, wildJokerRank) {
  if (!Array.isArray(group) || group.length < 3 || group.length > 4) {
    return false;
  }

  const wildRank = getWildJokerRank(wildJokerRank);
  const naturalCards = group.filter(c => !isJokerCard(c, wildRank));
  if (naturalCards.length === 0) {
    return false;
  }

  const targetRank = naturalCards[0].rank;
  if (!targetRank || !naturalCards.every(c => c && c.rank === targetRank)) {
    return false;
  }

  const suits = new Set(naturalCards.map(c => c.suit));
  if (suits.size !== naturalCards.length) {
    return false;
  }

  return true;
}

/**
 * Validates whether an array of grouped cards constitutes a full 13-card winning hand in Indian Rummy.
 * Rules:
 * a. Total cards across all groups must be exactly 13.
 * b. ALL cards must be part of a valid set or sequence.
 * c. Must contain at least 1 Pure Sequence.
 * d. Must contain at least 2 total Sequences (pure or impure).
 *
 * @param {Array<Array>} groups - Array of card groups
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object
 * @returns {boolean} True if the hand is a valid 13-card win, false otherwise
 */
export function validateFullRummyHand(groups, wildJokerRank) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return false;
  }

  const wildRank = getWildJokerRank(wildJokerRank);
  const totalCards = groups.reduce((acc, g) => acc + (Array.isArray(g) ? g.length : 0), 0);
  if (totalCards !== 13) {
    return false;
  }

  let pureSeqCount = 0;
  let totalSeqCount = 0;

  for (const group of groups) {
    if (!Array.isArray(group) || group.length < 3) {
      return false;
    }

    if (isPureSequence(group, wildRank)) {
      pureSeqCount++;
      totalSeqCount++;
    } else if (isImpureSequence(group, wildRank)) {
      totalSeqCount++;
    } else if (isSet(group, wildRank)) {
      // Valid set
    } else {
      return false;
    }
  }

  return (pureSeqCount >= 1 && totalSeqCount >= 2);
}

/**
 * Generates all k-combinations of an array.
 *
 * @param {Array} arr - Source array
 * @param {number} k - Combination size
 * @returns {Array<Array>}
 */
export function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  if (k === arr.length) return [arr.slice()];

  const result = [];
  function backtrack(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * Attempts to logically partition 13 cards into valid sets and sequences using
 * a greedy approach (pure sequences first, then impure sequences, then sets).
 *
 * @param {Array} cards13 - Array of 13 card objects
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object
 * @returns {Array<Array>|null} Array of 3 or 4 valid groups if a win is found, or null
 */
export function findWinningGrouping(cards13, wildJokerRank, timeBudgetMs = Infinity) {
  if (!Array.isArray(cards13) || cards13.length !== 13) {
    return null;
  }

  const wildRank = getWildJokerRank(wildJokerRank);
  const deadline = performance.now() + timeBudgetMs;
  const suits = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
  const candidatePureSeqs = [];

  for (const suit of suits) {
    const suitCards = cards13.filter(c => c && !isJokerCard(c, wildRank) && c.suit === suit && c.rank);
    if (suitCards.length < 3) continue;

    for (const sz of [5, 4, 3]) {
      const combs = getCombinations(suitCards, sz);
      for (const comb of combs) {
        if (isPureSequence(comb, wildRank)) {
          candidatePureSeqs.push(comb);
        }
      }
    }
  }

  if (candidatePureSeqs.length === 0) {
    return null;
  }

  function isValidGroup(grp) {
    return isSet(grp, wildRank) || isPureSequence(grp, wildRank) || isImpureSequence(grp, wildRank);
  }

  for (const p1 of candidatePureSeqs) {
    if (performance.now() > deadline) return null;
    const r1 = cards13.filter(c => !p1.includes(c));

    for (const sz of [5, 4, 3]) {
      const seqCombs = getCombinations(r1, sz);
      for (const s2 of seqCombs) {
        if (performance.now() > deadline) return null;
        if (!isPureSequence(s2, wildRank) && !isImpureSequence(s2, wildRank)) {
          continue;
        }

        const r2 = r1.filter(c => !s2.includes(c));
        const remLen = r2.length;

        if (remLen === 6) {
          const g3Combs = getCombinations(r2, 3);
          for (const g3 of g3Combs) {
            const g4 = r2.filter(c => !g3.includes(c));
            if (isValidGroup(g3) && isValidGroup(g4)) {
              const groups = [p1, s2, g3, g4];
              if (validateFullRummyHand(groups, wildRank)) {
                return groups;
              }
            }
          }
        } else if (remLen === 7) {
          const g3Combs = getCombinations(r2, 3);
          for (const g3 of g3Combs) {
            const g4 = r2.filter(c => !g3.includes(c));
            if (isValidGroup(g3) && isValidGroup(g4)) {
              const groups = [p1, s2, g3, g4];
              if (validateFullRummyHand(groups, wildRank)) {
                return groups;
              }
            }
          }
        } else if (remLen === 3 || remLen === 4) {
          if (isValidGroup(r2)) {
            const groups = [p1, s2, r2];
            if (validateFullRummyHand(groups, wildRank)) {
              return groups;
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Smart greedy auto-grouping algorithm for Indian Rummy hands.
 * Analyzes the cards to extract the best combinations:
 * a) Finds all possible Pure Sequences.
 * b) Finds Impure Sequences (using wildcards/printed jokers).
 * c) Finds Sets.
 *
 * @param {Array} hand - Array of 13 card objects
 * @param {Object|string|null} wildJokerRank - The wild joker rank or open joker card object
 * @returns {{ pureSeqCount: number, totalSeqCount: number, unmatchedCards: Array, matchedGroups: Array }}
 */
export function autoGroupHand(hand, wildJokerRank, timeBudgetMs = Infinity) {
  const wildRank = getWildJokerRank(wildJokerRank);
  const greedyDeadline = performance.now() + Math.min(timeBudgetMs, 300);

  if (!Array.isArray(hand) || hand.length === 0) {
    return {
      pureSeqCount: 0,
      totalSeqCount: 0,
      unmatchedCards: [],
      matchedGroups: []
    };
  }

  // 1. If 13 cards form a 100% complete winning hand, use findWinningGrouping
  if (hand.length === 13) {
    const winningGroups = findWinningGrouping(hand, wildRank, timeBudgetMs);
    if (winningGroups && validateFullRummyHand(winningGroups, wildRank)) {
      const pureSeqCount = winningGroups.filter(g => isPureSequence(g, wildRank)).length;
      const totalSeqCount = winningGroups.filter(g => isPureSequence(g, wildRank) || isImpureSequence(g, wildRank)).length;
      return {
        pureSeqCount,
        totalSeqCount,
        unmatchedCards: [],
        matchedGroups: winningGroups
      };
    }
  }

  // 2. Greedy combination extraction
  // a) Find candidate Pure Sequences
  const suits = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
  const candidatePure = [];
  for (const suit of suits) {
    const suitCards = hand.filter(c => c && !isJokerCard(c, wildRank) && c.suit === suit && c.rank);
    if (suitCards.length < 3) continue;
    for (const sz of [5, 4, 3]) {
      if (suitCards.length >= sz) {
        const combs = getCombinations(suitCards, sz);
        for (const comb of combs) {
          if (isPureSequence(comb, wildRank)) {
            candidatePure.push(comb);
          }
        }
      }
    }
  }

  // Enumerate disjoint pure sequence sets
  const disjointPureSets = [[]];
  function getPureDisjoint(startIdx, current, used) {
    if (current.length > 0) {
      disjointPureSets.push(current);
    }
    for (let i = startIdx; i < candidatePure.length; i++) {
      if (performance.now() > greedyDeadline) break;
      const cand = candidatePure[i];
      const overlap = cand.some(c => used.has(c));
      if (!overlap) {
        const nextUsed = new Set(used);
        cand.forEach(c => nextUsed.add(c));
        getPureDisjoint(i + 1, [...current, cand], nextUsed);
      }
    }
  }
  getPureDisjoint(0, [], new Set());

  let bestResult = null;
  let bestScore = -Infinity;

  for (const pureSet of disjointPureSets) {
    if (bestResult && performance.now() > greedyDeadline) break;
    const usedPure = new Set(pureSet.flat());
    const rem1 = hand.filter(c => !usedPure.has(c));

    // b) Find candidate Impure Sequences from rem1
    const candidateImpure = [];
    for (const sz of [5, 4, 3]) {
      if (rem1.length >= sz) {
        const combs = getCombinations(rem1, sz);
        for (const comb of combs) {
          if (isImpureSequence(comb, wildRank)) {
            candidateImpure.push(comb);
          }
        }
      }
    }

    // Enumerate disjoint impure sequence sets
    const disjointImpureSets = [[]];
    function getImpureDisjoint(startIdx, current, used) {
      if (current.length > 0) {
        disjointImpureSets.push(current);
      }
      for (let i = startIdx; i < candidateImpure.length; i++) {
        if (performance.now() > greedyDeadline) break;
        const cand = candidateImpure[i];
        const overlap = cand.some(c => used.has(c));
        if (!overlap) {
          const nextUsed = new Set(used);
          cand.forEach(c => nextUsed.add(c));
          getImpureDisjoint(i + 1, [...current, cand], nextUsed);
        }
      }
    }
    getImpureDisjoint(0, [], new Set());

    for (const impureSet of disjointImpureSets) {
      if (bestResult && performance.now() > greedyDeadline) break;
      const usedImpure = new Set(impureSet.flat());
      const rem2 = rem1.filter(c => !usedImpure.has(c));

      // c) Find candidate Sets from rem2
      const candidateSets = [];
      for (const sz of [4, 3]) {
        if (rem2.length >= sz) {
          const combs = getCombinations(rem2, sz);
          for (const comb of combs) {
            if (isSet(comb, wildRank)) {
              candidateSets.push(comb);
            }
          }
        }
      }

      // Enumerate disjoint sets
      const disjointSets = [[]];
      function getSetsDisjoint(startIdx, current, used) {
        if (current.length > 0) {
          disjointSets.push(current);
        }
        for (let i = startIdx; i < candidateSets.length; i++) {
          if (performance.now() > greedyDeadline) break;
          const cand = candidateSets[i];
          const overlap = cand.some(c => used.has(c));
          if (!overlap) {
            const nextUsed = new Set(used);
            cand.forEach(c => nextUsed.add(c));
            getSetsDisjoint(i + 1, [...current, cand], nextUsed);
          }
        }
      }
      getSetsDisjoint(0, [], new Set());

      for (const sSet of disjointSets) {
        if (bestResult && performance.now() > greedyDeadline) break;
        const usedSets = new Set(sSet.flat());
        const unmatched = rem2.filter(c => !usedSets.has(c));
        const matchedGroups = [...pureSet, ...impureSet, ...sSet];
        const pureCount = pureSet.length;
        const totalSeqCount = pureSet.length + impureSet.length;

        let score = 0;
        if (unmatched.length === 0 && pureCount >= 1 && totalSeqCount >= 2) {
          score += 100000;
        }
        if (pureCount >= 1) score += 10000;
        if (totalSeqCount >= 2) score += 5000;
        score += pureCount * 500;
        score += totalSeqCount * 200;
        score += sSet.length * 100;
        score -= unmatched.length * 10;

        if (score > bestScore) {
          bestScore = score;
          bestResult = {
            pureSeqCount: pureCount,
            totalSeqCount,
            unmatchedCards: unmatched,
            matchedGroups
          };
        }
      }
    }
  }

  return bestResult || {
    pureSeqCount: 0,
    totalSeqCount: 0,
    unmatchedCards: [...hand],
    matchedGroups: []
  };
}

/**
 * Finds the largest group of non-overlapping Pure Sequences in a hand.
 * Only natural cards are used, so it is fast and never gives a false "yes".
 *
 * @param {Array} hand - Player's cards (13 or 14).
 * @param {Object|string|null} wildJokerRank - Wild joker rank or open joker card.
 * @returns {Array<Array>} Array of pure sequence groups (empty array if none).
 */
export function findPureSequences(hand, wildJokerRank) {
  if (!Array.isArray(hand)) return [];
  const wildRank = getWildJokerRank(wildJokerRank);
  const candidates = [];

  for (const suit of ['Spades', 'Hearts', 'Clubs', 'Diamonds']) {
    const suitCards = hand.filter(c => c && !isJokerCard(c, wildRank) && c.suit === suit && c.rank);
    for (const sz of [5, 4, 3]) {
      if (suitCards.length < sz) continue;
      for (const comb of getCombinations(suitCards, sz)) {
        if (isPureSequence(comb, wildRank)) candidates.push(comb);
      }
    }
  }

  let best = [];
  const deadline = performance.now() + 50;
  function pick(start, chosen, used) {
    if (chosen.length > best.length) best = chosen;
    for (let i = start; i < candidates.length; i++) {
      if (performance.now() > deadline) return;
      const cand = candidates[i];
      if (cand.some(c => used.has(c))) continue;
      const nextUsed = new Set(used);
      cand.forEach(c => nextUsed.add(c));
      pick(i + 1, [...chosen, cand], nextUsed);
    }
  }
  pick(0, [], new Set());
  return best;
}

/**
 * For a 14-card hand (right after drawing): looks for a card to throw so that
 * the other 13 cards form a valid winning hand. Uses the same validator as Declare.
 * Returns null if no such card exists, or if the time budget runs out
 * (the player can still press Declare manually, which is always exact).
 *
 * @param {Array} hand14 - The 14 cards in the player's hand.
 * @param {Object|string|null} wildJokerRank - Wild joker rank or open joker card.
 * @param {number} [timeBudgetMs=400] - Maximum search time.
 * @returns {{ finishCard: Object, groups: Array<Array> }|null}
 */
export function findDeclareOption(hand14, wildJokerRank, timeBudgetMs = 400) {
  if (!Array.isArray(hand14) || hand14.length !== 14) return null;
  const wildRank = getWildJokerRank(wildJokerRank);
  const deadline = performance.now() + timeBudgetMs;

  // Try normal cards first, jokers last (nobody wants to throw a joker to win)
  const order = hand14.map((_, i) => i).sort((a, b) =>
    (isJokerCard(hand14[a], wildRank) ? 1 : 0) - (isJokerCard(hand14[b], wildRank) ? 1 : 0)
  );

  const tried = new Set();
  for (const i of order) {
    const card = hand14[i];
    const key = card.isJoker ? 'joker' : card.suit + '-' + card.rank;
    if (tried.has(key)) continue;
    tried.add(key);

    const remaining = hand14.filter((_, idx) => idx !== i);
    const left = deadline - performance.now();
    if (left <= 0) return null;

    const groups = findWinningGrouping(remaining, wildRank, left);
    if (groups && validateFullRummyHand(groups, wildRank)) {
      return { finishCard: card, groups };
    }
  }
  return null;
}

/**
 * Moves one or more cards within a player's hand to a target position or group.
 * Pure function: does not perform any DOM operations.
 *
 * @param {Array<Object>} hand - The full hand array of card objects.
 * @param {Array<string>|Array<Object>|string|Object} cardsToMove - Card IDs or card objects to move.
 * @param {Object} target - Target drop specification:
 *    - { type: 'card', cardId: string, position: 'before'|'after' }
 *    - { type: 'group', groupId: number|string, position?: 'start'|'end' }
 *    - { type: 'new_group', relativeGroupId?: number|string, position: 'before'|'after'|'start'|'end' }
 * @returns {{ success: boolean, hand: Array<Object>, movedCardIds: string[], targetGroupId: number|null }}
 */
export function moveCardsInHand(hand, cardsToMove, target) {
  if (!Array.isArray(hand) || hand.length === 0 || !cardsToMove || !target || !target.type) {
    return { success: false, hand: hand || [], movedCardIds: [], targetGroupId: null };
  }

  // Normalize cardsToMove to an array of card IDs
  const rawList = Array.isArray(cardsToMove) ? cardsToMove : [cardsToMove];
  const moveIds = rawList.map(c => (typeof c === 'string' ? c : c?.id)).filter(Boolean);

  if (moveIds.length === 0) {
    return { success: false, hand, movedCardIds: [], targetGroupId: null };
  }

  // Verify all moveIds exist in hand
  const movingCards = hand.filter(c => moveIds.includes(c.id));
  if (movingCards.length !== moveIds.length) {
    return { success: false, hand, movedCardIds: [], targetGroupId: null };
  }

  const remainingCards = hand.filter(c => !moveIds.includes(c.id));

  // Build sorted distinct group order of existing cards
  const existingGroupIds = [];
  hand.forEach(c => {
    const g = typeof c.group === 'number' ? c.group : 0;
    if (!existingGroupIds.includes(g)) existingGroupIds.push(g);
  });
  existingGroupIds.sort((a, b) => Number(a) - Number(b));

  let newHand = [];
  let targetGroupId = null;

  if (target.type === 'card') {
    const targetCardId = target.cardId;
    // Reject dropping onto one of the cards being moved
    if (moveIds.includes(targetCardId)) {
      return { success: false, hand, movedCardIds: [], targetGroupId: null };
    }

    const targetIdx = remainingCards.findIndex(c => c.id === targetCardId);
    if (targetIdx === -1) {
      return { success: false, hand, movedCardIds: [], targetGroupId: null };
    }

    const targetCard = remainingCards[targetIdx];
    targetGroupId = typeof targetCard.group === 'number' ? targetCard.group : 0;

    // Update moving cards' group
    const updatedMoving = movingCards.map(c => ({ ...c, group: targetGroupId }));

    const insertIdx = target.position === 'after' ? targetIdx + 1 : targetIdx;
    newHand = [
      ...remainingCards.slice(0, insertIdx),
      ...updatedMoving,
      ...remainingCards.slice(insertIdx)
    ];
  } else if (target.type === 'group') {
    targetGroupId = Number(target.groupId);
    if (isNaN(targetGroupId)) {
      return { success: false, hand, movedCardIds: [], targetGroupId: null };
    }

    const updatedMoving = movingCards.map(c => ({ ...c, group: targetGroupId }));
    const groupCardIndices = [];
    remainingCards.forEach((c, idx) => {
      if (c.group === targetGroupId) groupCardIndices.push(idx);
    });

    if (groupCardIndices.length === 0) {
      // Group only had the moving cards or is a new group with specified ID
      newHand = [...remainingCards, ...updatedMoving];
    } else if (target.position === 'start') {
      const firstIdx = groupCardIndices[0];
      newHand = [
        ...remainingCards.slice(0, firstIdx),
        ...updatedMoving,
        ...remainingCards.slice(firstIdx)
      ];
    } else {
      // Default 'end'
      const lastIdx = groupCardIndices[groupCardIndices.length - 1];
      newHand = [
        ...remainingCards.slice(0, lastIdx + 1),
        ...updatedMoving,
        ...remainingCards.slice(lastIdx + 1)
      ];
    }
  } else if (target.type === 'new_group') {
    // Collect remaining groups in sorted order
    const remainingGroupIds = [];
    remainingCards.forEach(c => {
      const g = typeof c.group === 'number' ? c.group : 0;
      if (!remainingGroupIds.includes(g)) remainingGroupIds.push(g);
    });
    remainingGroupIds.sort((a, b) => Number(a) - Number(b));

    // Determine target group position relative to remaining groups
    let newGroupIndex = remainingGroupIds.length; // default 'end'
    if (target.position === 'start') {
      newGroupIndex = 0;
    } else if (target.relativeGroupId !== undefined) {
      // Works even when the reference group disappeared because the moved card was its only card
      const relId = Number(target.relativeGroupId);
      if (!isNaN(relId)) {
        newGroupIndex = remainingGroupIds.filter(id => (target.position === 'before' ? id < relId : id <= relId)).length;
      }
    }

    // Generate ordered group list with placeholder for new group
    const NEW_GROUP_TOKEN = '__NEW_GROUP__';
    const orderedGroupList = [
      ...remainingGroupIds.slice(0, newGroupIndex),
      NEW_GROUP_TOKEN,
      ...remainingGroupIds.slice(newGroupIndex)
    ];

    // Assign clean sequential integer group IDs (1, 2, 3...)
    const groupIdMap = new Map();
    orderedGroupList.forEach((token, idx) => {
      groupIdMap.set(token, idx + 1);
    });

    targetGroupId = groupIdMap.get(NEW_GROUP_TOKEN);
    const updatedMoving = movingCards.map(c => ({ ...c, group: targetGroupId }));

    // Re-index remaining cards and assemble newHand preserving group order
    const updatedRemaining = remainingCards.map(c => ({
      ...c,
      group: groupIdMap.get(c.group) ?? c.group
    }));

    // Find insertion index in updatedRemaining
    let insertIdx = updatedRemaining.length;
    if (newGroupIndex < remainingGroupIds.length) {
      const nextGroupId = groupIdMap.get(remainingGroupIds[newGroupIndex]);
      const nextCardIdx = updatedRemaining.findIndex(c => c.group === nextGroupId);
      if (nextCardIdx !== -1) insertIdx = nextCardIdx;
    }

    newHand = [
      ...updatedRemaining.slice(0, insertIdx),
      ...updatedMoving,
      ...updatedRemaining.slice(insertIdx)
    ];
  } else {
    return { success: false, hand, movedCardIds: [], targetGroupId: null };
  }

  // Safety integrity check: card count must match
  if (newHand.length !== hand.length) {
    return { success: false, hand, movedCardIds: [], targetGroupId: null };
  }

  return {
    success: true,
    hand: newHand,
    movedCardIds: movingCards.map(c => c.id),
    targetGroupId
  };
}

export default {
  dealCards,
  getOpenJoker,
  getWildJokerRank,
  isJokerCard,
  isPureSequence,
  isImpureSequence,
  isSet,
  validateFullRummyHand,
  findWinningGrouping,
  autoGroupHand,
  findPureSequences,
  findDeclareOption,
  moveCardsInHand
};

