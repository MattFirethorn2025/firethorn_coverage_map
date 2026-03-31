"use strict";

const fs = require("fs");
const unionModule = require("@turf/union");

const union = unionModule.default || unionModule;

const INPUT_PATH = "client/public/four_counties_plss.geojson";
const OUTPUT_PATH = "client/public/township-polygons.geojson";

function normalizePart(value) {
  return String(value ?? "").trim().toUpperCase();
}

function toTownshipKey(props) {
  const twpNo = normalizePart(props?.TWNSHPNO).replace(/^0+/, "") || "0";
  const twpDir = normalizePart(props?.TWNSHPDIR);
  const rangeNo = normalizePart(props?.RANGENO).replace(/^0+/, "") || "0";
  const rangeDir = normalizePart(props?.RANGEDIR);
  return `${twpNo}${twpDir}${rangeNo}${rangeDir}`;
}

function unionTwo(a, b) {
  try {
    return union(a, b);
  } catch {
    return union({
      type: "FeatureCollection",
      features: [a, b],
    });
  }
}

function buildTownshipPolygons(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const groups = new Map();

  for (const feature of features) {
    if (!feature?.geometry) continue;
    const key = toTownshipKey(feature.properties || {});
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature);
  }

  const outFeatures = [];

  for (const [twpKey, group] of groups) {
    if (group.length === 0) continue;

    let merged = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const next = group[i];
      const maybeUnion = unionTwo(merged, next);
      if (maybeUnion) merged = maybeUnion;
    }

    outFeatures.push({
      type: "Feature",
      geometry: merged.geometry,
      properties: { twpKey },
    });
  }

  return {
    type: "FeatureCollection",
    features: outFeatures,
  };
}

function main() {
  const inputRaw = fs.readFileSync(INPUT_PATH, "utf8");
  const input = JSON.parse(inputRaw);
  const output = buildTownshipPolygons(input);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf8");
  console.log(`Wrote ${output.features.length} township polygons`);
}

if (require.main === module) {
  main();
}

module.exports = { buildTownshipPolygons, main };
