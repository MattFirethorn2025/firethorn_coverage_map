'use strict'

const fs = require('fs')

const INPUT_FILE = `${__dirname}/four_counties_plss.geojson`
const OUTPUT_FILE = `${__dirname}/four_counties_plss_deduped.geojson`

function ringArea(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return 0
  let sum = 0
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i]
    const b = coords[(i + 1) % coords.length]
    if (!Array.isArray(a) || !Array.isArray(b)) continue
    const x1 = Number(a[0])
    const y1 = Number(a[1])
    const x2 = Number(b[0])
    const y2 = Number(b[1])
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      continue
    }
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

function polygonArea(rings) {
  if (!Array.isArray(rings)) return 0
  let total = 0
  for (const ring of rings) {
    total += ringArea(ring)
  }
  return total
}

function geometryArea(geometry) {
  if (!geometry || typeof geometry !== 'object') return 0
  const { type, coordinates } = geometry

  if (type === 'Polygon') {
    return polygonArea(coordinates)
  }

  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    let total = 0
    for (const polygon of coordinates) {
      total += polygonArea(polygon)
    }
    return total
  }

  return 0
}

function dedupeKey(props) {
  const twpNo = String(props?.TWNSHPNO ?? '').trim()
  const twpDir = String(props?.TWNSHPDIR ?? '').trim().toUpperCase()
  const rangeNo = String(props?.RANGENO ?? '').trim()
  const rangeDir = String(props?.RANGEDIR ?? '').trim().toUpperCase()
  const sec = String(props?.FRSTDIVNO ?? '').trim()
  return `${twpNo}|${twpDir}|${rangeNo}|${rangeDir}|${sec}`
}

function main() {
  const raw = fs.readFileSync(INPUT_FILE, 'utf8')
  const geojson = JSON.parse(raw)
  const inputFeatures = Array.isArray(geojson.features) ? geojson.features : []

  const bestByKey = new Map()

  for (const feature of inputFeatures) {
    const key = dedupeKey(feature?.properties)
    const area = geometryArea(feature?.geometry)
    const existing = bestByKey.get(key)

    if (!existing || area > existing.area) {
      bestByKey.set(key, { feature, area })
    }
  }

  const outputFeatures = Array.from(bestByKey.values(), (entry) => entry.feature)
  const output = {
    type: 'FeatureCollection',
    features: outputFeatures,
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output), 'utf8')

  const inputCount = inputFeatures.length
  const outputCount = outputFeatures.length
  const removed = inputCount - outputCount

  console.log(`Input count: ${inputCount}`)
  console.log(`Output count: ${outputCount}`)
  console.log(`Duplicates removed: ${removed}`)
  console.log(`Wrote ${OUTPUT_FILE}`)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
