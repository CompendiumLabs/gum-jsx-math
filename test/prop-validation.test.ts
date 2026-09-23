import { expect, test } from 'bun:test'
import { evaluate, px } from '@gum-jsx/core'
import { Latex, Frac } from '../src'
import * as math from '../src'

test('math constructors and evaluated math reject unknown props', () => {
  expect(() => new Latex({ font_szie: px(24) } as any)).toThrow('font_size')
  expect(() => new Frac({ thicknes: px(1) } as any)).toThrow('unknown prop')
  expect(() => evaluate('<Latex font-szie={px(24)}>x^2</Latex>', { scope: math })).toThrow('font_size')
  expect(() => new Latex({ font_size: px(24), inline: true, children: 'x^2' })).not.toThrow()
})
