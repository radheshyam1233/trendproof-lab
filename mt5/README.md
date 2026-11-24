# Trendproof Sweep for MetaTrader 5

This Expert Advisor implements the fractal sweep and engulfing setup from the [Codex and MT5 tutorial](https://www.youtube.com/watch?v=XdQToWl-UHA). It initializes only inside MetaTrader 5 Strategy Tester. The Trendproof Lab website demonstrates a separate moving-average experiment.

## Run the EA

1. In MT5, use **File → Open Data Folder**, then put `TrendproofSweep.mq5` under `MQL5/Experts`. Open it in MetaEditor and press **F7**. The EA was compiled locally with zero errors and zero warnings.
2. In MT5, press **Ctrl+R** and select TrendproofSweep. Choose EURUSD or a symbol with historical data. Start with M5, **Every tick based on real ticks** where available, and a period of a few months. Set the tester currency to USD if you want the cash-risk setting to mean USD.
3. Enable **Visual mode** for a single run to see the marked sweep, engulfing body, entry, stop and target. Read **Backtest**, **Graph** and **Journal** together. The Journal records order rejections.

## What the EA does

- Find the latest confirmed H1 swing high and low using completed bars on each side of the candidate. A sweep means price passes the level and closes back across it on the entry timeframe.
- Wait for a later candle whose body engulfs the preceding opposite-direction body. Place a limit at the body midpoint, with a stop beyond the wick and default target of 3R for buys or 2R for sells.
- Size positions in cash risk, balance percentage, or fixed lots. Cash risk and the daily loss cutoff are in tester account currency. Risk sizing estimates the stop loss in that currency and rounds down to a supported volume. Spread, gaps and execution can change the realized loss. The daily equity cutoff stops new orders and tries to cancel pending entries. Open positions keep their stop and target.
- Use one attempt per swept swing and at most one open position or pending order per symbol. Pending orders expire after the selected number of entry-bar durations in wall-clock time. Symbols need support for specified-time pending order expiry.
- Interpret session input hours in broker server time. Adjust both intervals to the broker's timezone and daylight-saving schedule. Disable the filter for a separate sensitivity test.

## Research workflow

Use MT5's native **Slow complete algorithm** to sweep numeric inputs such as `FractalWing`, `BuyReward`, `SellReward`, `MinimumBodyPoints` and `MaximumSpreadPoints`. Set both the tester chart period and the EA's **EntryTimeframe** when comparing timeframes. Run M1, M5, M15, M30, H1, H4 and D1 as separate experiments. Start on M5 because that is the tutorial's base entry timeframe. Reserve a later period using MT5 **Forward** testing, then compare trade count, profit factor, Sharpe and equity drawdown on that period. Inspect nearby settings and reject results driven by very few trades. Use MT5's native test report and optimization exports.

The first version covers the core EA. News filtering, breakeven, partial exits, trailing stops, notifications and the tutorial's separate cross-timeframe ranking and Excel reporting module remain outside the implementation.

## Explain it in 20 seconds

“I wait for price to break an old hourly swing and close back inside. Then I look for a candle that confirms the reversal and test a limit order halfway through that candle's body. My main research question is how often the order actually fills and whether the setup survives spread and a later test period.”
