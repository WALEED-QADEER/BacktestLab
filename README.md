# BacktestLab

A TradingView-style web app built with Ruby on Rails: live charts, multiple
technical indicators, and an honest strategy backtesting engine.

## Run it

```bash
bundle install
bin/rails db:prepare
bin/dev        # http://localhost:3000
```

Open the root URL: pick a symbol and interval, toggle indicators, pick a
strategy, hit **Run backtest**.

## What's here

| Path | What it is |
|---|---|
| `app/javascript/lib/indicators.js` | SMA, EMA, RSI, MACD, Bollinger, VWAP, ATR, Stochastic — pure functions, 34/34 node tests passing (`node app/javascript/lib/test.mjs`) |
| `app/javascript/lib/backtester.js` | Backtest engine: signals fill at next candle's **open** (no lookahead), 0.1% fee + 0.05% adverse slippage per fill, long/short, force-close at end. Stats: return, buy-and-hold benchmark, win rate, profit factor, max drawdown, Sharpe |
| `app/javascript/lib/strategies.js` | 4 strategies: SMA crossover, RSI mean reversion, MACD trend, Bollinger breakout — each with tunable params |
| `app/javascript/controllers/chart_controller.js` | Stimulus controller: Lightweight Charts candlesticks + volume, Binance websocket live ticks, indicator overlays/panes, backtest runner with equity curve, trade markers, trades table |
| `app/views/charts/show.html.erb` | Dark trading UI: symbol/interval pickers, indicator toggles, strategy panel, results |
| `app/services/binance_client.rb` | Binance public market-data API (`data-api.binance.vision`, no key needed; honors proxy env vars) |
| `app/controllers/api/klines_controller.rb` | `/api/klines?symbol=BTCUSDT&interval=1h` — cached 30s JSON proxy |

## Stack

- Rails 8.1 (importmap + Stimulus, no Node build step)
- [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) v4 (TradingView's open-source chart lib, via CDN)
- Binance public API for crypto klines + live websocket ticks
- Indicator/backtest math runs client-side in JS (instant results, zero server cost)

## Backtest honesty rules

1. A signal on candle *i*'s close fills at candle *i+1*'s **open** — never on the same candle.
2. Every fill pays a 0.1% fee and suffers 0.05% adverse slippage.
3. No leverage; positions sized as a fraction of cash.
4. Open positions force-close at the final candle.

## Roadmap

- `Strategy` / `BacktestRun` models: save strategies and backtest history per user
- Paper-trading mode on live ticks
- More data sources (stocks via a provider abstraction over `BinanceClient`)
- Alerts (Action Cable + browser notifications)
