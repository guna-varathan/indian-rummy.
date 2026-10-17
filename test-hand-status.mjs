import { findPureSequences, findDeclareOption } from './gameLogic.js';

let n = 0;
const c = (rank, suit) => ({ id: 'c' + n++, rank, suit, isJoker: false, displayName: `${rank} of ${suit}`, group: 0, isSelected: false });
const J = () => ({ id: 'j' + n++, rank: null, suit: null, isJoker: true, displayName: 'Printed Joker', group: 0, isSelected: false });

const win13 = () => [
  c('4','Hearts'), c('5','Hearts'), c('6','Hearts'),
  c('7','Spades'), c('8','Spades'), c('9','Spades'),
  c('10','Clubs'), c('10','Diamonds'), c('10','Hearts'),
  c('Ace','Spades'), c('Ace','Hearts'), c('Ace','Clubs'), c('Ace','Diamonds')
];
const W = 'Queen';

const h = [...win13(), c('King','Diamonds')];
console.log('pure sequences (expect 2):', findPureSequences(h, W).length);
const opt = findDeclareOption(h, W);
console.log('eligible (expect King of Diamonds):', opt && opt.finishCard.displayName);
console.log('not eligible (expect null):', findDeclareOption([...win13().slice(0, 12), c('2','Clubs'), c('King','Diamonds')], W));
console.log('wild-rank card is not natural (expect 0):', findPureSequences([c('4','Hearts'), c('5','Hearts'), c('Queen','Hearts')], 'Queen').length);

const withJoker = [c('4','Hearts'), c('5','Hearts'), c('6','Hearts'), c('7','Spades'), c('8','Spades'), J(),
  c('10','Clubs'), c('10','Diamonds'), c('10','Hearts'), c('Ace','Spades'), c('Ace','Hearts'), c('Ace','Clubs'), c('Ace','Diamonds'), c('3','Clubs')];
const o2 = findDeclareOption(withJoker, W);
console.log('joker hand (expect 3 of Clubs):', o2 && o2.finishCard.displayName);
