// A tiny SVG tree: the crest and the kit are built as data, then serialised to a string (image of
// share, 3D textures, tests) or rendered by React without `dangerouslySetInnerHTML`. Only what the
// generators need: elements with attributes, text, and nothing that comes from a user.

export interface SvgElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string | number>>;
  readonly children: readonly SvgNode[];
}
export type SvgNode = SvgElement | string;

export function el(
  tag: string,
  attrs: Readonly<Record<string, string | number>> = {},
  ...children: readonly (SvgNode | null | undefined | false)[]
): SvgElement {
  return {
    tag,
    attrs,
    children: children.filter((c): c is SvgNode => c !== null && c !== undefined && c !== false),
  };
}

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string): string => escapeText(text).replace(/"/g, '&quot;');

/** Numbers are printed with at most two decimals so two runs write the same bytes. */
export const num = (x: number): string => String(Math.round(x * 100) / 100);

export function toSvgString(node: SvgNode): string {
  if (typeof node === 'string') return escapeText(node);
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(typeof v === 'number' ? num(v) : v)}"`)
    .join('');
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(toSvgString).join('')}</${node.tag}>`;
}
