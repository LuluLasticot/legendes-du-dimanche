// Match conditions (GDD §7.3).

export const SURFACES = [
  'grass', // pelouse
  'artificial', // synthétique
  'muddy', // terrain gras
  'dirt', // stabilisé
] as const;
export type Surface = (typeof SURFACES)[number];

export const PRECIPITATION = ['none', 'rain'] as const;
export type Precipitation = (typeof PRECIPITATION)[number];

export const KIT_PATTERNS = [
  'plain', // uni
  'stripes', // rayé
  'hoops', // cerclé
  'sash', // écharpe (bande en diagonale)
  'checks', // damier
] as const;
export type KitPattern = (typeof KIT_PATTERNS)[number];
