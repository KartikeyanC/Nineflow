// Bundles test.mjs for Node (npm run test:voice).
import path from 'node:path'

const here = import.meta.dirname
export default {
  input: path.join(here, 'test.mjs'),
  output: { file: path.join(here, '..', '..', 'node_modules', '.cache', 'voice-test.mjs'), format: 'esm' },
  platform: 'node',
  external: ['react', 'react-dom'],
}
