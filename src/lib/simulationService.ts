import { supabase } from './supabase';

export interface SimulationRecord {
  id: number;
  created_at: string;
  json: any;
  from_AI: boolean;
  parent_id: number | null;
  title: string | null;
  description: string | null;
  changes_made: string | null;
}

export interface SimulationListItem {
  id: number;
  title: string | null;
  description: string | null;
  created_at: string;
  parent_id: number | null;
  changes_made: string | null;
  published: boolean;
  endorsement_count: number;
}

export type SortOption = 'recent' | 'endorsed';
export type WindowOption = 'week' | 'all';

/**
 * Creates a new simulation in the database
 * @param json - The simulation JSON configuration
 * @param fromAI - Whether this simulation was created by AI
 * @param parentId - The ID of the parent simulation (null for new simulations)
 * @returns The ID of the created simulation
 */
export async function createSimulation(
  json: any,
  fromAI: boolean,
  parentId: number | null
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

function mapRow(row: any): SimulationListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    parent_id: row.parent_id,
    changes_made: row.changes_made,
    published: !!row.published,
    endorsement_count: row.simulation_endorsements?.[0]?.count ?? 0,
  };
}

/**
 * Fetches published simulations with endorsement counts, sorted per opts.
 * When window='week', endorsement_count only reflects endorsements from the past 7 days.
 */
export async function getPublishedSimulations(opts: {
  sort: SortOption;
  window: WindowOption;
}): Promise<SimulationListItem[]> {
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  let query = supabase
    .from('simulations')
    .select(
      'id, title, description, created_at, parent_id, changes_made, published, simulation_endorsements(count)'
    )
    .eq('published', true);

  if (opts.window === 'week') {
    query = query.gte('simulation_endorsements.created_at', weekAgo);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch simulations: ${error.message}`);
  }

  const items = (data || []).map(mapRow);

  if (opts.sort === 'recent') {
    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else {
    items.sort((a, b) => {
      if (b.endorsement_count !== a.endorsement_count) {
        return b.endorsement_count - a.endorsement_count;
      }
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
): Promise<{ published: boolean; endorsement_count: number }> {
  const { data, error } = await supabase
    .from('simulations')
    .select('published, simulation_endorsements(count)')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch simulation meta: ${error.message}`);
  }

  return {
    published: !!data.published,
    endorsement_count: data.simulation_endorsements?.[0]?.count ?? 0,
  };
}

export async function publishSimulation(id: number): Promise<void> {
  const { error } = await supabase
    .from('simulations')
    .update({ published: true, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to publish simulation: ${error.message}`);
  }
}

export async function unpublishSimulation(id: number): Promise<void> {
  const { error } = await supabase
    .from('simulations')
    .update({ published: false, published_at: null })
    .eq('id', id);
  if (error) {
    throw new Error(`Failed to unpublish simulation: ${error.message}`);
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

