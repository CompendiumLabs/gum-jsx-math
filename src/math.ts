import { Element, Svg, Fonts, LayoutPass, make_request, make_rect, make_size, make_point,
  make_fragment, place_fragment, union_rects, transform_guides, resolve_insets, finish_size, px,
  render_svg } from 'gum-jsx-core'
import type { ElementProps, FitSpec, LayoutQuery, LayoutRequest, InsetSpec, SvgProps, SvgOptions,
  FontProvider } from 'gum-jsx-core'
import { Latex } from './elems/composition'
import type { MathTextProps } from './elems/composition'
import { createMathFonts } from './fonts'

type MathSource = string | Element
type MathElementOptions = Pick<MathTextProps,
  'font_size' | 'font_family' | 'color' | 'opacity' | 'inline' | 'style' | 'size_index'
  | 'strut' | 'macros' | 'warnings' | 'on_error'> & FitSpec & Readonly<{
  padding?: InsetSpec
  width?: SvgProps['width']
  height?: SvgProps['height']
}>
type MathResources = Readonly<{ fonts?: Fonts; pass?: LayoutPass }>
type MathSvgOptions = MathElementOptions & SvgOptions & MathResources & Readonly<{ request?: LayoutRequest }>
// Loading an element's fonts requires a caller-owned resource: resources never
// live in the immutable source, and there is no hidden global font registry.
type MathLoadOptions = MathElementOptions & (
  Readonly<{ fonts: Fonts; pass?: LayoutPass }> | Readonly<{ pass: LayoutPass; fonts?: Fonts }>
)

class MathViewport extends Element<ElementProps & { padding?: InsetSpec }> {
  static auto_fit = true
  static layout(props: ElementProps & { padding?: InsetSpec }, query: LayoutQuery) {
    const child = props.children as Element
    const fragment = query.child(child, make_request(), query.measure.reference, 0, { coordinates: null, math: null })
    // Logical space (including phantom) and visible ink both belong in a
    // standalone export. Unpainted overflow alone must not enlarge its viewport.
    const bounds = union_rects(make_rect(0, 0, fragment.size.width, fragment.size.height), fragment.ink)!
    const padding = resolve_insets(props.padding, query.measure)
    const offset = make_point(padding.left - bounds.x, padding.top - bounds.y)
    // A one-pixel floor gives even an empty, unstrutted formula a usable raster
    // viewport. Explicit SVG dimensions can still request zero and clip normally.
    const size = finish_size(make_size(
      Math.max(1, bounds.width + padding.left + padding.right),
      Math.max(1, bounds.height + padding.top + padding.bottom),
    ), query.request, query.sizing)
    return make_fragment({ size, children: [place_fragment(fragment, offset)],
      guides: transform_guides(fragment.guides, offset.y) })
  }
}

// Construction only snapshots source. Parsing, fonts, natural sizing, and
// negative-ink translation all happen in the ordinary layout pass.
function mathToElement(source: MathSource, options: MathElementOptions = {}): Svg {
  if (typeof source !== 'string' && !(source instanceof Element)) {
    throw new TypeError('Math source must be a TeX string or an Element')
  }
  const { font_size = px(24), font_family, color, opacity, width, height, padding,
    inline, style, size_index, strut, macros, warnings, on_error, fit, fit_align } = options
  return new Svg({ width, height, font_size, font_family, color, opacity,
    children: new MathViewport({ padding, fit, fit_align, children: new Latex({
      inline, style, size_index, strut, macros, warnings, on_error, children: source,
    }) }),
  })
}

function resources(options: MathResources): { pass: LayoutPass; fonts: FontProvider } {
  const { pass: supplied, fonts: supplied_fonts } = options
  const existing = supplied?.resource<FontProvider>('fonts')
  if (existing && supplied_fonts && existing !== supplied_fonts) {
    throw new TypeError('fonts must be the same resource used by pass')
  }
  const fonts = supplied_fonts ?? existing ?? createMathFonts()
  const pass = supplied ?? new LayoutPass({ fonts: { value: fonts, version: fonts instanceof Fonts ? fonts.version : 0 } })
  // A caller can register/replace faces between calls with the same pass.
  if (fonts instanceof Fonts) pass.set_resource('fonts', fonts, fonts.version)
  return { pass, fonts }
}

function mathToSvg(source: MathSource, options: MathSvgOptions = {}): string {
  const element = mathToElement(source, options)
  const { pass } = resources(options)
  return render_svg(pass.layout(element, options.request), options)
}

async function preload(options: MathResources) {
  const result = resources(options)
  if (!(result.fonts instanceof Fonts)) {
    throw new TypeError('Async math helpers require Fonts; preload a custom provider before using mathToSvg')
  }
  // Includes optional math faces, bundled prose, and caller-registered faces.
  // Fonts itself shares in-flight requests and allows retry after a failed load.
  await result.fonts.load()
  result.pass.set_resource('fonts', result.fonts, result.fonts.version)
  return result
}

async function mathToElementAsync(source: MathSource, options: MathLoadOptions): Promise<Svg> {
  if (!options?.fonts && !options?.pass) throw new TypeError('mathToElementAsync requires fonts or pass')
  const element = mathToElement(source, options)
  await preload(options)
  return element
}

async function mathToSvgAsync(source: MathSource, options: MathSvgOptions = {}): Promise<string> {
  const element = mathToElement(source, options)
  const { pass } = await preload(options)
  return render_svg(pass.layout(element, options.request), options)
}

export { mathToElement, mathToSvg, mathToElementAsync, mathToSvgAsync }
export type { MathSource, MathElementOptions, MathSvgOptions, MathLoadOptions }
