import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
// import esbuild from 'rollup-plugin-esbuild-transform'
// import { createRequire } from 'node:module'
// const require = createRequire(import.meta.url)
// const packageJson = require('./package.json')
// const name = packageJson.main.replace(/\.js$/, '')

const bundle = config => ({
  ...config,
  input: 'src/index.ts',
  external: id => !/^[./]/.test(id),
})

// const ext = id => {
//   const res = !/^[./]/.test(id) && id !== 'lodash/cloneDeepWith' && id !== 'src/index.ts'
//   console.log(`id: ${id} - ${res}`)
//   return res
// }

export default [
  {
    input: 'src/index.ts',
    external: [/@deepkit/, 'debug', 'openai'],
    plugins: [
      nodeResolve({
        resolveOnly: id => {
          return true
        },
      }),
      commonjs({
        include: 'node_modules/**',
      }),
      esbuild(),
    ],
    output: [
      {
        file: `dist/index.cjs`,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: `dist/index.js`,
        format: 'es',
        sourcemap: true,
      },
    ],
  },
  bundle({
    plugins: [dts()],
    output: {
      file: `dist/index.d.ts`,
      format: 'es',
    },
  }),
]
