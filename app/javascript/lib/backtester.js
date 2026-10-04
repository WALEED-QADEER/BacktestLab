// backtester.js — an honest, minimal backtest engine for BacktestLab.
//
// Honesty rules (documented, not hidden):
//   1. A signal computed on candle i's close fills at candle i+1's OPEN.
//      No lookahead, ever.
//   2. Every fill pays a fee (feeRate on notional) and suffers slippage
//      against the trader (slippageRate on price).
//   3. Long-only or long/short via targetPosition of -1 / 0 / 1.
//   4. Position size is a fraction of current cash (positionSizePct).
//      No leverage, no margin calls in this MVP — sizes that exceed cash
//      are simply capped by available cash.
//   5. Any open position is force-closed at the final candle's close.

function runBacktest({
  candles,
  targetPosition,
  initialCapital = 10000,
  feeRate = 0.001, // 0.1% per fill (Binance spot taker is 0.1%)
  slippageRate = 0.0005, // 0.05% adverse move on every fill
  positionSizePct = 1.0,
  periodsPerYear = 365, // crypto trades every day
}) {
  const n = candles.length;
  if (!n || !targetPosition || targetPosition.length !== n) {
    throw new Error('candles and targetPosition must be non-empty and aligned');
  }

  const trades = [];
  const equity = new Array(n).fill(null);
  let cash = initialCapital;
  let qty = 0; // signed base-asset quantity: +long / -short
  let entryPrice = 0;
  let entryIndex = 0;
  let entryFee = 0;

  // Adverse slippage: buys fill higher, sells fill lower.
  const fillPrice = (open, side) => (side > 0 ? open * (1 + slippageRate) : open * (1 - slippageRate));

  const closePosition = (exitIdx, px) => {
    const absQty = Math.abs(qty);
    const notional = absQty * px;
    const exitFee = notional * feeRate;
    if (qty > 0) {
      cash += notional - exitFee; // sell the long
    } else {
      cash -= notional + exitFee; // buy back the short
    }
    const pnl = (qty > 0 ? px - entryPrice : entryPrice - px) * absQty - entryFee - exitFee;
    trades.push({
      entryIndex,
      exitIndex: exitIdx,
      side: qty > 0 ? 'long' : 'short',
      entryPrice,
      exitPrice: px,
      qty: absQty,
      pnl,
    });
    qty = 0;
  };

  const openPosition = (entryIdx, px, desired) => {
    const notional = cash * positionSizePct;
    if (notional <= 0) return;
    const q = notional / (px * (1 + feeRate));
    if (q <= 0) return;
    const cost = q * px;
    entryFee = cost * feeRate;
    if (desired > 0) {
      cash -= cost + entryFee;
      qty = q;
    } else {
      cash += cost - entryFee; // short sale proceeds
      qty = -q;
    }
    entryPrice = px;
    entryIndex = entryIdx;
  };

  for (let i = 0; i < n - 1; i++) {
    equity[i] = cash + qty * candles[i].close; // mark to market
    const desired = Math.sign(targetPosition[i] || 0);
    if (desired !== Math.sign(qty)) {
      const open = candles[i + 1].open;
      if (qty !== 0) closePosition(i + 1, fillPrice(open, qty > 0 ? -1 : 1));
      if (desired !== 0) openPosition(i + 1, fillPrice(open, desired), desired);
    }
  }

  // Force-close anything still open at the final close.
  if (qty !== 0) closePosition(n - 1, candles[n - 1].close);
  equity[n - 1] = cash; // flat after force-close

  return { trades, equity, stats: computeStats(equity, trades, initialCapital, candles, periodsPerYear) };
}

function computeStats(equity, trades, initialCapital, candles, periodsPerYear) {
  const eq = equity.filter((v) => v !== null && isFinite(v));
  const finalEquity = eq[eq.length - 1];
  const totalReturn = finalEquity / initialCapital - 1;

  const rets = [];
  for (let i = 1; i < eq.length; i++) {
    if (eq[i - 1] > 0) rets.push(eq[i] / eq[i - 1] - 1);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, v / peak - 1);
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const benchmarkReturn =
    candles.length > 1 ? candles[candles.length - 1].close / candles[0].close - 1 : 0;

  return {
    initialCapital,
    finalEquity,
    totalReturn,
    totalReturnPct: totalReturn * 100,
    benchmarkReturn,
    benchmarkReturnPct: benchmarkReturn * 100,
    numTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -(grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPct: maxDrawdown * 100,
    sharpe,
  };
}

export { runBacktest };
