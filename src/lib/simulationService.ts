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
}

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

/**
 * Fetches all simulations from the database, sorted by creation date (newest first)
 * @returns Array of simulation list items with id, title, description, and created_at
 */
export async function getAllSimulations(): Promise<SimulationListItem[]> {
  const { data, error } = await supabase
    .from('simulations')
    .select('id, title, description, created_at, parent_id, changes_made')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch simulations: ${error.message}`);
  }

  return data || [];
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

