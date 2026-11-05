// Tests du moteur sur des situations types.
// Lancement : /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tools/test.js

load("js/cards.js"); load("js/equity_data.js"); load("js/engine.js"); load("js/preflop.js"); load("js/postflop.js");

var fails = 0;
function cards(s) { return s ? s.split(" ").map(parseCard) : []; }
function check(name, res, expected) {
  var ok = expected.indexOf(res.action) >= 0;
  if (!ok) fails++;
  print((ok ? "OK    " : "ÉCHEC ") + name + " -> " + res.action + (res.amount ? " " + res.amount : "") + "   [" + res.headline + "]");
  if (!ok) res.reasons.forEach(function (r) { print("        " + r); });
}
function pre(o) {
  var s = { n: 3, heroPos: 'BTN', stacks: { BTN: 500, SB: 500, BB: 500 }, sb: 10, bb: 20, ante: 0, payouts: [1, 0, 0],
            style: 'normal', actions: {}, heroPrev: 0 };
  for (var k in o) s[k] = o[k];
  s.heroCards = cards(o.hand);
  return preflopDecision(s);
}
function post(o) {
  var s = { nOpp: 1, villainPre: 'call', earlierAggro: false, heroWasRaiser: true, heroInPosition: true, style: 'normal', toCall: 0 };
  for (var k in o) s[k] = o[k];
  s.heroCards = cards(o.hand); s.board = cards(o.board);
  return postflopDecision(s);
}
var S10 = { BTN: 200, SB: 200, BB: 200 };

print("--- Préflop, push/fold (10 BB) ---");
check("BTN A5o 10bb tapis", pre({ hand: "Ad 5c", stacks: S10 }), ['ALLIN']);
check("BTN 72o 10bb couché", pre({ hand: "7d 2c", stacks: S10 }), ['FOLD']);
check("BTN K9s 10bb tapis", pre({ hand: "Kd 9d", stacks: S10 }), ['ALLIN']);
check("SB (BTN couché) J4s tapis", pre({ hand: "Jd 4d", heroPos: 'SB', stacks: S10, actions: { BTN: { type: 'fold' } } }), ['ALLIN']);
check("HU SB 10bb 83o tapis (58%)", pre({ n: 2, heroPos: 'SB', hand: "8d 3c", stacks: { SB: 200, BB: 200 } }), ['ALLIN', 'FOLD']);
check("HU SB 10bb 72o couché", pre({ n: 2, heroPos: 'SB', hand: "7d 2c", stacks: { SB: 200, BB: 200 } }), ['FOLD']);

print("--- Préflop, face à un tapis ---");
check("BB vs tapis BTN 10bb, A7o suit", pre({ hand: "Ad 7c", heroPos: 'BB', stacks: S10, actions: { BTN: { type: 'allin' }, SB: { type: 'fold' } } }), ['CALL']);
check("BB vs tapis BTN 10bb, Q5o couché", pre({ hand: "Qd 5c", heroPos: 'BB', stacks: S10, actions: { BTN: { type: 'allin' }, SB: { type: 'fold' } } }), ['FOLD']);
check("SB vs tapis BTN, QQ suit", pre({ hand: "Qd Qc", heroPos: 'SB', stacks: S10, actions: { BTN: { type: 'allin' } } }), ['CALL']);
check("BB vs tapis BTN+SB, KJo couché", pre({ hand: "Kd Jc", heroPos: 'BB', stacks: S10, actions: { BTN: { type: 'allin' }, SB: { type: 'allin' } } }), ['FOLD']);
check("BB 2 BB restants vs tapis SB, 94o suit (cote)", pre({ hand: "9d 4c", heroPos: 'BB', stacks: { BTN: 800, SB: 650, BB: 50 }, actions: { BTN: { type: 'fold' }, SB: { type: 'allin' } } }), ['CALL']);

print("--- Préflop, début de partie (25 BB) ---");
check("BTN 25bb AJo relance", pre({ hand: "Ad Jc" }), ['RAISE']);
check("BTN 25bb 93o couché", pre({ hand: "9d 3c" }), ['FOLD']);
check("BB vs relance BTN 2BB, KTs ne se couche pas", pre({ hand: "Kd Td", heroPos: 'BB', actions: { BTN: { type: 'raise', amount: 40 }, SB: { type: 'fold' } } }), ['CALL', 'ALLIN']);
check("BB vs relance BTN 2BB, 72o couché", pre({ hand: "7d 2c", heroPos: 'BB', actions: { BTN: { type: 'raise', amount: 40 }, SB: { type: 'fold' } } }), ['FOLD']);
check("SB vs relance BTN 2BB à 15bb, A9o tapis", pre({ hand: "Ad 9c", heroPos: 'SB', stacks: { BTN: 300, SB: 300, BB: 300 }, actions: { BTN: { type: 'raise', amount: 40 } } }), ['ALLIN']);
check("BB 10bb vs limp SB, 72o checke", pre({ hand: "7d 2c", heroPos: 'BB', stacks: S10, actions: { BTN: { type: 'fold' }, SB: { type: 'limp' } } }), ['CHECK']);
check("BB vs limp SB, AA relance/tapis", pre({ hand: "Ad Ac", heroPos: 'BB', actions: { BTN: { type: 'fold' }, SB: { type: 'limp' } } }), ['RAISE', 'ALLIN']);
check("BB vs limp SB, 82o checke", pre({ hand: "8d 2c", heroPos: 'BB', actions: { BTN: { type: 'fold' }, SB: { type: 'limp' } } }), ['CHECK']);

print("--- Après le flop ---");
check("Top paire bon kicker, personne n'a misé -> mise", post({ hand: "Ah Kd", board: "Ks 7c 2d", pot: 120, heroStack: 400, oppStack: 400 }), ['BET']);
check("Rien du tout face à grosse mise -> couché", post({ hand: "6h 5h", board: "Ks Qc 2d", pot: 240, toCall: 120, heroStack: 400, oppStack: 400 }), ['FOLD']);
check("Brelan face à mise -> relance/tapis", post({ hand: "7h 7d", board: "Ks 7c 2d", pot: 200, toCall: 80, heroStack: 400, oppStack: 400 }), ['RAISE', 'ALLIN']);
check("Tirage couleur, petite mise -> suit/tapis", post({ hand: "Ah 9h", board: "Kh 7h 2d", pot: 150, toCall: 40, heroStack: 400, oppStack: 400 }), ['CALL', 'ALLIN', 'RAISE']);
check("Quinte flush max à la river -> mise/tapis", post({ hand: "Ah Kh", board: "Qh Jh Th 2c 3d", pot: 200, heroStack: 300, oppStack: 300 }), ['BET', 'ALLIN']);

print(fails ? "\n" + fails + " ÉCHEC(S)" : "\nTous les tests passent.");
