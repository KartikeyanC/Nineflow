// Bundles test.mjs for Node (npm run test:import).
import path from 'node:path'

const here = import.meta.dirname
export default {
  input: path.join(here, 'test.mjs'),
  output: { file: path.join(here, '..', '..', 'node_modules', '.cache', 'import-test.mjs'), format: 'esm' },
  platform: 'node',
}
