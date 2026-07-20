import type { ObjectConfig, ExpandedObjectConfig } from '../../../schemas/simulation';
// SI-side variant: vector fields guaranteed cartesian (polar authoring is
// normalized away at the config→SI boundary in scaleObjectToSI).
import type { SIObjectConfig } from '../../../lib/unitConversion';

export type { ObjectConfig, ExpandedObjectConfig, SIObjectConfig };
