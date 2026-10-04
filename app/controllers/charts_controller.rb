class ChartsController < ApplicationController
  def show
    @symbols = %w[BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT DOGEUSDT ADAUSDT]
    @intervals = [%w[15m 15m], ["1h", "1h"], ["4h", "4h"], ["1d", "1d"], ["1w", "1w"]]
  end
end
