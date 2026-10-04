// strategies.js — strategy definitions for BacktestLab.
//
// Each strategy: { key, name, params: [{key,label,default,min,max}], signals(candles, ind, p) }
// signals() returns targetPosition: array of -1/0/1 aligned to candles.
// Signals are computed on candle i's close; the engine fills at i+1's open,
// so there is no lookahead bias.

function smaCrossover(candles, ind, p) {
  const closes = candles.map((c) => c.close);
  const fast = ind.sma(closes, p.fast);
  const slow = ind.sma(closes, p.slow);
  return closes.map((_, i) =>
    fast[i] !== null && slow[i] !== null ? (fast[i] > slow[i] ? 1 : 0) : 0
  );
}

function rsiMeanReversion(candles, ind, p) {
  const closes = candles.map((c) => c.close);
  const r = ind.rsi(closes, p.period);
  const out = new Array(candles.length).fill(0);
  let pos = 0;
  for (let i = 0; i < candles.length; i++) {
    if (r[i] === null) {
      out[i] = pos;
      continue;
    }
    if (r[i] < p.oversold) pos = 1;
    else if (r[i] > p.overbought) pos = 0;
    out[i] = pos;
  }
  return out;
}

function macdTrend(candles, ind, p) {
  const closes = candles.map((c) => c.close);
  const { macdLine, signalLine } = ind.macd(closes, p.fast, p.slow, p.signal);
  return closes.map((_, i) =>
    macdLine[i] !== null && signalLine[i] !== null ? (macdLine[i] > signalLine[i] ? 1 : 0) : 0
  );
}

function bollingerBreakout(candles, ind, p) {
  const closes = candles.map((c) => c.close);
  const { upper, lower } = ind.bollinger(closes, p.period, p.mult);
  const out = new Array(candles.length).fill(0);
  let pos = 0;
  for (let i = 0; i < candles.length; i++) {
    if (upper[i] !== null) {
      if (closes[i] > upper[i]) pos = 1;
      else if (closes[i] < lower[i]) pos = 0;
    }
    out[i] = pos;
  }
  return out;
}

const strategies = {
  sma_crossover: {
    key: 'sma_crossover',
    name: 'SMA Crossover',
    description: 'Long when the fast SMA crosses above the slow SMA.',
    params: [
      { key: 'fast', label: 'Fast period', def: 10, min: 2, max: 200 },
      { key: 'slow', label: 'Slow period', def: 30, min: 3, max: 400 },
    ],
    signals: smaCrossover,
  },
  rsi_mean_reversion: {
    key: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    description: 'Buy when RSI drops below oversold, exit when it rises above overbought.',
    params: [
      { key: 'period', label: 'RSI period', def: 14, min: 2, max: 50 },
      { key: 'oversold', label: 'Oversold', def: 30, min: 5, max: 45 },
      { key: 'overbought', label: 'Overbought', def: 70, min: 55, max: 95 },
    ],
    signals: rsiMeanReversion,
  },
  macd_trend: {
    key: 'macd_trend',
    name: 'MACD Trend',
    description: 'Long when the MACD line is above its signal line.',
    params: [
      { key: 'fast', label: 'Fast EMA', def: 12, min: 2, max: 50 },
      { key: 'slow', label: 'Slow EMA', def: 26, min: 5, max: 100 },
      { key: 'signal', label: 'Signal', def: 9, min: 2, max: 30 },
    ],
    signals: macdTrend,
  },
  bollinger_breakout: {
    key: 'bollinger_breakout',
    name: 'Bollinger Breakout',
    description: 'Long on closes above the upper band, flat on closes below the lower band.',
    params: [
      { key: 'period', label: 'Period', def: 20, min: 5, max: 100 },
      { key: 'mult', label: 'Std dev', def: 2, min: 1, max: 3 },
    ],
    signals: bollingerBreakout,
  },
};

export { strategies };
