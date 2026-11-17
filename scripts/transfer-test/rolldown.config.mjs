// Bundles test.mjs for Node (npm run test:transfer).
import path from 'node:path'

const here = import.meta.dirname
export default {
  input: path.join(here, 'test.mjs'),
  output: { file: path.join(here, '..', '..', 'node_modules', '.cache', 'transfer-test.mjs'), format: 'esm' },
  platform: 'node',
}
