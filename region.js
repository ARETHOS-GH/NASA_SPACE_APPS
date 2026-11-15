const startYear = document.querySelector("#start-year");
const endYear = document.querySelector("#end-year");
const startOutput = document.querySelector("#start-output");
const endOutput = document.querySelector("#end-output");
const rangeSelection = document.querySelector("#range-selection");
const selectionForm = document.querySelector("#selection-form");

function updateYears() {
  startYear.max = endYear.value;
  endYear.min = startYear.value;
  startOutput.textContent = startYear.value;
  endOutput.textContent = endYear.value;
  const startPercent = ((Number(startYear.value) - 1980) / (2026 - 1980)) * 100;
  const endPercent = ((Number(endYear.value) - 1980) / (2026 - 1980)) * 100;
  rangeSelection.style.left = `${startPercent}%`;
  rangeSelection.style.width = `${endPercent - startPercent}%`;
}

startYear.addEventListener("input", updateYears);
endYear.addEventListener("input", updateYears);
updateYears();

selectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const params = new URLSearchParams({
    region: document.querySelector("#region").value,
    start: startYear.value,
    end: endYear.value
  });
  window.location.href = `visualization.html?${params.toString()}`;
});
