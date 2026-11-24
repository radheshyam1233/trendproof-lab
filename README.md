# Trendproof Lab

[Open the live demo](https://radheshyam1233.github.io/trendproof-lab/)

For the tutorial's hourly fractal sweep and engulfing strategy, see the [MetaTrader 5 Expert Advisor and tester guide](mt5/README.md).

**Research question:** Does a simple moving-average rule beat buy and hold on a later period after both pay trading costs?

## Run it locally

From this folder, run `python -m http.server 8000 --directory docs` and open `http://localhost:8000`. The app uses browser-native JavaScript and Canvas, with no package installation or API keys. Run the research checks with `node --test test/research.test.mjs`.

## Run the experiment

1. Keep the default 20-session average and 10 basis points per order. Compare development and holdout.
2. On holdout, raise the cost to 50 bps. Compare the before-cost strategy line with the after-cost line.
3. Export the audit CSV. Each row records the signal date, execution date, subsequent return date, moving average, position, trades and returns.
4. Optionally load a CSV of your own. Use the header `date,close`, unquoted ISO dates, positive finite prices, 150–20,000 rows, and increasing unique dates. Use adjusted prices where appropriate and check provenance, missing sessions and corporate actions separately. The browser processes the CSV locally.

## Method

- A close strictly above its trailing average signals long. Otherwise the position is cash. The average includes the signal close. Trade at the following close so the same bar cannot determine both signal and fill.
- Both periods start flat and settle at their last close. Pre-period prices can warm up the signal. The split is based on closes. The boundary close ends the development period and is the execution anchor for holdout, with disjoint return intervals. Development starts at index 62, allowing every supported window the same evaluation dates.
- A flat fee applies per buy or sell, including the terminal liquidation. Buy and hold pays for entry and exit too. A basis point is 0.01 percentage point. Compare compounded returns, peak-to-trough maximum drawdown, and Sharpe using mean daily return divided by sample standard deviation, annualized by √252 with a zero cash rate.
- The deterministic synthetic series changes from trending regimes to near-flat drift. It demonstrates why results can be sensitive to regime and costs. It provides no empirical evidence about Indian markets. Execution assumes a close fill and models a flat fee. It omits separate slippage, impact, cash yield and execution constraints.
- The holdout stays a valid unseen test only if choices are locked before inspection. Exploring settings after opening it calls for a fresh test period. A next experiment would use adjusted, attributable data for an Indian equity ETF and a predeclared walk-forward protocol.
