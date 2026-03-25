'use strict'

const fs = require('fs')

const INPUT_FILE = `${__dirname}/oklahoma_plss_sections.geojson`
const OUTPUT_FILE = `${__dirname}/four_counties_plss.geojson`

/**
 * PLSSID: OK17 + 3-digit twp + twp dir + 0 + 2-digit range + range dir + …
 * e.g. OK170290N0260W0 → T29N R26W
 * Township number: indices 4–6, separator at 7, direction index 8
 * Range number: indices 10–11 (2 digits), direction index 13
 */
function parsePlssid(plssid) {
  const s = String(plssid ?? '')
  if (s.length < 14) return null

  const twpStr = s.slice(4, 7)
  const twpDir = s.charAt(8).toUpperCase()
  const rangeStr = s.slice(10, 12)
  const rangeDir = s.charAt(13).toUpperCase()

  const twpNo = Number.parseInt(twpStr, 10)
  const rangeNo = Number.parseInt(rangeStr, 10)
  if (!Number.isFinite(twpNo) || !Number.isFinite(rangeNo)) return null
  if (!twpDir || !rangeDir) return null

  return { twpNo, twpDir, rangeNo, rangeDir }
}

/** Combined box: T4N–T25N, R8W–R27W */
function isInBounds(parsed) {
  if (!parsed) return false
  const { twpNo, twpDir, rangeNo, rangeDir } = parsed
  return (
    twpDir === 'N' &&
    rangeDir === 'W' &&
    twpNo >= 4 &&
    twpNo <= 25 &&
    rangeNo >= 8 &&
    rangeNo <= 27
  )
}

function main() {
  const raw = fs.readFileSync(INPUT_FILE, 'utf8')
  const geojson = JSON.parse(raw)
  const inputFeatures = Array.isArray(geojson.features) ? geojson.features : []

  const seenFrstdivid = new Set()
  const keptFeatures = []
  let duplicatesRemoved = 0

  for (const feature of inputFeatures) {
    const props = feature && feature.properties ? feature.properties : {}
    const parsed = parsePlssid(props.PLSSID)
    if (!isInBounds(parsed)) continue

    const fidRaw = props.FRSTDIVID
    if (fidRaw != null && String(fidRaw).trim() !== '') {
      const fid = String(fidRaw).trim()
      if (seenFrstdivid.has(fid)) {
        duplicatesRemoved += 1
        continue
      }
      seenFrstdivid.add(fid)
    }

    keptFeatures.push({
      ...feature,
      properties: {
        ...props,
        county: '',
        TWNSHPNO: String(parsed.twpNo).padStart(3, '0'),
        TWNSHPDIR: parsed.twpDir,
        RANGENO: String(parsed.rangeNo).padStart(3, '0'),
        RANGEDIR: parsed.rangeDir,
      },
    })
  }

  const out = {
    type: 'FeatureCollection',
    features: keptFeatures,
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out), 'utf8')

  console.log(`Total kept: ${keptFeatures.length}`)
  console.log(`Duplicates removed: ${duplicatesRemoved}`)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exitCode = 1
}
