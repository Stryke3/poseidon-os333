const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const rootDir = path.resolve(__dirname, "..")
const nextDir = path.join(rootDir, ".next")
const maxAttempts = 2
const maxCleanupAttempts = 5

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function clearBuildArtifacts() {
  for (let attempt = 1; attempt <= maxCleanupAttempts; attempt += 1) {
    try {
      fs.rmSync(nextDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      })
      return
    } catch (error) {
      if (attempt === maxCleanupAttempts) {
        throw error
      }

      for (const entry of fs.readdirSync(nextDir, { withFileTypes: true })) {
        fs.rmSync(path.join(nextDir, entry.name), {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        })
      }

      sleep(250 * attempt)
    }
  }
}

function runBuild() {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "build", "--webpack"],
    {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
      env: process.env,
    },
  )

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  return result
}

function isRetryable(result) {
  const combined = `${result.stderr || ""}\n${result.stdout || ""}`
  return (
    combined.includes(".nft.json") ||
    combined.includes("pages-manifest.json") ||
    combined.includes("ENOENT") ||
    combined.includes("ENOTEMPTY")
  )
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  clearBuildArtifacts()
  const result = runBuild()
  if (result.status === 0) {
    process.exit(0)
  }
  if (attempt === maxAttempts || !isRetryable(result)) {
    process.exit(result.status || 1)
  }
  console.warn(`[build] Retrying Next build after transient artifact error (${attempt}/${maxAttempts})`)
}
