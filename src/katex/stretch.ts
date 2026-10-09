import { freeze_owned } from '@gum-jsx/core'
import type { MathStretchMetrics } from '../font-provider'

const STRETCH: Readonly<Record<string, MathStretchMetrics>> = freeze_owned(Object.fromEntries([
  ...['overrightarrow', 'overleftarrow', 'underrightarrow', 'underleftarrow',
    'overleftrightarrow', 'underleftrightarrow', 'overleftharpoon', 'overrightharpoon',
    'overlinesegment', 'underlinesegment'].map(name => [name, { height: 0.522, min_width: 0.888 }]),
  ['Overrightarrow', { height: 0.56, min_width: 0.888 }],
  ...['overgroup', 'undergroup'].map(name => [name, { height: 0.26, min_width: 0.888 }]),
  ...['widehat', 'widecheck', 'widetilde', 'utilde'].map(name => [name, { height: 0.26, min_width: 0 }]),
  ...['overbrace', 'underbrace'].map(name => [name, { height: 0.548, min_width: 1.6, thickness: 0.1 }]),
  ['overbracket', { height: 0.44, min_width: 1.6, thickness: 0.12 }],
  ['underbracket', { height: 0.41, min_width: 1.6, thickness: 0.12 }],
  ['vec', { height: 0.197, min_width: 0.442 }],
  ...['xrightarrow', 'xleftarrow'].map(name => [name, { height: 0.522, min_width: 1.469 }]),
  ['xleftrightarrow', { height: 0.522, min_width: 1.75 }],
  ...['xRightarrow', 'xLeftarrow'].map(name => [name, { height: 0.56, min_width: 1.526 }]),
  ['xLeftrightarrow', { height: 0.56, min_width: 1.75 }],
  ...['xlongequal', 'xtwoheadrightarrow', 'xtwoheadleftarrow'].map(name => [name, { height: 0.334, min_width: 0.888 }]),
  ...['xrightharpoonup', 'xrightharpoondown', 'xleftharpoonup', 'xleftharpoondown']
    .map(name => [name, { height: 0.522, min_width: 0.888 }]),
  ...['xhookrightarrow', 'xhookleftarrow'].map(name => [name, { height: 0.522, min_width: 1.08 }]),
  ['xmapsto', { height: 0.522, min_width: 1.5 }],
  ...['xrightleftharpoons', 'xleftrightharpoons', 'xrightequilibrium', 'xleftequilibrium']
    .map(name => [name, { height: 0.716, min_width: 1.75 }]),
  ['xrightleftarrows', { height: 0.901, min_width: 1.75 }],
  ['xtofrom', { height: 0.528, min_width: 1.75 }],
] as [string, MathStretchMetrics][]))


export { STRETCH }
