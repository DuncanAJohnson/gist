import { supabase } from './supabase';

export interface SimulationRecord {
  id: number;
  created_at: string;
  json: any;
  from_AI: boolean;
  parent_id: number | null;
  title: string | null;
  description: string | null;
}

export interface SimulationListItem {
  id: number;
  title: string | null;
  description: string | null;
  created_at: string;
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
    .select('id, title, description, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch simulations: ${error.message}`);
  }

  return data || [];
}

