// cards.js — cartes, évaluateur de mains 5 à 7 cartes, classes de mains préflop (169)
// Une carte = entier 0..51 : rang = c >> 2 (0 = 2 ... 12 = As), couleur = c & 3.

var RANKS = "23456789TJQKA";
var SUITS = "shdc"; // pique, coeur, carreau, trèfle
var SUIT_SYMBOLS = ["♠", "♥", "♦", "♣"];
var RANK_NAMES_FR = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Valet", "Dame", "Roi", "As"];

function cardRank(c) { return c >> 2; }
function cardSuit(c) { return c & 3; }
function makeCard(r, s) { return r * 4 + s; }
function cardStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
function parseCard(s) { return makeCard(RANKS.indexOf(s[0].toUpperCase()), SUITS.indexOf(s[1].toLowerCase())); }

// --- Évaluateur -----------------------------------------------------------
// Renvoie un entier : plus il est grand, meilleure est la main.
// Catégorie (bits 20+) : 8 quinte flush, 7 carré, 6 full, 5 couleur, 4 quinte,
// 3 brelan, 2 deux paires, 1 paire, 0 hauteur.

var _cnt = new Int32Array(13);
var _suitMask = new Int32Array(4);
var _suitCnt = new Int32Array(4);

function straightHigh(mask) {
  var ext = (mask << 1) | ((mask >> 12) & 1); // bit 0 = As joué en 1
  for (var top = 13; top >= 4; top--) {
    if (((ext >> (top - 4)) & 31) === 31) return top - 1;
  }
  return -1;
}

function topBits(mask, n) {
  var out = 0, k = 0;
  for (var r = 12; r >= 0 && k < n; r--) {
    if (mask & (1 << r)) { out = (out << 4) | r; k++; }
  }
  return out;
}

function evalHand(cards, n) {
  if (n === undefined) n = cards.length;
  var i, r, s, mask = 0;
  for (i = 0; i < 13; i++) _cnt[i] = 0;
  for (i = 0; i < 4; i++) { _suitMask[i] = 0; _suitCnt[i] = 0; }
  for (i = 0; i < n; i++) {
    r = cards[i] >> 2; s = cards[i] & 3;
    _cnt[r]++; _suitMask[s] |= 1 << r; _suitCnt[s]++; mask |= 1 << r;
  }
  var fs = -1;
  for (s = 0; s < 4; s++) if (_suitCnt[s] >= 5) fs = s;
  if (fs >= 0) {
    var sf = straightHigh(_suitMask[fs]);
    if (sf >= 0) return (8 << 20) | sf;
  }
  var quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (r = 12; r >= 0; r--) {
    var c = _cnt[r];
    if (c === 4) quad = r;
    else if (c === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  if (quad >= 0) return (7 << 20) | (quad << 4) | topBits(mask & ~(1 << quad), 1);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 4) | Math.max(t2, p1);
  if (fs >= 0) return (5 << 20) | topBits(_suitMask[fs], 5);
  var st = straightHigh(mask);
  if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 8) | topBits(mask & ~(1 << t1), 2);
  if (p2 >= 0) return (2 << 20) | (p1 << 8) | (p2 << 4) | topBits(mask & ~(1 << p1) & ~(1 << p2), 1);
  if (p1 >= 0) return (1 << 20) | (p1 << 12) | topBits(mask & ~(1 << p1), 3);
  return topBits(mask, 5);
}

function handCategory(score) { return score >> 20; }
var CATEGORY_FR = ["Hauteur", "Paire", "Deux paires", "Brelan", "Quinte", "Couleur", "Full", "Carré", "Quinte flush"];

// --- Classes de mains (grille 13x13) ---------------------------------------
// Index g = ligne*13 + colonne, ligne/colonne 0 = As ... 12 = 2.
// Au-dessus de la diagonale : assorties (s), en dessous : dépareillées (o).

var NUM_CLASSES = 169;
var CLASS_LABELS = [];
var CLASS_COMBOS = []; // liste des combinaisons concrètes [c1, c2]
var CLASS_NCOMBOS = [];

(function buildClasses() {
  for (var row = 0; row < 13; row++) {
    for (var col = 0; col < 13; col++) {
      var rRow = 12 - row, rCol = 12 - col, combos = [], label;
      if (row === col) {
        label = RANKS[rRow] + RANKS[rRow];
        for (var a = 0; a < 4; a++) for (var b = a + 1; b < 4; b++) combos.push([makeCard(rRow, a), makeCard(rRow, b)]);
      } else if (col > row) {
        label = RANKS[rRow] + RANKS[rCol] + "s";
        for (var s = 0; s < 4; s++) combos.push([makeCard(rRow, s), makeCard(rCol, s)]);
      } else {
        label = RANKS[rCol] + RANKS[rRow] + "o";
        for (var s1 = 0; s1 < 4; s1++) for (var s2 = 0; s2 < 4; s2++) if (s1 !== s2) combos.push([makeCard(rCol, s1), makeCard(rRow, s2)]);
      }
      CLASS_LABELS.push(label);
      CLASS_COMBOS.push(combos);
      CLASS_NCOMBOS.push(combos.length);
    }
  }
})();

function classOf(c1, c2) {
  var r1 = c1 >> 2, r2 = c2 >> 2, hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (r1 === r2) return (12 - hi) * 14;
  if ((c1 & 3) === (c2 & 3)) return (12 - hi) * 13 + (12 - lo);
  return (12 - lo) * 13 + (12 - hi);
}

// --- Générateur aléatoire reproductible (xorshift32) ------------------------
function makeRng(seed) {
  var x = seed | 0 || 123456789;
  return function () {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
