# BacktestLab

A TradingView-style web app built with Ruby on Rails: live charts, multiple
technical indicators, and an honest strategy backtesting engine.

## Status

**Foundation complete (no Rails install yet).** The indicator math, backtest
engine, strategies, chart UI, and data layer are built, tested, and staged at
their final Rails paths. Run `rails new` (see `docs/NOTES.md`) to generate the
app skeleton around them.

## What's here

| Path | What it is |
|---|---|
| `app/javascript/lib/indicators.js` | SMA, EMA, RSI, MACD, Bollinger, VWAP, ATR, Stochastic — pure functions, 34/34 node tests passing |
| `app/javascript/lib/backtester.js` | Backtest engine: signals fill at next candle's **open** (no lookahead), 0.1% fee + 0.05% adverse slippage per fill, long/short, force-close at end. Stats: return, buy-and-hold benchmark, win rate, profit factor, max drawdown, Sharpe |
| `app/javascript/lib/strategies.js` | 4 strategies: SMA crossover, RSI mean reversion, MACD trend, Bollinger breakout — each with tunable params |
| `app/javascript/lib/test.mjs` | `node test.mjs` — indicator correctness + engine honesty checks |
| `app/javascript/controllers/chart_controller.js` | Stimulus controller: Lightweight Charts candlesticks + volume, Binance websocket live ticks, indicator overlays/panes, backtest runner with equity curve, trade markers, trades table |
| `app/views/charts/show.html.erb` | Dark trading UI: symbol/interval pickers, indicator toggles, strategy panel, results |
| `app/services/binance_client.rb` | Binance public market-data API (`data-api.binance.vision`, no key needed) |
| `app/controllers/api/klines_controller.rb` | `/api/klines?symbol=BTCUSDT&interval=1h` — cached 30s JSON proxy |
| `config/routes.rb` | Routes |

## Stack

- Rails 8 (importmap + Stimulus, no Node build step)
- [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) v4 (TradingView's open-source chart lib, via CDN)
- Binance public API for crypto klines + live websocket ticks
- Indicator/backtest math runs client-side in JS (instant results, zero server cost)

## Backtest honesty rules

1. A signal on candle *i*'s close fills at candle *i+1*'s **open** — never on the same candle.
2. Every fill pays a 0.1% fee and suffers 0.05% adverse slippage.
3. No leverage; positions sized as a fraction of cash.
4. Open positions force-close at the final candle.

## Next steps

See `docs/NOTES.md` for the 6-step integration once `rails new` is available.
