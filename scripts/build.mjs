import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
await mkdir(new URL('lib/', root), { recursive: true })
await build({ entryPoints: [new URL('src/index.mjs', root).pathname.replace(/^\/([A-Z]:)/, '$1')], outfile: new URL('lib/index.js', root).pathname.replace(/^\/([A-Z]:)/, '$1'), bundle: true, format: 'esm', platform: 'node', target: 'node22', external: ['@deepseek-ai/*'] })
const result = await build({ entryPoints: [new URL('src/client/index.ts', root).pathname.replace(/^\/([A-Z]:)/, '$1')], bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', write: false, outdir: new URL('lib/', root).pathname.replace(/^\/([A-Z]:)/, '$1'), loader: { '.css': 'local-css' }, external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-*'] })
const js = result.outputFiles.find(file => file.path.endsWith('.js')), css = result.outputFiles.find(file => file.path.endsWith('.css'))
if (!js || !css) throw new Error('Missing speech enhancement client artifacts')
const artifact = `window.__ModuleLoader__.load({\n id: 'dsh-speech-service',\n factory: (require) => {\n var module = { exports: {} }; var exports = module.exports;\n${js.text}\n const implementation = module.exports;\n return { inject: implementation.inject, apply: ctx => {\n ctx.effect(() => { const style = document.createElement('style'); style.dataset.speechServiceEnhancement = ''; style.textContent = ${JSON.stringify(css.text)}; document.head.append(style); return () => style.remove(); });\n return implementation.apply(ctx);\n } };\n }\n});\n`
await writeFile(new URL('lib/client.js', root), artifact)
console.log('Built dsh-speech-service')
