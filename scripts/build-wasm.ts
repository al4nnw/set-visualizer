/**
 * Compiles src/shared/resample.wat (the resampler's hot loop in WebAssembly SIMD) into
 * src/shared/resampleWasm.ts, which embeds it so it loads the same way in browsers, workers and
 * Node. Run after changing the .wat:
 *   npm run build:wasm
 * test/browserAnalysis.test.ts fails while the two are out of step.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import wabtInit from 'wabt'

export async function compileWat(path: string): Promise<Uint8Array> {
  const wabt = await wabtInit()
  const mod = wabt.parseWat(path, await readFile(path, 'utf8'), { simd: true })
  try {
    mod.validate()
    return new Uint8Array(mod.toBinary({}).buffer)
  } finally {
    mod.destroy()
  }
}

async function main() {
  const wat = resolve(__dirname, '../src/shared/resample.wat')
  const bytes = await compileWat(wat)
  const b64 = Buffer.from(bytes).toString('base64')
  const out = resolve(__dirname, '../src/shared/resampleWasm.ts')
  await writeFile(out, `// Generated from resample.wat by \`npm run build:wasm\`. Don't edit.\nexport const RESAMPLE_WASM = '${b64}'\n`)
  console.log(`${out}: ${bytes.length} bytes of WebAssembly`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) main()
