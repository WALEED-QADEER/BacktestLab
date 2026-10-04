Rails.application.routes.draw do
  root "charts#show"
  get "chart", to: "charts#show"

  namespace :api do
    get "klines", to: "klines#index"
  end
end
