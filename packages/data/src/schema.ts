// The world's data model (GDD §4): a league holds districts; divisions exist at national, league
// or district scope; a club plays its first team in one division. Plain, serialisable, validated
// with Zod at every boundary (CSV import, database, network).

import { z } from 'zod';
import { COMPETITION_LEVELS, DISTRICT_MAX_RANK, REGIONAL_MAX_RANK } from '@legendes/shared';

/** Stable, URL-safe identifier: lowercase letters, digits and dashes. */
export const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase-dashed identifier');

export const leagueSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Administrative region the league covers. */
  region: z.string().min(1),
});
export type League = z.infer<typeof leagueSchema>;

export const districtSchema = z.object({
  id: idSchema,
  leagueId: idSchema,
  name: z.string().min(1),
  /** Departments covered, e.g. ['59'] (a district can straddle two). */
  departments: z.array(z.string().regex(/^\d{2,3}$/)).min(1),
});
export type District = z.infer<typeof districtSchema>;

export const DIVISION_SCOPES = ['national', 'league', 'district'] as const;
export type DivisionScope = (typeof DIVISION_SCOPES)[number];

export const divisionSchema = z
  .object({
    id: idSchema,
    scope: z.enum(DIVISION_SCOPES),
    level: z.enum(COMPETITION_LEVELS),
    /** N2 = 2, R1 = 1, D5 = 5… (see `divisionCode`). */
    rank: z.number().int().min(1).max(DISTRICT_MAX_RANK),
    /** Display name, e.g. "Régional 1 Hauts-de-France". */
    name: z.string().min(1),
    leagueId: idSchema.nullable(),
    districtId: idSchema.nullable(),
    /** Pool / group letter for divisions split in groups (N2 groupe C). */
    pool: z.string().nullable(),
  })
  .refine((d) => (d.level === 'regional' ? d.rank <= REGIONAL_MAX_RANK : true), {
    message: 'regional rank out of range',
  })
  .refine((d) => (d.scope === 'district') === (d.districtId !== null), {
    message: 'district divisions (and only them) carry a district',
  });
export type Division = z.infer<typeof divisionSchema>;

export const SURFACES = ['grass', 'artificial', 'stabilized'] as const;
export type Surface = (typeof SURFACES)[number];

export const SHIRT_PATTERNS = ['plain', 'stripes', 'hoops', 'sash', 'checks'] as const;
export type ShirtPattern = (typeof SHIRT_PATTERNS)[number];

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/, '#rrggbb');

export const stadiumSchema = z.object({
  name: z.string().min(1),
  surface: z.enum(SURFACES),
});
export type Stadium = z.infer<typeof stadiumSchema>;

export const clubSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Short name for scoreboards and cards (falls back to the name). */
  shortName: z.string().min(1).max(24),
  city: z.string().min(1),
  /** INSEE code of the commune. */
  insee: z.string().regex(/^\d[0-9AB]\d{3}$/),
  districtId: idSchema,
  /** Division of the first team this season. */
  divisionId: idSchema,
  colours: z.object({
    primary: hexColour,
    secondary: hexColour,
    tertiary: hexColour.nullable(),
  }),
  /** Where the colours come from: a known kit, or a plausible guess to correct. */
  coloursSource: z.enum(['known', 'guess']),
  pattern: z.enum(SHIRT_PATTERNS),
  stadium: stadiumSchema,
  founded: z.number().int().min(1850).max(2026).nullable(),
  /** Checked by a person against a public source (else the row is a first compilation). */
  verified: z.boolean(),
});
export type Club = z.infer<typeof clubSchema>;

export const SEASON = '2026-27';
