const SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
const RANKS = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];

/**
 * Generates card decks dynamically based on total player count.
 * Creates 1 deck (54 cards: 52 standard + 2 Printed Jokers) for 2 players,
 * and 2 decks (108 cards: 104 standard + 4 Printed Jokers) for 3+ players.
 *
 * @param {number|string} [botCount=1] - Number of bots playing.
 * @returns {Array<{id: string, suit: string|null, rank: string|null, isJoker: boolean, displayName: string, group: number, isSelected: boolean}>}
 */
export function createDeck(botCount = 1) {
  let totalPlayers = parseInt(botCount) + 1;
  let numDecks = (totalPlayers > 2) ? 2 : 1;
  console.log('Generating ' + numDecks + ' deck(s) for ' + totalPlayers + ' players.');

  const deck = [];
  let cardCounter = 0;

  for (let d = 0; d < numDecks; d++) {
    // 52 standard cards per deck
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `card_${d}_${suit}_${rank}_${cardCounter++}`,
          suit,
          rank,
          isJoker: false,
          displayName: `${rank} of ${suit}`,
          group: 0,
          isSelected: false
        });
      }
    }

    // 2 Printed Jokers per deck
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: `card_joker_${d}_${cardCounter++}`,
        suit: null,
        rank: null,
        isJoker: true,
        displayName: 'Printed Joker',
        group: 0,
        isSelected: false
      });
    }
  }

  return deck;
}

/**
 * Shuffles a card deck using the Fisher-Yates shuffle algorithm.
 * Performs in-place mutation and returns the shuffled deck.
 *
 * @param {Array} deck - Array of card objects
 * @returns {Array} Shuffled array of card objects
 */
export function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
}

export default {
  createDeck,
  shuffleDeck
};
