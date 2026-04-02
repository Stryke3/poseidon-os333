#!/usr/bin/env node
/**
 * Copy pdf.js worker into /public so OCR can load it same-origin (CSP-friendly).
 */
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const src = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
const dest = path.join(root, "public", "pdf.worker.min.mjs")

if (!fs.existsSync(src)) {
  console.warn("[copy-pdfjs-worker] pdf.worker.min.mjs not found (run npm install).")
  process.exit(0)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)
console.log("[copy-pdfjs-worker] copied to public/pdf.worker.min.mjs")
