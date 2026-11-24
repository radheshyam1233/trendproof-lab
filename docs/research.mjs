const DAY = 86_400_000;

export function samplePrices() {
  let state = 81;
  let price = 100;
  const rows = [];
  for (let day = 0; rows.length < 520; day++) {
    const date = new Date(Date.UTC(2024, 0, 1) + day * DAY);
    if ([0, 6].includes(date.getUTCDay())) continue;
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const noise = (state / 2 ** 32 - 0.5) * 0.022;
    const i = rows.length;
    const drift = i < 312 ? (Math.floor(i / 55) % 2 ? -0.003 : 0.004)
      : 0.0015 * Math.sin(i / 2);
    price *= 1 + drift + noise;
    rows.push({date: date.toISOString().slice(0, 10), close: +price.toFixed(4)});
  }
  return rows;
}

export function parsePrices(csv) {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (header.trim().toLowerCase() !== "date,close") throw Error("Use the header date,close.");
  if (lines.length < 150 || lines.length > 20000) throw Error("Provide 150 to 20,000 sessions.");
  const rows = lines.map((line, i) => {
    const [date, value, ...extra] = line.split(",").map(field => field.trim());
    const close = Number(value);
    const time = Date.parse(date);
    if (extra.length || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time)
      || new Date(time).toISOString().slice(0, 10) !== date
      || !Number.isFinite(close) || close <= 0) {
      throw Error("Invalid date or positive close on line " + (i + 2) + ".");
    }
    return {date, close};
  });
  if (rows.some((row, i) => i > 0 && row.date <= rows[i - 1].date)) {
    throw Error("Dates must be unique and sorted oldest first.");
  }
  return rows;
}

export function summarize(rows, key) {
  let peak = 1;
  let maxDrawdown = 0;
  let value = 1;
  const equity = [1];
  const returns = rows.map(row => row[key]);
  for (const daily of returns) {
    value *= 1 + daily;
    equity.push(value);
    peak = Math.max(value, peak);
    maxDrawdown = Math.max(maxDrawdown, 1 - value / peak);
  }
  const mean = returns.reduce((sum, daily) => sum + daily, 0) / returns.length;
  const sd = Math.sqrt(returns.reduce((sum, daily) => sum + (daily - mean) ** 2, 0) / (returns.length - 1));
  return {return: value - 1, maxDrawdown, sharpe: sd > 0 ? Math.sqrt(252) * mean / sd : null, equity};
}

export function run(prices, {window, bps, period}) {
  const split = Math.floor(prices.length * 0.6);
  const start = period === "holdout" ? split : 62;
  const end = period === "holdout" ? prices.length - 1 : split;
  const fee = bps / 10000;
  let position = 0;
  let orders = 0;
  const rows = [];
  for (let t = start; t < end; t++) {
    // Observe close[t-1], trade at close[t], then earn close[t] to close[t+1].
    const history = prices.slice(t - window, t);
    const average = history.reduce((sum, row) => sum + row.close, 0) / window;
    const next = Number(prices[t - 1].close > average);
    const turnover = Math.abs(next - position);
    const liquidate = t === end - 1 ? next : 0;
    const market = prices[t + 1].close / prices[t].close - 1;
    const gross = next * market;
    const net = (1 - fee * turnover) * (1 + gross) * (1 - fee * liquidate) - 1;
    const benchmark = (1 - (t === start ? fee : 0)) * (1 + market)
      * (1 - (t === end - 1 ? fee : 0)) - 1;
    rows.push({signalDate: prices[t - 1].date, executionDate: prices[t].date,
      date: prices[t + 1].date, signalClose: prices[t - 1].close, average,
      position: next, turnover, liquidate, gross, net, benchmark});
    orders += turnover + liquidate;
    position = next;
  }
  return {start: prices[start].date, end: prices[end].date, orders, rows,
    net: summarize(rows, "net"), gross: summarize(rows, "gross"), benchmark: summarize(rows, "benchmark")};
}
