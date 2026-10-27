// Worker entry for the CLI: lets the worker thread load the TypeScript sources through tsx.
require('tsx/cjs')
require('../src/node/renderWorker.ts')
