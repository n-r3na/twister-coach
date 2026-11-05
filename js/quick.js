// quick.js — le mode rapide : tes cartes, celles du milieu, ton tapis et le nombre de joueurs.
//
// Hypothèses (Twister à 5 €, 3 x 500 = 1500 jetons au total) :
//  - les adversaires sont agressifs : ils font tapis et suivent avec beaucoup de mains ;
//  - à 2 joueurs, l'adversaire a 1500 - tes jetons ; à 3, les deux autres se partagent le reste.
// Le bot répond par 3 verdicts : GO (tu peux tout mettre), CAREFUL (ne joue que si personne n'a
// fait tapis / si c'est pas cher), FOLD.

var TOTAL_CHIPS = 1500;

var QUICK = {
  // % de mains avec lesquelles un adversaire agressif fait tapis, selon le tapis effectif (en BB)
  shovePct: { 3: [[5, 60], [10, 45], [20, 30]], 2: [[5, 85], [10, 65], [20, 45]] },
  callMargin: { 3: 0.04, 2: 0.02 }, // prudence en plus de la cote du pot (à 3, le dernier joueur peut se réveiller)
  openPct: { 3: 30, 2: 55 },        // tapis profonds : % de mains à relancer quand personne n'a misé
  pushFoldBB: 15,                   // en dessous : tapis ou rien, calculé par le solveur
  callerFactor: 1.4,                // les adversaires suivent nos tapis 40 % plus large que l'équilibre
  villainPostPct: 50,               // mains avec lesquelles un adversaire agressif voit le flop
  betKeep: 0.65,                    // part de ses mains avec lesquelles il mise / fait tapis après le flop
  // préflop : % de mains selon ce qu'il a fait
  raisePct: { 3: 40, 2: 60 },       // il relance
  limpPct: { 3: 65, 2: 80 },        // il paie juste (limp) ou suit
  // après le flop : part de ses mains qu'il garde selon ce qu'il fait
  keepOnAction: { none: 0.65, call: 0.8, raise: 0.55, allin: 0.6 },
  postMargin: 0.06,                 // prudence en plus de la cote du pot après le flop
  carefulGap: 0.12                  // écart entre "Vas-y" et "Prudence" après le flop
};

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (var i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      var a = points[i - 1], b = points[i];
      return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
  }
  return points[points.length - 1][1];
}

// o = { n: 2 | 3, stack: tes jetons, sb, bb, villain: 'none' | 'call' | 'raise' | 'allin' }
function quickDecision(hero, board, o) {
  initEngine();
  var others = o.n === 2 ? [TOTAL_CHIPS - o.stack] : [(TOTAL_CHIPS - o.stack) / 2, (TOTAL_CHIPS - o.stack) / 2];
  var effBB = Math.min(o.stack, Math.max.apply(null, others)) / o.bb;
  var res = board.length === 0 ? quickPreflop(hero, o, others, effBB) : quickPostflop(hero, board, effBB, o.villain || 'none');
  res.effBB = effBB;
  return res;
}

function setVerdict(res, verdict, title, action, why) {
  res.verdict = verdict; res.title = title; res.action = action; res.why = why;
  return res;
}

function quickPreflop(hero, o, others, eff) {
  var n = o.n, act = o.villain || 'none', h = classOf(hero[0], hero[1]), top = HAND_TOP_PCT[h];
  var shovePct = interp(QUICK.shovePct[n], eff);
  var eq = vsRange(h, topRange(shovePct)).eq;
  var need = Math.max(0.2, (eff - 0.5) / (2 * eff + 1.5)) + QUICK.callMargin[n];
  var res = { street: 'preflop', hand: CLASS_LABELS[h], eq: eq, need: need, top: top, meterLabel: "Tes chances contre un tapis" };
  var deep = eff > QUICK.pushFoldBB;
  var raiseTo = 2 * o.bb;
  var vsShove = "Avec " + eff.toFixed(0) + " BB, il te faut " + pct(need) + " de chances pour suivre un tapis. Contre un joueur agressif (tapis avec ~" +
    shovePct.toFixed(0) + " % des mains), ta main en a " + pct(eq) + ".";

  if (act === 'allin') {
    if (eq >= need) return setVerdict(res, 'GO', "Suis son tapis", "Mets tous tes jetons : suis.", vsShove);
    return setVerdict(res, 'FOLD', "Couche-toi", "Laisse-lui le pot.", vsShove + " Pas assez.");
  }

  if (act === 'raise') {
    var eqR = vsRange(h, topRange(QUICK.raisePct[n])).eq;
    if (eq >= need) return setVerdict(res, 'GO', "Vas-y",
      eff <= 25 ? "Fais tapis par-dessus sa relance." : "Relance fort (environ 3 fois sa mise). S'il fait tapis, suis.",
      "Ta main est assez forte pour tout jouer, même s'il suit. " + vsShove);
    res.eq = eqR; res.need = 0.5; res.meterLabel = "Tes chances contre sa relance";
    if (eqR >= 0.5 && eff > 8) return setVerdict(res, 'CAREFUL', "Suis, puis prudence",
      "Paie sa relance. S'il fait tapis ensuite, couche-toi.",
      "Contre ses relances (~" + QUICK.raisePct[n] + " % des mains), tu gagnes " + pct(eqR) + " du temps : assez pour voir le flop, pas pour tout risquer.");
    return setVerdict(res, 'FOLD', "Couche-toi", "Ne paie pas sa relance.",
      "Contre ses relances (~" + QUICK.raisePct[n] + " % des mains), tu ne gagnes que " + pct(eqR) + " du temps.");
  }

  if (act === 'call') {
    var eqL = vsRange(h, topRange(QUICK.limpPct[n])).eq;
    var attack = deep ? "Relance à " + (3 * o.bb) + "." : "Fais tapis : il a juste payé, il se couchera souvent.";
    if (eq >= need) return setVerdict(res, 'GO', "Vas-y", attack + " S'il fait tapis, suis.", "Il a montré une main moyenne. " + vsShove);
    res.eq = eqL; res.need = 0.55; res.meterLabel = "Tes chances contre sa main moyenne";
    if (eqL >= 0.55) return setVerdict(res, 'CAREFUL', "Attaque, mais pas plus", attack + " S'il fait tapis derrière, couche-toi.",
      "Tu es devant ce qu'il a en moyenne (" + pct(eqL) + "), mais pas assez forte pour suivre un tapis.");
    if (eqL >= 0.45) return setVerdict(res, 'CAREFUL', "Prudence", "Checke si tu es grosse blinde, sinon paie aussi. Prudence au flop.",
      "Ta main fait jeu égal avec la sienne (" + pct(eqL) + ") : vois le flop pas cher, sans en mettre plus.");
    return setVerdict(res, 'FOLD', "Couche-toi", "Checke si c'est gratuit, sinon couche-toi.",
      "Même contre une main moyenne, tu ne gagnes que " + pct(eqL) + " du temps.");
  }

  if (eq >= need) return setVerdict(res, 'GO', "Vas-y",
    deep ? "Relance à " + raiseTo + " ou fais tapis. Si quelqu'un fait tapis, suis." : "Fais tapis, ou suis le tapis d'un adversaire.", vsShove);

  var canOpen;
  if (deep) canOpen = top <= QUICK.openPct[n];
  else {
    // tapis d'entrée : meilleure réponse à des adversaires qui suivent large (position prudente : bouton à 3)
    // tapis arrondis à la demi-blinde : le solveur réutilise ses calculs quand on bouge la barre
    var half = o.bb / 2;
    var st = [o.stack].concat(others).map(function (x) { return Math.max(o.bb, Math.round(x / half) * half); });
    var node = n === 3 ? 'pBTN' : 'pSB';
    var sol = solvePushFold(st, o.sb, o.bb, 0, [1, 0, 0], 120);
    var spot = buildSpots(sol.ctx, adjustStrategies(sol.S, QUICK.callerFactor, [node]))[node];
    canOpen = evAllIn(spot, h) > evFold(spot);
  }
  if (canOpen) return setVerdict(res, 'CAREFUL', "Seulement si personne n'a fait tapis",
    deep ? "Si personne n'a misé avant toi : relance à " + raiseTo + ". Si quelqu'un fait tapis : couche-toi."
         : "Si personne n'a misé avant toi : fais tapis. Si quelqu'un a déjà fait tapis : couche-toi.",
    "Assez bonne pour attaquer en premier, même contre des joueurs qui suivent beaucoup. Mais contre un tapis elle ne gagne que " +
      pct(eq) + " du temps, et il en faudrait " + pct(need) + ".");
  return setVerdict(res, 'FOLD', "Couche-toi", "Si tu es grosse blinde et que personne n'a relancé, checke (c'est gratuit).",
    "Contre un tapis elle ne gagne que " + pct(eq) + " du temps (il faudrait " + pct(need) + "), et attaquer avec elle te ferait perdre des jetons.");
}

function quickPostflop(hero, board, eff, act) {
  // Pot typique après une relance suivie : ~5 BB ; il reste environ (tapis - 2 BB) à jouer.
  var behind = Math.max(1, eff - 2);
  var need = behind / (2 * behind + 5);
  var goEq = Math.min(0.5, Math.max(0.33, need + QUICK.postMargin));
  var carefulEq = goEq - QUICK.carefulGap;

  var dead = hero.concat(board);
  var all = rangeCombos(topRange(QUICK.villainPostPct), dead);
  var vs = narrowOnBet(all, board, QUICK.keepOnAction[act]);
  var eqAll = equityVsCombos(hero, board, [all], 4000, 99);
  var eqV = equityVsCombos(hero, board, [vs], 4000, 77);
  var hand = describeHand(hero, board);
  var d = drawsOf(hero, board);
  var drawTxt = d.flush && d.oesd ? "Tirage couleur + quinte" : d.flush ? "Tirage couleur" : d.oesd ? "Tirage quinte (2 bouts)" : d.gutshot ? "Tirage quinte ventral" : "";
  var drawNote = drawTxt ? "Tu as un tirage : ta main peut encore s'améliorer, mais elle n'est pas faite. " : "";
  var label = { none: "Tes chances s'il mise", call: "Tes chances contre ce qu'il suit", raise: "Tes chances contre sa relance", allin: "Tes chances contre son tapis" }[act];
  var res = { street: STREET_FR[board.length], hand: hand.text, draw: drawTxt, eq: eqV, eqAll: eqAll, need: goEq, cat: hand.cat, meterLabel: label };
  var vsTxt = "Contre ce qu'il peut avoir, tu gagnes " + pct(eqV) + " du temps (il en faut " + pct(goEq) + " avec ton tapis).";

  if (act === 'allin') {
    if (eqV >= goEq) return setVerdict(res, 'GO', "Suis son tapis", "Mets tous tes jetons : suis.", vsTxt);
    return setVerdict(res, 'FOLD', "Couche-toi", "Laisse-lui le pot.", drawNote + vsTxt + " Pas assez.");
  }
  if (act === 'raise') {
    if (eqV >= goEq) return setVerdict(res, 'GO', "Vas-y", "Fais tapis (ou suis s'il est déjà presque à tapis).", vsTxt);
    if (eqV >= carefulEq + 0.05) return setVerdict(res, 'CAREFUL', "Prudence", "Suis seulement si sa mise est petite (moins de la moitié du pot). Sinon couche-toi.", drawNote + vsTxt);
    return setVerdict(res, 'FOLD', "Couche-toi", "Ne paie pas sa mise.", drawNote + vsTxt);
  }
  if (act === 'call') {
    if (eqV >= goEq) return setVerdict(res, 'GO', "Continue", "Mise encore (ou fais tapis s'il te reste peu de jetons).", "Il a suivi, mais ta main reste devant. " + vsTxt);
    if (eqV >= carefulEq) return setVerdict(res, 'CAREFUL', "Prudence", "Checke. S'il mise, suis seulement si c'est petit.", drawNote + "Il a suivi : il a sûrement quelque chose. " + vsTxt);
    return setVerdict(res, 'FOLD', "Arrête de miser", "Checke, et couche-toi s'il mise.", "Il a suivi : il a sûrement mieux que toi. " + vsTxt);
  }

  if (eqV >= goEq) return setVerdict(res, 'GO', "Vas-y", "Mise ou fais tapis. Si l'adversaire fait tapis, suis.",
    "Même contre les mains avec lesquelles il mise, tu gagnes " + pct(eqV) + " du temps. Avec ton tapis, il en faut " + pct(goEq) + ".");
  if (eqV >= carefulEq || (eqAll >= 0.5 && board.length < 5)) return setVerdict(res, 'CAREFUL', "Prudence",
    "Checke. Suis une petite mise (moins de la moitié du pot), couche-toi face à un tapis.",
    drawNote + "Tu gagnes " + pct(eqAll) + " du temps s'il n'a rien de spécial, mais seulement " + pct(eqV) + " s'il mise fort.");
  return setVerdict(res, 'FOLD', "Couche-toi", "Checke si c'est gratuit, sinon couche-toi.",
    "Tu ne gagnes que " + pct(eqV) + " du temps contre une mise (il faudrait " + pct(goEq) + "). Ne remets plus de jetons dans ce coup.");
}
