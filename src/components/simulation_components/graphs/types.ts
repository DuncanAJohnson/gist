import type { GraphConfig, LineGraphConfig, LineConfig, DataPoint } from '../../../schemas/simulation';

export type { GraphConfig, LineGraphConfig, LineConfig, DataPoint };

export interface OverlayPoint {
  time: number;
  value: number;
}

export interface GraphRenderProps<T extends GraphConfig = GraphConfig> {
  config: T;
  data: DataPoint[];
  compact?: boolean;
  maxDuration?: number | null;
  overlayData?: OverlayPoint[];
  overlayColor?: string;
}
