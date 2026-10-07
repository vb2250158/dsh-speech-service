import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const source = process.env.DSH_SOURCE_ROOT
if (!source) throw new Error('Set DSH_SOURCE_ROOT to the upstream developer checkout')
const root = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/')
const files = ['voice-input.client.spec.tsx', 'audio.client.spec.ts']
const temporary = []
try {
  const configPath = join(source, 'local-speech-service.config.mts')
  if (existsSync(configPath)) throw new Error('Test configuration already exists')
  const config = `import { defineConfig } from 'vitest/config';
import ts from 'typescript';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts';
const paths = ts.readConfigFile('tsconfig.base.json', ts.sys.readFile).config.compilerOptions.paths;
const require = createRequire(resolve('packages/experimental/client-ui-voice-input/package.json'));
const alias = Object.entries(paths).sort(([a], [b]) => b.length - a.length).map(([key, targets]) => ({
 find: new RegExp('^' + key.replace(/[.+?^$(){}|[\\]\\\\]/g, '\\\\$&').replace('*', '(.*)') + '$'),
 replacement: resolve(targets[0]).replaceAll('\\\\', '/').replace('*', '$1') }));
alias.unshift({ find: /^react(\\/.*)?$/, replacement: require.resolve('react').replace(/index.js$/, '') + '$1' });
export default defineConfig({ plugins: [standardDecoratorPlugin()], resolve: { alias }, test: { execArgv: vitestExecArgv, include: ['apps/web/tests/local-speech-service-*.spec.ts*'], setupFiles: ['scripts/test-dom-environment.ts'] } });\n`
  await writeFile(configPath, config); temporary.push({ path: configPath, contents: config })
  for (const file of files) {
    const path = join(source, 'apps/web/tests/local-speech-service-' + file)
    if (existsSync(path)) throw new Error('Fixture already exists: ' + path)
    const contents = (await readFile(new URL('../tests/' + file, import.meta.url), 'utf8'))
      .replaceAll('../src/client/', root + 'src/client/').replaceAll('./audio-fixture.client.ts', root + 'tests/audio-fixture.client.ts')
      .replaceAll('@deepseek-ai/dsh-client-locale/src/locales/zh.ts', resolve(source, 'packages/client/locale/src/locales/zh.ts').replaceAll('\\', '/'))
    await writeFile(path, contents); temporary.push({ path, contents })
  }
  execFileSync(process.execPath, [join(resolve(source), 'node_modules/vitest/vitest.mjs'), 'run', '--config', configPath], { cwd: source, windowsHide: true, stdio: 'inherit', timeout: 180000 })
} finally {
  for (const { path, contents } of temporary) {
    if (await readFile(path, 'utf8') !== contents) throw new Error('Changed fixture retained: ' + path)
    await unlink(path)
  }
}
