import { getGraphComponent } from './registry';
import type { GraphConfig, DataPoint } from './types';

// Ensure all variants are registered
import './variants';

interface Props {
  config: GraphConfig;
  data: DataPoint[];
  compact?: boolean;
  maxDuration?: number | null;
}

function GraphRenderer({ config, data, compact = false, maxDuration }: Props) {
  const Component = getGraphComponent(config.type ?? 'line');

  if (!Component) {
    console.warn(`Unknown graph type: ${config.type}`);
    return null;
  }

  return <Component config={config} data={data} compact={compact} maxDuration={maxDuration} />;
}

export default GraphRenderer;


