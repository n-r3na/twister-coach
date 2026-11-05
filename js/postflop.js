// postflop.js — décisions après le flop (des cartes sont au milieu).
//
// Situation attendue (objet s) :
//   heroCards, board (3 à 5 cartes), pot (tout ce qui est au milieu, mises de ce tour comprises),
//   toCall (ce que tu dois payer pour suivre, 0 si personne n'a misé),
//   heroStack (tes jetons restants devant toi), oppStack (jetons restants du plus gros adversaire encore dans le coup),
//   nOpp (1 ou 2), villainPre: 'raise' | 'call' | 'limp' | 'check' | '3bet' (ce qu'il a fait avant le flop),
//   earlierAggro (il a déjà misé sur un tour précédent), heroWasRaiser, heroInPosition, style

var VILLAIN_PRE = {
  raise: { pct: 40, topCut: 0, why: "a relancé avant le flop" },
  call: { pct: 40, topCut: 5, why: "a suivi une relance avant le flop" },
  limp: { pct: 60, topCut: 8, why: "a juste payé (limp) avant le flop" },
  check: { pct: 100, topCut: 12, why: "a checké de grosse blinde (il peut avoir n'importe quoi)" },
  '3bet': { pct: 12, topCut: 0, why: "a sur-relancé avant le flop" }
};

var STREET_FR = { 3: "flop", 4: "turn", 5: "river" };

function villainPreRange(kind, factor) {
  var d = VILLAIN_PRE[kind] || VILLAIN_PRE.call;
  var p = Math.min(100, d.pct * factor);
  return d.topCut ? bandRange(d.topCut, p, 0.3) : topRange(p);
}

function rangeCombos(range, dead) {
  var out = [];
  for (var g = 0; g < NUM_CLASSES; g++) {
    if (!range[g]) continue;
    CLASS_COMBOS[g].forEach(function (cb) {
      if (dead.indexOf(cb[0]) < 0 && dead.indexOf(cb[1]) < 0) out.push({ a: cb[0], b: cb[1], w: range[g] });
    });
  }
  return out;
}

// Tirages : couleur (4 cartes de la même couleur) et quinte (par = 8 outs, ventral = 4 outs).
function drawsOf(hole, board) {
  var cards = hole.concat(board), d = { flush: false, oesd: false, gutshot: false, outs: 0 };
  if (board.length >= 5) return d;
  var made = handCategory(evalHand(cards));
  var suitCnt = [0, 0, 0, 0];
  cards.forEach(function (c) { suitCnt[c & 3]++; });
  for (var s = 0; s < 4; s++) {
    if (suitCnt[s] === 4 && made < 5 && hole.some(function (c) { return (c & 3) === s; })) { d.flush = true; d.outs += 9; }
  }
  if (made < 4) {
    var mask = 0;
    cards.forEach(function (c) { mask |= 1 << (c >> 2); });
    var completing = 0;
    for (var r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      if (straightHigh(mask | (1 << r)) >= 0) completing++;
    }
    var holeMask = 0;
    hole.forEach(function (c) { holeMask |= 1 << (c >> 2); });
    var boardOnly = 0;
    board.forEach(function (c) { boardOnly |= 1 << (c >> 2); });
    if (completing >= 2) { d.oesd = true; d.outs += d.flush ? 6 : 8; }
    else if (completing === 1) { d.gutshot = true; d.outs += d.flush ? 3 : 4; }
  }
  return d;
}

// Description simple de ce que tu as.
function describeHand(hole, board) {
  var all = hole.concat(board), sc = evalHand(all), cat = handCategory(sc);
  var boardMax = Math.max.apply(null, board.map(function (c) { return c >> 2; }));
  var txt = cat === 0 ? "Pas de paire" : CATEGORY_FR[cat];
  if (cat === 1) {
    var pr = (sc >> 12) & 15, holeR = hole.map(function (c) { return c >> 2; });
    if (holeR[0] === holeR[1] && holeR[0] > boardMax) txt = "Paire servie au-dessus du tableau (overpair) : " + RANK_NAMES_FR[pr];
    else if (holeR.indexOf(pr) < 0) txt = "Rien de plus que la paire du tableau";
    else if (pr === boardMax) txt = "Top paire (paire avec la plus haute carte du tableau) : " + RANK_NAMES_FR[pr];
    else txt = "Paire moyenne/basse de " + RANK_NAMES_FR[pr];
  } else if (cat >= 2) {
    // la main vient-elle seulement du tableau ?
    if (board.length === 5 && evalHand(board) === sc) txt += " (mais c'est le tableau qui joue : tout le monde l'a)";
  }
  return { score: sc, cat: cat, text: txt };
}

// Force "brute" d'une combinaison adverse sur ce tableau, pour savoir ce qu'il garde quand il mise.
function comboStrength(a, b, board) {
  var sc = evalHand([a, b].concat(board));
  var d = drawsOf([a, b], board);
  return { sc: sc, draw: d.flush || d.oesd };
}

// Ne garde que la partie forte de la range (+ les tirages, qu'on mise souvent en bluff).
function narrowOnBet(combos, board, keep) {
  var scored = combos.map(function (c) { var s = comboStrength(c.a, c.b, board); return { c: c, sc: s.sc, draw: s.draw }; });
  scored.sort(function (x, y) { return y.sc - x.sc; });
  var tot = scored.reduce(function (a, x) { return a + x.c.w; }, 0), cum = 0, out = [];
  scored.forEach(function (x) {
    if (cum < keep * tot) out.push(x.c);
    else if (x.draw) out.push({ a: x.c.a, b: x.c.b, w: x.c.w * 0.8 });
    cum += x.c.w;
  });
  return out;
}

function pickCombo(list, cumw, rng) {
  var x = rng() * cumw[cumw.length - 1], lo = 0, hi = cumw.length - 1;
  while (lo < hi) { var m = (lo + hi) >> 1; if (cumw[m] < x) lo = m + 1; else hi = m; }
  return list[lo];
}

// Équité par simulation (Monte-Carlo) contre 1 ou 2 adversaires.
function equityVsCombos(hero, board, villains, trials, seed) {
  var rng = makeRng(seed || 7), cums = villains.map(function (l) {
    var c = [], s = 0; l.forEach(function (x) { s += x.w; c.push(s); }); return c;
  });
  var used = new Uint8Array(52), win = 0, done = 0, attempts = 0, cards = new Array(7), need = 5 - board.length;
  while (done < trials && attempts < trials * 20) {
    attempts++;
    used.fill(0);
    hero.concat(board).forEach(function (c) { used[c] = 1; });
    var vh = [], bad = false;
    for (var v = 0; v < villains.length; v++) {
      var cb = pickCombo(villains[v], cums[v], rng);
      if (used[cb.a] || used[cb.b]) { bad = true; break; }
      used[cb.a] = used[cb.b] = 1; vh.push(cb);
    }
    if (bad) continue;
    var runout = [];
    while (runout.length < need) { var c = (rng() * 52) | 0; if (!used[c]) { used[c] = 1; runout.push(c); } }
    var full = board.concat(runout);
    var hs = evalHand(hero.concat(full)), best = hs, nBest = 1, heroBest = true;
    for (var k = 0; k < vh.length; k++) {
      var vs = evalHand([vh[k].a, vh[k].b].concat(full));
      if (vs > best) { best = vs; nBest = 1; heroBest = false; } else if (vs === best) nBest++;
    }
    if (heroBest) win += 1 / nBest;
    done++;
  }
  return done ? win / done : 0;
}

function postflopDecision(s) {
  initEngine();
  var factor = STYLE_FACTOR[s.style] || 1;
  var dead = s.heroCards.concat(s.board);
  var street = STREET_FR[s.board.length];
  var base = rangeCombos(villainPreRange(s.villainPre, factor), dead);
  var betFrac = s.toCall > 0 ? s.toCall / Math.max(1, s.pot - s.toCall) : 0;
  var vCombos = base;
  if (s.toCall > 0) {
    var keep = betFrac <= 0.4 ? 0.7 : betFrac <= 0.8 ? 0.55 : betFrac <= 1.2 ? 0.45 : 0.35;
    if (s.earlierAggro) keep *= 0.8;
    keep = Math.max(0.15, Math.min(0.95, keep + (factor > 1 ? 0.15 : factor < 1 ? -0.1 : 0)));
    vCombos = narrowOnBet(base, s.board, keep);
  } else if (s.earlierAggro) {
    vCombos = narrowOnBet(base, s.board, 0.7);
  }
  var villains = [];
  for (var v = 0; v < (s.nOpp || 1); v++) villains.push(vCombos);
  var eq = equityVsCombos(s.heroCards, s.board, villains, 5000, 1234);

  var hand = describeHand(s.heroCards, s.board);
  var draws = drawsOf(s.heroCards, s.board);
  var n = s.nOpp || 1, fair = 1 / (n + 1);
  var eff = Math.min(s.heroStack, s.oppStack || s.heroStack);
  var spr = eff / Math.max(1, s.pot);
  var strong = eq >= fair + (1 - fair) * 0.45;
  var good = eq >= fair + (1 - fair) * 0.3;
  var bigDraw = (draws.flush || draws.oesd) && eq >= fair * 0.65;

  var drawTxt = draws.flush && draws.oesd ? "un tirage couleur + quinte (énorme)" : draws.flush ? "un tirage couleur (9 cartes t'aident)" :
                draws.oesd ? "un tirage quinte par les deux bouts (8 cartes t'aident)" : draws.gutshot ? "un tirage quinte ventral (4 cartes t'aident)" : "";
  var info = [
    "Ce que tu as : " + hand.text + (drawTxt ? ", avec " + drawTxt : "") + ".",
    "Je suppose que l'adversaire " + (VILLAIN_PRE[s.villainPre] || VILLAIN_PRE.call).why +
      (s.toCall > 0 ? " et qu'en misant ici il montre plutôt une main correcte (ou un tirage)." : ".") +
      " Contre ça, tu gagnes " + pct(eq) + " du temps" + (n > 1 ? " (contre les 2 adversaires)." : ".")
  ];
  var nums = [{ label: "Tes chances de gagner à la fin", value: pct(eq) }, { label: "Ta main", value: CATEGORY_FR[hand.cat] },
              { label: "Tapis restant / pot (SPR)", value: spr.toFixed(1) }];
  var res = { street: street, eq: eq, numbers: nums, reasons: info };

  function allin(head, why) { res.action = 'ALLIN'; res.amount = s.heroStack; res.headline = head || "TAPIS !"; res.reasons = info.concat(why); return res; }
  function bet(size, why, label) {
    var amt = Math.round(s.pot * size);
    if (amt >= s.heroStack * 0.45) return allin("TAPIS !", why.concat(["La mise idéale représente presque la moitié de ton tapis : autant mettre tout directement."]));
    res.action = 'BET'; res.amount = amt; res.headline = (label || "Mise") + " " + fmt(amt) + " jetons";
    res.reasons = info.concat(why); return res;
  }

  if (s.toCall > 0) {
    var call = Math.min(s.toCall, s.heroStack);
    var need = call / (s.pot + call);
    nums.push({ label: "Chances nécessaires pour suivre", value: pct(need) });
    var oddsTxt = "Il faut payer " + fmt(call) + " pour un pot de " + fmt(s.pot + call) + " : suivre est rentable si tu gagnes plus de " + pct(need) + " du temps.";
    if (s.toCall >= s.heroStack) {
      if (eq > need) { res.action = 'CALL'; res.amount = call; res.headline = "SUIS (tapis, " + fmt(call) + " jetons)";
        res.reasons = info.concat([oddsTxt, "Tu as " + pct(eq) + " : c'est assez, on suit."]); return res; }
      res.action = 'FOLD'; res.headline = "Couche-toi"; res.reasons = info.concat([oddsTxt, "Tu n'as que " + pct(eq) + " : pas assez."]); return res;
    }
    if (strong) {
      if (spr < 3 || s.heroStack <= s.pot + 2 * s.toCall) return allin("TAPIS ! (relance avec tout)", [oddsTxt, "Ta main est très forte : on met tout de suite le maximum de jetons au milieu."]);
      var to = Math.round(s.toCall * 3);
      res.action = 'RAISE'; res.amount = to; res.headline = "Relance à " + fmt(to) + " jetons";
      res.reasons = info.concat([oddsTxt, "Ta main est très forte : relance environ 3 fois sa mise pour gagner plus de jetons."]); return res;
    }
    if (eq >= need + 0.03) {
      if (bigDraw && spr < 2 && eq >= need) return allin("TAPIS ! (semi-bluff)", [oddsTxt, "Avec ton tirage et peu de jetons derrière, mettre tapis maintenant est meilleur que suivre : il peut se coucher, et sinon tu as encore des chances."]);
      res.action = 'CALL'; res.amount = call; res.headline = "SUIS (" + fmt(call) + " jetons)";
      res.reasons = info.concat([oddsTxt, "Tu as " + pct(eq) + " : c'est assez pour suivre, mais pas assez pour relancer."]); return res;
    }
    if (bigDraw && s.board.length === 3 && spr > 3 && eq + 0.07 >= need) {
      res.action = 'CALL'; res.amount = call; res.headline = "SUIS (" + fmt(call) + " jetons)";
      res.reasons = info.concat([oddsTxt, "C'est un peu juste, mais si ton tirage rentre tu gagneras souvent un gros pot derrière (« cotes implicites »)."]); return res;
    }
    res.action = 'FOLD'; res.headline = "Couche-toi";
    res.reasons = info.concat([oddsTxt, "Tu n'as que " + pct(eq) + " : ça coûte trop cher pour ce que ta main vaut."]); return res;
  }

  // Personne n'a misé : tu peux miser ou checker
  if (strong || good) {
    if (spr < 1.2) return allin("TAPIS !", ["Ta main est devant la plupart du temps et il reste peu de jetons par rapport au pot : mets tout."]);
    return bet(strong ? 0.66 : 0.5, ["Ta main est probablement la meilleure : mise pour te faire payer par des mains moins bonnes et protéger ta main contre les tirages."], "Mise");
  }
  if (bigDraw && n === 1) {
    if (spr < 1.5) return allin("TAPIS ! (semi-bluff)", ["Tu n'as pas encore de main faite, mais un gros tirage. En faisant tapis, l'adversaire va souvent se coucher, et s'il suit tu as encore " + pct(eq) + " de chances."]);
    return bet(0.5, ["Tu as un gros tirage : en misant tu peux gagner tout de suite si l'adversaire se couche, et sinon ta main peut encore s'améliorer (« semi-bluff »)."], "Mise");
  }
  if (s.heroWasRaiser && n === 1 && s.board.length === 3 && eq >= 0.35)
    return bet(0.33, ["Tu as relancé avant le flop : l'adversaire pense que tu es fort. Une petite mise (un tiers du pot) le fait souvent coucher (« continuation bet »)."], "Petite mise");
  res.action = 'CHECK'; res.headline = "Checke (parole)";
  res.reasons = info.concat([eq >= fair ? "Ta main a de la valeur mais pas assez pour miser : checke et vois la suite gratuitement."
                                        : "Ta main est faible ici : ne mets pas de jetons, checke. Si l'adversaire mise gros, tu pourras te coucher."]);
  return res;
}
