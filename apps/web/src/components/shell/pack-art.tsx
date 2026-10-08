import type { PackType } from '@legendes/data';
import { packNode } from '@legendes/ui/card';
import { getTranslations } from 'next-intl/server';
import { SvgTree } from '@/components/club/svg-tree';

/** The front of a closed pack, flat (the 3D one is in the opening scene). */
export async function PackArt({
  type,
  uid,
  className,
}: {
  type: PackType;
  uid: string;
  className?: string;
}) {
  const tp = await getTranslations('packs');
  const node = packNode(
    type,
    {
      title: tp(`types.${type}.name`),
      contents: tp(`types.${type}.contents`),
      tearHere: tp('print.tearHere'),
      odds: tp('print.odds'),
      legal: tp('print.legal'),
    },
    uid,
  );
  return (
    <svg
      viewBox={String(node.attrs['viewBox'])}
      className={className}
      role="img"
      aria-label={tp(`types.${type}.name`)}
    >
      {node.children.map((child, i) => (
        <SvgTree key={i} node={child} />
      ))}
    </svg>
  );
}
