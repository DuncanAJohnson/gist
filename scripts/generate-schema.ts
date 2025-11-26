/**
 * Script to generate JSON Schema from Zod schemas.
 * Run with: npm run generate:schema
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SimulationConfigSchema } from '../src/schemas/simulation.ts';
import * as zod from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate JSON Schema from Zod schema
// Using 'target: openApi3' for better compatibility
const jsonSchema = zod.toJSONSchema(SimulationConfigSchema, { target: "openapi-3.0" });

// Write to modal_functions directory
const outputPath = join(__dirname, '..', 'modal_functions', 'simulation_schema.json');
writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));

console.log(`✓ Generated JSON Schema at: ${outputPath}`);

