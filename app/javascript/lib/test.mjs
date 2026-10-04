// Sanity tests for the BacktestLab indicator + backtest cores. Run: node test.mjs
import * as ind from './indicators.js';
import { runBacktest } from './backtester.js';
import { strategies } from './strategies.js';

let passed = 0;
let failed = 0;
function assert(cond, name, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL: ${name} ${detail}`);
  }
}
const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---- deterministic candles: clean uptrend, close = 100 + i ----
const N = 60;
const candles = [];
for (let i = 0; i < N; i++) {
  const close = 100 + i;
  candles.push({
    time: i,
    open: i === 0 ? 100 : 99 + i,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 1000,
  });
}
const closes = candles.map((c) => c.close);

// ---- indicators ----
assert(
  JSON.stringify(ind.sma([1, 2, 3, 4, 5], 3)) === JSON.stringify([null, null, 2, 3, 4]),
  'sma basic'
);
assert(
  ind.ema([1, 2, 3, 4, 5], 3).every((v, i) => (v === null ? i < 2 : approx(v, [2, 3, 4][i - 2]))),
  'ema seeds with SMA then smooths'
);
const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
const falling = Array.from({ length: 20 }, (_, i) => 100 - i);
assert(ind.rsi(rising)[19] === 100, 'rsi all-up = 100');
assert(ind.rsi(falling)[19] === 0, 'rsi all-down = 0');
assert(ind.rsi(closes).every((v) => v === null || (v >= 0 && v <= 100)), 'rsi bounded 0-100');

const bb = ind.bollinger(closes);
const s20 = ind.sma(closes, 20);
assert(bb.middle.every((v, i) => v === null || approx(v, s20[i])), 'bollinger middle == sma(20)');
assert(
  bb.upper.every((v, i) => v === null || (v >= bb.middle[i] && bb.lower[i] <= bb.middle[i])),
  'bollinger bands contain middle'
);

const m = ind.macd(closes);
assert(m.macdLine[24] === null && m.macdLine[25] !== null, 'macd line starts after slow-1');
assert(m.signalLine[32] === null && m.signalLine[33] !== null, 'signal starts after slow-1+signal-1');
assert(
  m.histogram.every((v, i) => v === null || approx(v, m.macdLine[i] - m.signalLine[i])),
  'macd histogram == line - signal'
);

const flat = candles.map((c) => ({ ...c, high: 100, low: 100, close: 100 }));
assert(ind.vwap(flat).every((v) => approx(v, 100)), 'vwap of flat series == price');
const atrVals = ind.atr(candles).filter((v) => v !== null);
assert(atrVals.every((v) => approx(v, 1.5, 1e-6)), 'atr of steady 1.5-range candles == 1.5', atrVals[0]);

const st = ind.stochastic(candles);
assert(st.k.every((v) => v === null || (v >= 0 && v <= 100)), 'stochastic %K bounded');
assert(st.d[14] === null && st.d[15] !== null, 'stochastic %D starts after k+d warmup');

// ---- backtester: SMA(10) > SMA(30) long-only on the uptrend ----
const sma10 = ind.sma(closes, 10);
const sma30 = ind.sma(closes, 30);
const target = closes.map((_, i) =>
  sma10[i] !== null && sma30[i] !== null && sma10[i] > sma30[i] ? 1 : 0
);
const res = runBacktest({ candles, targetPosition: target });
assert(res.trades.length === 1, 'one round-trip trade', `got ${res.trades.length}`);
assert(res.trades[0].entryIndex === 30, 'entry fills at next open after first signal (no lookahead)', `got ${res.trades[0].entryIndex}`);
assert(
  res.stats.totalReturn > 0.2 && res.stats.totalReturn < 0.25,
  'return ≈ +23% on the clean uptrend after fees/slippage',
  `got ${(res.stats.totalReturn * 100).toFixed(2)}%`
);
assert(res.stats.winRate === 1, 'win rate 1.0');
assert(res.stats.maxDrawdown <= 0, 'max drawdown <= 0 on monotonic rise');
assert(res.stats.finalEquity > 10000, 'final equity above initial');

// ---- backtester: flat market, no signals -> no trades, no drift ----
const flatTarget = new Array(N).fill(0);
const res2 = runBacktest({ candles, targetPosition: flatTarget });
assert(res2.trades.length === 0, 'no trades when flat');
assert(approx(res2.stats.totalReturn, 0), 'zero return when flat');

// ---- backtester: shorts lose on an uptrend (engine handles both sides) ----
const shortTarget = target.map((t) => -t);
const res3 = runBacktest({ candles, targetPosition: shortTarget });
assert(res3.trades.length === 1 && res3.trades[0].side === 'short', 'short trade recorded');
assert(res3.stats.totalReturn < 0, 'shorting an uptrend loses money');

// ---- strategies: aligned output, valid values, sensible behavior ----
for (const [key, s] of Object.entries(strategies)) {
  const p = Object.fromEntries(s.params.map((x) => [x.key, x.def]));
  const sig = s.signals(candles, ind, p);
  assert(sig.length === N, `strategy ${key}: output aligned to candles`);
  assert(sig.every((v) => v === -1 || v === 0 || v === 1), `strategy ${key}: values in {-1,0,1}`);
}
const smaSig = strategies.sma_crossover.signals(candles, ind, { fast: 10, slow: 30 });
assert(smaSig[29] === 1 && smaSig[28] === 0, 'sma_crossover flips long once trend is established');
const rsiSig = strategies.rsi_mean_reversion.signals(falling.map((c, i) => ({ close: c })), ind, { period: 14, oversold: 30, overbought: 70 });
assert(rsiSig.some((v) => v === 1), 'rsi_mean_reversion buys a waterfall decline');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
