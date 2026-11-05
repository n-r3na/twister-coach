// preflop.js — décisions avant le flop (tu n'as que tes 2 cartes).
//
// Situation attendue (objet s) :
//   n: 2 ou 3 joueurs, heroPos: 'BTN' | 'SB' | 'BB'
//   stacks: {BTN, SB, BB} jetons de chacun AU DÉBUT de la main (avant les blindes)
//   sb, bb, ante, payouts: [1,0,0] = le gagnant prend tout
//   heroCards: [c1, c2], style: 'tight' | 'normal' | 'loose'
//   actions: {SEAT: {type: 'none'|'fold'|'limp'|'raise'|'allin', amount}} pour les adversaires
//   heroPrev: jetons que tu as déjà mis (si tu avais relancé / limpé avant), 0 sinon

var STYLE_FACTOR = { tight: 0.7, normal: 1, loose: 1.4 };
var PUSH_FOLD_BB = 13;           // à 13 BB ou moins : tapis ou se coucher
var OPEN_PCT = { BTN3: 40, SB3: 50, SBHU: 70 }; // % de mains relancées d'entrée selon la position
var POS_FR = { BTN: "Bouton", SB: "Petite blinde", BB: "Grosse blinde" };

function seatsFor(n) { return n === 3 ? ['BTN', 'SB', 'BB'] : ['SB', 'BB']; }
function fmt(x) { return Math.round(x).toLocaleString('fr-FR'); }
function pct(x) { return (100 * x).toFixed(0) + " %"; }

// Le joueur `me` joue-t-il après `opp` sur les tours suivants (= "en position") ?
function inPosition(n, mePos, oppPos) {
  var order = n === 3 ? ['SB', 'BB', 'BTN'] : ['BB', 'SB'];
  return order.indexOf(mePos) > order.indexOf(oppPos);
}

function preflopDecision(s) {
  initEngine();
  var seats = seatsFor(s.n), me = seats.indexOf(s.heroPos);
  var st = seats.map(function (p) { return s.stacks[p]; });
  var h = classOf(s.heroCards[0], s.heroCards[1]);
  var factor = STYLE_FACTOR[s.style] || 1;
  var sol = solvePushFold(st, s.sb, s.bb, s.ante, s.payouts);
  var V = sol.ctx.V, com0 = sol.ctx.com0;

  // Jetons engagés par chacun d'après les actions saisies
  var com = com0.slice(), allins = [], raisers = [], limpers = [], toact = [];
  seats.forEach(function (p, i) {
    if (i === me) return;
    var a = (s.actions && s.actions[p]) || { type: 'none' };
    if (a.type === 'raise' && a.amount >= st[i] * 0.95) a = { type: 'allin' };
    if (a.type === 'limp') com[i] = Math.min(st[i], Math.max(com0[i], s.bb));
    else if (a.type === 'raise') com[i] = Math.min(st[i], Math.max(com0[i], a.amount));
    else if (a.type === 'allin') com[i] = st[i];
    if (a.type === 'allin') allins.push(i);
    else if (a.type === 'raise') raisers.push(i);
    else if (a.type === 'limp') limpers.push(i);
    else if (a.type === 'none') toact.push(i);
  });
  com[me] = Math.max(com0[me], Math.min(st[me], s.heroPrev || 0));

  var oppMax = 0;
  seats.forEach(function (p, i) { if (i !== me && (s.actions[p] || {}).type !== 'fold') oppMax = Math.max(oppMax, st[i]); });
  var effBB = Math.min(st[me], oppMax) / s.bb;

  var ctx = { s: s, seats: seats, me: me, st: st, h: h, factor: factor, sol: sol, V: V,
    com0: com0, com: com, allins: allins, raisers: raisers, limpers: limpers, toact: toact, effBB: effBB };

  var res;
  if (st[me] <= com[me]) res = { action: 'CHECK', headline: "Tu es déjà à tapis", reasons: ["Toutes tes jetons sont déjà au milieu : il n'y a plus rien à décider, on regarde les cartes !"] };
  else if (allins.length) res = facingAllin(ctx);
  else if (raisers.length) res = facingRaise(ctx);
  else if (limpers.length) res = facingLimp(ctx);
  else res = unopened(ctx);

  res.street = 'preflop';
  res.hand = CLASS_LABELS[h];
  res.handTop = HAND_TOP_PCT[h];
  res.effBB = effBB;
  res.numbers = res.numbers || [];
  res.numbers.unshift({ label: "Ta main fait partie des", value: "meilleures " + HAND_TOP_PCT[h].toFixed(0) + " %" });
  res.numbers.unshift({ label: "Tapis effectif", value: effBB.toFixed(1) + " BB" });
  return res;
}

// --- Personne n'est encore entré dans le coup -------------------------------------
function unopened(c) {
  var s = c.s, h = c.h;
  if (s.heroPos === 'BB') return { action: 'CHECK', headline: "Tout le monde s'est couché : tu gagnes les blindes", reasons: ["Personne n'a misé, le pot est pour toi."] };

  var node = s.n === 3 && s.heroPos === 'BTN' ? 'pBTN' : 'pSB';
  var heroNodes = s.n === 3 ? (s.heroPos === 'BTN' ? ['pBTN'] : ['cSB', 'pSB']) : ['pSB'];
  var nash = c.sol.S[node];

  if (c.effBB <= PUSH_FOLD_BB) {
    var Sadj = adjustStrategies(c.sol.S, c.factor, heroNodes);
    var spot = buildSpots(c.sol.ctx, Sadj)[node];
    var evPush = evAllIn(spot, h), evF = evFold(spot), gain = c.V.toChips(evPush - evF);
    var callers = spot.opps.map(function (o) { return o.range(1); });
    var foldProb = callers.reduce(function (p, r) { return p * (1 - vsRange(h, r).p); }, 1);
    var push = evPush > evF;
    var res = {
      action: push ? 'ALLIN' : 'FOLD',
      amount: push ? c.st[c.me] : 0,
      headline: push ? "TAPIS ! (mets tous tes jetons)" : "Couche-toi",
      reasons: [
        "Avec " + c.effBB.toFixed(1) + " grosses blindes, on est en mode « tapis ou rien » : relancer petit ne sert plus à rien, il faut mettre la pression avec tout ton tapis.",
        push ? "Tes adversaires vont se coucher environ " + pct(foldProb) + " du temps : tu ramasses les blindes sans combattre. Et quand ils suivent, ta main a encore assez de chances."
             : "Cette main n'est pas assez forte ici : si on te suit, tu perds trop souvent. Attends une meilleure occasion.",
        "Calcul : le tapis rapporte en moyenne " + (gain >= 0 ? "+" : "") + fmt(gain) + " jetons par rapport à se coucher."
      ],
      numbers: [{ label: "Gain moyen du tapis vs se coucher", value: (gain >= 0 ? "+" : "") + fmt(gain) + " jetons" },
                { label: "Les adversaires se couchent", value: pct(foldProb) }],
      chart: { title: "Mains à pousser à tapis ici (équilibre de Nash) : " + rangePct(nash).toFixed(0) + " %", range: nash, hero: h }
    };
    return res;
  }

  var key = s.n === 3 ? (s.heroPos === 'BTN' ? 'BTN3' : 'SB3') : 'SBHU';
  var openPct = OPEN_PCT[key] * (c.effBB > 20 ? 1 : 0.9);
  var open = topRange(openPct);
  var size = s.n === 2 || s.heroPos === 'BTN' ? 2 : 2.5;
  var raiseTo = Math.round(size * s.bb);
  if (HAND_TOP_PCT[h] <= openPct) {
    return {
      action: 'RAISE', amount: raiseTo,
      headline: "Relance à " + fmt(raiseTo) + " jetons",
      reasons: [
        "Tu as encore " + c.effBB.toFixed(0) + " grosses blindes : assez pour faire une petite relance (" + size + " fois la grosse blinde) au lieu de tout risquer.",
        "Ta main est dans les " + openPct.toFixed(0) + " % de mains qu'on joue depuis cette position.",
        "Si quelqu'un relance à tapis derrière, reviens me voir avec sa mise : je te dirai si tu dois suivre."
      ],
      chart: { title: "Mains à relancer depuis cette position (" + openPct.toFixed(0) + " %)", range: open, hero: h }
    };
  }
  return {
    action: 'FOLD', headline: "Couche-toi",
    reasons: ["Ta main est trop faible pour entrer dans le coup depuis cette position.",
              "On ne relance que les " + openPct.toFixed(0) + " % meilleures mains ici. La tienne est dans les " + HAND_TOP_PCT[h].toFixed(0) + " %."],
    chart: { title: "Mains à relancer depuis cette position (" + openPct.toFixed(0) + " %)", range: open, hero: h }
  };
}

// Range supposée d'un adversaire qui est à tapis.
function shoveRangeFor(c, i) {
  var s = c.s, pos = c.seats[i], S = c.sol.S, r, why;
  var firstAllin = c.allins[0] === i;
  if (s.heroPrev > 0 || c.raisers.length) { r = topRange(s.n === 3 ? 18 : 28); why = "relance à tapis sur une relance"; }
  else if (c.limpers.length && c.limpers[0] < i) { r = topRange(25); why = "tapis après un limp"; }
  else if (firstAllin) {
    r = s.n === 3 ? (pos === 'BTN' ? S.pBTN : S.pSB) : S.pSB;
    why = "tapis d'entrée (range de Nash)";
  } else { r = s.n === 3 ? S.cSB : S.cBB3; why = "suit un tapis"; }
  return { range: scaleRange(r, c.factor), why: why };
}

// --- Quelqu'un est à tapis ----------------------------------------------------------
function facingAllin(c) {
  var s = c.s, h = c.h, opps = [], ranges = [];
  c.allins.forEach(function (i) {
    var sr = shoveRangeFor(c, i);
    ranges.push(sr);
    opps.push({ i: i, kind: 'allin', range: sr.range });
  });
  var S = c.sol.S, f = c.factor;
  c.toact.forEach(function (i) {
    opps.push({ i: i, kind: 'toact', range: function (nIn) {
      if (s.n === 3 && c.seats[i] === 'BB') return scaleRange(nIn >= 2 ? S.cBB2 : S.cBB1, f);
      return topRange(nIn >= 2 ? 6 * f : 15 * f);
    } });
  });
  var spot = { st: c.st, com: c.com.slice(), me: c.me, V: c.V, opps: opps };
  c.allins.forEach(function (i) { spot.com[i] = c.st[i]; });
  var evC = evAllIn(spot, h), evF = evFold(spot), gain = c.V.toChips(evC - evF);

  var eqs = ranges.map(function (r) { return vsRange(h, r.range).eq; });
  var eq = eqs.length === 1 ? eqs[0] : eq3(eqs[0], eqs[1], rangeVsRange(ranges[0].range, ranges[1].range))[0];
  var maxOpp = Math.max.apply(null, c.allins.map(function (i) { return c.st[i]; }));
  var cf = spot.com.slice();
  cf[c.me] = Math.min(c.st[c.me], maxOpp);
  var call = cf[c.me] - c.com[c.me];
  var potFinal = cf.reduce(function (a, x) { return a + Math.min(x, cf[c.me]); }, 0);
  var need = call / potFinal;
  var ok = evC > evF;
  var who = c.allins.map(function (i) { return POS_FR[c.seats[i]]; }).join(" et ");
  var res = {
    action: ok ? 'CALL' : 'FOLD', amount: ok ? call : 0,
    headline: ok ? "SUIS le tapis (" + fmt(call) + " jetons)" : "Couche-toi",
    reasons: [
      who + (c.allins.length > 1 ? " sont" : " est") + " à tapis. Je suppose qu'" + (c.allins.length > 1 ? "ils jouent" : "il joue") + " environ " +
        ranges.map(function (r) { return rangePct(r.range).toFixed(0) + " % des mains"; }).join(" / ") + " (" + ranges[0].why + ").",
      "Ta main gagne " + pct(eq) + " du temps contre ça. Pour que suivre soit rentable, il faut gagner au moins " + pct(need) + " (c'est la « cote du pot » : tu paies " + fmt(call) + " pour un pot final de " + fmt(potFinal) + ").",
      ok ? "Tu as assez de chances : suivre rapporte en moyenne " + fmt(gain) + " jetons de plus que se coucher."
         : "Pas assez de chances : suivre te coûterait en moyenne " + fmt(-gain) + " jetons par rapport à se coucher."
    ],
    numbers: [{ label: "Tes chances de gagner", value: pct(eq) }, { label: "Chances nécessaires", value: pct(need) },
              { label: "Gain moyen de suivre vs se coucher", value: (gain >= 0 ? "+" : "") + fmt(gain) + " jetons" }],
    chart: { title: "Range supposée de l'adversaire à tapis (" + rangePct(ranges[0].range).toFixed(0) + " %)", range: ranges[0].range, hero: h, villain: true }
  };
  if (c.toact.length) res.reasons.push("Attention, un joueur doit encore parler derrière toi : j'ai tenu compte du risque qu'il suive aussi.");
  return res;
}

// Mains de la range `open` qui suivraient notre tapis (range `shove`), vu le prix à payer.
function callRangeVsShove(open, shove, needEq) {
  var r = emptyRange();
  for (var j = 0; j < NUM_CLASSES; j++) if (open[j] > 0 && vsRange(j, shove).eq >= needEq) r[j] = open[j];
  return r;
}

// Équilibre "sur-relance à tapis / suivi" : notre range de tapis et sa range de suivi s'ajustent
// l'une à l'autre (fictitious play). gainCall(h) = gain de suivre avec h, en jetons.
function reshoveEquilibrium(c, open, r, needR, gainCall, extra) {
  var H = topRange(15), C = null, iters = 40;
  var others = (extra || []).concat(c.toact.map(function (i) { return { i: i, kind: 'toact', range: function () { return topRange(5 * c.factor); } }; }));
  var foldValue = c.V.values(settle(c.st, c.com, [r]))[c.me];
  for (var t = 1; t <= iters; t++) {
    C = callRangeVsShove(open, H, needR);
    var spot = { st: c.st, com: c.com.slice(), me: c.me, V: c.V, foldValue: foldValue,
      opps: [{ i: r, kind: 'toact', range: function () { return C; } }].concat(others) };
    var nh = emptyRange();
    for (var h = 0; h < NUM_CLASSES; h++) {
      var g = c.V.toChips(evAllIn(spot, h) - foldValue);
      var b = g > Math.max(0, gainCall(h)) ? 1 : 0;
      nh[h] = H[h] + (b - H[h]) / (t + 1);
    }
    H = nh;
  }
  return { H: H, C: scaleRange(C, c.factor), others: others, foldValue: foldValue };
}

function openRangeOf(c, i) {
  var s = c.s, pos = c.seats[i];
  if (s.n === 2) return OPEN_PCT.SBHU;
  if (pos === 'BTN') return OPEN_PCT.BTN3;
  if (pos === 'SB') return c.raisers.length > 1 ? 15 : OPEN_PCT.SB3;
  return 25; // la grosse blinde qui relance un limp
}

// --- Quelqu'un a relancé (sans être à tapis) ---------------------------------------
function facingRaise(c) {
  var s = c.s, h = c.h, V = c.V;
  var r = c.raisers[c.raisers.length - 1];
  var openPct = openRangeOf(c, r) * c.factor;
  var open = topRange(openPct);
  var raiseAmt = c.com[r];
  var potNow = c.com.reduce(function (a, b) { return a + b; }, 0);

  // 1) Suivre
  var heroAll = c.st[c.me];
  var ip = inPosition(s.n, s.heroPos, c.seats[r]);
  var real = ip ? 0.9 : 0.75;
  var callAmt = Math.min(raiseAmt, heroAll) - c.com[c.me];
  var callGain = function (hh) {
    var g = real * vsRange(hh, open).eq * (potNow + callAmt) - callAmt;
    return c.toact.length ? g - 0.15 * callAmt : g; // un joueur peut encore relancer derrière
  };
  var eq = vsRange(h, open).eq, gainCall = callGain(h);
  var need = callAmt / (potNow + callAmt);

  // 2) Tapis
  var cap = Math.min(heroAll, c.st[r]);
  var dead = potNow - c.com[r] - c.com[c.me];
  var needR = (cap - c.com[r]) / (2 * cap + dead);
  var eqm = reshoveEquilibrium(c, open, r, needR, callGain);
  var callR = eqm.C;
  var spot = { st: c.st, com: c.com.slice(), me: c.me, V: V, foldValue: eqm.foldValue,
    opps: [{ i: r, kind: 'toact', range: function () { return callR; } }].concat(eqm.others) };
  var gainShove = V.toChips(evAllIn(spot, h) - spot.foldValue);

  // 3) Sur-relance (3-bet) avec les monstres quand on est profond
  var premium = HAND_TOP_PCT[h] <= 4 && c.effBB > 25;
  var opts = [{ a: 'FOLD', g: 0 }, { a: 'ALLIN', g: c.effBB <= 30 ? gainShove : -1e9 }, { a: 'CALL', g: gainCall }];
  if (premium) opts.push({ a: 'RAISE', g: Math.max(gainShove, gainCall) + 1 });
  opts.sort(function (x, y) { return y.g - x.g; });
  var best = opts[0].a;

  var intro = POS_FR[c.seats[r]] + " a relancé à " + fmt(raiseAmt) + " jetons. Je suppose qu'il relance environ " + openPct.toFixed(0) + " % des mains : ta main gagne " + pct(eq) + " du temps contre ça.";
  var nums = [{ label: "Tes chances contre sa range", value: pct(eq) }, { label: "Cote du pot pour suivre", value: pct(need) },
              { label: "Gain moyen du tapis", value: (gainShove >= 0 ? "+" : "") + fmt(gainShove) + " jetons" },
              { label: "Gain moyen de suivre", value: (gainCall >= 0 ? "+" : "") + fmt(gainCall) + " jetons" }];
  var chart = { title: "Range supposée du relanceur (" + openPct.toFixed(0) + " %)", range: open, hero: h, villain: true };
  if (best === 'ALLIN') return { action: 'ALLIN', amount: heroAll, headline: "TAPIS ! (sur-relance avec tout)", numbers: nums, chart: chart,
    reasons: [intro, "Faire tapis est le meilleur choix : il se couchera environ " + pct(Math.max(0, 1 - rangePct(callR) / rangePct(open))) +
              " du temps (il ne peut suivre qu'avec le haut de sa range) et tu récupères le pot ; quand il suit, ta main a encore " + pct(vsRange(h, callR).eq) + " de chances.",
              "Avec " + c.effBB.toFixed(0) + " BB, suivre puis jouer après le flop te laisserait dans une position inconfortable."] };
  if (best === 'RAISE') { var to = Math.round(raiseAmt * 3); return { action: 'RAISE', amount: to, headline: "Sur-relance à " + fmt(to) + " jetons", numbers: nums, chart: chart,
    reasons: [intro, "Tu as une main énorme et beaucoup de jetons : relance environ 3 fois sa mise pour grossir le pot sans le faire fuir.", "S'il fait tapis derrière, suis sans hésiter."] }; }
  if (best === 'CALL') return { action: 'CALL', amount: callAmt, headline: "SUIS (" + fmt(callAmt) + " jetons)", numbers: nums, chart: chart,
    reasons: [intro, "Il faut " + pct(need) + " de chances pour que suivre soit rentable, et ta main en a assez (même en tenant compte du fait qu'on ne gagne pas toujours tout le pot après le flop).",
              ip ? "Tu joueras après lui sur les prochains tours : c'est un avantage." : "Tu parleras avant lui après le flop : sois prudent si tu ne touches rien."] };
  return { action: 'FOLD', headline: "Couche-toi", numbers: nums, chart: chart,
    reasons: [intro, "Ni suivre ni faire tapis ne rapporte : ta main n'est pas assez forte contre ce qu'il peut avoir.", "Se coucher ne coûte que ce que tu as déjà mis."] };
}

// --- Quelqu'un a juste payé la grosse blinde (limp) -----------------------------------
function facingLimp(c) {
  var s = c.s, h = c.h, V = c.V;
  var limpPct = function (i) { var p = c.seats[i]; return (s.n === 2 ? 75 : p === 'BTN' ? 50 : 65) * c.factor; };
  var potNow = c.com.reduce(function (a, b) { return a + b; }, 0);
  var lim = c.limpers[0], limpR = topRange(limpPct(lim));
  var eqL = vsRange(h, limpR).eq;
  var multi = c.limpers.length + c.toact.length > 1;
  var ip = inPosition(s.n, s.heroPos, c.seats[lim]);
  var real = multi ? 0.7 : ip ? 0.9 : 0.75;
  var callAmt = s.heroPos === 'BB' ? 0 : Math.max(0, c.com[lim] - c.com[c.me]);
  var full = fullRange(), eqLimpVsAll = rangeVsRange(limpR, full);
  var playGain = function (hh) {
    var e = vsRange(hh, limpR).eq;
    if (multi) e = eq3(e, vsRange(hh, full).eq, eqLimpVsAll)[0];
    return real * e * (potNow + callAmt) - callAmt;
  };
  var gainPlay = playGain(h);

  // Tapis : le limpeur ajuste sa range de suivi à notre range de tapis (et inversement)
  var cap = Math.min(c.st[c.me], c.st[lim]);
  var needR = (cap - c.com[lim]) / (2 * cap + potNow - c.com[lim] - c.com[c.me]);
  var extra = c.limpers.slice(1).map(function (i) {
    var cr = topRange(Math.min(limpPct(i), 15 * c.factor));
    return { i: i, kind: 'toact', range: function () { return cr; } };
  });
  var eqm = reshoveEquilibrium(c, limpR, lim, needR, playGain, extra);
  var spot = { st: c.st, com: c.com.slice(), me: c.me, V: V, foldValue: eqm.foldValue,
    opps: [{ i: lim, kind: 'toact', range: function () { return eqm.C; } }].concat(eqm.others) };
  var gainShove = V.toChips(evAllIn(spot, h) - spot.foldValue);
  var canRaise = c.effBB > 15 && HAND_TOP_PCT[h] <= (s.heroPos === 'BB' ? 20 : 12);
  var raiseTo = Math.round((3 + c.limpers.length) * s.bb);

  var intro = POS_FR[c.seats[lim]] + " a juste payé (limp). En général ça veut dire une main moyenne : je suppose environ " + limpPct(lim).toFixed(0) + " % des mains. Ta main gagne " + pct(eqL) + " contre ça.";
  var nums = [{ label: "Tes chances contre le limpeur", value: pct(eqL) },
              { label: "Gain moyen du tapis", value: (gainShove >= 0 ? "+" : "") + fmt(gainShove) + " jetons" },
              { label: "Gain moyen de " + (s.heroPos === 'BB' ? "checker" : "compléter"), value: (gainPlay >= 0 ? "+" : "") + fmt(gainPlay) + " jetons" }];
  var chart = { title: "Range supposée du limpeur (" + limpPct(lim).toFixed(0) + " %)", range: limpR, hero: h, villain: true };

  if (c.effBB <= PUSH_FOLD_BB + 2 && gainShove > gainPlay && gainShove > 0)
    return { action: 'ALLIN', amount: c.st[c.me], headline: "TAPIS !", numbers: nums, chart: chart,
      reasons: [intro, "Les joueurs qui limpent se couchent souvent face à un tapis : tu gagnes le pot tout de suite la plupart du temps, et ta main tient la route quand il suit."] };
  if (canRaise)
    return { action: 'RAISE', amount: raiseTo, headline: "Relance à " + fmt(raiseTo) + " jetons", numbers: nums, chart: chart,
      reasons: [intro, "Ta main est bien meilleure que ce qu'il a en moyenne : relance pour le faire payer plus cher (ou le faire coucher)."] };
  if (s.heroPos === 'BB')
    return { action: 'CHECK', headline: "Checke (parole)", numbers: nums, chart: chart,
      reasons: [intro, "Tu vois le flop gratuitement : pas besoin de risquer des jetons avec une main moyenne."] };
  if (gainPlay > 0)
    return { action: 'CALL', amount: callAmt, headline: "Complète (" + fmt(callAmt) + " jetons)", numbers: nums, chart: chart,
      reasons: [intro, "Ça ne coûte pas cher de voir le flop et ta main a assez de potentiel."] };
  return { action: 'FOLD', headline: "Couche-toi", numbers: nums, chart: chart,
    reasons: [intro, "Ta main n'a pas assez de valeur, même pour un petit prix."] };
}
