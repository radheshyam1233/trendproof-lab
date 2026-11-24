import assert from "node:assert/strict";
import test from "node:test";
import {parsePrices, run, samplePrices} from "../docs/research.mjs";

const prices = samplePrices();
const settings = {window: 20, bps: 10, period: "holdout"};

test("signal precedes execution and cannot use future prices", () => {
  const original = run(prices, settings);
  const split = Math.floor(prices.length * 0.6);
  const altered = prices.map((row, i) => i >= split ? {...row, close: row.close * 1.5} : row);
  const before = original.rows[0];
  const after = run(altered, settings).rows[0];
  assert.equal(after.position, before.position);
  assert.equal(after.average, before.average);
  assert.ok(before.signalDate < before.executionDate && before.executionDate < before.date);
  assert.equal(run(prices, {...settings, period:"development"}).end, original.start);
});

test("entry and terminal exit fees compound for both portfolios", () => {
  const rising = prices.map((row, i) => ({...row, close: 100 + i}));
  const result = run(rising, {...settings, bps: 50});
  const factor = rising.at(-1).close / rising[Math.floor(rising.length * 0.6)].close;
  assert.equal(result.orders, 2);
  assert.ok(Math.abs(result.net.return - (factor * 0.995 ** 2 - 1)) < 1e-12);
  assert.equal(result.net.return, result.benchmark.return);
  const free = run(rising, {...settings, bps: 0});
  assert.equal(free.net.return, free.gross.return);
});

test("CSV rejects duplicate, invalid, and nonpositive observations", () => {
  const csv = rows => "date,close\n" + rows.map(row => row.date + "," + row.close).join("\n");
  assert.deepEqual(parsePrices(csv(prices)), prices);
  assert.throws(() => parsePrices(csv([prices[0], ...prices])), /unique/);
  assert.throws(() => parsePrices(csv([{...prices[0], close: 0}, ...prices.slice(1)])), /positive/);
  assert.throws(() => parsePrices(csv([{...prices[0], date: "2024-02-30"}, ...prices.slice(1)])), /Invalid/);
});
