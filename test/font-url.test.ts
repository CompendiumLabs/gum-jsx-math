import { expect, test } from 'bun:test'
import { font_url } from '../src/fonts'

test('Windows drive paths become file URLs with encoded path characters', () => {
  for (const path of [String.raw`C:\Users\A #?%\KaTeX_Math-Italic.ttf`,
    'C:/Users/A #?%/KaTeX_Math-Italic.ttf']) {
    const url = font_url(path, import.meta.url)
    expect(url.protocol).toBe('file:')
    expect(url.href).toBe('file:///C:/Users/A%20%23%3F%25/KaTeX_Math-Italic.ttf')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  }
})

test('other asset paths retain normal URL resolution', () => {
  const base = 'file:///workspace/gum-jsx-math/src/fonts.ts'
  expect(font_url('/tmp/KaTeX_Main-Regular.ttf', base).href).toBe('file:///tmp/KaTeX_Main-Regular.ttf')
  expect(font_url('../assets/KaTeX_Main-Regular.ttf', base).href)
    .toBe('file:///workspace/gum-jsx-math/assets/KaTeX_Main-Regular.ttf')
  expect(font_url('https://example.com/KaTeX_Main-Regular.ttf', base).href)
    .toBe('https://example.com/KaTeX_Main-Regular.ttf')
})
