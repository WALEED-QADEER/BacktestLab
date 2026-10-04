import { Controller } from "@hotwired/stimulus";
import * as ind from "lib/indicators";
import { runBacktest } from "lib/backtester";
import { strategies } from "lib/strategies";

// Main chart controller: candlestick chart (TradingView Lightweight Charts),
// Binance klines via our API, websocket live updates, overlay + pane
// indicators, and in-browser strategy backtesting.
export default class extends Controller {
  static targets = [
    "chartEl", "symbol", "interval", "liveDot",
    "strategy", "strategyDesc", "strategyParams",
    "resultsCard", "stats", "trades", "tradeCount",
  ];

  connect() {
    this.candles = [];
    this.indicatorSeries = [];
    this.indScaleReady = false;
    this.ws = null;
    this.equityChart = null;
    this.buildChart();
    this.buildStrategySelect();
    this.reload();
  }

  disconnect() {
    this.closeWs();
  }

  // ---------- chart setup ----------

  buildChart() {
    this.chart = LightweightCharts.createChart(this.chartElTarget, {
      layout: { background: { color: "#161b22" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#2d333b" },
      rightPriceScale: { borderColor: "#2d333b" },
    });
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    });
    this.volumeSeries = this.chart.addHistogramSeries({
      priceScaleId: "",
      priceFormat: { type: "volume" },
    });
    this.chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0.3 } });
    this.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: 0.3 } });

    new ResizeObserver(() => {
      this.chart.applyOptions({
        width: this.chartElTarget.clientWidth,
        height: this.chartElTarget.clientHeight,
      });
    }).observe(this.chartElTarget);
  }

  ensureIndScale() {
    if (this.indScaleReady) return;
    this.chart.priceScale("ind").applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 } });
    this.indScaleReady = true;
  }

  // ---------- data ----------

  async reload() {
    const symbol = this.symbolTarget.value;
    const interval = this.intervalTarget.value;
    this.setLive(false);
    this.closeWs();
    let data;
    try {
      const res = await fetch(
        `/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=500`
      );
      data = await res.json();
    } catch {
      return;
    }
    if (data.error || !Array.isArray(data) || !data.length) return;
    this.candles = data;
    this.candleSeries.setData(
      data.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    this.volumeSeries.setData(
      data.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)",
      }))
    );
    this.candleSeries.setMarkers([]);
    this.chart.timeScale().fitContent();
    this.refreshIndicators();
    this.connectWs(symbol, interval);
  }

  // ---------- live websocket ----------

  connectWs(symbol, interval) {
    try {
      this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
    } catch {
      return;
    }
    this.ws.onopen = () => this.setLive(true);
    this.ws.onclose = () => this.setLive(false);
    this.ws.onerror = () => this.setLive(false);
    this.ws.onmessage = (event) => {
      let k;
      try {
        k = JSON.parse(event.data).k;
      } catch {
        return;
      }
      if (!k) return;
      const candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
      };
      const last = this.candles[this.candles.length - 1];
      if (last && candle.time === last.time) {
        Object.assign(last, candle);
      } else if (!last || candle.time > last.time) {
        this.candles.push(candle);
      } else {
        return;
      }
      this.candleSeries.update(candle);
      this.volumeSeries.update({
        time: candle.time,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)",
      });
    };
  }

  closeWs() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  setLive(on) {
    this.liveDotTarget.classList.toggle("off", !on);
  }

  // ---------- indicators ----------

  toggleIndicators() {
    this.refreshIndicators();
  }

  refreshIndicators() {
    this.indicatorSeries.forEach((s) => this.chart.removeSeries(s));
    this.indicatorSeries = [];
    if (!this.candles.length) return;
    const checked = [
      ...this.element.querySelectorAll('.bl-indicator-bar input[type="checkbox"]:checked'),
    ].map((el) => el.value);
    if (!checked.length) return;

    const closes = this.candles.map((c) => c.close);
    const times = this.candles.map((c) => c.time);
    const toPoints = (arr) =>
      arr.map((v, i) => (v === null ? null : { time: times[i], value: v })).filter(Boolean);

    const addLine = (data, color, scaleId, width = 1, title = "") => {
      const pts = toPoints(data);
      if (!pts.length) return;
      if (scaleId === "ind") this.ensureIndScale();
      const series = this.chart.addLineSeries({
        color,
        lineWidth: width,
        priceScaleId: scaleId,
        priceLineVisible: false,
        lastValueVisible: false,
        title,
      });
      series.setData(pts);
      this.indicatorSeries.push(series);
    };

    if (checked.includes("sma")) {
      addLine(ind.sma(closes, 20), "#f0b90b", "right", 1, "SMA 20");
      addLine(ind.sma(closes, 50), "#e91e63", "right", 1, "SMA 50");
    }
    if (checked.includes("ema")) {
      addLine(ind.ema(closes, 12), "#2196f3", "right", 1, "EMA 12");
      addLine(ind.ema(closes, 26), "#ff9800", "right", 1, "EMA 26");
    }
    if (checked.includes("bb")) {
      const { upper, middle, lower } = ind.bollinger(closes, 20, 2);
      addLine(upper, "#7e57c2", "right", 1, "BB upper");
      addLine(middle, "#7e57c2", "right", 1, "BB mid");
      addLine(lower, "#7e57c2", "right", 1, "BB lower");
    }
    if (checked.includes("vwap")) {
      addLine(ind.vwap(this.candles), "#00bcd4", "right", 2, "VWAP");
    }
    if (checked.includes("rsi")) {
      this.ensureIndScale();
      const pts = toPoints(ind.rsi(closes, 14));
      const series = this.chart.addLineSeries({
        color: "#ab47bc",
        lineWidth: 1,
        priceScaleId: "ind",
        priceLineVisible: false,
        lastValueVisible: true,
        title: "RSI 14",
      });
      series.setData(pts);
      series.createPriceLine({ price: 70, color: "#ef5350", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
      series.createPriceLine({ price: 30, color: "#26a69a", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
      this.indicatorSeries.push(series);
    }
    if (checked.includes("macd")) {
      this.ensureIndScale();
      const { macdLine, signalLine, histogram } = ind.macd(closes, 12, 26, 9);
      const macdPts = toPoints(macdLine);
      const sigPts = toPoints(signalLine);
      const histPts = toPoints(histogram).map((p) => ({
        ...p,
        color: p.value >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
      }));
      const l1 = this.chart.addLineSeries({ color: "#2196f3", lineWidth: 1, priceScaleId: "ind", priceLineVisible: false, lastValueVisible: false, title: "MACD" });
      const l2 = this.chart.addLineSeries({ color: "#ff9800", lineWidth: 1, priceScaleId: "ind", priceLineVisible: false, lastValueVisible: false, title: "Signal" });
      const h = this.chart.addHistogramSeries({ priceScaleId: "ind", priceLineVisible: false, lastValueVisible: false });
      l1.setData(macdPts);
      l2.setData(sigPts);
      h.setData(histPts);
      this.indicatorSeries.push(l1, l2, h);
    }
    if (checked.includes("stoch")) {
      this.ensureIndScale();
      const { k, d } = ind.stochastic(this.candles, 14, 3);
      const sk = this.chart.addLineSeries({ color: "#29b6f6", lineWidth: 1, priceScaleId: "ind", priceLineVisible: false, lastValueVisible: false, title: "%K" });
      const sd = this.chart.addLineSeries({ color: "#ffa726", lineWidth: 1, priceScaleId: "ind", priceLineVisible: false, lastValueVisible: false, title: "%D" });
      sk.setData(toPoints(k));
      sd.setData(toPoints(d));
      this.indicatorSeries.push(sk, sd);
    }
  }

  // ---------- strategies ----------

  buildStrategySelect() {
    Object.values(strategies).forEach((s) => {
      this.strategyTarget.add(new Option(s.name, s.key));
    });
    this.renderStrategyParams();
  }

  renderStrategyParams() {
    const s = strategies[this.strategyTarget.value];
    if (!s) return;
    this.strategyDescTarget.textContent = s.description;
    this.strategyParamsTarget.innerHTML = "";
    s.params.forEach((p) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "number";
      input.value = p.def;
      input.min = p.min;
      input.max = p.max;
      input.dataset.param = p.key;
      label.append(`${p.label} `, input);
      this.strategyParamsTarget.appendChild(label);
    });
  }

  // ---------- backtest ----------

  runBacktest() {
    if (!this.candles.length) return;
    const s = strategies[this.strategyTarget.value];
    if (!s) return;
    const params = {};
    this.strategyParamsTarget.querySelectorAll("[data-param]").forEach((el) => {
      const def = s.params.find((p) => p.key === el.dataset.param);
      let v = parseFloat(el.value);
      if (!isFinite(v)) v = def.def;
      params[el.dataset.param] = Math.min(def.max, Math.max(def.min, v));
    });

    const target = s.signals(this.candles, ind, params);
    const { trades, equity, stats } = runBacktest({
      candles: this.candles,
      targetPosition: target,
    });

    this.resultsCardTarget.hidden = false;
    this.showStats(stats);
    this.drawEquity(equity, stats.initialCapital);
    this.showTrades(trades);
    this.markTrades(trades);
  }

  showStats(stats) {
    const fmtPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
    const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
    const pf = stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);
    const cards = [
      ["Return", fmtPct(stats.totalReturnPct), cls(stats.totalReturn)],
      ["Buy & hold", fmtPct(stats.benchmarkReturnPct), cls(stats.benchmarkReturn)],
      ["Trades", stats.numTrades, ""],
      ["Win rate", `${(stats.winRate * 100).toFixed(1)}%`, ""],
      ["Profit factor", pf, ""],
      ["Max drawdown", `${stats.maxDrawdownPct.toFixed(2)}%`, "neg"],
      ["Sharpe", stats.sharpe.toFixed(2), ""],
      ["Final equity", `$${stats.finalEquity.toFixed(2)}`, ""],
    ];
    this.statsTarget.innerHTML = cards
      .map(([k, v, c]) => `<div class="bl-stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`)
      .join("");
  }

  drawEquity(equity, initialCapital) {
    const el = document.getElementById("bl-equity");
    const pts = equity
      .map((v, i) => (v === null ? null : { time: this.candles[i].time, value: v }))
      .filter(Boolean);
    if (!pts.length) return;
    if (!this.equityChart) {
      this.equityChart = LightweightCharts.createChart(el, {
        layout: { background: { color: "#0d1117" }, textColor: "#8b949e" },
        grid: { vertLines: { visible: false }, horzLines: { color: "#21262d" } },
        timeScale: { visible: false },
        rightPriceScale: { borderVisible: false },
      });
      new ResizeObserver(() => {
        this.equityChart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }).observe(el);
    } else {
      this.equityChart.removeSeries(this.equitySeries);
    }
    const up = pts[pts.length - 1].value >= initialCapital;
    this.equitySeries = this.equityChart.addAreaSeries({
      lineColor: up ? "#26a69a" : "#ef5350",
      topColor: up ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
      bottomColor: "rgba(38,166,154,0)",
    });
    this.equitySeries.setData(pts);
    this.equityChart.timeScale().fitContent();
  }

  showTrades(trades) {
    this.tradeCountTarget.textContent = `(${trades.length})`;
    const rows = trades
      .slice(-100)
      .reverse()
      .map((t, i) => {
        const pnlCls = t.pnl >= 0 ? "pos" : "neg";
        return `<tr><td>${trades.length - i}</td><td>${t.side}</td><td>${t.entryPrice.toFixed(2)}</td><td>${t.exitPrice.toFixed(2)}</td><td class="${pnlCls}" style="color:${t.pnl >= 0 ? "#26a69a" : "#ef5350"}">${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}</td></tr>`;
      })
      .join("");
    this.tradesTarget.innerHTML = trades.length
      ? `<table><thead><tr><th>#</th><th>Side</th><th>Entry</th><th>Exit</th><th>P&amp;L</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="bl-muted">No trades.</p>`;
  }

  markTrades(trades) {
    const markers = [];
    trades.forEach((t) => {
      const entry = this.candles[t.entryIndex];
      const exit = this.candles[t.exitIndex];
      if (!entry || !exit) return;
      const long = t.side === "long";
      markers.push({
        time: entry.time,
        position: long ? "belowBar" : "aboveBar",
        color: "#26a69a",
        shape: long ? "arrowUp" : "arrowDown",
        text: long ? "Buy" : "Short",
      });
      markers.push({
        time: exit.time,
        position: long ? "aboveBar" : "belowBar",
        color: "#ef5350",
        shape: long ? "arrowDown" : "arrowUp",
        text: "Sell",
      });
    });
    markers.sort((a, b) => a.time - b.time);
    this.candleSeries.setMarkers(markers);
  }
}
