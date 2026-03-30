"use strict";

const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(__dirname, "four_counties_plss.geojson");
const OUTPUT_FILE = path.join(__dirname, "townships.geojson");

function toNumber(value) {
  const n = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeNo(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
}

function normalizeDir(value) {
  const s = String(value ?? "").trim().toUpperCase();
  return s || null;
}

function townshipLabelFromProperties(props) {
  const twpNo = normalizeNo(props?.TWNSHPNO);
  const twpDir = normalizeDir(props?.TWNSHPDIR);
  const rangeNo = normalizeNo(props?.RANGENO);
  const rangeDir = normalizeDir(props?.RANGEDIR);
  if (!twpNo || !twpDir || !rangeNo || !rangeDir) return null;
  return `T${twpNo}${twpDir} R${rangeNo}${rangeDir}`;
}

function accumulateCoords(node, acc) {
  if (!Array.isArray(node)) return;
  if (
    node.length >= 2 &&
    typeof node[0] !== "object" &&
    typeof node[1] !== "object"
  ) {
    const x = toNumber(node[0]);
    const y = toNumber(node[1]);
    if (x !== null && y !== null) {
      acc.sumX += x;
      acc.sumY += y;
      acc.count += 1;
    }
    return;
  }
  for (const child of node) {
    accumulateCoords(child, acc);
  }
}

function main() {
  const raw = fs.readFileSync(INPUT_FILE, "utf8");
  const geojson = JSON.parse(raw);
  const features = Array.isArray(geojson?.features) ? geojson.features : [];

  const groups = new Map();

  for (const feature of features) {
    const props = feature?.properties ?? {};
    const label = townshipLabelFromProperties(props);
    if (!label) continue;

    const geom = feature?.geometry ?? null;
    const coords = geom?.coordinates;
    if (!coords) continue;

    let group = groups.get(label);
    if (!group) {
      group = { sumX: 0, sumY: 0, count: 0 };
      groups.set(label, group);
    }

    accumulateCoords(coords, group);
  }

  const outputFeatures = [];
  for (const [label, acc] of groups) {
    if (!acc.count) continue;
    outputFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [acc.sumX / acc.count, acc.sumY / acc.count],
      },
      properties: { label },
    });
  }

  outputFeatures.sort((a, b) =>
    String(a.properties.label).localeCompare(String(b.properties.label)),
  );

  const out = {
    type: "FeatureCollection",
    features: outputFeatures,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out), "utf8");
  console.log(`Wrote ${outputFeatures.length} township labels to ${OUTPUT_FILE}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
