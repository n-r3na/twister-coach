// app.js — l'interface : saisie de la situation et affichage de la décision.

var BLIND_LEVELS = [[10, 20], [15, 30], [20, 40], [25, 50], [30, 60], [40, 80], [50, 100], [60, 120], [80, 160],
                    [100, 200], [120, 240], [150, 300], [200, 400], [250, 500], [300, 600]];
var ACTION_LABELS = { none: "Pas encore joué", fold: "S'est couché", limp: "A payé (limp)", raise: "A relancé à…", allin: "Tapis" };
var SEAT_FR = { BTN: "Bouton", SB: "Petite blinde", BB: "Grosse blinde" };

var S = {
  n: 3, heroPos: 'BTN', sb: 10, bb: 20, ante: 0, payouts: [1, 0, 0], style: 'normal',
  stacks: { BTN: 500, SB: 500, BB: 500 },
  hero: [], board: [], target: 'hero',
  actions: { BTN: { type: 'fold', amount: 40 }, SB: { type: 'none', amount: 40 }, BB: { type: 'none', amount: 40 } },
  heroPrev: 0, nOpp: 1
};

function $(id) { return document.getElementById(id); }
function seats() { return S.n === 3 ? ['BTN', 'SB', 'BB'] : ['SB', 'BB']; }
function seatName(p) { return S.n === 2 && p === 'SB' ? "Petite blinde (bouton)" : SEAT_FR[p]; }

function bindSeg(id, onPick) {
  $(id).addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    Array.prototype.forEach.call($(id).children, function (x) { x.classList.toggle('on', x === b); });
    onPick(b.dataset.v);
  });
}

// --- Rendu des réglages ------------------------------------------------------------
function renderHeroPos() {
  $('heroPos').innerHTML = seats().map(function (p) {
    return '<button data-v="' + p + '"' + (p === S.heroPos ? ' class="on"' : '') + '>' + seatName(p) + '</button>';
  }).join('');
}

function renderStacks() {
  $('stacks').innerHTML = seats().map(function (p) {
    var me = p === S.heroPos;
    return '<div class="stk' + (me ? ' me' : '') + '"><span>' + (me ? 'Toi (' + seatName(p) + ')' : seatName(p)) + '</span>' +
      '<input type="number" min="0" data-seat="' + p + '" value="' + S.stacks[p] + '">' +
      '<span class="bbinfo">' + (S.stacks[p] / S.bb).toFixed(1) + ' BB</span></div>';
  }).join('');
}

function renderOppActions() {
  var me = seats().indexOf(S.heroPos);
  $('oppActions').innerHTML = seats().map(function (p, i) {
    if (p === S.heroPos) return '';
    var a = S.actions[p];
    var opts = Object.keys(ACTION_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (a.type === k ? ' selected' : '') + '>' + ACTION_LABELS[k] + '</option>';
    }).join('');
    return '<div class="opp"><div class="name">' + seatName(p) + (i > me ? ' <span class="small">(parle après toi)</span>' : '') + '</div>' +
      '<div class="ctl"><select data-seat="' + p + '" class="actType">' + opts + '</select>' +
      (a.type === 'raise' ? '<input type="number" min="0" class="actAmt" data-seat="' + p + '" value="' + a.amount + '"> jetons au total' : '') +
      '</div></div>';
  }).join('');
}

function defaultActions() {
  var me = seats().indexOf(S.heroPos);
  seats().forEach(function (p, i) {
    S.actions[p] = { type: i < me ? 'fold' : 'none', amount: 2 * S.bb };
  });
}

function renderBlindLevels() {
  $('blindLevel').innerHTML = '<option value="">Niveau…</option>' + BLIND_LEVELS.map(function (l, k) {
    return '<option value="' + k + '"' + (l[0] === S.sb && l[1] === S.bb ? ' selected' : '') + '>' + l[0] + ' / ' + l[1] + '</option>';
  }).join('');
}

// --- Cartes --------------------------------------------------------------------------
function cardHtml(c) {
  if (c === undefined) return '<div class="pc empty"></div>';
  var r = RANKS[c >> 2] === 'T' ? '10' : RANKS[c >> 2];
  return '<div class="pc suit-' + (c & 3) + '"><span>' + r + '</span><span class="s">' + SUIT_SYMBOLS[c & 3] + '</span></div>';
}

function renderCards() {
  $('heroSlots').innerHTML = [0, 1].map(function (k) { return cardHtml(S.hero[k]); }).join('');
  $('boardSlots').innerHTML = [0, 1, 2, 3, 4].map(function (k) { return cardHtml(S.board[k]); }).join('');
  document.querySelectorAll('.slotgroup').forEach(function (g) { g.classList.toggle('active', g.dataset.target === S.target); });
  var html = '';
  for (var s = 0; s < 4; s++) for (var r = 12; r >= 0; r--) {
    var c = makeCard(r, s), cls = S.hero.indexOf(c) >= 0 ? 'sel-hero' : S.board.indexOf(c) >= 0 ? 'sel-board' : '';
    html += '<button class="suit-' + s + ' ' + cls + '" data-c="' + c + '">' + (RANKS[r] === 'T' ? '10' : RANKS[r]) + SUIT_SYMBOLS[s] + '</button>';
  }
  $('picker').innerHTML = html;
  $('pickHint').textContent = S.target === 'hero' ? "Clique sur tes 2 cartes." : "Clique sur les cartes du milieu (3 au flop, 4 au turn, 5 à la river). Aucune = avant le flop.";
  var post = S.board.length >= 3;
  $('preCard').classList.toggle('hidden', post);
  $('postCard').classList.toggle('hidden', !post);
}

function pickCard(c) {
  var ih = S.hero.indexOf(c), ib = S.board.indexOf(c);
  if (ih >= 0) { S.hero.splice(ih, 1); S.target = 'hero'; }
  else if (ib >= 0) S.board.splice(ib, 1);
  else if (S.target === 'hero' && S.hero.length < 2) { S.hero.push(c); if (S.hero.length === 2) S.target = 'board'; }
  else if (S.board.length < 5) { S.board.push(c); S.target = 'board'; }
  renderCards();
  schedule();
}

// --- Calcul et affichage de la décision ---------------------------------------------
var timer = null;
function schedule() {
  clearTimeout(timer);
  if (S.hero.length === 2) $('result').classList.add('busy');
  timer = setTimeout(compute, 120);
}

function num(id) { var v = parseFloat($(id).value); return isNaN(v) ? 0 : v; }

function compute() {
  var box = $('result');
  box.className = 'card result';
  if (S.hero.length < 2) { box.innerHTML = '<div class="placeholder">Choisis tes 2 cartes pour voir la décision.</div>'; return; }
  if (S.board.length > 0 && S.board.length < 3) { box.innerHTML = '<div class="placeholder">Le flop, c\'est 3 cartes : ajoute la ou les cartes manquantes.</div>'; return; }
  var res;
  try {
    if (S.board.length === 0) {
      res = preflopDecision({
        n: S.n, heroPos: S.heroPos, stacks: S.stacks, sb: S.sb, bb: S.bb, ante: S.ante, payouts: S.payouts,
        heroCards: S.hero, style: S.style, actions: S.actions, heroPrev: S.heroPrev
      });
    } else {
      res = postflopDecision({
        heroCards: S.hero, board: S.board, pot: num('pot'), toCall: num('toCall'), heroStack: num('heroStack'),
        oppStack: num('oppStack'), nOpp: S.nOpp, villainPre: $('villainPre').value, earlierAggro: $('earlierAggro').checked,
        heroWasRaiser: $('heroWasRaiser').checked, style: S.style
      });
    }
  } catch (e) {
    box.innerHTML = '<div class="placeholder">Je n\'ai pas pu calculer cette situation. Vérifie les jetons et les actions saisies.</div>';
    console.error(e);
    return;
  }
  renderResult(res);
}

function renderResult(res) {
  var box = $('result');
  box.className = 'card result ' + res.action;
  var ctx = res.street === 'preflop'
    ? 'Avant le flop · ' + res.hand + ' · ' + res.effBB.toFixed(1) + ' BB effectifs'
    : 'Au ' + res.street + ' · ' + S.hero.map(cardStr).join(' ') + ' sur ' + S.board.map(cardStr).join(' ');
  var html = '<div class="context">' + ctx + '</div><div class="verdict ' + res.action + '">' + res.headline + '</div>';
  html += '<ul class="reasons">' + res.reasons.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
  if (res.numbers && res.numbers.length) {
    html += '<div class="nums">' + res.numbers.map(function (n) {
      return '<div class="num"><div class="l">' + n.label + '</div><div class="v">' + n.value + '</div></div>';
    }).join('') + '</div>';
  }
  if (res.chart) html += chartHtml(res.chart);
  box.innerHTML = html;
}

function chartHtml(ch) {
  var color = ch.villain ? '198,40,40' : '15,122,79';
  var cells = '';
  for (var g = 0; g < NUM_CLASSES; g++) {
    var f = ch.range[g], style = f > 0 ? ' style="background: rgba(' + color + ',' + (0.25 + 0.75 * f).toFixed(2) + ')"' : '';
    var cls = (f > 0.5 ? 'in' : '') + (g === ch.hero ? ' hero' : '');
    var lbl = CLASS_LABELS[g].replace(/T/g, '10');
    cells += '<div class="' + cls + '"' + style + ' title="' + lbl + (f > 0 && f < 1 ? ' (' + Math.round(f * 100) + ' %)' : '') + '">' + CLASS_LABELS[g] + '</div>';
  }
  return '<div class="chart-title">' + ch.title + '</div><div class="grid13">' + cells + '</div>' +
    '<div class="legend">Case encadrée = ta main. « s » = même couleur, « o » = couleurs différentes. Couleur pâle = seulement parfois.</div>';
}

// --- Événements ---------------------------------------------------------------------
function init() {
  initEngine();
  renderBlindLevels(); renderHeroPos(); renderStacks(); renderOppActions(); renderCards();

  bindSeg('nPlayers', function (v) {
    S.n = +v;
    if (S.n === 2 && S.heroPos === 'BTN') S.heroPos = 'SB';
    seats().forEach(function (p) { if (!S.stacks[p]) S.stacks[p] = 750; });
    defaultActions(); renderHeroPos(); renderStacks(); renderOppActions(); schedule();
  });
  bindSeg('style', function (v) { S.style = v; schedule(); });
  bindSeg('nOpp', function (v) { S.nOpp = +v; schedule(); });
  $('heroPos').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.heroPos = b.dataset.v; defaultActions(); renderHeroPos(); renderStacks(); renderOppActions(); schedule();
  });
  $('blindLevel').addEventListener('change', function () {
    var l = BLIND_LEVELS[+this.value]; if (!l) return;
    S.sb = l[0]; S.bb = l[1]; $('sb').value = l[0]; $('bb').value = l[1];
    seats().forEach(function (p) { S.actions[p].amount = 2 * S.bb; });
    renderStacks(); renderOppActions(); schedule();
  });
  ['sb', 'bb', 'ante'].forEach(function (id) {
    $(id).addEventListener('input', function () { S[id] = Math.max(0, num(id)); renderBlindLevels(); renderStacks(); schedule(); });
  });
  $('payouts').addEventListener('change', function () { S.payouts = this.value.split(',').map(Number); schedule(); });
  $('stacks').addEventListener('input', function (e) {
    var p = e.target.dataset.seat; if (!p) return;
    S.stacks[p] = Math.max(0, parseFloat(e.target.value) || 0);
    e.target.nextElementSibling.textContent = (S.stacks[p] / S.bb).toFixed(1) + ' BB';
    schedule();
  });
  $('oppActions').addEventListener('change', function (e) {
    var p = e.target.dataset.seat; if (!p) return;
    if (e.target.classList.contains('actType')) { S.actions[p].type = e.target.value; renderOppActions(); }
    schedule();
  });
  $('oppActions').addEventListener('input', function (e) {
    if (!e.target.classList.contains('actAmt')) return;
    S.actions[e.target.dataset.seat].amount = parseFloat(e.target.value) || 0;
    schedule();
  });
  $('heroPrev').addEventListener('input', function () { S.heroPrev = num('heroPrev'); schedule(); });
  $('picker').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) pickCard(+b.dataset.c); });
  document.querySelectorAll('.slotgroup').forEach(function (g) {
    g.addEventListener('click', function () { S.target = g.dataset.target; renderCards(); });
  });
  $('clearCards').addEventListener('click', function () { S.hero = []; S.board = []; S.target = 'hero'; renderCards(); schedule(); });
  ['pot', 'toCall', 'heroStack', 'oppStack', 'villainPre', 'earlierAggro', 'heroWasRaiser'].forEach(function (id) {
    $(id).addEventListener('input', schedule); $(id).addEventListener('change', schedule);
  });
}

init();
