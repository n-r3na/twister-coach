// quick-ui.js — interface du mode rapide : une valeur + une couleur = une carte.

var RANK_ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // A K Q J 10 9 ... 2
var KEY_RANK = { a: 12, k: 11, q: 10, j: 9, t: 8, '0': 8, '1': 8, '9': 7, '8': 6, '7': 5, '6': 4, '5': 3, '4': 2, '3': 1, '2': 0 };
var KEY_SUIT = { s: 0, h: 1, d: 2, c: 3 };
var SUIT_NAMES = ["pique", "cœur", "carreau", "trèfle"];

var BLIND_LEVELS = [[10, 20], [15, 30], [20, 40], [25, 50], [30, 60], [40, 80], [50, 100], [60, 120], [80, 160],
                    [100, 200], [120, 240], [150, 300], [200, 400], [250, 500], [300, 600]];

var Q = { cards: [], rank: null, n: 3, dealt: -1, stack: 500, level: 0, villain: 'none' };
try {
  var saved = JSON.parse(localStorage.getItem('twister-quick') || '{}');
  if (saved.n === 2 || saved.n === 3) Q.n = saved.n;
  if (saved.stack > 0) Q.stack = saved.stack;
  if (BLIND_LEVELS[saved.level]) Q.level = saved.level;
} catch (e) { /* stockage indisponible */ }

function save() {
  try { localStorage.setItem('twister-quick', JSON.stringify({ n: Q.n, stack: Q.stack, level: Q.level })); } catch (e) { /* stockage indisponible */ }
}
function maxStack() { return TOTAL_CHIPS - 10 * (Q.n - 1); }
function blinds() { return BLIND_LEVELS[Q.level]; }

function el(id) { return document.getElementById(id); }
function rankText(r) { return RANKS[r] === 'T' ? '10' : RANKS[r]; }

function cardEl(c, next, k) {
  if (c === undefined) return '<div class="card empty' + (next ? ' next' : '') + '"></div>';
  return '<div class="card suit-' + (c & 3) + (k === Q.dealt ? ' deal' : '') + '" aria-label="' + RANK_NAMES_FR[c >> 2] + ' de ' + SUIT_NAMES[c & 3] + '">' +
    '<span class="r">' + rankText(c >> 2) + '</span><span class="s">' + SUIT_SYMBOLS[c & 3] + '</span></div>';
}

function render() {
  var n = Q.cards.length;
  el('heroSlots').innerHTML = [0, 1].map(function (k) { return cardEl(Q.cards[k], k === n, k); }).join('');
  el('boardSlots').innerHTML = [2, 3, 4, 5, 6].map(function (k) { return cardEl(Q.cards[k], k === n, k); }).join('');
  var b = Math.max(0, n - 2);
  el('streetName').textContent = b === 0 ? (n === 2 ? "· avant le flop" : "") : b < 3 ? "· encore " + (3 - b) + " pour le flop" : "· " + STREET_FR[b];

  el('ranks').innerHTML = RANK_ORDER.map(function (r) {
    var used = [0, 1, 2, 3].every(function (s) { return Q.cards.indexOf(makeCard(r, s)) >= 0; });
    return '<button data-r="' + r + '" class="' + (Q.rank === r ? 'on' : '') + (used ? ' full' : '') + '" aria-label="' + RANK_NAMES_FR[r] + '"' + (used ? ' disabled' : '') + '>' + rankText(r) + '</button>';
  }).join('');
  el('suits').className = 'suits' + (Q.rank !== null ? ' waiting' : '');
  el('suits').innerHTML = [0, 1, 2, 3].map(function (s) {
    var dis = Q.rank === null || Q.cards.indexOf(makeCard(Q.rank, s)) >= 0 || n >= 7;
    return '<button data-s="' + s + '" class="suit-' + s + '" aria-label="' + SUIT_NAMES[s] + '"' + (dis ? ' disabled' : '') + '>' + SUIT_SYMBOLS[s] + '</button>';
  }).join('');
  ['p3', 'p2'].forEach(function (id) {
    var on = +el(id).dataset.n === Q.n;
    el(id).classList.toggle('on', on); el(id).setAttribute('aria-pressed', on);
  });
  Array.prototype.forEach.call(el('villain').children, function (b) {
    var on = b.dataset.a === Q.villain;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
  Q.dealt = -1;
  renderSetup();
  renderVerdict();
}

// Barre de jetons, blindes et tapis supposé des adversaires (instantané, sans recalcul)
function renderSetup() {
  var bl = blinds(), slider = el('stack');
  slider.max = maxStack();
  Q.stack = Math.min(Q.stack, maxStack());
  slider.value = Q.stack;
  el('stackOut').textContent = Q.stack;
  el('stackBB').textContent = (Q.stack / bl[1]).toFixed(1).replace('.0', '') + ' BB';
  el('blindOut').textContent = bl[0] + ' / ' + bl[1];
  el('blindDown').disabled = Q.level === 0;
  el('blindUp').disabled = Q.level === BLIND_LEVELS.length - 1;
  var rest = TOTAL_CHIPS - Q.stack;
  el('oppsOut').textContent = Q.n === 2 ? "Adversaire : " + rest + " jetons" : "Les 2 autres : ~" + Math.round(rest / 2) + " chacun";
}

function renderVerdict() {
  var v = el('verdict'), n = Q.cards.length;
  var idle = function (title, action) {
    v.className = 'verdict idle';
    el('vTitle').textContent = title; el('vAction').textContent = action;
    el('vWhy').textContent = ''; el('vChips').innerHTML = ''; el('meter').hidden = true;
  };
  if (n < 2) return idle(n === 0 ? "Choisis tes 2 cartes" : "Encore une carte",
    "Touche une valeur, puis une couleur. Au clavier : « a » puis « s » pour l'As de pique.");
  var board = Q.cards.slice(2);
  if (board.length > 0 && board.length < 3) return idle("Ajoute le flop", "Le flop, c'est 3 cartes au milieu. Il en manque " + (3 - board.length) + ".");

  var bl = blinds();
  var r = quickDecision(Q.cards.slice(0, 2), board, { n: Q.n, stack: Q.stack, sb: bl[0], bb: bl[1], villain: Q.villain });
  v.className = 'verdict ' + r.verdict;
  el('vTitle').textContent = r.title;
  el('vAction').textContent = r.action;
  el('vWhy').textContent = r.why;
  var chips = r.street === 'preflop'
    ? [r.hand, "Top " + r.top.toFixed(0) + " % des mains", r.effBB.toFixed(1).replace('.0', '') + " BB effectifs"]
    : [r.hand, r.draw].filter(Boolean);
  el('vChips').innerHTML = chips.map(function (c) { return '<span class="chip">' + c + '</span>'; }).join('');
  var need = r.need;
  el('meter').hidden = false;
  el('mFill').style.width = (100 * r.eq).toFixed(1) + '%';
  el('mMark').style.left = (100 * need).toFixed(1) + '%';
  el('mText').textContent = r.meterLabel + " : " + Math.round(100 * r.eq) + " %";
  el('mNeed').textContent = "Seuil : " + Math.round(100 * need) + " %";
}

function pickRank(r) {
  if (Q.cards.length >= 7) return;
  Q.rank = Q.rank === r ? null : r;
  render();
}
function pickSuit(s) {
  if (Q.rank === null) return;
  var c = makeCard(Q.rank, s);
  if (Q.cards.indexOf(c) >= 0 || Q.cards.length >= 7) return;
  Q.cards.push(c); Q.rank = null; Q.dealt = Q.cards.length - 1;
  if (Q.cards.length > 2) Q.villain = 'none';
  render();
}
function undo() { if (Q.rank !== null) Q.rank = null; else Q.cards.pop(); render(); }
function reset() { Q.cards = []; Q.rank = null; Q.villain = 'none'; render(); }

el('ranks').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) pickRank(+b.dataset.r); });
el('suits').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) pickSuit(+b.dataset.s); });
el('undo').addEventListener('click', undo);
el('villain').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Q.villain = b.dataset.a; render();
});
el('reset').addEventListener('click', reset);
el('players').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Q.n = +b.dataset.n;
  save(); render();
});
var slideTimer = null;
el('stack').addEventListener('input', function () {
  Q.stack = +this.value;
  renderSetup();
  clearTimeout(slideTimer);
  slideTimer = setTimeout(function () { save(); renderVerdict(); }, 120);
});
// Bouton plein écran (ordinateur / Android) ; sur iPhone : Partager → « Sur l'écran d'accueil »
var root = document.documentElement;
if (root.requestFullscreen) {
  el('fullscreen').hidden = false;
  el('fullscreen').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen().catch(function () { /* refusé par le navigateur */ });
  });
}
el('blindDown').addEventListener('click', function () { if (Q.level > 0) { Q.level--; save(); render(); } });
el('blindUp').addEventListener('click', function () { if (Q.level < BLIND_LEVELS.length - 1) { Q.level++; save(); render(); } });
document.addEventListener('keydown', function (e) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT') return;
  var k = e.key.toLowerCase();
  if (k === 'backspace') { e.preventDefault(); undo(); }
  else if (k === 'escape' || k === 'enter') { e.preventDefault(); reset(); }
  else if (Q.rank !== null && k in KEY_SUIT) pickSuit(KEY_SUIT[k]);
  else if (k in KEY_RANK) pickRank(KEY_RANK[k]);
});

render();
