#!/usr/bin/env node
/**
 * Compile src/App.tsx into a single CJS bundle that the Prisme.ai platform
 * can load via its module loader, AND compile the app's Tailwind CSS
 * (src/styles/globals.css) into the bundle so it self-injects at runtime.
 *
 * Output: dist/bundle.js (committed-friendly, single file, no source maps)
 *
 * The platform expects:
 *   - CJS format with `module.exports.default = AppComponent`
 *   - All shared libs (React, Radix, lucide, @prisme.ai/sdk, ...) as externals
 *     (they are injected by the host's module loader; bundling them would
 *     duplicate React and break hooks)
 *
 * Why we inject CSS: the platform ships its OWN Tailwind/theme. Anything your
 * app adds on top — theme overrides (brand colors/fonts), custom utilities,
 * @keyframes, @font-face — does NOT exist in the platform CSS, so a deployed
 * app that relies on them looks broken vs. local dev. We compile globals.css
 * with Tailwind and prepend a tiny injector that appends a <style> once on
 * load. Utilities the platform already provides keep working; your custom CSS
 * now ships too.
 */

import * as esbuild from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { EXTERNALS } from './externals.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ENTRY = path.join(ROOT, 'src/App.tsx')
const CSS_ENTRY = path.join(ROOT, 'src/styles/globals.css')
const OUT_DIR = path.join(ROOT, 'dist')
const OUT_FILE = path.join(OUT_DIR, 'bundle.js')

const start = Date.now()

// 1. Compile Tailwind CSS (scans src/** per tailwind.config.js content globs).
//    Skipped gracefully if there is no globals.css.
let compiledCss = ''
if (existsSync(CSS_ENTRY)) {
  const rawCss = await readFile(CSS_ENTRY, 'utf8')
  compiledCss = (
    await postcss([
      tailwindcss({ config: path.join(ROOT, 'tailwind.config.js') }),
      autoprefixer,
    ]).process(rawCss, { from: CSS_ENTRY })
  ).css
}

// 2. Bundle the React app. `.css` imports are emptied so `import './styles/
//    globals.css'` (used for local dev) doesn't pull raw CSS into the JS.
const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  external: EXTERNALS,
  alias: {
    '@': path.join(ROOT, 'src'),
  },
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'empty',
  },
  metafile: true,
  write: false,
})

// 3. Prepend a runtime injector that appends the compiled CSS once.
const injector = compiledCss
  ? `(function(){try{if(typeof document!=="undefined"&&!document.getElementById("prismeai-app-styles")){` +
    `var s=document.createElement("style");s.id="prismeai-app-styles";s.textContent=${JSON.stringify(compiledCss)};` +
    `document.head.appendChild(s);}}catch(e){}})();\n`
  : ''

const bundleJs = injector + new TextDecoder().decode(result.outputFiles[0].contents)

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, bundleJs)

const elapsed = Date.now() - start
const bytes = Buffer.byteLength(bundleJs)
const sizeKb = (bytes / 1024).toFixed(1)
const cssKb = (Buffer.byteLength(compiledCss) / 1024).toFixed(1)

console.log(
  `✓ Built ${path.relative(ROOT, OUT_FILE)} (${sizeKb} KB${compiledCss ? `, incl. ${cssKb} KB CSS` : ''}) in ${elapsed}ms`
)
console.log(`  External modules (provided by host): ${EXTERNALS.length}`)

if (result.warnings.length) {
  console.warn(`⚠ ${result.warnings.length} warnings:`)
  for (const w of result.warnings) console.warn('  -', w.text)
}

// Bundle size guard: warn at WARN threshold, fail at MAX. Configurable via env.
// Defaults: warn 500 KB, fail 2 MB. Apps over a few MB load slowly on mobile.
const SIZE_WARN = parseInt(process.env.PRISMEAI_BUNDLE_SIZE_WARN || '512000', 10) // 500 KB
const SIZE_MAX = parseInt(process.env.PRISMEAI_BUNDLE_SIZE_MAX || '2097152', 10)  // 2 MB

if (bytes > SIZE_MAX) {
  console.error(`✗ Bundle exceeds max size: ${sizeKb} KB > ${(SIZE_MAX / 1024).toFixed(0)} KB.`)
  console.error(`  Either trim the bundle (tree-shake, code-split, drop heavy deps)`)
  console.error(`  or raise PRISMEAI_BUNDLE_SIZE_MAX (current: ${SIZE_MAX} bytes).`)
  process.exit(1)
}
if (bytes > SIZE_WARN) {
  console.warn(`⚠ Bundle is ${sizeKb} KB (warn threshold: ${(SIZE_WARN / 1024).toFixed(0)} KB).`)
  console.warn(`  Consider tree-shaking or React.lazy for heavy panels.`)
}
