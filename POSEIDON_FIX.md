# POSEIDON OS — NUCLEAR FIX PROTOCOL
# Drop this file into your Cursor project root.
# Open Cursor Chat → paste the CURSOR PROMPT below → execute.

---

## CURSOR PROMPT — COPY THIS ENTIRE BLOCK INTO CURSOR CHAT

---

You are rebuilding Poseidon OS from a broken state. Stop all patching. Follow these instructions exactly, in order, with no deviation.

### PHASE 1 — KILL EVERYTHING BROKEN

Run this in terminal:

```bash
# Nuke all build artifacts, caches, and broken installs
rm -rf .next
rm -rf node_modules
rm -rf .turbo
rm -f package-lock.json
rm -f yarn.lock
rm -f pnpm-lock.yaml

# Clear Next.js and TypeScript caches
rm -rf tsconfig.tsbuildinfo
rm -rf .swc

echo "Clean slate confirmed."
```

---

### PHASE 2 — REINSTALL CLEAN

```bash
npm install
```

If npm install fails:
```bash
npm install --legacy-peer-deps
```

Do NOT use yarn or pnpm. Use npm only.

---

### PHASE 3 — VERIFY THESE FILES EXIST AND ARE CORRECT

Check each file listed below. If any file is missing, malformed, or has conflicting content — rewrite it completely using the canonical version provided. Do not merge. Do not patch. Replace entirely.

---

#### `/next.config.js` — CANONICAL VERSION

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig
```

---

#### `/tsconfig.json` — CANONICAL VERSION

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

NOTE: `strict: false` — this kills the cascade of TypeScript errors without breaking functionality.

---

#### `/tailwind.config.ts` — CANONICAL VERSION

```ts
import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        mono: ["DM Mono", "monospace"],
        display: ["Bebas Neue", "Impact", "sans-serif"],
      },
      colors: {
        navy: "#05080f",
        "navy-2": "#0a0e1a",
        "navy-3": "#0f1525",
        "navy-4": "#151c30",
        "accent-blue": "#1a6ef5",
        "accent-gold": "#c9921a",
        "accent-gold-2": "#f0b432",
        "accent-green": "#0fa86a",
        "accent-red": "#e03a3a",
        "accent-amber": "#d4820f",
        "accent-purple": "#7c5af0",
        "accent-teal": "#0d9eaa",
      },
    },
  },
  plugins: [],
}

export default config
```

---

#### `/postcss.config.js` — CANONICAL VERSION

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

#### `/src/app/layout.tsx` — CANONICAL VERSION

```tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Poseidon OS — StrykeFox Medical",
  description: "Clinical operations platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

---

#### `/src/app/globals.css` — CANONICAL VERSION

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@300;400&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
}

body {
  background: #05080f;
  color: #c8dff5;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  overflow-x: hidden;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(40,90,180,0.32); border-radius: 4px; }
```

---

#### `/src/app/page.tsx` — CANONICAL VERSION

```tsx
export default function Home() {
  return (
    <main style={{ padding: "40px", color: "#c8dff5" }}>
      <h1 style={{ fontFamily: "sans-serif", fontSize: "32px" }}>
        Poseidon OS — Online
      </h1>
      <p style={{ marginTop: "12px", color: "#7a9bc4" }}>
        Platform is operational. Replace this with your dashboard component.
      </p>
    </main>
  )
}
```

---

### PHASE 4 — PACKAGE.JSON AUDIT

Open `package.json`. Verify these exact dependencies are present. If any are missing, add them. If versions conflict, use these exact versions:

```json
{
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5"
  }
}
```

After editing package.json, run:
```bash
npm install
```

---

### PHASE 5 — TEST BUILD

```bash
npm run dev
```

Expected output:
```
▲ Next.js 14.x.x
- Local: http://localhost:3000
✓ Ready in Xs
```

If you see any error — DO NOT PATCH IT. Report the exact error message back to me. I will fix it from root cause, not symptoms.

---

### PHASE 6 — COMMON ERROR KILLS

**Error: Cannot find module 'X'**
→ Run: `npm install X`

**Error: SyntaxError in .tsx file**
→ The file has a bad import or JSX error. Open that file and look for: unclosed tags, bad import paths, `import` statements using `require()` syntax, or missing `"use client"` directive on files that use hooks.

**Error: Hydration mismatch**
→ Add `"use client"` to the top of the component file throwing the error.

**Error: @/components/X not found**
→ The file doesn't exist at `src/components/X`. Check the filename case — Next.js is case-sensitive on Linux.

**Error: Tailwind classes not applying**
→ Check `tailwind.config.ts` content array includes `./src/**/*.{ts,tsx}`. Run `npm run dev` fresh after fixing.

**Error: Module 'framer-motion' not found**
→ Run: `npm install framer-motion`

**Error: Text content does not match server-rendered HTML**
→ Wrap the component in a `useEffect` + state pattern or add `suppressHydrationWarning` to the element.

---

### RULES FOR CURSOR WHILE BUILDING POSEIDON

1. NEVER use `any` as a TypeScript type — use `unknown` or define the interface.
2. NEVER use inline `<style>` tags inside TSX files — use Tailwind classes or globals.css.
3. NEVER install packages without checking package.json first for duplicates.
4. NEVER modify `next.config.js` unless instructed — experimental flags cause random crashes.
5. ALL components that use `useState`, `useEffect`, or browser APIs must have `"use client"` at line 1.
6. ALL data fetching lives in server components or API routes — not inside client components.
7. ALL file names are lowercase with hyphens: `case-management.tsx`, not `CaseManagement.tsx`.
8. DO NOT stack patches on broken components — if a component crashes twice, rewrite it from scratch.
9. DO NOT use `export default` AND named exports in the same file.
10. DO NOT import from barrel files (`index.ts`) that don't exist yet — import directly from the component file.

---

### VERIFICATION CHECKLIST — RUN BEFORE TELLING ME IT'S DONE

- [ ] `npm run dev` starts without errors
- [ ] http://localhost:3000 loads in browser without crash
- [ ] No red errors in terminal
- [ ] No red errors in browser console
- [ ] Tailwind classes are applying (background is dark, not white)
- [ ] Fonts are loading (DM Sans, not system fallback)

If all boxes are checked — the platform is operational. Report back with confirmation.

---

END OF CURSOR PROMPT
