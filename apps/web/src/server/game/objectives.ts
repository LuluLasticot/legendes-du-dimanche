// Objectives (spec §7): definitions in data, progress per player, rewards paid by the database.

import { gameErrorFrom } from './errors.ts';
import type { GameDb } from './wallet.ts';

export interface ObjectiveState {
  readonly id: string;
  readonly done: boolean;
  readonly reward: { readonly pack: string } | { readonly credits: number };
}

/** A chain of objectives in order, with what the player has done. */
export async function listObjectives(
  db: GameDb,
  userId: string,
  chain = 'foundations',
): Promise<ObjectiveState[]> {
  const [defs, done] = await Promise.all([
    db
      .from('objective_defs')
      .select('id, reward_pack, reward_credits')
      .eq('chain', chain)
      .order('position'),
    db.from('user_objectives').select('objective_id').eq('user_id', userId),
  ]);
  if (defs.error) throw gameErrorFrom(defs.error);
  if (done.error) throw gameErrorFrom(done.error);
  const ids = new Set(done.data.map((d) => d.objective_id));
  return defs.data.map((d) => ({
    id: d.id,
    done: ids.has(d.id),
    reward: d.reward_pack ? { pack: d.reward_pack } : { credits: d.reward_credits ?? 0 },
  }));
}

/** Counts an action for the objectives (idempotent: each objective pays once). */
export async function advanceObjective(
  db: GameDb,
  userId: string,
  condition: 'match_played' | 'squad_saved' | 'pack_opened',
): Promise<number> {
  const { data, error } = await db.rpc('advance_objective', {
    p_user: userId,
    p_condition: condition,
  });
  if (error) throw gameErrorFrom(error);
  return data ?? 0;
}
