// Génère js/equity_data.js : équité préflop de chaque classe de main contre chaque autre (169 x 169).
// Lancement (macOS, sans Node) :
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tools/gen_equity.js -- 4000 > js/equity_data.js

load("js/cards.js");

var SAMPLES = parseInt(arguments[0] || "4000", 10);
var rng = makeRng(20261105);
var deck = new Int32Array(52);
var hand = new Int32Array(7);
var eq = new Float64Array(NUM_CLASSES * NUM_CLASSES);

function sample(i, j) {
  var A = CLASS_COMBOS[i], B = CLASS_COMBOS[j], score = 0, done = 0;
  while (done < SAMPLES) {
    var a = A[(rng() * A.length) | 0], b = B[(rng() * B.length) | 0];
    if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
    var n = 0;
    for (var c = 0; c < 52; c++) if (c !== a[0] && c !== a[1] && c !== b[0] && c !== b[1]) deck[n++] = c;
    for (var k = 0; k < 5; k++) {
      var p = k + ((rng() * (n - k)) | 0), t = deck[k]; deck[k] = deck[p]; deck[p] = t;
      hand[2 + k] = deck[k];
    }
    hand[0] = a[0]; hand[1] = a[1];
    var sa = evalHand(hand, 7);
    hand[0] = b[0]; hand[1] = b[1];
    var sb = evalHand(hand, 7);
    score += sa > sb ? 1 : sa === sb ? 0.5 : 0;
    done++;
  }
  return score / SAMPLES;
}

for (var i = 0; i < NUM_CLASSES; i++) {
  eq[i * NUM_CLASSES + i] = 0.5;
  for (var j = i + 1; j < NUM_CLASSES; j++) {
    var e = sample(i, j);
    eq[i * NUM_CLASSES + j] = e;
    eq[j * NUM_CLASSES + i] = 1 - e;
  }
}

var parts = [];
for (var k = 0; k < eq.length; k++) parts.push(Math.round(eq[k] * 1000));
print("// Fichier généré par tools/gen_equity.js (" + SAMPLES + " tirages par confrontation). Ne pas modifier à la main.");
print("// Équité préflop (en pour mille) de la classe ligne contre la classe colonne.");
print("var PREFLOP_EQ_PERMILLE = [" + parts.join(",") + "];");
