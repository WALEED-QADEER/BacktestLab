// indicators.js — pure technical-indicator functions for BacktestLab.
//
// Every function takes plain arrays and returns arrays aligned to the input
// (null for warmup bars), so results can be plotted straight onto a chart.
// No DOM, no dependencies — runs in the browser or in Node.
//
// Candle shape: { time, open, high, low, close, volume }

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period; // seed with SMA, the standard approach
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// Wilder's RSI
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (period <= 0 || closes.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const toRsi = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = toRsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = toRsi();
  }
  return out;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const n = closes.length;
  const macdLine = new Array(n).fill(null);
  const signalLine = new Array(n).fill(null);
  const histogram = new Array(n).fill(null);
  if (n < slow) return { macdLine, signalLine, histogram };
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const start = slow - 1;
  const compact = [];
  for (let i = start; i < n; i++) compact.push(fastEma[i] - slowEma[i]);
  const sigCompact = ema(compact, signal);
  for (let i = 0; i < compact.length; i++) {
    const idx = start + i;
    macdLine[idx] = compact[i];
    if (sigCompact[i] !== null) {
      signalLine[idx] = sigCompact[i];
      histogram[idx] = compact[i] - sigCompact[i];
    }
  }
  return { macdLine, signalLine, histogram };
}

function bollinger(closes, period = 20, mult = 2) {
  const n = closes.length;
  const upper = new Array(n).fill(null);
  const middle = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  if (period <= 0 || n < period) return { upper, middle, lower };
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = closes[i];
    sum += v;
    sumSq += v * v;
    if (i >= period) {
      const old = closes[i - period];
      sum -= old;
      sumSq -= old * old;
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      const sd = Math.sqrt(variance);
      middle[i] = mean;
      upper[i] = mean + mult * sd;
      lower[i] = mean - mult * sd;
    }
  }
  return { upper, middle, lower };
}

// Anchored VWAP from the start of the series (crypto trades 24/7, so no
// session reset; a rolling/session variant can be added later).
function vwap(candles) {
  const out = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 0;
    cumPV += typical * vol;
    cumV += vol;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

// Wilder's ATR
function atr(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  if (period <= 0 || n < period + 1) return out;
  const trueRange = (i) => {
    const c = candles[i];
    const p = candles[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  };
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += trueRange(i);
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + trueRange(i)) / period;
    out[i] = prev;
  }
  return out;
}

function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  const n = candles.length;
  const k = new Array(n).fill(null);
  const d = new Array(n).fill(null);
  if (kPeriod <= 0 || n < kPeriod) return { k, d };
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    k[i] = range === 0 ? 50 : (100 * (candles[i].close - ll)) / range;
  }
  const compact = k.filter((v) => v !== null);
  const dCompact = sma(compact, dPeriod);
  let di = 0;
  for (let i = 0; i < n; i++) {
    if (k[i] !== null) {
      d[i] = dCompact[di];
      di++;
    }
  }
  return { k, d };
}

export { sma, ema, rsi, macd, bollinger, vwap, atr, stochastic };
