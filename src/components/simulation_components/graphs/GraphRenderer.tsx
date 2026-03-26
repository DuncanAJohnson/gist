import { getGraphComponent } from './registry';
import type { GraphConfig, DataPoint, OverlayPoint } from './types';

// Ensure all variants are registered
import './variants';

interface Props {
  config: GraphConfig;
  data: DataPoint[];
  compact?: boolean;
  maxDuration?: number | null;
  overlayData?: OverlayPoint[];
  overlayColor?: string;
}

function GraphRenderer({ config, data, compact = false, maxDuration, overlayData, overlayColor }: Props) {
  const Component = getGraphComponent(config.type ?? 'line');

  if (!Component) {
    console.warn(`Unknown graph type: ${config.type}`);
    return null;
  }

  return <Component config={config} data={data} compact={compact} maxDuration={maxDuration} overlayData={overlayData} overlayColor={overlayColor} />;
}

export default GraphRenderer;


