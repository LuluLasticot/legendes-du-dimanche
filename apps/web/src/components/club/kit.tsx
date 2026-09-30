import { kitNode, shirtNode, type CrestSpec, type KitSpec } from '@legendes/data';
import { useMemo } from 'react';
import { SvgTree } from './svg-tree';

/** A shirt (`full` adds the shorts and socks) drawn from a kit spec. Decorative. */
export function Kit({
  kit,
  uid,
  crest,
  sponsor,
  full = false,
  className,
}: {
  kit: KitSpec;
  /** Unique on the page: club id + kit name. */
  uid: string;
  crest?: CrestSpec;
  sponsor?: string;
  full?: boolean;
  className?: string;
}) {
  const node = useMemo(
    () => (full ? kitNode(kit, { uid, crest, sponsor }) : shirtNode(kit, { uid, crest, sponsor })),
    [full, kit, uid, crest, sponsor],
  );
  return (
    <svg
      viewBox={full ? '0 0 120 178' : '0 0 120 100'}
      className={className}
      aria-hidden
      focusable="false"
    >
      {node.children.map((child, i) => (
        <SvgTree key={i} node={child} />
      ))}
    </svg>
  );
}
