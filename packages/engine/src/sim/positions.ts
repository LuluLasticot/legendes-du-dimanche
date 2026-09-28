// Player positions. Identifiers are English; French labels (G, DD, DC…) live in messages/fr.json.

export const POSITIONS = [
  'GK', // G — gardien
  'RB', // DD — défenseur droit
  'CB', // DC — défenseur central
  'LB', // DG — défenseur gauche
  'RWB', // DLD — latéral droit offensif
  'LWB', // DLG — latéral gauche offensif
  'CDM', // MDC — milieu défensif
  'CM', // MC — milieu central
  'RM', // MD — milieu droit
  'LM', // MG — milieu gauche
  'CAM', // MOC — milieu offensif
  'RW', // AD — ailier droit
  'LW', // AG — ailier gauche
  'CF', // AT — attaquant de soutien
  'ST', // BU — buteur
] as const;

export type Position = (typeof POSITIONS)[number];

export type PositionLine = 'goalkeeper' | 'defence' | 'midfield' | 'attack';

export const POSITION_LINE: Readonly<Record<Position, PositionLine>> = {
  GK: 'goalkeeper',
  RB: 'defence',
  CB: 'defence',
  LB: 'defence',
  RWB: 'defence',
  LWB: 'defence',
  CDM: 'midfield',
  CM: 'midfield',
  RM: 'midfield',
  LM: 'midfield',
  CAM: 'midfield',
  RW: 'attack',
  LW: 'attack',
  CF: 'attack',
  ST: 'attack',
};
