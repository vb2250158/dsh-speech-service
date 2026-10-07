import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const source = process.env.DSH_SOURCE_ROOT
if (!source || !process.env.DSH_RABI_PLUGIN_ROOT) throw new Error('Set DSH_SOURCE_ROOT and DSH_RABI_PLUGIN_ROOT')
const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = []
try {
  const names = process.env.DSH_ASR_REAL_ONLY ? ['models-real'] : ['input', 'readback']
  for (const name of names) {
    const path = join(source, 'apps/web/tests/local-speech-service-' + name + '.e2e.ts')
    if (existsSync(path)) throw new Error('Existing browser fixture: ' + path)
    const contents = await readFile(new URL('../tests/' + name + '-browser.fixture.txt', import.meta.url), 'utf8')
    await writeFile(path, contents); temporary.push({ path, contents })
  }
  execFileSync(process.execPath, [join(resolve(source), 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.web.config.ts', ...temporary.map(file => file.path)], {
    cwd: source, windowsHide: true, stdio: 'inherit', timeout: 300000,
    env: { ...process.env, DSH_SPEECH_PLUGIN_ROOT: root, DSH_SNAPSHOT: process.env.DSH_SNAPSHOT || 'replay' },
  })
} finally {
  for (const { path, contents } of temporary) {
    if (await readFile(path, 'utf8') !== contents) throw new Error('Changed fixture retained: ' + path)
    await unlink(path)
  }
}
