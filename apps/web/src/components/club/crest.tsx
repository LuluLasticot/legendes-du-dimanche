import { crestNode, crestOf, type Club, type CrestSpec } from '@legendes/data';
import { useMemo } from 'react';
import { SvgTree } from './svg-tree';

/** The generated crest of a club (or of a given spec, to try one out). Decorative by default. */
export function Crest({
  club,
  spec,
  className,
  title,
}: {
  club: Club;
  spec?: CrestSpec;
  className?: string;
  /** Accessible name; leave out when the club's name is written next to the crest. */
  title?: string;
}) {
  const node = useMemo(() => crestNode(spec ?? crestOf(club), club.id), [club, spec]);
  return (
    <svg
      viewBox="0 0 100 120"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {node.children.map((child, i) => (
        <SvgTree key={i} node={child} />
      ))}
    </svg>
  );
}
