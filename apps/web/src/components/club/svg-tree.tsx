import type { SvgNode } from '@legendes/data';
import { createElement, type ReactNode } from 'react';

/** `stroke-width` → `strokeWidth`; the few attributes React spells differently. */
const reactName = (name: string): string =>
  name === 'class' ? 'className' : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** "mix-blend-mode:overlay" → { mixBlendMode: 'overlay' }. */
function styleObject(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of style.split(';')) {
    const [name, value] = rule.split(':');
    if (name && value) out[reactName(name.trim())] = value.trim();
  }
  return out;
}

function toReact(node: SvgNode, key?: number): ReactNode {
  if (typeof node === 'string') return node;
  const props: Record<string, string | number | Record<string, string>> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === 'style' && typeof value === 'string') props['style'] = styleObject(value);
    else props[reactName(name)] = value;
  }
  if (key !== undefined) props['key'] = key;
  return createElement(node.tag, props, ...node.children.map((child, i) => toReact(child, i)));
}

/**
 * Renders a generated SVG tree (crest, kit) as React elements. The trees come from the pure
 * generators of `@legendes/data`, never from user input, and are built as elements, not markup.
 */
export function SvgTree({ node }: { node: SvgNode }) {
  return <>{toReact(node)}</>;
}
