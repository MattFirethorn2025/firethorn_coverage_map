'use strict'

const https = require('https')
const fs = require('fs')

const QUERY_BASE =
  'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/2/query'

const PAGE_SIZE = 1000
const OUTPUT_FILE = `${__dirname}/oklahoma_plss_sections.geojson`

function buildQueryUrl(offset) {
  const params = new URLSearchParams({
    where: "PLSSID LIKE 'OK%' AND FRSTDIVTYP='SN'",
    outFields:
      'PLSSID,FRSTDIVID,FRSTDIVNO,FRSTDIVDUP',
    returnGeometry: 'true',
    f: 'geojson',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
  })
  return `${QUERY_BASE}?${params.toString()}`
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url)
    const options = {
      hostname: requestUrl.hostname,
      path: requestUrl.pathname + requestUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'firethorn-coverage-map/1.0 (PLSS fetch script)',
        Accept: 'application/json, application/geo+json, */*',
      },
    }

    const req = https.request(options, (res) => {
      const { statusCode, headers } = res

      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        headers.location
      ) {
        const nextUrl = new URL(headers.location, url).href
        res.resume()
        httpsGetJson(nextUrl).then(resolve, reject)
        return
      }

      if (statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${statusCode} for ${url}`))
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve(JSON.parse(text))
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const allFeatures = []
  let offset = 0

  while (true) {
    const url = buildQueryUrl(offset)
    const data = await httpsGetJson(url)

    const feats = Array.isArray(data.features) ? data.features : []
    allFeatures.push(...feats)

    console.log(`Fetched ${feats.length} features, offset ${offset}...`)

    if (feats.length < PAGE_SIZE || data.exceededTransferLimit === false) {
      break
    }

    offset += PAGE_SIZE
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features: allFeatures,
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(featureCollection), 'utf8')
  console.log(`Wrote ${allFeatures.length} features to ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
