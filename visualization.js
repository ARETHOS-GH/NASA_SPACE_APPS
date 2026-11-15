const params = new URLSearchParams(window.location.search);
const region = params.get("region") || "Global";
const parseYear = (value, fallback) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1980 && year <= 2026 ? year : fallback;
};
let startYear = parseYear(params.get("start"), 1980);
let endYear = parseYear(params.get("end"), 2026);
if (startYear > endYear) [startYear, endYear] = [endYear, startYear];

document.querySelector("#selected-region").textContent = region;
document.querySelector("#selected-period").textContent = `${startYear}–${endYear}`;

const svgNamespace = "http://www.w3.org/2000/svg";
const chartGrid = document.querySelector("#chart-grid");
const chartLabels = document.querySelector("#chart-labels");
const chartPoints = document.querySelector("#chart-points");
const chartLine = document.querySelector("#chart-line");
const chartArea = document.querySelector("#chart-area");
const plot = { left: 86, right: 880, top: 48, bottom: 344 };
const values = [24, 31, 28, 39, 36, 47, 43, 54, 50];
const createSvgElement = (name, attributes, text) => {
  const element = document.createElementNS(svgNamespace, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
};
const xPosition = (ratio) => plot.left + ratio * (plot.right - plot.left);
const yPosition = (value) => plot.bottom - (value / 60) * (plot.bottom - plot.top);

[0, 20, 40, 60].forEach((value) => {
  const y = yPosition(value);
  chartGrid.appendChild(createSvgElement("line", {
    x1: plot.left, x2: plot.right, y1: y, y2: y
  }));
  chartLabels.appendChild(createSvgElement("text", {
    x: plot.left - 12, y: y + 4, "text-anchor": "end", class: "chart-axis-label"
  }, String(value)));
});
chartLabels.appendChild(createSvgElement("text", {
  x: plot.left, y: 28, class: "chart-axis-caption"
}, "Sample index"));

const points = values.map((value, index) => {
  const ratio = index / (values.length - 1);
  const year = Math.round(startYear + ratio * (endYear - startYear));
  return { x: xPosition(ratio), y: yPosition(value), year, value };
});
const linePath = points.map((point, index) =>
  `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
).join(" ");
chartLine.setAttribute("d", linePath);
chartArea.setAttribute("d", `${linePath} L ${plot.right} ${plot.bottom} L ${plot.left} ${plot.bottom} Z`);

points.forEach((point) => {
  const circle = createSvgElement("circle", {
    cx: point.x, cy: point.y, r: 6, class: "chart-point"
  });
  circle.appendChild(createSvgElement("title", {}, `${point.year}: ${point.value} (illustrative)`));
  chartPoints.appendChild(circle);
  chartLabels.appendChild(createSvgElement("text", {
    x: point.x, y: point.y - 14, "text-anchor": "middle", class: "chart-value-label"
  }, String(point.value)));
});

const yearTicks = new Set(
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(startYear + ratio * (endYear - startYear)))
);
Array.from(yearTicks).forEach((year) => {
  const ratio = endYear === startYear ? 0.5 : (year - startYear) / (endYear - startYear);
  chartLabels.appendChild(createSvgElement("text", {
    x: xPosition(ratio), y: plot.bottom + 28, "text-anchor": "middle", class: "chart-axis-label"
  }, String(year)));
});
chartLabels.appendChild(createSvgElement("text", {
  x: (plot.left + plot.right) / 2, y: 414, "text-anchor": "middle", class: "chart-axis-caption"
}, "Year"));
