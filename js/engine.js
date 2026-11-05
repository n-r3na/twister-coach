// engine.js — le cœur mathématique du bot :
//  - équités préflop entre classes de mains (avec effet de blocage des cartes)
//  - ranges ("éventail de mains" d'un joueur)
//  - ICM (valeur réelle des jetons selon la structure de gains)
//  - calcul d'EV d'un tapis (EV = gain moyen espéré)
//  - solveur push/fold (équilibre de Nash à 2 ou 3 joueurs, par "fictitious play")

var EQ = [];            // EQ[i][j] : équité de la classe i contre la classe j
var W = [];             // W[i][j]  : nb de combinaisons de j compatibles avec une combinaison de i
var HAND_STRENGTH = []; // équité de chaque classe contre une main aléatoire
var HAND_ORDER = [];    // classes triées de la meilleure à la moins bonne
var HAND_TOP_PCT = [];  // pour chaque classe : % des mains qui sont meilleures ou égales
var TOTAL_COMBOS = 1326;

function initEngine() {
  if (EQ.length) return;
  var i, j;
  for (i = 0; i < NUM_CLASSES; i++) {
    var row = new Float64Array(NUM_CLASSES);
    for (j = 0; j < NUM_CLASSES; j++) row[j] = PREFLOP_EQ_PERMILLE[i * NUM_CLASSES + j] / 1000;
    EQ.push(row);
  }
  for (i = 0; i < NUM_CLASSES; i++) {
    var w = new Float64Array(NUM_CLASSES), A = CLASS_COMBOS[i];
    for (j = 0; j < NUM_CLASSES; j++) {
      var B = CLASS_COMBOS[j], cnt = 0;
      for (var a = 0; a < A.length; a++) for (var b = 0; b < B.length; b++) {
        var x = A[a], y = B[b];
        if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) cnt++;
      }
      w[j] = cnt / A.length;
    }
    W.push(w);
  }
  for (i = 0; i < NUM_CLASSES; i++) {
    var tw = 0, te = 0;
    for (j = 0; j < NUM_CLASSES; j++) { tw += W[i][j]; te += W[i][j] * EQ[i][j]; }
    HAND_STRENGTH.push(te / tw);
    HAND_ORDER.push(i);
  }
  HAND_ORDER.sort(function (a, b) { return HAND_STRENGTH[b] - HAND_STRENGTH[a]; });
  var cum = 0;
  for (i = 0; i < NUM_CLASSES; i++) {
    cum += CLASS_NCOMBOS[HAND_ORDER[i]];
    HAND_TOP_PCT[HAND_ORDER[i]] = 100 * cum / TOTAL_COMBOS;
  }
}

// --- Ranges -----------------------------------------------------------------
// Une range = tableau de 169 fréquences entre 0 et 1.

function emptyRange() { return new Float64Array(NUM_CLASSES); }
function fullRange() { var r = emptyRange(); r.fill(1); return r; }

function rangePct(r) {
  var c = 0;
  for (var i = 0; i < NUM_CLASSES; i++) c += r[i] * CLASS_NCOMBOS[i];
  return 100 * c / TOTAL_COMBOS;
}

// Les pct% meilleures mains (classement par équité contre une main aléatoire).
function topRange(pct) {
  var r = emptyRange(), target = Math.max(0, Math.min(100, pct)) * TOTAL_COMBOS / 100, cum = 0;
  for (var k = 0; k < NUM_CLASSES && cum < target; k++) {
    var h = HAND_ORDER[k], n = CLASS_NCOMBOS[h];
    r[h] = Math.min(1, (target - cum) / n);
    cum += n;
  }
  return r;
}

// Range "entre from% et to%" (ex. un joueur qui suit sans relancer ses meilleures mains).
function bandRange(fromPct, toPct, topWeight) {
  var r = topRange(toPct), top = topRange(fromPct);
  for (var i = 0; i < NUM_CLASSES; i++) r[i] = r[i] - top[i] * (1 - topWeight);
  return r;
}

// Élargit (factor > 1) ou resserre (factor < 1) une range en gardant le même ordre de force.
function scaleRange(r, factor) {
  if (factor === 1) return r;
  return topRange(rangePct(r) * factor);
}

// Probabilité que l'adversaire ait une main de la range r, et notre équité contre ces mains,
// sachant qu'on tient la classe h (effet de blocage inclus).
function vsRange(h, r) {
  var Wh = W[h], Eh = EQ[h], tw = 0, w = 0, e = 0;
  for (var j = 0; j < NUM_CLASSES; j++) {
    var ww = Wh[j]; tw += ww;
    var x = ww * r[j]; w += x; e += x * Eh[j];
  }
  return { p: w / tw, eq: w > 0 ? e / w : 0.5 };
}

// Équité moyenne de la range A contre la range B.
function rangeVsRange(A, B) {
  var tw = 0, te = 0;
  for (var i = 0; i < NUM_CLASSES; i++) {
    if (!A[i]) continue;
    var wi = CLASS_NCOMBOS[i] * A[i], Wi = W[i], Ei = EQ[i];
    for (var j = 0; j < NUM_CLASSES; j++) {
      if (!B[j]) continue;
      var x = wi * Wi[j] * B[j];
      tw += x; te += x * Ei[j];
    }
  }
  return tw > 0 ? te / tw : 0.5;
}

function rangeFrac(r) { return rangePct(r) / 100; }

// --- ICM ---------------------------------------------------------------------
// Probabilité de finir à chaque place proportionnelle aux jetons (modèle Malmuth-Harville).
// payouts : part du prize pool pour la 1re, 2e, 3e place (ex. [1,0,0] = le gagnant prend tout).

function icm(stacks, payouts) {
  var n = stacks.length, res = new Array(n).fill(0);
  function rec(alive, place, prob) {
    if (place >= payouts.length || !payouts[place] && allZero(place)) return;
    var tot = 0;
    for (var k = 0; k < alive.length; k++) tot += stacks[alive[k]];
    for (var k2 = 0; k2 < alive.length; k2++) {
      var i = alive[k2], p = prob * stacks[i] / tot;
      if (p === 0) continue;
      res[i] += p * payouts[place];
      if (alive.length > 1) rec(alive.filter(function (x) { return x !== i; }), place + 1, p);
    }
  }
  function allZero(from) { for (var k = from; k < payouts.length; k++) if (payouts[k]) return false; return true; }
  var all = [];
  for (var i = 0; i < n; i++) all.push(i);
  rec(all, 0, 1);
  return res;
}

// Valeur (part du prize pool) de chaque joueur pour des tapis finaux donnés, avec cache.
function Valuer(st, payouts) {
  this.st = st;
  this.pay = payouts.slice(0, st.length);
  this.total = st.reduce(function (a, b) { return a + b; }, 0);
  this.cache = new Map();
}
Valuer.prototype.values = function (fin) {
  var key = fin.join(",");
  var v = this.cache.get(key);
  if (!v) {
    var st = this.st;
    // un joueur éliminé garde un "epsilon" : celui qui avait le plus de jetons finit devant
    var adj = fin.map(function (f, k) { return f > 0 ? f : st[k] * 1e-7 + 1e-12; });
    v = icm(adj, this.pay);
    this.cache.set(key, v);
  }
  return v;
};
// Conversion d'un écart de valeur en "équivalent jetons" (exact quand le gagnant prend tout).
Valuer.prototype.toChips = function (dv) { return dv * this.total / (this.pay[0] || 1); };

// Répartition du pot (pots secondaires inclus). order = joueurs au showdown du meilleur au moins bon.
function settle(st, com, order) {
  var n = st.length, c = com.slice(), fin = new Array(n), k, total = 0;
  for (k = 0; k < n; k++) { fin[k] = st[k] - c[k]; total += c[k]; }
  if (order.length === 1) { fin[order[0]] += total; return fin; }
  var amts = order.map(function (i) { return c[i]; }).sort(function (a, b) { return b - a; });
  var cap = amts[1];
  order.forEach(function (i) { if (c[i] > cap) { fin[i] += c[i] - cap; total -= c[i] - cap; c[i] = cap; } });
  var levels = order.map(function (i) { return c[i]; }).sort(function (a, b) { return a - b; });
  var prev = 0, given = 0, lastWinner = order[0];
  for (var l = 0; l < levels.length; l++) {
    var L = levels[l];
    if (L === prev) continue;
    var layer = 0;
    for (k = 0; k < n; k++) layer += Math.min(c[k], L) - Math.min(c[k], prev);
    for (var o = 0; o < order.length; o++) if (c[order[o]] >= L) { lastWinner = order[o]; break; }
    fin[lastWinner] += layer; given += layer; prev = L;
  }
  if (total > given) fin[lastWinner] += total - given;
  return fin;
}

// Approximation de l'équité à 3 joueurs à partir des équités face à face.
// eA = moi vs A, eB = moi vs B, eAB = A vs B. Renvoie [moi, A, B].
function eq3(eA, eB, eAB) {
  var a = eA * eB, b = (1 - eA) * eAB, c = (1 - eB) * (1 - eAB), s = a + b + c;
  return [a / s, b / s, c / s];
}

// --- EV d'un tapis -------------------------------------------------------------
// spot = {
//   st: tapis en début de main, com: jetons déjà engagés par chacun, me: mon index,
//   V: Valuer,
//   opps: adversaires encore dans le coup, dans l'ordre de parole :
//     {i, kind: 'allin', range}                -> déjà à tapis avec cette range
//     {i, kind: 'toact', range: function(nIn)} -> doit encore parler ; range de suivi selon
//                                                 le nombre de joueurs déjà à tapis devant lui
//   foldValue: (optionnel) ma valeur si je me couche
// }

function _pairEq(spot, A, B) {
  if (!spot._eqc) spot._eqc = new Map();
  var m = spot._eqc.get(A);
  if (!m) { m = new Map(); spot._eqc.set(A, m); }
  var e = m.get(B);
  if (e === undefined) { e = rangeVsRange(A, B); m.set(B, e); }
  return e;
}

function _showdownValue(spot, com, me, parts, eqs) {
  var V = spot.V, st = spot.st;
  function val(order) { return V.values(settle(st, com, order))[me]; }
  if (parts.length === 0) return val([me]);
  if (parts.length === 1) {
    var o = parts[0].i, e = eqs[0];
    return e * val([me, o]) + (1 - e) * val([o, me]);
  }
  var A = parts[0], B = parts[1];
  var eA = eqs[0], eB = eqs[1], eAB = _pairEq(spot, A.range, B.range);
  var p = eq3(eA, eB, eAB);
  return p[0] * (eAB * val([me, A.i, B.i]) + (1 - eAB) * val([me, B.i, A.i])) +
         p[1] * (eB * val([A.i, me, B.i]) + (1 - eB) * val([A.i, B.i, me])) +
         p[2] * (eA * val([B.i, me, A.i]) + (1 - eA) * val([B.i, A.i, me]));
}

// Valeur moyenne si je mets tout mon tapis avec la classe h.
function evAllIn(spot, h) {
  var st = spot.st, me = spot.me, com = spot.com.slice();
  com[me] = st[me];
  var allins = [], toacts = [];
  spot.opps.forEach(function (o) {
    if (o.kind === 'allin') { allins.push(o); com[o.i] = st[o.i]; } else toacts.push(o);
  });
  var base = allins.map(function (o) { return { i: o.i, range: o.range, eq: vsRange(h, o.range).eq }; });
  var total = 0;
  (function rec(k, prob, parts, c) {
    if (prob < 1e-9) return;
    if (k === toacts.length) {
      total += prob * _showdownValue(spot, c, me, parts, parts.map(function (x) { return x.eq; }));
      return;
    }
    var o = toacts[k], r = o.range(1 + parts.length), vr = vsRange(h, r);
    if (vr.p > 0) {
      var c2 = c.slice(); c2[o.i] = st[o.i];
      rec(k + 1, prob * vr.p, parts.concat([{ i: o.i, range: r, eq: vr.eq }]), c2);
    }
    if (vr.p < 1) rec(k + 1, prob * (1 - vr.p), parts, c);
  })(0, 1, base, com);
  return total;
}

// Valeur si je me couche (ne dépend pas de ma main).
function evFold(spot) {
  if (spot.foldValue !== undefined) return spot.foldValue;
  var st = spot.st, me = spot.me, V = spot.V, com = spot.com.slice();
  var allins = [], toacts = [];
  spot.opps.forEach(function (o) {
    if (o.kind === 'allin') { allins.push(o); com[o.i] = st[o.i]; } else toacts.push(o);
  });
  var total = 0;
  (function rec(k, prob, parts, c) {
    if (prob < 1e-9) return;
    if (k === toacts.length) {
      var v;
      if (parts.length === 1) v = V.values(settle(st, c, [parts[0].i]))[me];
      else {
        var A = parts[0], B = parts[1], e = _pairEq(spot, A.range, B.range);
        v = e * V.values(settle(st, c, [A.i, B.i]))[me] + (1 - e) * V.values(settle(st, c, [B.i, A.i]))[me];
      }
      total += prob * v;
      return;
    }
    var o = toacts[k], r = o.range(parts.length), p = rangeFrac(r);
    if (parts.length >= 2) p = 0; // on simplifie : pas de 3e joueur quand je suis couché
    if (p > 0) { var c2 = c.slice(); c2[o.i] = st[o.i]; rec(k + 1, prob * p, parts.concat([{ i: o.i, range: r }]), c2); }
    if (p < 1) rec(k + 1, prob * (1 - p), parts, c);
  })(0, 1, allins, com);
  return total;
}

// --- Solveur push/fold ------------------------------------------------------------
// 3 joueurs : index 0 = Bouton, 1 = Petite blinde, 2 = Grosse blinde.
// 2 joueurs : index 0 = Petite blinde (= bouton), 1 = Grosse blinde.
// Nœuds : pBTN (bouton fait tapis), cSB (PB suit le tapis du bouton), cBB1 (GB suit le bouton, PB couchée),
//         cBB2 (GB suit après bouton + PB), pSB (PB fait tapis, bouton couché), cBB3 (GB suit la PB).

function postedBlinds(st, sb, bb, ante) {
  var n = st.length, com = new Array(n).fill(0);
  for (var i = 0; i < n; i++) com[i] = Math.min(st[i], ante);
  var iSB = n === 3 ? 1 : 0, iBB = n === 3 ? 2 : 1;
  com[iSB] = Math.min(st[iSB], com[iSB] + sb);
  com[iBB] = Math.min(st[iBB], com[iBB] + bb);
  return com;
}

function buildSpots(ctx, S) {
  var st = ctx.st, com0 = ctx.com0, V = ctx.V, spots = {};
  function withAllin(idx) { var c = com0.slice(); idx.forEach(function (i) { c[i] = st[i]; }); return c; }
  function cst(r) { return function () { return r; }; }
  if (st.length === 3) {
    spots.pBTN = { st: st, com: com0, me: 0, V: V,
      opps: [{ i: 1, kind: 'toact', range: cst(S.cSB) },
             { i: 2, kind: 'toact', range: function (nIn) { return nIn >= 2 ? S.cBB2 : S.cBB1; } }],
      foldValue: subgameSBvsBB(ctx, S, 0) };
    spots.cSB = { st: st, com: withAllin([0]), me: 1, V: V,
      opps: [{ i: 0, kind: 'allin', range: S.pBTN },
             { i: 2, kind: 'toact', range: function (nIn) { return nIn >= 2 ? S.cBB2 : S.cBB1; } }] };
    spots.cBB1 = { st: st, com: withAllin([0]), me: 2, V: V, opps: [{ i: 0, kind: 'allin', range: S.pBTN }] };
    spots.cBB2 = { st: st, com: withAllin([0, 1]), me: 2, V: V,
      opps: [{ i: 0, kind: 'allin', range: S.pBTN }, { i: 1, kind: 'allin', range: S.cSB }] };
    spots.pSB = { st: st, com: com0, me: 1, V: V, opps: [{ i: 2, kind: 'toact', range: cst(S.cBB3) }],
      foldValue: V.values(settle(st, com0, [2]))[1] };
    spots.cBB3 = { st: st, com: withAllin([1]), me: 2, V: V, opps: [{ i: 1, kind: 'allin', range: S.pSB }] };
  } else {
    spots.pSB = { st: st, com: com0, me: 0, V: V, opps: [{ i: 1, kind: 'toact', range: cst(S.cBB3) }],
      foldValue: V.values(settle(st, com0, [1]))[0] };
    spots.cBB3 = { st: st, com: withAllin([0]), me: 1, V: V, opps: [{ i: 0, kind: 'allin', range: S.pSB }] };
  }
  return spots;
}

// Valeur pour le joueur `who` du coup PB contre GB quand le bouton s'est couché.
function subgameSBvsBB(ctx, S, who) {
  var st = ctx.st, com0 = ctx.com0, V = ctx.V;
  var fP = rangeFrac(S.pSB), fC = rangeFrac(S.cBB3), e = rangeVsRange(S.pSB, S.cBB3);
  var cAll = com0.slice(); cAll[1] = st[1]; cAll[2] = st[2];
  var cPush = com0.slice(); cPush[1] = st[1];
  return (1 - fP) * V.values(settle(st, com0, [2]))[who] +
    fP * ((1 - fC) * V.values(settle(st, cPush, [1]))[who] +
          fC * (e * V.values(settle(st, cAll, [1, 2]))[who] + (1 - e) * V.values(settle(st, cAll, [2, 1]))[who]));
}

var _solveCache = new Map();

// Calcule l'équilibre push/fold. st = tapis en début de main ; payouts = structure de gains.
function solvePushFold(st, sb, bb, ante, payouts, iters) {
  initEngine();
  iters = iters || 250;
  var key = [st.join("/"), sb, bb, ante, payouts.join("/"), iters].join("|");
  if (_solveCache.has(key)) return _solveCache.get(key);
  var ctx = { st: st, com0: postedBlinds(st, sb, bb, ante), V: new Valuer(st, payouts) };
  var names = st.length === 3 ? ['pBTN', 'cSB', 'cBB1', 'cBB2', 'pSB', 'cBB3'] : ['pSB', 'cBB3'];
  var owner = st.length === 3 ? { pBTN: 0, cSB: 1, cBB1: 2, cBB2: 2, pSB: 1, cBB3: 2 } : { pSB: 0, cBB3: 1 };
  var S = {};
  names.forEach(function (nm) {
    var i = owner[nm];
    // un joueur déjà à tapis en postant sa blinde "suit" forcément
    S[nm] = ctx.com0[i] >= st[i] ? fullRange() : topRange(nm[0] === 'p' ? 40 : 25);
  });
  var forced = {};
  names.forEach(function (nm) { forced[nm] = ctx.com0[owner[nm]] >= st[owner[nm]]; });

  for (var t = 1; t <= iters; t++) {
    var spots = buildSpots(ctx, S), br = {};
    names.forEach(function (nm) {
      if (forced[nm]) return;
      var sp = spots[nm], fv = evFold(sp), b = emptyRange();
      for (var h = 0; h < NUM_CLASSES; h++) b[h] = evAllIn(sp, h) > fv ? 1 : 0;
      br[nm] = b;
    });
    names.forEach(function (nm) {
      if (forced[nm]) return;
      var cur = S[nm], b = br[nm], nr = emptyRange(), a = 1 / (t + 1);
      for (var h = 0; h < NUM_CLASSES; h++) nr[h] = cur[h] + (b[h] - cur[h]) * a;
      S[nm] = nr;
    });
  }
  // arrondi des fréquences quasi pures
  names.forEach(function (nm) {
    for (var h = 0; h < NUM_CLASSES; h++) {
      if (S[nm][h] > 0.97) S[nm][h] = 1; else if (S[nm][h] < 0.03) S[nm][h] = 0;
    }
  });
  var res = { S: S, ctx: ctx, names: names };
  _solveCache.set(key, res);
  return res;
}

// Copie des stratégies avec les ranges adverses élargies/resserrées selon le style.
function adjustStrategies(S, factor, heroNodes) {
  var out = {};
  Object.keys(S).forEach(function (nm) {
    out[nm] = heroNodes.indexOf(nm) >= 0 ? S[nm] : scaleRange(S[nm], factor);
  });
  return out;
}
