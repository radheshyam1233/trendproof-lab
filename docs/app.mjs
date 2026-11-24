import {parsePrices, run, samplePrices} from "./research.mjs";

const $ = id => document.getElementById(id);
const sample = samplePrices();
let prices = sample;
let result;
let upload = 0;
const pct = value => (100 * value).toFixed(2) + "%";
const number = value => value === null ? "—" : value.toFixed(2);

function render() {
  const window = Number($("days").value);
  const bps = Number($("cost").value);
  const period = $("period").value;
  $("daysValue").textContent = window + " sessions";
  $("costValue").textContent = bps + " bps";
  result = run(prices, {window, bps, period});
  const {net, gross, benchmark, orders, start, end} = result;
  $("range").textContent = start + " to " + end;
  const difference = net.return - benchmark.return;
  const relative = Math.abs(difference) < 0.00005 ? "matches buy and hold after costs"
    : (difference > 0 ? "beats" : "trails") + " buy and hold by "
      + (100 * Math.abs(difference)).toFixed(2) + " pp after costs";
  $("finding").textContent = "The strategy " + relative + ". Its "
    + orders + " orders reduce its return by " + (100 * (gross.return - net.return)).toFixed(2)
    + " pp versus the same rule before costs.";
  $("stats").innerHTML = [
    ["Total return", pct(net.return), pct(benchmark.return)],
    ["Maximum drawdown", pct(net.maxDrawdown), pct(benchmark.maxDrawdown)],
    ["Annualized Sharpe", number(net.sharpe), number(benchmark.sharpe)],
    ["Buy and sell orders", orders, 2],
  ].map(([label, a, b]) => "<tr><th scope='row'>" + label + "</th><td>" + a + "</td><td>" + b + "</td></tr>").join("");
  $("chart").setAttribute("aria-label", "Growth of 100. Final strategy value "
    + (100 * net.equity.at(-1)).toFixed(2) + ". Final buy and hold value "
    + (100 * benchmark.equity.at(-1)).toFixed(2) + ".");
  draw();
}

function draw() {
  const canvas = $("chart");
  const {width, height} = canvas.getBoundingClientRect();
  if (!result || width < 90) return;
  const ratio = devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const series = [
    [result.benchmark.equity, "#91b7ff", []],
    [result.gross.equity, "#e6c17b", [5, 4]],
    [result.net.equity, "#64e6b5", []],
  ];
  const values = series.flatMap(([equity]) => equity);
  const low = Math.min(...values) - 0.015;
  const high = Math.max(...values) + 0.015;
  const left = 48, right = width - 12, top = 18, bottom = height - 30;
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.fillStyle = "#aabfba";
  for (let i = 0; i <= 4; i++) {
    const value = low + (high - low) * i / 4;
    ctx.strokeStyle = "#29403d";
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillText((100 * value).toFixed(1), 2, y(value) + 4);
  }
  for (const [equity, color, dash] of series) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    equity.forEach((value, i) => {
      const x = left + i / (equity.length - 1) * (right - left);
      if (i === 0) ctx.moveTo(x, y(value));
      else ctx.lineTo(x, y(value));
    });
    ctx.stroke();
  }
  ctx.fillText(result.start, left, height - 9);
  ctx.textAlign = "right";
  ctx.fillText(result.end, right, height - 9);
}

for (const id of ["period", "days", "cost"]) $(id).addEventListener("input", render);
$("file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  const attempt = ++upload;
  try {
    if (file.size > 2_000_000) throw Error("Choose a CSV smaller than 2 MB.");
    const rows = parsePrices(await file.text());
    if (attempt !== upload) return;
    prices = rows;
    $("dataset").textContent = file.name + " · " + rows.length + " sessions";
    $("error").textContent = "";
    render();
  } catch (error) {
    if (attempt === upload) {
      $("error").textContent = error.message;
      event.target.value = "";
    }
  }
});
$("reset").addEventListener("click", () => {
  upload++;
  prices = sample;
  $("file").value = "";
  $("dataset").textContent = "Simulated prices · 520 sessions";
  $("error").textContent = "";
  render();
});
$("download").addEventListener("click", () => {
  const columns = Object.keys(result.rows[0]);
  const csv = [columns.join(","), ...result.rows.map(row => columns.map(key => row[key]).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  link.download = "trendproof-" + $("period").value + "-" + $("days").value + "d-" + $("cost").value + "bps.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
new ResizeObserver(draw).observe($("chart"));
render();
