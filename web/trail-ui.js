"use strict";
function trailLabels() {
  for (const id of [
    "trailLength",
    "trailHalfLife",
    "trailWidth",
    "trailDash",
    "trailGap",
  ])
    $(id + "-value").textContent = String(+$(id).value);
  $("trailLength").disabled = !$("limitTrail").checked;
  $("trailHalfLife").disabled = !$("fadeTrail").checked;
  const style = $("trailStyle").value;
  $("trailDash").disabled = style === "solid" || style === "dotted";
  $("trailGap").disabled = style === "solid";
}
for (const id of [
  "limitTrail",
  "fadeTrail",
  "trailStyle",
  "trailLength",
  "trailHalfLife",
  "trailWidth",
  "trailDash",
  "trailGap",
]) {
  $(id).addEventListener($(id).type === "range" ? "input" : "change", () => {
    trailLabels();
    draw();
  });
}
trailLabels();
