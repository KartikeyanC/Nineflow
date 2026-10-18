// Bundles test.mjs for Node (npm run test:ntpc).
import path from 'node:path'

const here = import.meta.dirname
export default {
  input: path.join(here, 'test.mjs'),
  output: { file: path.join(here, '..', '..', 'node_modules', '.cache', 'ntpc-test.mjs'), format: 'esm' },
  platform: 'node',
  external: ['react', 'react-dom'],
}
