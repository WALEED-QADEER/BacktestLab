# Public market-data endpoint: no API key needed, generous rate limits.
# Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
class BinanceClient
  BASE_URL = "https://data-api.binance.vision"
  INTERVALS = %w[1m 5m 15m 1h 4h 1d 1w].freeze
  MAX_LIMIT = 1000

  class ApiError < StandardError; end

  def klines(symbol:, interval:, limit: 500)
    symbol = symbol.to_s.upcase
    interval = interval.to_s
    limit = [[limit.to_i, 1].max, MAX_LIMIT].min
    raise ArgumentError, "bad interval" unless INTERVALS.include?(interval)

    uri = URI("#{BASE_URL}/api/v3/klines")
    uri.query = URI.encode_www_form(symbol: symbol, interval: interval, limit: limit)
    res = Net::HTTP.get_response(uri)
    raise ApiError, "Binance #{res.code}: #{res.body[0, 200]}" unless res.is_a?(Net::HTTPSuccess)

    JSON.parse(res.body).map do |k|
      {
        time: k[0] / 1000, # lightweight-charts wants UNIX seconds
        open: k[1].to_f,
        high: k[2].to_f,
        low: k[3].to_f,
        close: k[4].to_f,
        volume: k[5].to_f
      }
    end
  end
end
