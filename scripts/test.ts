#! /usr/bin/env bun

// Render every example in test/code in strict mode (see @gum-jsx/core/test);
// pass --report to also write the renders and manifest to test/data

import { runTests } from '@gum-jsx/core/test'
import '../src/index'

const report = process.argv.includes('--report')
const { failed } = runTests({ groups: [ 'test' ], report })
process.exit(failed > 0 ? 1 : 0)
