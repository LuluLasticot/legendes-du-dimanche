// Pitch markings (IFAB Law 1) as geometry in pitch coordinates: x along the length (goal lines
// at ±length/2), z across (touchlines at ±width/2). Pure data, drawn into the pitch texture.

export type Marking =
  | {
      readonly kind: 'line';
      readonly a: readonly [number, number];
      readonly b: readonly [number, number];
    }
  | {
      readonly kind: 'arc';
      readonly centre: readonly [number, number];
      readonly radius: number;
      /** Angles in radians, measured from +x towards +z. */
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: 'spot'; readonly at: readonly [number, number]; readonly radius: number };

export const MARKING = {
  lineWidth: 0.12,
  centreCircleRadius: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaHalfWidth: 20.16,
  goalAreaDepth: 5.5,
  goalAreaHalfWidth: 9.16,
  penaltySpot: 11,
  penaltyArcRadius: 9.15,
  cornerArcRadius: 1,
  spotRadius: 0.11,
} as const;

export function pitchMarkings(length: number, width: number): Marking[] {
  const hx = length / 2;
  const hz = width / 2;
  const m = MARKING;
  const out: Marking[] = [];
  const line = (ax: number, az: number, bx: number, bz: number): void => {
    out.push({ kind: 'line', a: [ax, az], b: [bx, bz] });
  };

  // Boundary and halfway line.
  line(-hx, -hz, hx, -hz);
  line(-hx, hz, hx, hz);
  line(-hx, -hz, -hx, hz);
  line(hx, -hz, hx, hz);
  line(0, -hz, 0, hz);
  out.push({
    kind: 'arc',
    centre: [0, 0],
    radius: m.centreCircleRadius,
    start: 0,
    end: 2 * Math.PI,
  });
  out.push({ kind: 'spot', at: [0, 0], radius: m.spotRadius * 1.5 });

  for (const side of [-1, 1] as const) {
    const gx = side * hx;
    const inward = -side;
    // Penalty area and goal area.
    for (const [depth, half] of [
      [m.penaltyAreaDepth, m.penaltyAreaHalfWidth],
      [m.goalAreaDepth, m.goalAreaHalfWidth],
    ] as const) {
      const x = gx + inward * depth;
      line(gx, -half, x, -half);
      line(x, -half, x, half);
      line(x, half, gx, half);
    }
    // Penalty spot and the arc outside the penalty area.
    const spotX = gx + inward * m.penaltySpot;
    out.push({ kind: 'spot', at: [spotX, 0], radius: m.spotRadius });
    const open = Math.acos((m.penaltyAreaDepth - m.penaltySpot) / m.penaltyArcRadius);
    const facing = inward > 0 ? 0 : Math.PI;
    out.push({
      kind: 'arc',
      centre: [spotX, 0],
      radius: m.penaltyArcRadius,
      start: facing - open,
      end: facing + open,
    });
    // Corner arcs.
    for (const cz of [-1, 1] as const) {
      const centreAngle = Math.atan2(-cz, inward);
      out.push({
        kind: 'arc',
        centre: [gx, cz * hz],
        radius: m.cornerArcRadius,
        start: centreAngle - Math.PI / 4,
        end: centreAngle + Math.PI / 4,
      });
    }
  }
  return out;
}
