/**
 * 把 app.js + 引擎 + acts.json 打成一个单文件 HTML。
 *
 *   cd demo && npm install && npm run build
 *
 * 产物 sanguo.html 是提交进仓库的：读者双击就能玩，不需要 Node。
 */

import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const templatePath = join(here, 'template.html')
const outputPath = join(here, 'sanguo.html')

const bundled = await build({
  entryPoints: [join(here, 'app.js')],
  bundle: true,
  format: 'iife',
  target: ['es2018'],
  minify: true,
  write: false,
  legalComments: 'none',
  loader: { '.json': 'json' },
  logLevel: 'warning'
})

const js = bundled.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>')
const template = await readFile(templatePath, 'utf8')
if (!template.includes('/*__BUNDLE__*/')) {
  throw new Error('template.html 里找不到 /*__BUNDLE__*/ 占位符')
}

const html = template.replace('/*__BUNDLE__*/', () => js)
await writeFile(outputPath, html, 'utf8')

const kb = (Buffer.byteLength(html) / 1024).toFixed(1)
console.log(`wrote ${outputPath} (${kb} KB)`)
