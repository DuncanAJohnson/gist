import type { GraphConfig, LineGraphConfig, LineConfig, DataPoint } from '../../../schemas/simulation';

export type { GraphConfig, LineGraphConfig, LineConfig, DataPoint };

export interface GraphRenderProps<T extends GraphConfig = GraphConfig> {
  config: T;
  data: DataPoint[];
}
