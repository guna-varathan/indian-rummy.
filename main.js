import announce from './announcer.js';
import bots from './bots.js';
import { createDeck, shuffleDeck } from './deck.js';
import { dealCards, getOpenJoker, getWildJokerRank, isJokerCard, isPureSequence, isImpureSequence, isSet, validateFullRummyHand, findWinningGrouping, autoGroupHand, findPureSequences, findDeclareOption } from './gameLogic.js';

// User's dealt hand, bot hands, active bot names, and auto arrange toggle state
let currentUserHand = [];
let botHands = [];
let activeBotNames = [];
let autoArrangeState = 0;

// Turn system, open joker, wild joker rank, and deck states
let openDeck = [];
let closedDeck = [];
let currentOpenJoker = null;
let wildJokerRank = null;
window.wildJokerRank = null;
let isUserTurn = true;
let hasDrawnThisTurn = false;
let nextBotIndex = 0; // which bot plays next (needed to resume after a page reload)
let lastPureCount = 0;          // how many Pure Sequences the player had at the last check
let eligibleFinishCardId = null; // card to throw if the player can declare right now

// Bot turn timeouts for clean cancellation
let currentBotStepTimeout = null;
let currentBotNextTimeout = null;

function clearAllBotTimeouts() {
  if (currentBotStepTimeout) {
    clearTimeout(currentBotStepTimeout);
    currentBotStepTimeout = null;
  }
  if (currentBotNextTimeout) {
    clearTimeout(currentBotNextTimeout);
    currentBotNextTimeout = null;
  }
}

// ---------- Screen switching (replaces all manual style.display toggling) ----------
const SCREEN_IDS = {
  setup: 'setupScreen',
  loading: 'loadingScreen',
  game: 'gameBoard',
  gameover: 'gameOverScreen'
};

/**
 * Shows exactly one screen: 'setup' | 'loading' | 'game' | 'gameover'.
 * Any other name hides all of them.
 */
function setScreen(name) {
  Object.entries(SCREEN_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = (key !== name);
    el.style.display = ''; // clear any old inline display value
  });
  document.body.classList.toggle('in-game', name === 'game');
  if (name === 'game') requestAnimationFrame(fitHand);
  if (name === 'gameover') {
    const title = document.getElementById('gameOverTitle');
    if (title) title.focus();
  }
}

// ---------- Make the whole hand fit the screen width ----------
function fitHand() {
  const handEl = document.getElementById('playerHand');
  const board = document.getElementById('gameBoard');
  if (!handEl || !board || board.hidden) return;

  const cards = handEl.querySelectorAll('.card');
  const groups = handEl.querySelectorAll('.card-group');
  const N = cards.length;
  const G = groups.length;
  if (N === 0 || G === 0) return;

  const cardW = cards[0].offsetWidth;
  if (!cardW) return;

  const available = board.clientWidth - 24;
  const minPeek = cardW * 0.44; // rank and suit must stay readable
  const maxPeek = cardW * 0.6;
  let gap = 10;

  let peek = N > G ? (available - G * (cardW + 2 * gap)) / (N - G) : maxPeek;
  if (peek < minPeek) {
    peek = minPeek;
    const spare = available - peek * (N - G) - G * cardW;
    gap = Math.max(1, Math.min(10, spare / (2 * G)));
  }
  peek = Math.min(maxPeek, peek);

  handEl.style.setProperty('--peek', peek + 'px');
  handEl.style.setProperty('--group-gap', gap + 'px');
}

// ---------- Fullscreen + landscape lock (hides the browser bars = more room) ----------
async function enterImmersiveMode() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (err) {
    // Not supported or refused: the layout still works without it.
  }
}

// ---------- Portrait warning for screen reader users ----------
let wasPortrait = null;
function checkOrientation() {
  const portrait = window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 700;
  if (portrait && wasPortrait !== true && document.body.classList.contains('in-game')) {
    announce('Please rotate your phone to landscape mode to play.');
  }
  wasPortrait = portrait;
}

// ---------- One shared "draw" ending (the old code left the player stuck) ----------
function endGameInDraw() {
  clearAllBotTimeouts();
  isUserTurn = false;
  hasDrawnThisTurn = false;
  highlightActiveBot(-1);
  sessionStorage.removeItem('rummyState');

  const msg = 'No more cards can be drawn. The game has ended in a Draw.';
  const gameOverMsgEl = document.getElementById('gameOverMessage');
  if (gameOverMsgEl) gameOverMsgEl.innerText = msg;
  const gameOverCardsEl = document.getElementById('gameOverCards');
  if (gameOverCardsEl) gameOverCardsEl.innerHTML = '';

  setScreen('gameover');
  announce(msg);
}

// HTML entities for playing card suits
const suitEntities = {
  Hearts: '&hearts;',
  Diamonds: '&diams;',
  Spades: '&spades;',
  Clubs: '&clubs;'
};

// Suit ordering for auto-arranging
const suitOrder = {
  Spades: 1,
  Hearts: 2,
  Clubs: 3,
  Diamonds: 4
};

// Numeric rank ordering for auto-arranging (Ace=1, Jack=11, Queen=12, King=13)
const rankOrder = {
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

// Visual mapping for card ranks: displays face cards as single characters (A, K, Q, J)
const rankVisualMap = {
  Ace: 'A',
  King: 'K',
  Queen: 'Q',
  Jack: 'J',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2'
};

/**
 * Returns the inner HTML string for a card (.card-top-left and .card-center)
 * and applies the appropriate .red or .black color class to parentEl if provided.
 *
 * @param {Object} cardObj - The card data object
 * @param {HTMLElement} [parentEl=null] - Optional parent card element
 * @returns {string} The inner HTML string of the card
 */
function renderCardHTML(cardObj, parentEl = null) {
  if (!cardObj) return '';

  if (parentEl) {
    parentEl.classList.remove('red', 'black', 'red-suit', 'black-suit');
    if (cardObj.suit === 'Hearts' || cardObj.suit === 'Diamonds' || (cardObj.isJoker && !cardObj.suit)) {
      parentEl.classList.add('red', 'red-suit');
    } else {
      parentEl.classList.add('black', 'black-suit');
    }
  }

  if (cardObj.isJoker) {
    return `
      <span class="sr-only">${cardObj.displayName}</span>
      <div aria-hidden="true" class="card-top-left">★</div>
      <div aria-hidden="true" class="card-center">🃏</div>
    `;
  }

  const visualRank = rankVisualMap[cardObj.rank] || cardObj.rank;
  const suitSymbol = suitEntities[cardObj.suit] || '';

  return `
    <span class="sr-only">${cardObj.displayName}</span>
    <div aria-hidden="true" class="card-top-left">${visualRank}</div>
    <div aria-hidden="true" class="card-center">${suitSymbol}</div>
  `;
}

/**
 * Renders the final cards to #gameOverCards on the Game Over screen and returns
 * a comma-separated string of card display names for screen reader announcements.
 *
 * @param {Array} handArray - Array of card objects to render
 * @returns {string} Comma-separated card display names (e.g., 'Ace of Spades, 2 of Spades')
 */
function renderFinalCards(handArray) {
  const unmatchedCardsArray = arguments[1] || null;
  const gameOverCardsEl = document.getElementById('gameOverCards');
  if (gameOverCardsEl) {
    gameOverCardsEl.innerHTML = '';
  }

  let finalCards = [];
  if (Array.isArray(handArray) && handArray.length > 0 && Array.isArray(handArray[0])) {
    // Array of matched groups: assign group indices
    handArray.forEach((grp, idx) => {
      grp.forEach(c => { c.group = idx + 1; });
    });
    finalCards = handArray.flat();
    if (Array.isArray(unmatchedCardsArray) && unmatchedCardsArray.length > 0) {
      unmatchedCardsArray.forEach(c => { c.group = handArray.length + 1; });
      finalCards.push(...unmatchedCardsArray);
    }
  } else if (Array.isArray(handArray)) {
    finalCards = [...handArray];
    if (Array.isArray(unmatchedCardsArray) && unmatchedCardsArray.length > 0) {
      finalCards.push(...unmatchedCardsArray);
    }
  }

  if (finalCards.length === 0) {
    return '';
  }

  // Sort by group if defined, then by suit and rank for nice grouped presentation
  const sortedCards = [...finalCards].sort((a, b) => {
    const gA = typeof a.group === 'number' ? a.group : 0;
    const gB = typeof b.group === 'number' ? b.group : 0;
    if (gA !== gB) return gA - gB;
    const suitA = suitOrder[a.suit] ?? 99;
    const suitB = suitOrder[b.suit] ?? 99;
    if (suitA !== suitB) return suitA - suitB;
    const rankA = rankOrder[a.rank] ?? 0;
    const rankB = rankOrder[b.rank] ?? 0;
    return rankA - rankB;
  });

  const cardNames = [];
  let lastGroup = null;

  sortedCards.forEach(card => {
    if (!card) return;
    cardNames.push(card.displayName || 'Unknown Card');

    if (gameOverCardsEl) {
      const currentGroup = typeof card.group === 'number' ? card.group : 0;
      if (lastGroup !== null && currentGroup !== lastGroup) {
        const spacer = document.createElement('div');
        spacer.className = 'group-spacer';
        spacer.style.width = '24px';
        spacer.style.height = '1px';
        spacer.setAttribute('aria-hidden', 'true');
        gameOverCardsEl.appendChild(spacer);
      }
      lastGroup = currentGroup;

      const cardEl = document.createElement('div');
      cardEl.classList.add('card');
      if (card.id) {
        cardEl.dataset.cardId = card.id;
      }
      cardEl.innerHTML = renderCardHTML(card, cardEl);
      gameOverCardsEl.appendChild(cardEl);
    }
  });

  return cardNames.join(', ');
}

/**
 * Updates action buttons visibility based on card selection and turn state.
 *
 * @param {Array} hand - Player's hand
 */
function updateActionButtons(hand) {
  const arrangeBtn = document.getElementById('groupBtn');
  const discardBtn = document.getElementById('discardBtn');
  const declareBtn = document.getElementById('declareBtn');
  const selectedCards = hand ? hand.filter(c => c.isSelected) : [];

  if (arrangeBtn) {
    if (selectedCards.length >= 2 && isUserTurn) {
      arrangeBtn.style.display = 'block';
    } else {
      arrangeBtn.style.display = 'none';
    }
  }

  const showDiscardAndDeclare = (selectedCards.length === 1 && hasDrawnThisTurn && isUserTurn);

  if (discardBtn) {
    discardBtn.style.display = showDiscardAndDeclare ? 'block' : 'none';
  }
  if (declareBtn) {
    declareBtn.style.display = showDiscardAndDeclare ? 'block' : 'none';
  }
}

/**
 * Updates the table center display (Closed Deck and Open Deck cards).
 */
function updateTableCenter() {
  const closedDeckEl = document.getElementById('closedDeck');
  const openDeckEl = document.getElementById('openDeck');

  if (closedDeckEl) {
    closedDeckEl.setAttribute('aria-label', `Closed Deck (${closedDeck.length} cards remaining). Press to draw.`);
  }

  if (openDeckEl) {
    if (openDeck.length === 0) {
      openDeckEl.className = 'card';
      openDeckEl.setAttribute('aria-label', 'Open Deck is empty');
      openDeckEl.innerHTML = '<span class="sr-only">Open Deck is empty</span>';
    } else {
      const topCard = openDeck[openDeck.length - 1];
      openDeckEl.className = 'card';
      openDeckEl.setAttribute('aria-label', `Open Deck. Top card is ${topCard.displayName}. Press to draw.`);
      openDeckEl.innerHTML = renderCardHTML(topCard, openDeckEl);
    }
  }
}

/**
 * Standard Rummy rule: Reshuffles the open deck back into the closed deck
 * when the closed deck runs out of cards, keeping the top card on the open deck.
 */
function reshuffleOpenDeckToClosed() {
  if (closedDeck.length === 0 && openDeck.length > 1) {
    // a. Keep the top card of the openDeck
    const topCard = openDeck.pop();

    // b. Move all remaining cards from openDeck to closedDeck
    closedDeck = [...openDeck];
    openDeck = [];

    // c. Call shuffleDeck(closedDeck) to randomize them
    shuffleDeck(closedDeck);

    // d. Put the topCard back into openDeck
    openDeck.push(topCard);

    // e. Call announce('Closed deck was empty. Open deck has been reshuffled into a new closed deck.');
    announce('Closed deck was empty. Open deck has been reshuffled into a new closed deck.');

    // Update table center display
    updateTableCenter();
  }
}

/**
 * Renders the visual representation of opponent bots at the top of the table.
 */
function renderBotsUI() {
  const botsContainer = document.getElementById('botsContainer');
  if (!botsContainer) return;

  botsContainer.innerHTML = '';

  activeBotNames.forEach((botName, index) => {
    const avatarEl = document.createElement('div');
    avatarEl.className = 'bot-avatar bot-ui';
    avatarEl.dataset.botIndex = String(index);

    const handEl = document.createElement('div');
    handEl.className = 'bot-hand';
    handEl.dataset.botIndex = String(index);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'bot-name';
    nameSpan.textContent = botName;

    avatarEl.appendChild(handEl);
    avatarEl.appendChild(nameSpan);

    botsContainer.appendChild(avatarEl);
  });
}

/**
 * Highlights the active bot taking its turn by adding .active to its .bot-hand
 * and removing it from all other bots. If activeIndex is -1, removes from all.
 *
 * @param {number} activeIndex - Index of the currently playing bot, or -1 for user's turn
 */
function highlightActiveBot(activeIndex) {
  const botHandEls = document.querySelectorAll('.bot-hand');
  botHandEls.forEach((handEl, idx) => {
    if (idx === activeIndex) {
      handEl.classList.add('active');
    } else {
      handEl.classList.remove('active');
    }
  });

  const turnEl = document.getElementById('turnIndicator');
  if (turnEl) {
    turnEl.textContent = activeIndex >= 0
      ? ((activeBotNames[activeIndex] || 'Bot') + '\u2019s turn')
      : 'Your turn';
  }
}

/**
 * Helper to check whether a bot has a winning full 13-card Rummy hand.
 * Since bots don't manually group cards, logically groups botHand into sets and sequences
 * using a greedy approach (pure sequences first, then impure sequences, then sets),
 * and validates via validateFullRummyHand().
 *
 * @param {Array} botHand - Array of card objects held by the bot (13 or 14 cards)
 * @returns {boolean} True if the bot has a valid winning hand, false otherwise.
 */
function checkBotWin(botHand) {
  if (!Array.isArray(botHand) || botHand.length < 13) {
    return false;
  }

  // If already 13 cards:
  if (botHand.length === 13) {
    const winningGroups = findWinningGrouping(botHand, wildJokerRank, 40);
    if (winningGroups && validateFullRummyHand(winningGroups, wildJokerRank)) {
      winningGroups.forEach((grp, idx) => {
        grp.forEach(c => { c.group = idx + 1; });
      });
      botHand.length = 0;
      botHand.push(...winningGroups.flat());
      return true;
    }
    return false;
  }

  // If 14 cards (after draw phase): test setting aside each card as the finish card
  for (let i = 0; i < botHand.length; i++) {
    const candidate13 = botHand.filter((_, idx) => idx !== i);
    const winningGroups = findWinningGrouping(candidate13, wildJokerRank, 40);
    if (winningGroups && validateFullRummyHand(winningGroups, wildJokerRank)) {
      // Discard the i-th card to openDeck
      const [finishCard] = botHand.splice(i, 1);
      finishCard.isSelected = false;
      openDeck.push(finishCard);
      updateTableCenter();

      // Assign winning groups so renderFinalCards presents them grouped
      winningGroups.forEach((grp, idx) => {
        grp.forEach(c => { c.group = idx + 1; });
      });
      botHand.length = 0;
      botHand.push(...winningGroups.flat());
      return true;
    }
  }

  return false;
}

/**
 * Simulates sequential bot AI turns using a recursive playNextBot(botIndex) function.
 * Splits each bot turn into two clear steps with delays so screen readers announce each move clearly.
 */
function simulateBotTurn(startIndex = 0) {
  function playNextBot(botIndex) {
    // If botIndex >= botHands.length: bot phase is over
    if (botIndex >= botHands.length) {
      highlightActiveBot(-1);
      isUserTurn = true;
      hasDrawnThisTurn = false;
      nextBotIndex = 0;
      saveGameState();
      announce('All bots have played. It is now your turn.');
      return;
    }

    const currentBotHand = botHands[botIndex];
    const botName = (activeBotNames && activeBotNames[botIndex]) ? activeBotNames[botIndex] : `Bot ${botIndex + 1}`;

    if (!currentBotHand) {
      playNextBot(botIndex + 1);
      return;
    }

    // Add .active class to this specific bot's .bot-hand, remove from others
    highlightActiveBot(botIndex);

    // Step 1 (Start of Bot Turn): Announce bot is playing
    announce(botName + ' is playing...');

    // Step 2 (Bot Action after 2000ms delay)
    currentBotStepTimeout = setTimeout(() => {
      // Check if closed deck needs reshuffling before bot draws
      if (closedDeck.length === 0) {
        reshuffleOpenDeckToClosed();
      }

      // Safety fallback: if BOTH decks are empty or openDeck only has 1 card left when closedDeck is empty
      if (closedDeck.length === 0 && openDeck.length <= 1) {
        endGameInDraw();
        return;
      }

      // Read botDifficulty (low, medium, high)
      const botDifficultySelect = document.getElementById('botDifficulty');
      const difficulty = botDifficultySelect ? botDifficultySelect.value : 'low';

      // Draw Phase: track drawSource ('Open Deck' or 'Closed Deck')
      let drawSource = '';
      let drawnCard = null;

      if (difficulty === 'low') {
        // 80% chance closed deck, 20% open deck
        const wantsOpen = Math.random() < 0.2;
        if (wantsOpen && openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        } else if (closedDeck.length > 0) {
          drawnCard = closedDeck.pop();
          drawSource = 'Closed Deck';
        } else if (openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        }
      } else if (difficulty === 'high') {
        // High Difficulty: Advanced Smart Draw
        // Look at top card of openDeck. Check if drawing it IMMEDIATELY helps form a Pure Sequence, Impure Sequence, or Set.
        // Simulates by adding open card to bot hand, running autoGroupHand, and seeing if unmatchedCards decreases or pure/total sequences increase.
        const topOpen = openDeck.length > 0 ? openDeck[openDeck.length - 1] : null;
        let helps = false;

        if (topOpen) {
          const currentEval = autoGroupHand(currentBotHand, wildJokerRank, 50);
          const simHand = [...currentBotHand, topOpen];
          const simEval = autoGroupHand(simHand, wildJokerRank, 50);

          const unmatchedDecreased = simEval.unmatchedCards.length < currentEval.unmatchedCards.length;
          const pureSeqIncreased = simEval.pureSeqCount > currentEval.pureSeqCount;
          const totalSeqIncreased = simEval.totalSeqCount > currentEval.totalSeqCount;
          const matchedGroupsIncreased = simEval.matchedGroups.length > currentEval.matchedGroups.length;
          const isAbsorbed = !simEval.unmatchedCards.some(c => c.id === topOpen.id);

          if (unmatchedDecreased || pureSeqIncreased || totalSeqIncreased || matchedGroupsIncreased || isAbsorbed) {
            helps = true;
          }
        }

        if (helps && openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        } else if (closedDeck.length > 0) {
          drawnCard = closedDeck.pop();
          drawSource = 'Closed Deck';
        } else if (openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        }
      } else {
        // Medium Difficulty:
        // Draw Logic: Check top card of openDeck. If bot sees a joker or card of SAME SUIT in hand, draw from openDeck.
        // Otherwise, draw from closedDeck.
        const topOpen = openDeck.length > 0 ? openDeck[openDeck.length - 1] : null;
        const isOpenJoker = topOpen && isJokerCard(topOpen, wildJokerRank);
        const hasSameSuit = topOpen && topOpen.suit && currentBotHand.some(c => c.suit === topOpen.suit);

        if ((isOpenJoker || hasSameSuit) && openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        } else if (closedDeck.length > 0) {
          drawnCard = closedDeck.pop();
          drawSource = 'Closed Deck';
        } else if (openDeck.length > 0) {
          drawnCard = openDeck.pop();
          drawSource = 'Open Deck';
        }
      }

      if (drawnCard) {
        currentBotHand.push(drawnCard);
      }

      // Bot Winning Logic: Check AFTER drawing card (when hand has 14 cards)
      if (checkBotWin(currentBotHand)) {
        clearAllBotTimeouts();

        highlightActiveBot(botIndex);
        isUserTurn = false;
        hasDrawnThisTurn = false;
        sessionStorage.removeItem('rummyState');

        setScreen('gameover');

        renderFinalCards(currentBotHand);
        const winMessage = botName + ' has Declared a valid Hand! You lose.';

        const gameOverMsgEl = document.getElementById('gameOverMessage');
        if (gameOverMsgEl) gameOverMsgEl.innerText = winMessage;

        announce(winMessage);
        return; // Stop the turn loop entirely
      }

      // Discard Phase:
      if (currentBotHand.length === 0) {
        nextBotIndex = botIndex + 1;
        saveGameState();
        currentBotNextTimeout = setTimeout(() => {
          playNextBot(botIndex + 1);
        }, 2500);
        return;
      }

      let discardedCard = null;
      if (difficulty === 'low') {
        // Random discard of non-joker card
        const nonJokers = currentBotHand.filter(c => !isJokerCard(c, wildJokerRank));
        if (nonJokers.length > 0) {
          const randomIndex = Math.floor(Math.random() * nonJokers.length);
          discardedCard = nonJokers[randomIndex];
          const targetIndex = currentBotHand.indexOf(discardedCard);
          currentBotHand.splice(targetIndex, 1);
        } else {
          const randomIndex = Math.floor(Math.random() * currentBotHand.length);
          [discardedCard] = currentBotHand.splice(randomIndex, 1);
        }
      } else if (difficulty === 'high') {
        // High Difficulty: Advanced Smart Discard
        // Run autoGroupHand on the bot's 14 cards and look ONLY at unmatchedCards (deadwood)
        const eval14 = autoGroupHand(currentBotHand, wildJokerRank, 50);
        const deadwood = eval14.unmatchedCards.filter(c => !isJokerCard(c, wildJokerRank));

        if (deadwood.length > 0) {
          // Sort the unmatchedCards by rank descending (K, Q, J, 10... down to 2)
          const sortedDeadwood = [...deadwood].sort((a, b) => {
            const rankA = rankOrder[a.rank] ?? 0;
            const rankB = rankOrder[b.rank] ?? 0;
            return rankB - rankA;
          });
          discardedCard = sortedDeadwood[0];
          const targetIndex = currentBotHand.indexOf(discardedCard);
          currentBotHand.splice(targetIndex, 1);
        } else if (eval14.unmatchedCards.length > 0) {
          discardedCard = eval14.unmatchedCards[0];
          const targetIndex = currentBotHand.indexOf(discardedCard);
          currentBotHand.splice(targetIndex, 1);
        } else {
          const nonJokers = currentBotHand.filter(c => !isJokerCard(c, wildJokerRank));
          if (nonJokers.length > 0) {
            const sorted = [...nonJokers].sort((a, b) => (rankOrder[b.rank] ?? 0) - (rankOrder[a.rank] ?? 0));
            discardedCard = sorted[0];
            const targetIndex = currentBotHand.indexOf(discardedCard);
            currentBotHand.splice(targetIndex, 1);
          } else {
            [discardedCard] = currentBotHand.splice(0, 1);
          }
        }
      } else {
        // Medium Difficulty:
        // Discard Logic: The bot sorts its hand by rank (descending).
        // It finds highest-ranking non-joker card that does NOT have another card of the same suit in hand, and discards it.
        // If no such card, discard a random non-joker card.
        const sortedHand = [...currentBotHand].sort((a, b) => {
          const rankA = rankOrder[a.rank] ?? 0;
          const rankB = rankOrder[b.rank] ?? 0;
          return rankB - rankA;
        });

        const targetCard = sortedHand.find(card => {
          if (isJokerCard(card, wildJokerRank) || !card.suit) return false;
          const sameSuitCount = currentBotHand.filter(c => c.suit === card.suit && !isJokerCard(c, wildJokerRank)).length;
          return sameSuitCount === 1;
        });

        if (targetCard) {
          const targetIndex = currentBotHand.indexOf(targetCard);
          [discardedCard] = currentBotHand.splice(targetIndex, 1);
        } else {
          const nonJokers = currentBotHand.filter(c => !isJokerCard(c, wildJokerRank));
          if (nonJokers.length > 0) {
            const randomIndex = Math.floor(Math.random() * nonJokers.length);
            discardedCard = nonJokers[randomIndex];
            const targetIndex = currentBotHand.indexOf(discardedCard);
            currentBotHand.splice(targetIndex, 1);
          } else {
            const randomIndex = Math.floor(Math.random() * currentBotHand.length);
            [discardedCard] = currentBotHand.splice(randomIndex, 1);
          }
        }
      }

      openDeck.push(discardedCard);

      // Call updateTableCenter() to show the discarded card
      updateTableCenter();

      // Announce draw source and discarded card
      announce(botName + ' drew a card from the ' + drawSource + ' and discarded ' + discardedCard.displayName);

      // Ensure saveGameState() is called after the bot completes its action.
      nextBotIndex = botIndex + 1;
      saveGameState();

      // Step 3 (Next Bot after another 2500ms delay)
      currentBotNextTimeout = setTimeout(() => {
        playNextBot(botIndex + 1);
      }, 2500);
    }, 2000);
  }

  // Start the sequence by calling playNextBot(startIndex) at the beginning of simulateBotTurn()
  playNextBot(startIndex);
}

/**
 * Handles drawing a card from either the closed deck or the open deck.
 *
 * @param {'closed'|'open'} source - The deck to draw from
 */
function handleDraw(source) {
  if (!isUserTurn) {
    announce('It is not your turn yet.');
    return;
  }
  if (hasDrawnThisTurn) {
    announce('You have already drawn a card this turn. Please select a card from your hand to discard.');
    return;
  }

  // Check if closed deck needs reshuffling when drawing from closed deck
  if (source === 'closed' && closedDeck.length === 0) {
    reshuffleOpenDeckToClosed();
  }

  // Safety fallback: if BOTH decks are empty or openDeck only has 1 card left when closedDeck is empty
  if (closedDeck.length === 0 && (openDeck.length === 0 || (source === 'closed' && openDeck.length <= 1))) {
    endGameInDraw();
    return;
  }

  let drawnCard = null;
  if (source === 'closed') {
    if (closedDeck.length === 0) {
      announce('Closed Deck is empty.');
      return;
    }
    drawnCard = closedDeck.pop();
  } else if (source === 'open') {
    if (openDeck.length === 0) {
      announce('Open Deck is empty.');
      return;
    }
    drawnCard = openDeck.pop();
  }

  if (!drawnCard) return;

  // Find latest group or default to 0
  const latestGroup = currentUserHand.length > 0
    ? Math.max(...currentUserHand.map(c => (typeof c.group === 'number' ? c.group : 0)))
    : 0;

  drawnCard.group = latestGroup;
  drawnCard.isSelected = false;
  currentUserHand.push(drawnCard);
  hasDrawnThisTurn = true;

  const status = refreshHandStatus('draw'); // may rearrange the hand when the player can declare

  updateTableCenter();
  renderPlayerHand(currentUserHand);
  saveGameState();

  announce(
    'You drew ' + drawnCard.displayName + '. ' +
    (status.text ? status.text + ' ' : '') +
    (status.eligible ? '' : 'Please select a card from your hand to discard.')
  );
}

/**
 * Handles discarding the single selected card from the player's hand to the open deck.
 */
function handleDiscard() {
  if (!isUserTurn) {
    announce('It is not your turn yet.');
    return;
  }
  if (!hasDrawnThisTurn) {
    announce('You must draw a card before discarding.');
    return;
  }

  const selectedIndex = currentUserHand.findIndex(c => c.isSelected);
  if (selectedIndex === -1) {
    announce('Please select a card to discard.');
    return;
  }

  const [discardedCard] = currentUserHand.splice(selectedIndex, 1);
  discardedCard.isSelected = false;
  openDeck.push(discardedCard);

  hasDrawnThisTurn = false;
  isUserTurn = false;

  eligibleFinishCardId = null;
  const status = refreshHandStatus('discard');

  const discardBtn = document.getElementById('discardBtn');
  if (discardBtn) discardBtn.style.display = 'none';

  const declareBtn = document.getElementById('declareBtn');
  if (declareBtn) declareBtn.style.display = 'none';

  const arrangeBtn = document.getElementById('groupBtn');
  if (arrangeBtn) arrangeBtn.style.display = 'none';

  updateTableCenter();
  renderPlayerHand(currentUserHand);
  nextBotIndex = 0;
  saveGameState();

  announce('Card discarded. ' + (status.text ? status.text + ' ' : '') + 'Bot turn...');

  simulateBotTurn();
}

/**
 * Handles declaring the hand when the user clicks #declareBtn.
 * Removes the selected finish card, groups the remaining 13 cards by group,
 * validates whether at least one group is a Pure Sequence, announces the result,
 * alerts the user, and disables further actions.
 */
function handleDeclare() {
  if (!isUserTurn) {
    announce('It is not your turn yet.');
    return;
  }
  if (!hasDrawnThisTurn) {
    announce('You must draw a card before declaring.');
    return;
  }

  const selectedIndex = currentUserHand.findIndex(c => c.isSelected);
  if (selectedIndex === -1) {
    announce('Please select a card to declare.');
    return;
  }

  // a. Remove the selected card from the hand (this is the finish card).
  const [finishCard] = currentUserHand.splice(selectedIndex, 1);
  finishCard.isSelected = false;
  openDeck.push(finishCard);
  updateTableCenter();

  // b. Auto-group the remaining 13 cards (completely IGNORE manual grouping)
  const activeWildJokerRank = wildJokerRank || getWildJokerRank(currentOpenJoker);
  const { pureSeqCount, totalSeqCount, unmatchedCards, matchedGroups } = autoGroupHand(currentUserHand, activeWildJokerRank);

  // Assign logical group properties so matched groups and unmatched cards are cleanly separated
  matchedGroups.forEach((grp, idx) => {
    grp.forEach(c => { c.group = idx + 1; });
  });
  unmatchedCards.forEach(c => {
    c.group = matchedGroups.length + 1;
  });

  // Re-assemble currentUserHand with the logically separated matchedGroups and unmatchedCards
  currentUserHand.length = 0;
  currentUserHand.push(...matchedGroups.flat(), ...unmatchedCards);

  // Render hand after removing finish card
  eligibleFinishCardId = null;
  renderPlayerHand(currentUserHand);

  // Disable further actions (set isUserTurn = false).
  isUserTurn = false;
  hasDrawnThisTurn = false;

  // Clear saved session state upon game end
  sessionStorage.removeItem('rummyState');

  const discardBtn = document.getElementById('discardBtn');
  if (discardBtn) discardBtn.style.display = 'none';

  const declareBtn = document.getElementById('declareBtn');
  if (declareBtn) declareBtn.style.display = 'none';

  const arrangeBtn = document.getElementById('groupBtn');
  if (arrangeBtn) arrangeBtn.style.display = 'none';

  setScreen('gameover');

  // Check the selected game mode
  const modeSelect = document.getElementById('gameMode');
  const mode = modeSelect ? modeSelect.value : '';
  const isPointsMode = mode.toLowerCase() === 'points';

  const gameOverMsgEl = document.getElementById('gameOverMessage');

  // Evaluate the result to Win or Lose
  if (unmatchedCards.length === 0 && pureSeqCount >= 1 && totalSeqCount >= 2) {
    let msg = 'Congratulations! You have a valid Hand. You Won!';
    if (isPointsMode) {
      msg += ' Your score is 0. Opponents take penalty points based on their unarranged cards.';
    }
    if (gameOverMsgEl) gameOverMsgEl.innerText = msg;
    announce(msg);
    renderFinalCards(matchedGroups, unmatchedCards);
  } else {
    let msg = '';
    if (pureSeqCount === 0) {
      msg = 'Invalid Declaration! You do not have a mandatory Pure Sequence (3 or more consecutive cards of the same suit without jokers).';
    } else if (totalSeqCount < 2) {
      msg = 'Invalid Declaration! You have a Pure Sequence, but you need at least one more sequence.';
    } else if (unmatchedCards.length > 0) {
      const unmatchedNames = unmatchedCards.map(c => c.displayName).join(', ');
      msg = 'Invalid Declaration! You have the required sequences, but these cards do not fit into any valid set or sequence: ' + unmatchedNames;
    } else {
      msg = 'Invalid Declaration! You do not have a valid Hand.';
    }

    if (gameOverMsgEl) gameOverMsgEl.innerText = msg;
    announce(msg);
    renderFinalCards(matchedGroups, unmatchedCards);
  }
}

/**
 * Sorts a player hand first by Suit, then by Rank (A=1, 2-10, J=11, Q=12, K=13),
 * with Jokers placed at the end.
 *
 * @param {Array} hand - Hand array to sort in-place
 */
function sortHand(hand) {
  hand.sort((a, b) => {
    if (a.isJoker && !b.isJoker) return 1;
    if (!a.isJoker && b.isJoker) return -1;
    if (a.isJoker && b.isJoker) return 0;

    // 1. Sort by Suit
    const suitA = suitOrder[a.suit] ?? 99;
    const suitB = suitOrder[b.suit] ?? 99;
    if (suitA !== suitB) {
      return suitA - suitB;
    }

    // 2. Sort by Rank
    const rankA = rankOrder[a.rank] ?? 0;
    const rankB = rankOrder[b.rank] ?? 0;
    return rankA - rankB;
  });
}

/** The wild joker rank that is active in this game. */
function getActiveWildRank() {
  return wildJokerRank || getWildJokerRank(currentOpenJoker);
}

/** Speaks a sequence in a natural order (Queen, King, Ace when the Ace is high). */
function sequenceToSpeech(group) {
  const hasKing = group.some(c => c.rank === 'King');
  const has2 = group.some(c => c.rank === '2');
  const val = (c) => {
    const v = rankOrder[c.rank];
    return (v === 1 && hasKing && !has2) ? 14 : v;
  };
  return [...group].sort((a, b) => val(a) - val(b)).map(c => c.displayName).join(', ');
}

function pureSequencesToSpeech(seqs) {
  if (seqs.length === 1) return 'a Pure Sequence: ' + sequenceToSpeech(seqs[0]);
  return seqs.length + ' Pure Sequences. ' +
    seqs.map((s, i) => 'Number ' + (i + 1) + ': ' + sequenceToSpeech(s)).join('. ');
}

/** Updates the visible status box (#handStatus). */
function updateHandStatusBadge(pureCount, eligible) {
  const el = document.getElementById('handStatus');
  if (!el) return;
  const lines = [pureCount > 0 ? 'Pure sequence \u2713' : 'No pure sequence yet'];
  if (eligible) lines.push('Ready to declare \u2713');
  el.textContent = lines.join('\n');
  el.classList.toggle('has-pure', pureCount > 0);
  el.classList.toggle('ready', eligible);
}

/**
 * Checks the player's hand. Updates the status box. If the player can declare,
 * it also arranges the hand into the winning groups (card to throw last).
 * It does NOT render and does NOT announce: the caller does both.
 *
 * @param {'deal'|'draw'|'discard'|'restore'} context
 * @returns {{ text: string, eligible: boolean }} Sentence(s) to add to the caller's announcement.
 */
function refreshHandStatus(context) {
  const wild = getActiveWildRank();
  const seqs = findPureSequences(currentUserHand, wild);
  const before = lastPureCount;
  lastPureCount = seqs.length;

  let option = null;
  if (currentUserHand.length === 14 && hasDrawnThisTurn && isUserTurn) {
    option = findDeclareOption(currentUserHand, wild);
  }
  eligibleFinishCardId = option ? option.finishCard.id : null;

  const parts = [];

  if (context === 'deal') {
    parts.push(seqs.length > 0
      ? 'You have ' + pureSequencesToSpeech(seqs) + '.'
      : 'You do not have a Pure Sequence yet.');
  } else if (context === 'draw' && seqs.length > before) {
    parts.push('You now have ' + pureSequencesToSpeech(seqs) + '.');
  } else if (context === 'discard' && seqs.length < before) {
    parts.push(seqs.length === 0
      ? 'You no longer have a Pure Sequence.'
      : 'You now have ' + pureSequencesToSpeech(seqs) + '.');
  }

  if (option) {
    // Auto-arrange: winning groups first, the card to throw alone at the end
    option.groups.forEach((grp, idx) => grp.forEach(c => { c.group = idx + 1; }));
    option.finishCard.group = option.groups.length + 1;
    currentUserHand.forEach(c => { c.isSelected = false; });
    const arranged = [...option.groups.flat(), option.finishCard];
    currentUserHand.length = 0;
    currentUserHand.push(...arranged);

    parts.push('You are eligible to declare. Your cards are arranged in groups. Select ' +
      option.finishCard.displayName + ' and press Declare.');
  }

  updateHandStatusBadge(seqs.length, !!option);
  return { text: parts.join(' '), eligible: !!option };
}

/**
 * Renders the player's cards into #playerHand grouped by their group property
 * inside <div class="card-group" role="group" aria-label="Card group"> with full
 * keyboard navigation, accessible Alt+Arrow drag-and-drop, selection toggling,
 * Escape unselection, and clean WCAG 2.1 AA screen reader support.
 *
 * @param {Array} hand - Array of card objects belonging to the player
 */
function renderPlayerHand(hand) {
  currentUserHand = hand;
  const playerHandEl = document.getElementById('playerHand');
  if (!playerHandEl) return;

  playerHandEl.innerHTML = '';
  updateActionButtons(hand);

  // 1. Group the card objects by their group property
  const groupMap = new Map();
  hand.forEach((card) => {
    const g = (typeof card.group === 'number') ? card.group : 0;
    if (!groupMap.has(g)) {
      groupMap.set(g, []);
    }
    groupMap.get(g).push(card);
  });

  // Sort groups numerically: group 0 first, followed by group 1, 2, ...
  const sortedGroupKeys = Array.from(groupMap.keys()).sort((a, b) => Number(a) - Number(b));

  // 2. For each unique group, create <div class="card-group" role="group" aria-label="Group X of Y...">
  sortedGroupKeys.forEach((groupId, groupIndex) => {
    const cardsInGroup = groupMap.get(groupId);
    const groupEl = document.createElement('div');
    groupEl.className = 'card-group';
    groupEl.setAttribute('role', 'group');
    groupEl.setAttribute(
      'aria-label',
      'Group ' + (groupIndex + 1) + ' of ' + sortedGroupKeys.length + ', ' +
      cardsInGroup.length + (cardsInGroup.length === 1 ? ' card' : ' cards')
    );
    groupEl.dataset.groupId = String(groupId);

    // Mouse drag-over and drop support on card groups
    groupEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    groupEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!isUserTurn) {
        announce('It is not your turn yet.');
        return;
      }
      const draggedCardId = e.dataTransfer.getData('text/plain');
      const targetCard = currentUserHand.find(c => c.id === draggedCardId);
      if (targetCard && targetCard.group !== groupId) {
        targetCard.group = groupId;
        const groupCards = currentUserHand.filter(c => c.group === groupId);
        const groupCardNames = groupCards.map(c => c.displayName).join(', ');

        announce('Moved to group ' + groupId + '. Cards in this group: ' + groupCardNames);
        renderPlayerHand(currentUserHand);

        const elToFocus = document.querySelector(`[data-card-id="${draggedCardId}"]`);
        if (elToFocus) elToFocus.focus();
      }
    });

    cardsInGroup.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.classList.add('card');
      cardEl.dataset.cardId = card.id;

      // Mouse drag-and-drop attribute (only for fine pointer)
      cardEl.setAttribute('draggable', window.matchMedia('(pointer: fine)').matches ? 'true' : 'false');
      cardEl.addEventListener('dragstart', (e) => {
        if (!isUserTurn) {
          e.preventDefault();
          announce('It is not your turn yet.');
          return;
        }
        e.dataTransfer.setData('text/plain', card.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      if (card.isSelected) {
        cardEl.classList.add('selected');
      }

      // Set tabindex="0", role="button", and aria-pressed
      cardEl.setAttribute('tabindex', '0');
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('aria-pressed', String(!!card.isSelected));

      if (card.id === eligibleFinishCardId) {
        cardEl.classList.add('finish-hint');
        cardEl.setAttribute('aria-label', card.displayName + ', the card to throw if you want to declare');
      }

      // Generate card inner HTML and apply .red or .black color class
      cardEl.innerHTML = renderCardHTML(card, cardEl);

      // Card selection toggle handler: toggles isSelected on card object and .selected CSS class
      const handleCardActivation = () => {
        if (!isUserTurn) {
          announce('It is not your turn yet.');
          return;
        }
        card.isSelected = !card.isSelected;
        cardEl.classList.toggle('selected', card.isSelected);

        cardEl.setAttribute('aria-pressed', String(card.isSelected));

        const actionText = card.isSelected ? ' selected' : ' unselected';
        announce(`${card.displayName}${actionText}`);

        updateActionButtons(hand);
      };

      // Click event listener
      cardEl.addEventListener('click', handleCardActivation);

      // Keyboard event listener (Enter/Space to select, Escape to unselect, Alt + Arrow to drag-and-drop)
      cardEl.addEventListener('keydown', (e) => {
        // Alt + ArrowRight: Increase card's group by 1
        if (e.altKey && e.key === 'ArrowRight') {
          e.preventDefault();
          if (!isUserTurn) {
            announce('It is not your turn yet.');
            return;
          }
          const currentG = (typeof card.group === 'number') ? card.group : 0;
          const newGroup = currentG + 1;
          card.group = newGroup;

          const savedCardId = card.id;
          const groupCards = currentUserHand.filter(c => c.group === newGroup);
          const groupCardNames = groupCards.map(c => c.displayName).join(', ');

          announce('Moved to group ' + newGroup + '. Cards in this group: ' + groupCardNames);

          renderPlayerHand(currentUserHand);

          const elToFocus = document.querySelector(`[data-card-id="${savedCardId}"]`);
          if (elToFocus) {
            elToFocus.focus();
          }
          return;
        }

        // Alt + ArrowLeft: Decrease card's group by 1 (minimum 0)
        if (e.altKey && e.key === 'ArrowLeft') {
          e.preventDefault();
          if (!isUserTurn) {
            announce('It is not your turn yet.');
            return;
          }
          const currentG = (typeof card.group === 'number') ? card.group : 0;
          const newGroup = Math.max(0, currentG - 1);
          card.group = newGroup;

          const savedCardId = card.id;
          const groupCards = currentUserHand.filter(c => c.group === newGroup);
          const groupCardNames = groupCards.map(c => c.displayName).join(', ');

          announce('Moved to group ' + newGroup + '. Cards in this group: ' + groupCardNames);

          renderPlayerHand(currentUserHand);

          const elToFocus = document.querySelector(`[data-card-id="${savedCardId}"]`);
          if (elToFocus) {
            elToFocus.focus();
          }
          return;
        }

        // Escape: Unselect card if currently selected
        if (e.key === 'Escape') {
          if (card.isSelected) {
            e.preventDefault();
            card.isSelected = false;
            cardEl.classList.remove('selected');
            cardEl.setAttribute('aria-pressed', 'false');
            announce(card.displayName + ' unselected');

            updateActionButtons(hand);
          }
          return;
        }

        // Enter / Space: Card selection toggle
        if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          handleCardActivation();
        }
      });

      // Append card into group div
      groupEl.appendChild(cardEl);
    });

    // Append group div to #playerHand
    playerHandEl.appendChild(groupEl);
  });

  fitHand();
}

/**
 * Resets all in-memory game state variables and restores the DOM to the initial setup screen.
 */
function resetGameToSetup() {
  // Clear running bot timeouts
  clearAllBotTimeouts();

  setScreen('setup');

  // Reset all game variables (hands, decks) with explicit .length = 0 to prevent memory leaks
  currentUserHand.length = 0;
  botHands.forEach(h => {
    if (Array.isArray(h)) h.length = 0;
  });
  botHands.length = 0;
  openDeck.length = 0;
  closedDeck.length = 0;
  activeBotNames.length = 0;
  currentOpenJoker = null;
  wildJokerRank = null;
  window.wildJokerRank = null;
  isUserTurn = true;
  hasDrawnThisTurn = false;
  autoArrangeState = 0;

  // Reset table UI elements
  const playerHandEl = document.getElementById('playerHand');
  if (playerHandEl) playerHandEl.innerHTML = '';

  const botsContainer = document.getElementById('botsContainer');
  if (botsContainer) botsContainer.innerHTML = '';

  const openJokerCardEl = document.getElementById('openJokerCard');
  if (openJokerCardEl) {
    openJokerCardEl.className = 'card open-joker';
    openJokerCardEl.innerHTML = '';
  }

  const openDeckEl = document.getElementById('openDeck');
  if (openDeckEl) {
    openDeckEl.className = 'card';
    openDeckEl.innerHTML = 'Open Deck';
  }

  const closedDeckEl = document.getElementById('closedDeck');
  if (closedDeckEl) {
    closedDeckEl.setAttribute('aria-label', 'Closed Deck. Press to draw.');
  }

  const discardBtnEl = document.getElementById('discardBtn');
  if (discardBtnEl) discardBtnEl.style.display = 'none';

  const declareBtnEl = document.getElementById('declareBtn');
  if (declareBtnEl) declareBtnEl.style.display = 'none';

  const arrangeBtnEl = document.getElementById('groupBtn');
  if (arrangeBtnEl) arrangeBtnEl.style.display = 'none';

  const gameOverCardsEl = document.getElementById('gameOverCards');
  if (gameOverCardsEl) gameOverCardsEl.innerHTML = '';

  const startBtnEl = document.getElementById('start-game-btn');
  if (startBtnEl) startBtnEl.focus();

  lastPureCount = 0;
  eligibleFinishCardId = null;
  const handStatusEl = document.getElementById('handStatus');
  if (handStatusEl) {
    handStatusEl.textContent = '';
    handStatusEl.className = 'hand-status';
  }
}

/**
 * Serializes and saves current game state to sessionStorage under 'rummyState'.
 */
function saveGameState() {
  try {
    const botDifficultySelect = document.getElementById('botDifficulty');
    const botDifficulty = botDifficultySelect ? botDifficultySelect.value : 'low';
    const gameModeSelect = document.getElementById('gameMode');
    const gameMode = gameModeSelect ? gameModeSelect.value : 'Points';

    const state = {
      currentUserHand,
      botHands,
      openDeck,
      closedDeck,
      activeBotNames,
      isUserTurn,
      hasDrawnThisTurn,
      currentOpenJoker,
      wildJokerRank,
      autoArrangeState,
      botDifficulty,
      gameMode,
      nextBotIndex
    };

    sessionStorage.setItem('rummyState', JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save game state to sessionStorage:', err);
  }
}

/**
 * Loads and restores game state from sessionStorage if 'rummyState' exists.
 *
 * @returns {boolean} True if game state was loaded, false otherwise.
 */
function loadGameState() {
  try {
    const saved = sessionStorage.getItem('rummyState');
    if (!saved) return false;

    const state = JSON.parse(saved);
    if (!state || !Array.isArray(state.currentUserHand)) return false;

    currentUserHand = state.currentUserHand;
    botHands = state.botHands || [];
    openDeck = state.openDeck || [];
    closedDeck = state.closedDeck || [];
    activeBotNames = state.activeBotNames || [];
    isUserTurn = state.isUserTurn ?? true;
    hasDrawnThisTurn = state.hasDrawnThisTurn ?? false;
    currentOpenJoker = state.currentOpenJoker || null;
    wildJokerRank = state.wildJokerRank || (currentOpenJoker ? getWildJokerRank(currentOpenJoker) : null);
    window.wildJokerRank = wildJokerRank;
    autoArrangeState = state.autoArrangeState || 0;
    nextBotIndex = state.nextBotIndex || 0;

    if (state.botDifficulty) {
      const diffEl = document.getElementById('botDifficulty');
      if (diffEl) diffEl.value = state.botDifficulty;
    }
    if (state.gameMode) {
      const modeEl = document.getElementById('gameMode');
      if (modeEl) modeEl.value = state.gameMode;
    }

    setScreen('game');

    // Call renderBotsUI(), renderPlayerHand(), and updateTableCenter()
    renderBotsUI();
    highlightActiveBot(-1);

    const openJokerCardEl = document.getElementById('openJokerCard');
    if (openJokerCardEl && currentOpenJoker) {
      openJokerCardEl.classList.add('card', 'open-joker');
      openJokerCardEl.innerHTML = renderCardHTML(currentOpenJoker, openJokerCardEl);
    }
    const jokerDisplayEl = document.getElementById('jokerDisplay');
    if (jokerDisplayEl && currentOpenJoker) {
      const jokerNote = currentOpenJoker.isJoker ? ' (Ace is the Wild Joker)' : '';
      jokerDisplayEl.textContent = 'The Open Joker is ' + currentOpenJoker.displayName + jokerNote;
    }

    updateTableCenter();
    lastPureCount = 0;
    const restoreStatus = refreshHandStatus('restore');
    renderPlayerHand(currentUserHand);

    if (isUserTurn) {
      announce('Game restored from previous session. It is your turn. ' + restoreStatus.text);
    } else {
      announce('Game restored from previous session. The bots are playing.');
      simulateBotTurn(nextBotIndex);
    }
    return true;
  } catch (err) {
    console.error('Failed to load game state from sessionStorage:', err);
    sessionStorage.removeItem('rummyState');
    return false;
  }
}

let idleTimer = null;

/**
 * Resets the 30-minute idle timer on user activity.
 */
function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(quitDueToIdle, 30 * 60 * 1000);
}

/**
 * Ends the game automatically after 30 minutes of inactivity.
 */
function quitDueToIdle() {
  clearAllBotTimeouts();
  sessionStorage.removeItem('rummyState');

  const gameOverMsgEl = document.getElementById('gameOverMessage');
  const msg = 'Game automatically ended due to 30 minutes of inactivity';
  if (gameOverMsgEl) gameOverMsgEl.innerText = msg;

  const gameOverCardsEl = document.getElementById('gameOverCards');
  if (gameOverCardsEl) gameOverCardsEl.innerHTML = '';

  setScreen('gameover');
  announce(msg);
}

document.addEventListener('DOMContentLoaded', () => {
  const startGameBtn = document.getElementById('start-game-btn');
  const botCountSelect = document.getElementById('bot-count');
  const statusMessageEl = document.getElementById('status-message');
  const autoArrangeBtn = document.getElementById('autoArrangeBtn');
  const arrangeBtn = document.getElementById('groupBtn');
  const discardBtn = document.getElementById('discardBtn');
  const declareBtn = document.getElementById('declareBtn');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const exitBtn = document.getElementById('exitBtn');
  const closedDeckEl = document.getElementById('closedDeck');
  const openDeckEl = document.getElementById('openDeck');

  if (!startGameBtn || !botCountSelect) {
    console.error('Required DOM elements not found.');
    return;
  }

  // Closed Deck and Open Deck click and keyboard event listeners
  if (closedDeckEl) {
    closedDeckEl.addEventListener('click', () => handleDraw('closed'));
    closedDeckEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleDraw('closed');
      }
    });
  }

  if (openDeckEl) {
    openDeckEl.addEventListener('click', () => handleDraw('open'));
    openDeckEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleDraw('open');
      }
    });
  }

  // Discard button click listener
  if (discardBtn) {
    discardBtn.addEventListener('click', () => {
      handleDiscard();
    });
  }

  // Declare button click listener
  if (declareBtn) {
    declareBtn.addEventListener('click', () => {
      handleDeclare();
    });
  }

  // Exit Game button click listener
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      sessionStorage.removeItem('rummyState');
      resetGameToSetup();
      announce('Exited the game.');
    });
  }

  // Play Again button click listener
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      const gameOverCardsEl = document.getElementById('gameOverCards');
      if (gameOverCardsEl) {
        gameOverCardsEl.innerHTML = '';
      }
      sessionStorage.removeItem('rummyState');
      resetGameToSetup();
      announce('Setup screen. Choose players and game mode to start a new game.');
    });
  }

  // Event listeners for user activity to reset 30-minute idle timer
  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', resetIdleTimer);
  document.addEventListener('click', resetIdleTimer);
  document.addEventListener('touchstart', resetIdleTimer, { passive: true });
  document.addEventListener('pointerdown', resetIdleTimer);

  // Initialize idle timer
  resetIdleTimer();

  // Load persisted game state if available
  loadGameState();

  // Auto Arrange button toggle logic
  if (autoArrangeBtn) {
    autoArrangeBtn.addEventListener('click', () => {
      if (!isUserTurn) {
        announce('It is not your turn yet.');
        return;
      }
      if (!currentUserHand || currentUserHand.length === 0) return;

      if (autoArrangeState === 0) {
        // State 0 -> 1: Sort by Suit then Rank, put in single group (group = 0)
        sortHand(currentUserHand);
        currentUserHand.forEach(c => {
          c.group = 0;
          c.isSelected = false;
        });
        autoArrangeState = 1;
        renderPlayerHand(currentUserHand);
        announce('Cards sorted');
      } else if (autoArrangeState === 1) {
        // State 1 -> 0: Sort by Suit then Rank, group by Suit (Spades=1, Hearts=2, Clubs=3, Diamonds=4, Jokers=5)
        sortHand(currentUserHand);
        const suitGroupMap = {
          Spades: 1,
          Hearts: 2,
          Clubs: 3,
          Diamonds: 4
        };
        currentUserHand.forEach(c => {
          c.isSelected = false;
          c.group = c.isJoker ? 5 : (suitGroupMap[c.suit] || 1);
        });
        autoArrangeState = 0;
        renderPlayerHand(currentUserHand);
        announce('Cards grouped by suit');
      }
    });
  }

  // Group / Arrange button click listener: groups selected cards together
  if (arrangeBtn) {
    arrangeBtn.addEventListener('click', () => {
      if (!isUserTurn) {
        announce('It is not your turn yet.');
        return;
      }
      const selectedCards = currentUserHand.filter(c => c.isSelected === true);
      if (selectedCards.length === 0) {
        return;
      }

      const maxGroup = currentUserHand.length > 0
        ? Math.max(...currentUserHand.map(c => (typeof c.group === 'number' ? c.group : 0)))
        : 0;

      const newGroupId = maxGroup + 1;
      selectedCards.forEach(c => {
        c.group = newGroupId;
      });

      currentUserHand.forEach(c => {
        c.isSelected = false;
      });

      updateActionButtons(currentUserHand);
      renderPlayerHand(currentUserHand);
      announce('Cards grouped successfully');
    });
  }

  startGameBtn.addEventListener('click', () => {
    enterImmersiveMode();

    // Clear running bot timeouts and explicitly reset array lengths
    clearAllBotTimeouts();
    currentUserHand.length = 0;
    botHands.forEach(h => {
      if (Array.isArray(h)) h.length = 0;
    });
    botHands.length = 0;
    openDeck.length = 0;
    closedDeck.length = 0;
    activeBotNames.length = 0;

    // Reset turn, joker, and arrange states on new game
    autoArrangeState = 0;
    isUserTurn = true;
    hasDrawnThisTurn = false;
    currentOpenJoker = null;
    wildJokerRank = null;
    window.wildJokerRank = null;

    setScreen('loading');
    const gameOverCardsEl = document.getElementById('gameOverCards');
    if (gameOverCardsEl) gameOverCardsEl.innerHTML = '';

    // Call ONLY this announcement when button is clicked
    announce('Shuffling cards and dealing...');

    const botCountInput = botCountSelect;
    const botCount = botCountInput.value;
    activeBotNames = bots.slice(0, parseInt(botCountInput.value));
    const numPlayers = 1 + (parseInt(botCount, 10) || 1);

    // Wrap all the remaining setup logic inside a setTimeout of 1500ms
    setTimeout(() => {
      setScreen('game');

      // Generate and shuffle deck
      const deck = createDeck(botCountInput.value);
      const shuffledDeck = shuffleDeck(deck);

      // Distribute 13 cards to user and bots
      const { hands, remainingDeck } = dealCards(shuffledDeck, numPlayers);

      // Store player hand, bot hands, and selected bot names
      currentUserHand = hands[0];
      botHands = hands.slice(1);
      activeBotNames = bots.slice(0, parseInt(botCountInput.value));

      // Render bots at the top of the table
      renderBotsUI();
      highlightActiveBot(-1);

      // Remaining deck becomes closedDeck
      closedDeck = remainingDeck;

      // Pop one card from closedDeck and push it to openDeck
      openDeck = [];
      if (closedDeck.length > 0) {
        openDeck.push(closedDeck.pop());
      }

      // Pick the Open Joker
      currentOpenJoker = getOpenJoker(closedDeck);
      wildJokerRank = getWildJokerRank(currentOpenJoker);
      window.wildJokerRank = wildJokerRank;
      const openJoker = currentOpenJoker;
      const openJokerNote = (openJoker && openJoker.isJoker) ? ' (Ace is the Wild Joker)' : '';
      const openJokerDisplayName = (openJoker ? openJoker.displayName : 'None') + openJokerNote;

      // Render Open Joker visually as a physical card in its traditional rotated position on the table
      const openJokerCardEl = document.getElementById('openJokerCard');
      if (openJokerCardEl && openJoker) {
        openJokerCardEl.classList.add('card', 'open-joker');
        openJokerCardEl.innerHTML = renderCardHTML(openJoker, openJokerCardEl);
      }

      // Display the open joker text in #jokerDisplay (for screen readers via .sr-only)
      const jokerDisplayEl = document.getElementById('jokerDisplay');
      if (jokerDisplayEl) {
        jokerDisplayEl.textContent = 'The Open Joker is ' + openJokerDisplayName;
      }

      // Initialize default group: 0 and isSelected: false for dealt cards
      currentUserHand.forEach(c => {
        if (c.group === undefined) c.group = 0;
        c.isSelected = false;
      });

      // Update table center and render player's cards
      updateTableCenter();
      renderPlayerHand(currentUserHand);

      lastPureCount = 0;
      eligibleFinishCardId = null;
      const dealStatus = refreshHandStatus('deal');

      // Single, clear announcement at the end of the timeout
      announce('Cards dealt. The Open Joker is ' + openJokerDisplayName +
        '. The top open card on the table is ' + openDeck[openDeck.length - 1].displayName +
        '. ' + dealStatus.text + ' It is your turn. Draw a card.');

      saveGameState();
      resetIdleTimer();

      console.log('Game initialized successfully:', {
        userCards: hands[0].length,
        openJoker,
        openDeckTop: openDeck[openDeck.length - 1]?.displayName,
        closedDeckRemaining: closedDeck.length,
        bots: bots.slice(0, Number(botCount))
      });
    }, 1500);
  });

  const boardEl = document.getElementById('gameBoard');
  if (boardEl && 'ResizeObserver' in window) {
    new ResizeObserver(() => fitHand()).observe(boardEl);
  }
  window.addEventListener('resize', () => { fitHand(); checkOrientation(); });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { fitHand(); checkOrientation(); }, 300);
  });
  checkOrientation();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
