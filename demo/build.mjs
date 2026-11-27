/**
 * 把 demo 打成单文件 HTML：
 *
 *   sanguo.html  页面版（长页）
 *   card.html    卡片版（4:6 单卡）
 *
 *   cd demo && npm install && npm run build
 *
 * 两个产物都提交进仓库：读者双击就能玩，不需要 Node。
 */

import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

async function emit(entry, templateName, outputName, title) {
  const bundled = await build({
    entryPoints: [join(here, entry)],
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
  let template = await readFile(join(here, templateName), 'utf8')
  if (title) template = template.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  if (!template.includes('/*__BUNDLE__*/')) {
    throw new Error(`${templateName} 里找不到 /*__BUNDLE__*/ 占位符`)
  }

  const html = template.replace('/*__BUNDLE__*/', () => js)
  const target = join(here, outputName)
  await writeFile(target, html, 'utf8')
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1)
  console.log(`wrote ${target} (${kb} KB)`)
}

await emit('app.js', 'template.html', 'sanguo.html')
await emit('card.js', 'card.template.html', 'card.html')
await emit('main-app.js', 'life.template.html', 'life.html')
await writeFile(join(here, 'instances.html'), `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./life.html#copybook">
<title>如果 · 穿梭副本</title></head>
<body style="background:#17130f;color:#d9b98d;font-family:serif;padding:40px">
<p>正在进入《如果》的穿梭副本……</p>
<p><a style="color:#e6c993" href="./life.html#copybook">点这里继续</a></p>
</body></html>
`, 'utf8')
