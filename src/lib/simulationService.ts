import { supabase } from './supabase';
import { DEFAULT_PROVIDER, getModelForProvider } from '../config/aiProviders';

export interface SimulationRecord {
  id: number;
  created_at: string;
  json: any;
  from_AI: boolean;
  parent_id: number | null;
  title: string | null;
  description: string | null;
  changes_made: string | null;
  user_prompt: string | null;
}

export interface SimulationListItem {
  id: number;
  title: string | null;
  description: string | null;
  created_at: string;
  published_at: string | null;
  parent_id: number | null;
  changes_made: string | null;
  published: boolean;
  endorsement_count: number;
  week_endorsement_count: number;
}

export type SortOption = 'recent' | 'endorsed';
export type WindowOption = 'week' | 'all';

/**
 * Creates a new simulation in the database
 * @param json - The simulation JSON configuration
 * @param fromAI - Whether this simulation was created by AI
 * @param parentId - The ID of the parent simulation (null for new simulations)
 * @param userPrompt - The natural-language prompt the user typed to generate
 *   this simulation (null when there is no prompt, e.g. manual JSON paste/tweak)
 * @returns The ID of the created simulation
 */
export async function createSimulation(
  json: any,
  fromAI: boolean,
  parentId: number | null,
  userPrompt: string | null
): Promise<number> {
  // Extract title and description from JSON
  const title = json.title || null;
  const description = json.description || null;

  const { data, error } = await supabase
    .from('simulations')
    .insert({
      json: json,
      from_AI: fromAI,
      parent_id: parentId,
      title: title,
      description: description,
      user_prompt: userPrompt,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create simulation: ${error.message}`);
  }

  return data.id;
}

/**
 * Fetches a simulation by ID from the database
 * @param id - The simulation ID
 * @returns The simulation JSON configuration
 */
export async function getSimulation(id: number): Promise<any> {
  const { data, error } = await supabase
    .from('simulations')
    .select('json')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch simulation: ${error.message}`);
  }

  return data.json;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fetches published simulations with both all-time and past-7-day endorsement
 * counts. Sort uses the count matching opts.window.
 */
export async function getPublishedSimulations(opts: {
  sort: SortOption;
  window: WindowOption;
}): Promise<SimulationListItem[]> {
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  let allTimeQuery = supabase
    .from('simulations')
    .select(
      'id, title, description, created_at, published_at, parent_id, changes_made, published, simulation_endorsements(count)'
    )
    .eq('published', true);
  let weekQuery = supabase
    .from('simulations')
    .select('id, simulation_endorsements(count)')
    .eq('published', true)
    .gte('simulation_endorsements.created_at', weekAgo);

  if (opts.window === 'week') {
    allTimeQuery = allTimeQuery.gte('published_at', weekAgo);
    weekQuery = weekQuery.gte('published_at', weekAgo);
  }

  const [allTimeRes, weekRes] = await Promise.all([allTimeQuery, weekQuery]);

  if (allTimeRes.error) {
    throw new Error(`Failed to fetch simulations: ${allTimeRes.error.message}`);
  }
  if (weekRes.error) {
    throw new Error(`Failed to fetch week counts: ${weekRes.error.message}`);
  }

  const weekCountById = new Map<number, number>();
  for (const row of weekRes.data || []) {
    weekCountById.set(row.id, (row as any).simulation_endorsements?.[0]?.count ?? 0);
  }

  const items: SimulationListItem[] = (allTimeRes.data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    published_at: row.published_at ?? null,
    parent_id: row.parent_id,
    changes_made: row.changes_made,
    published: !!row.published,
    endorsement_count: row.simulation_endorsements?.[0]?.count ?? 0,
    week_endorsement_count: weekCountById.get(row.id) ?? 0,
  }));

  const primaryCount = (s: SimulationListItem) =>
    opts.window === 'week' ? s.week_endorsement_count : s.endorsement_count;
  const altCount = (s: SimulationListItem) =>
    opts.window === 'week' ? s.endorsement_count : s.week_endorsement_count;

  if (opts.sort === 'recent') {
    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else {
    items.sort((a, b) => {
      const primaryDiff = primaryCount(b) - primaryCount(a);
      if (primaryDiff !== 0) return primaryDiff;
      const altDiff = altCount(b) - altCount(a);
      if (altDiff !== 0) return altDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return items;
}

/**
 * Convenience: top N published simulations by endorsement count in the past week.
 */
export async function getTopEndorsedThisWeek(limit = 3): Promise<SimulationListItem[]> {
  const items = await getPublishedSimulations({ sort: 'endorsed', window: 'week' });
  return items.slice(0, limit);
}

/**
 * Fetches metadata for a single simulation (published state, total endorsement count).
 */
export async function getSimulationMeta(
  id: number
): Promise<{ published: boolean; published_by: string | null; endorsement_count: number }> {
  const { data, error } = await supabase
    .from('simulations')
    .select('published, published_by, simulation_endorsements(count)')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch simulation meta: ${error.message}`);
  }

  return {
    published: !!data.published,
    published_by: data.published_by ?? null,
    endorsement_count: data.simulation_endorsements?.[0]?.count ?? 0,
  };
}

export async function publishSimulation(id: number, browserId: string): Promise<void> {
  const { error } = await supabase
    .from('simulations')
    .update({
      published: true,
      published_at: new Date().toISOString(),
      published_by: browserId,
    })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to publish simulation: ${error.message}`);
  }
}

export async function unpublishSimulation(id: number, browserId: string): Promise<void> {
  // Only update when published_by matches. Rows with NULL published_by (legacy
  // publishes) never match, so they can't be unpublished from the client.
  const { data, error } = await supabase
    .from('simulations')
    .update({ published: false, published_at: null, published_by: null })
    .eq('id', id)
    .eq('published_by', browserId)
    .select('id');
  if (error) {
    throw new Error(`Failed to unpublish simulation: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('Only the publisher can unpublish this simulation.');
  }
}

export async function endorseSimulation(
  simulationId: number,
  browserId: string
): Promise<void> {
  const { error } = await supabase
    .from('simulation_endorsements')
    .insert({ simulation_id: simulationId, browser_id: browserId });
  // 23505 = unique_violation; endorsement already exists, treat as success
  if (error && (error as any).code !== '23505') {
    throw new Error(`Failed to endorse simulation: ${error.message}`);
  }
}

export async function unendorseSimulation(
  simulationId: number,
  browserId: string
): Promise<void> {
  const { error } = await supabase
    .from('simulation_endorsements')
    .delete()
    .eq('simulation_id', simulationId)
    .eq('browser_id', browserId);
  if (error) {
    throw new Error(`Failed to unendorse simulation: ${error.message}`);
  }
}

export async function getEndorsedSimulationIds(browserId: string): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('simulation_endorsements')
    .select('simulation_id')
    .eq('browser_id', browserId);
  if (error) {
    throw new Error(`Failed to fetch endorsements: ${error.message}`);
  }
  return new Set((data || []).map((r: any) => r.simulation_id));
}

/**
 * Triggers a server-side update of the changes_made column for a simulation.
 * This is a fire-and-forget call that happens asynchronously on the server.
 * @param simulationId - The ID of the simulation to update
 */
export async function updateChangesMade(simulationId: number): Promise<void> {
  // Fire-and-forget: don't wait for the response or throw errors
  // This ensures the update happens server-side even if the user closes the tab
  const updateChangesMadeModalUrl = (import.meta as any).env.VITE_UPDATE_CHANGES_MADE_MODAL_URL;
  if (!updateChangesMadeModalUrl) {
    console.error('Missing env.VITE_UPDATE_CHANGES_MADE_MODAL_URL');
    return;
  }
  fetch(updateChangesMadeModalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      simulation_id: simulationId,
      provider: DEFAULT_PROVIDER,
      model: getModelForProvider(DEFAULT_PROVIDER),
    }),
  }).catch((error) => {
    // Silently fail - this is a background operation
    console.error('Failed to trigger changes_made update:', error);
  });
}

/**
 * Creates feedback for a simulation in the database
 * @param simulationId - The ID of the simulation to provide feedback for
 * @param feedback - The feedback text
 */
export async function createSimulationFeedback(
  simulationId: number,
  feedback: string
): Promise<void> {
  const { error } = await supabase
    .from('simulation_feedback')
    .insert({
      simulation_id: simulationId,
      feedback: feedback,
    });

  if (error) {
    throw new Error(`Failed to create feedback: ${error.message}`);
  }
}

