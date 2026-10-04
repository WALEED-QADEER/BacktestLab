# BacktestLab staging — integration notes

These files are staged for a standard `rails new` app (Rails 8, importmap,
Stimulus, sqlite). Steps once `rails new backtestlab` exists:

1. Copy into the new app, preserving paths:
   - `app/services/binance_client.rb`
   - `app/controllers/charts_controller.rb`
   - `app/controllers/api/klines_controller.rb`
   - `app/views/charts/show.html.erb`
   - `app/javascript/controllers/chart_controller.js`
   - `app/javascript/lib/{indicators,backtester,strategies}.js`
2. Replace `config/routes.rb` with the staged one.
3. In `config/importmap.rb` add:
   `pin_all_from "app/javascript/lib", under: "lib"`
4. In `app/views/layouts/application.html.erb`, inside `<head>`:
   `<%= yield :head %>`
   (the chart page uses `content_for :head` to load Lightweight Charts v4
   from jsDelivr — no npm build step needed)
5. `bin/rails db:prepare` (no migrations yet — models come later:
   Strategy, BacktestRun for saving work)
6. `bin/dev` → http://localhost:3000

Tests: `node app/javascript/lib/test.mjs` (34 checks, no dependencies).

Data: Binance public endpoint `data-api.binance.vision` (no key).
Rails caches klines for 30s per symbol/interval.
