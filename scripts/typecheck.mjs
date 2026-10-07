import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const source = process.env.DSH_SOURCE_ROOT
if (!source) throw new Error('Set DSH_SOURCE_ROOT to a built upstream checkout')
const require = createRequire(join(resolve(source), 'package.json'))
const ts = require('typescript')
const config = ts.readConfigFile(join(source, 'tsconfig.base.client.json'), ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(source))
const root = fileURLToPath(new URL('../', import.meta.url))
const paths = Object.fromEntries(Object.entries(parsed.options.paths).map(([key, targets]) => [key, targets.map(target => resolve(source, target).replaceAll('\\', '/').replace(/\/src(?=\/|$)/, '/lib/types').replace(/\.tsx?$/, '.d.ts'))]))
paths['@deepseek-ai/dsh-experimental-api-speech-to-text/remote'] = [resolve(source, 'packages/experimental/api-speech-to-text/lib/typert.remote-client.d.ts')]
const clientRequire = createRequire(resolve(source, 'packages/experimental/client-ui-voice-input/package.json'))
const reactTypes = dirname(clientRequire.resolve('@types/react/package.json'))
paths['react'] = [join(reactTypes, 'index.d.ts')]
paths['react/*'] = [join(reactTypes, '*.d.ts')]
const files = ts.sys.readDirectory(join(root, 'src'), ['.ts', '.tsx', '.mts'])
const program = ts.createProgram(files, { ...parsed.options, paths, rootDir: undefined, composite: false, incremental: false, noEmit: true })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) { console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: path => path, getNewLine: () => '\n' })); process.exitCode = 1 }
else console.log('Speech enhancement client types passed')
