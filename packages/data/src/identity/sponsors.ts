// Fictional sponsors (rule 3 of CLAUDE.md, GDD §12): the local tradespeople an amateur club puts
// on its shirt, with the humour of the region. Never a real brand: the templates are generic
// trades and the list of exclusions below is checked by a test against every name generated.
// A surname or a town in a name can match a real business by chance; the game never claims otherwise.

import { Rng } from '@legendes/engine/rng';
import { foldText } from '../naming.ts';
import { SEASON, type Club } from '../schema.ts';
import { COMMON_SURNAMES } from '../squad/names.ts';
import { townLabel } from './crest.ts';

export interface Sponsor {
  /** As written on a board or a card: "Boulangerie Delattre". */
  readonly name: string;
  /** On the chest of a shirt, in capitals and short: "DELATTRE". */
  readonly label: string;
}

/** `{S}` becomes a surname of the region, `{C}` the town. Name first, then the chest label. */
const TEMPLATES: readonly (readonly [name: string, label: string])[] = [
  ['Friterie Chez Momo', 'CHEZ MOMO'],
  ['Garage du Centre', 'GARAGE DU CENTRE'],
  ['Café des Sports', 'CAFÉ DES SPORTS'],
  ['Le Ch’ti Kebab', 'CH’TI KEBAB'],
  ['Boulangerie {S}', 'BOULANGERIE {S}'],
  ['Boucherie {S}', 'BOUCHERIE {S}'],
  ['Plomberie {S} & Fils', '{S} & FILS'],
  ['Carrosserie {S}', 'CARROSSERIE {S}'],
  ['Menuiserie {S}', 'MENUISERIE {S}'],
  ['Électricité {S}', 'ÉLEC {S}'],
  ['Maçonnerie {S}', 'MAÇONNERIE {S}'],
  ['Couverture Zinguerie {S}', 'ZINGUERIE {S}'],
  ['Peinture et Décoration {S}', 'DÉCO {S}'],
  ['Transports {S}', 'TRANSPORTS {S}'],
  ['Taxi {S}', 'TAXI {S}'],
  ['Ambulances {S}', 'AMBULANCES {S}'],
  ['Matériaux {S}', 'MATÉRIAUX {S}'],
  ['Terrassement {S}', 'TERRASSEMENT {S}'],
  ['Traiteur {S}', 'TRAITEUR {S}'],
  ['Fromagerie {S}', 'FROMAGERIE {S}'],
  ['Ferme {S}', 'FERME {S}'],
  ['Estaminet Chez {S}', 'CHEZ {S}'],
  ['Brasserie du Beffroi', 'BRASSERIE DU BEFFROI'],
  ['Brasserie des Mineurs', 'BRASSERIE DES MINEURS'],
  ['Distillerie du Terril', 'DISTILLERIE DU TERRIL'],
  ['Maison de la Presse de {C}', 'MAISON DE LA PRESSE'],
  ['Tabac-Presse Le Balto', 'LE BALTO'],
  ['Bar-Tabac du Stade', 'BAR DU STADE'],
  ['Auto-École de {C}', 'AUTO-ÉCOLE {C}'],
  ['Pizzeria Chez Tony', 'CHEZ TONY'],
  ['Crêperie La Bolée', 'LA BOLÉE'],
  ['Frites et Fricadelles {S}', 'FRITES {S}'],
  ['Le Relais du Chemin Vert', 'LE RELAIS'],
  ['Coiffure Tif’Hair', 'TIF’HAIR'],
  ['Fleuriste Aux Quatre Saisons', 'QUATRE SAISONS'],
  ['Pharmacie du Marché', 'PHARMACIE DU MARCHÉ'],
  ['Optique du Centre', 'OPTIQUE DU CENTRE'],
  ['Agence Immobilière de {C}', 'IMMOBILIER {C}'],
  ['Location de Camionnettes {S}', 'LOCATION {S}'],
  ['Cuisines et Bains {S}', 'CUISINES {S}'],
  ['Ferronnerie d’Art {S}', 'FERRONNERIE {S}'],
  ['Chauffage Sanitaire {S}', 'CHAUFFAGE {S}'],
  ['Le Coin des Copains', 'LE COIN DES COPAINS'],
  ['Chez Nono, Bar de la Mairie', 'CHEZ NONO'],
  ['Boissons du Nord Chez {S}', 'BOISSONS {S}'],
  ['Pompes et Fontaines {S}', 'FONTAINES {S}'],
  ['Jardins de {C}', 'JARDINS {C}'],
  ['Entreprise {S} — Nettoyage', 'NETTOYAGE {S}'],
  ['Pressing du Centre', 'PRESSING DU CENTRE'],
  ['Cordonnerie {S}', 'CORDONNERIE {S}'],
  ['Épicerie du Coin', 'ÉPICERIE DU COIN'],
  ['Chez Maryse, Friterie', 'CHEZ MARYSE'],
  ['Salon de Toilettage Pattes de Velours', 'PATTES DE VELOURS'],
  ['Cave à Bières du Terroir', 'BIÈRES DU TERROIR'],
  ['Ets {S} — Chauffagiste', 'ETS {S}'],
];

/**
 * Real brands, chains and institutions of the region that must never appear on a shirt: the
 * words a generated sponsor may not contain (compared without accents or case). A test runs every
 * template of the game through this list.
 */
export const SPONSOR_EXCLUSIONS: readonly string[] = [
  'auchan',
  'leclerc',
  'carrefour',
  'intermarche',
  'lidl',
  'aldi',
  'cora',
  'colruyt',
  'casino',
  'monoprix',
  'decathlon',
  'leroy',
  'merlin',
  'castorama',
  'brico',
  'bricomarche',
  'kiabi',
  'norauto',
  'midas',
  'speedy',
  'renault',
  'peugeot',
  'citroen',
  'toyota',
  'volkswagen',
  'total',
  'orange',
  'sfr',
  'bouygues',
  'free',
  'edf',
  'engie',
  'veolia',
  'nike',
  'adidas',
  'puma',
  'kappa',
  'macron',
  'joma',
  'errea',
  'hummel',
  'umbro',
  'coca',
  'pepsi',
  'heineken',
  'jupiler',
  'leffe',
  'pelforth',
  'kronenbourg',
  'ricard',
  'mcdonald',
  'quick',
  'domino',
  'kfc',
  'burger king',
  'subway',
  'amazon',
  'ikea',
  'darty',
  'fnac',
  'boulanger',
  'credit agricole',
  'caisse d epargne',
  'banque populaire',
  'bnp',
  'societe generale',
  'lcl',
  'mma',
  'groupama',
  'maif',
  'macif',
  'axa',
  'allianz',
  'harmonie',
  'la voix du nord',
  'france travail',
  'pole emploi',
  'la poste',
  'sncf',
  'bonduelle',
  'roquette',
  'lesaffre',
  'point p',
  'gedimat',
  'point s',
  'euromaster',
  'feu vert',
];

const fillIn = (text: string, surname: string, city: string): string =>
  text.replaceAll('{S}', surname).replaceAll('{C}', city);

/** On a shirt everything is in capitals; `town` comes already short and in capitals. */
function upperLabel(label: string, surname: string, town: string): string {
  return fillIn(label, surname.toUpperCase(), town);
}

/** Does a sponsor name mention a real brand? (Whole words, accents and case ignored.) */
export function mentionsExcludedBrand(name: string): boolean {
  const words = ` ${foldText(name)} `;
  return SPONSOR_EXCLUSIONS.some((b) => words.includes(` ${foldText(b)} `));
}

/** Surnames of the region that are not also a brand ("Boulanger" is a surname and a chain). */
const SURNAMES = COMMON_SURNAMES.filter((name) => !mentionsExcludedBrand(name));

/**
 * The sponsors of a club: the first one is on the shirt, the following ones on the shorts and the
 * boards around the pitch. Distinct, and the same every time for a club and a season.
 */
export function sponsorsOf(club: Club, season: string = SEASON, count = 3): Sponsor[] {
  const rng = Rng.create(`sponsors:${club.id}:${season}`);
  const used = new Set<number>();
  const out: Sponsor[] = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const draw = rng.fork('draw', i);
    const index = draw.int(0, TEMPLATES.length - 1);
    if (used.has(index)) continue;
    used.add(index);
    const [name, label] = TEMPLATES[index] as (typeof TEMPLATES)[number];
    const surname = SURNAMES[draw.fork('surname').int(0, SURNAMES.length - 1)] as string;
    const city = club.city;
    out.push({
      name: fillIn(name, surname, city),
      label: upperLabel(label, surname, townLabel(city)),
    });
  }
  return out;
}

/** Every name the templates can produce with a given surname and town (for the exclusion test). */
export function allSponsorNames(surname = 'Delattre', city = 'Escaudain'): string[] {
  return TEMPLATES.map(([name]) => fillIn(name, surname, city));
}
