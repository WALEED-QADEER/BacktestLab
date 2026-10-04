module Api
  class KlinesController < ApplicationController
    def index
      symbol = params[:symbol].to_s.upcase.presence || "BTCUSDT"
      interval = params[:interval].to_s.presence || "1h"
      limit = params[:limit].to_i.clamp(1, 1000)
      limit = 500 if limit.zero?

      klines = Rails.cache.fetch("klines/#{symbol}/#{interval}/#{limit}", expires_in: 30.seconds) do
        BinanceClient.new.klines(symbol: symbol, interval: interval, limit: limit)
      end
      render json: klines
    rescue BinanceClient::ApiError, ArgumentError => e
      render json: { error: e.message }, status: :bad_gateway
    end
  end
end
