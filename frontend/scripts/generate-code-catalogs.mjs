import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import https from "node:https"

const ICD10_XML_URL =
  "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/2026-update/icd10cm-April-1-2026-XML.zip"
const HCPCS_URL =
  "https://www.cms.gov/files/zip/april-2026-alpha-numeric-hcpcs-file.zip"

const OUT_DIR = resolve(process.cwd(), "src/generated")
const ICD10_OUT = join(OUT_DIR, "icd10-catalog.json")
const HCPCS_OUT = join(OUT_DIR, "hcpcs-catalog.json")

function download(url, dest, redirects = 0) {
  return new Promise((resolvePromise, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects > 5) {
          reject(new Error(`Too many redirects while fetching ${url}`))
          return
        }
        const nextUrl = new URL(res.headers.location, url).toString()
        res.resume()
        download(nextUrl, dest, redirects + 1).then(resolvePromise, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () => {
        writeFileSync(dest, Buffer.concat(chunks))
        resolvePromise(dest)
      })
    })
    req.on("error", reject)
  })
}

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function parseIcd10(xml) {
  const matches = xml.matchAll(/<name>([^<]+)<\/name>\s*<desc>([^<]+)<\/desc>/g)
  const codes = new Map()
  for (const match of matches) {
    const code = decodeXml(match[1] || "").toUpperCase()
    const description = decodeXml(match[2] || "")
    if (!/^[A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?$/i.test(code)) continue
    if (!description) continue
    if (!codes.has(code)) {
      codes.set(code, { code, description })
    }
  }
  return Array.from(codes.values()).sort((a, b) => a.code.localeCompare(b.code))
}

function parseHcpcs(text) {
  const rows = text.split(/\r?\n/)
  const items = new Map()
  for (const row of rows) {
    if (!row) continue
    const code = row.slice(0, 5).trim().toUpperCase()
    const recordType = row.slice(10, 11).trim()
    if (!/^[A-Z][A-Z0-9]{4}$/.test(code)) continue
    if (recordType !== "3" && recordType !== "4") continue

    const longChunk = row.slice(11, 91).trim()
    const shortDescription = row.slice(91, 119).trim()
    const existing = items.get(code) || {
      code,
      description: shortDescription || longChunk || code,
      long_description: "",
    }

    if (recordType === "3") {
      existing.description = shortDescription || existing.description || longChunk || code
      existing.long_description = longChunk
    } else if (longChunk) {
      existing.long_description = [existing.long_description, longChunk].filter(Boolean).join(" ").trim()
    }

    items.set(code, existing)
  }

  return Array.from(items.values())
    .map((item) => ({
      code: item.code,
      description: item.description,
      long_description: item.long_description || item.description,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const tempRoot = join(tmpdir(), `poseidon-code-catalogs-${Date.now()}`)
  mkdirSync(tempRoot, { recursive: true })

  const icdZip = join(tempRoot, "icd10.zip")
  const hcpcsZip = join(tempRoot, "hcpcs.zip")

  await download(ICD10_XML_URL, icdZip)
  await download(HCPCS_URL, hcpcsZip)

  const icdXml = execFileSync("unzip", ["-p", icdZip, "icd10c-tabular-April-1-2026.xml"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  })
  const hcpcsTxt = execFileSync("unzip", ["-p", hcpcsZip, "HCPC2026_APR_ANWEB.txt"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  })

  const icd10Catalog = parseIcd10(icdXml)
  const hcpcsCatalog = parseHcpcs(hcpcsTxt)

  writeFileSync(ICD10_OUT, `${JSON.stringify(icd10Catalog, null, 2)}\n`)
  writeFileSync(HCPCS_OUT, `${JSON.stringify(hcpcsCatalog, null, 2)}\n`)

  console.log(`Generated ${icd10Catalog.length} ICD-10 codes -> ${ICD10_OUT}`)
  console.log(`Generated ${hcpcsCatalog.length} HCPCS codes -> ${HCPCS_OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
