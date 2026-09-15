#!/usr/bin/env bun
// Exercise the actual editor production bundle: cold font loading, concurrent
// formulas, reuse, typed errors, and self-contained outline SVG. Run after build.
import { mkdtempSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../../gum-next-edit/dist/', import.meta.url))
const bundle = readdirSync(join(dist, 'assets')).find(file => /^gum-.+\.js$/.test(file))
if (!bundle) throw new Error('Run bun run build from the workspace first')
const chrome = process.env.GUM_CHROME ?? Bun.which('chromium') ?? Bun.which('google-chrome-stable')
if (!chrome) throw new Error('Chromium is required; set GUM_CHROME to its path')
const output = resolve(process.argv[2] ?? fileURLToPath(new URL('../out/browser.png', import.meta.url)))
mkdirSync(dirname(output), { recursive: true })
const scratch = mkdtempSync(join(tmpdir(), 'gum-next-browser-'))
const browserSources = [
  String.raw`e^{i\pi}+1=0`,
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\int_{-\infty}^{\infty}e^{-x^2}\,dx=\sqrt{\pi}`,
  String.raw`\left\{x\middle|\frac{1}{x}>0\right\}`,
].map(text => `<Svg font-size={px(40)}>
  <Box padding={em(0.5)}>
    <Latex text={${JSON.stringify(text)}} />
  </Box>
</Svg>`)
browserSources.push(`<Svg font-size={px(40)} color={blue}>
  <Box padding={em(0.5)}>
    <MathText style="display">
      <SupSub sub="n=0" sup="∞">
        <MathOp>∑</MathOp>
      </SupSub>
      <Frac>
        <SupSub sup="n">x</SupSub>
        <MathText>n!</MathText>
      </Frac>
    </MathText>
  </Box>
</Svg>`)
const failures = [['<Latex text="{" />', 'parse:'], [String.raw`<Latex text="\hat{x}" />`, 'unsupported:']]
const html = `<!doctype html><html><meta charset="utf-8"><title>Gum math browser verification</title>
<style>body{font:16px sans-serif;margin:24px;background:#f6f7f9;color:#182330}figure{margin:12px 0;padding:16px;background:white;border:1px solid #ddd}svg{display:block}pre{white-space:pre-wrap}</style>
<h1>Gum math · browser verification</h1><pre id="status">Loading…</pre><main></main>
<script type="module">
import {renderGum} from '/assets/${bundle}';
const status = document.querySelector('#status');
const fontRequests = () => performance.getEntriesByType('resource').filter(item => item.name.endsWith('.ttf'));
try {
  if (fontRequests().length) throw Error('Importing the math renderer loaded fonts');
  const sources = ${JSON.stringify(browserSources)};
  const svgs = await Promise.all(sources.map(source => renderGum(source)));
  for (const svg of svgs) {
    if (!svg.includes('<path') || svg.includes('<text')) throw Error('Expected outline-only SVG');
    // Each preview is a standalone SVG, like the docs images. Inlining several
    // exports into one DOM would make their local clip IDs collide.
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    figure.append(image); document.querySelector('main').append(figure);
    await image.decode();
  }
  const fonts = fontRequests();
  if (fonts.length !== 24 || new Set(fonts.map(item => item.name)).size !== 24) throw Error('Font loads were missing or duplicated: '+fonts.length);
  await renderGum(sources[0]);
  if (fontRequests().length !== 24) throw Error('Rendering again reloaded fonts');
  for (const [source, expected] of ${JSON.stringify(failures)}) {
    let failure;
    try { await renderGum(source) } catch (error) { failure = String(error) }
    if (!failure?.includes(expected)) throw Error('Expected '+expected+' diagnostic, got '+failure);
  }
  await renderGum(sources[0]);
  document.body.dataset.result = 'passed';
  status.textContent = 'Passed: no import-time font requests; 24 faces loaded once; concurrent formulas; repeat rendering; parse/unsupported failures and recovery; outline SVG.';
} catch (error) {
  document.body.dataset.result = 'failed'; status.textContent = String(error.stack ?? error);
}
</script></html>`
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const pathname = new URL(request.url).pathname
  if (pathname === '/') return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  const target = resolve(dist, '.' + pathname)
  if (!target.startsWith(dist) || !pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 })
  const file = Bun.file(target)
  return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 })
} })
try {
  const child = Bun.spawn([chrome, '--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--hide-scrollbars', `--user-data-dir=${scratch}`,
    '--virtual-time-budget=10000', '--window-size=1100,1200', `--screenshot=${output}`,
    '--dump-dom', server.url.href], { stdout: 'pipe', stderr: 'pipe' })
  const timeout = setTimeout(() => child.kill(), 30000)
  const [exit, dom, stderr] = await Promise.all([child.exited,
    new Response(child.stdout).text(), new Response(child.stderr).text()])
  clearTimeout(timeout)
  await Bun.write(output.replace(/\.png$/, '') + '.html', dom)
  if (exit !== 0 || !dom.includes('data-result="passed"')) {
    throw new Error(`Browser verification failed (${exit}): ${dom.match(/<pre id="status">([\s\S]*?)<\/pre>/)?.[1] ?? stderr.slice(-2000)}`)
  }
  console.log(`Browser verification passed; screenshot: ${output}`)
} finally {
  server.stop(true)
  rmSync(scratch, { recursive: true, force: true })
}
