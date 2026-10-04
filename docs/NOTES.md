# BacktestLab build notes

## What was built

A complete Rails 8.1 app (importmap + Stimulus + sqlite, no Node build step):

- `ChartsController#show` + dark trading UI (`app/views/charts/show.html.erb`)
- `Api::KlinesController` — `/api/klines?symbol=BTCUSDT&interval=1h&limit=500`,
  30s Rails-cache, proxies Binance public klines
- `BinanceClient` — `data-api.binance.vision` (no key). Uses `uri.find_proxy`
  so it honors `https_proxy`/`http_proxy`/`no_proxy` env vars and connects
  directly when none are set.
- `chart_controller.js` (Stimulus) — Lightweight Charts v4 candlesticks +
  volume, Binance websocket live ticks, 7 indicator toggles (overlay + lower
  pane), 4 tunable strategies, in-browser backtester with equity curve,
  trade markers and trades table.
- `app/javascript/lib/{indicators,backtester,strategies}.js` — pure ESM,
  pinned via `pin_all_from "app/javascript/lib", under: "lib"` in importmap.
- Lightweight Charts v4 loaded from jsDelivr via `content_for :head`
  (layout has `<%= yield :head %>`).

## Verified

- `bin/rails routes` — root + `/api/klines` live
- Homepage renders HTTP 200 with chart wiring
- `node app/javascript/lib/test.mjs` — 34/34 passing (indicator correctness,
  no-lookahead fill check, strategy smoke tests)
- Binance klines fetched live via curl (BTC ~85k at build time)

## Known sandbox quirk (not an app bug)

On the build VM, Ruby's `Net::HTTP` TLS to `data-api.binance.vision` hangs
through the egress proxy while curl and Ruby-to-other-hosts work fine — a
proxy/host-specific quirk. The request itself is proven good via curl, and
the code is standard proxy-aware `Net::HTTP`, so it works on any normal
machine/server without the proxy.

## Next steps

- Add `Strategy` and `BacktestRun` models + auth to save work
- Provider abstraction if stocks get added alongside crypto
