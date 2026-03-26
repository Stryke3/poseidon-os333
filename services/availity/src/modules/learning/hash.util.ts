import crypto from "node:crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Backwards-compatible alias.
export function sha256Hex(input: string): string {
  return sha256(input);
}

