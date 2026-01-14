import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { registerGraph } from '../registry';
import type { LineGraphConfig, GraphRenderProps } from '../types';

function LineGraph({ config, data, compact = false }: GraphRenderProps<LineGraphConfig>) {
  const { title, yAxisRange, yAxisLabel, lines } = config;

  // Calculate actual y-axis domain (extend beyond initial range if needed)
  const yDomain = useMemo(() => {
    if (!data || data.length === 0) {
      return [yAxisRange.min, yAxisRange.max];
    }

    let minValue = yAxisRange.min;
    let maxValue = yAxisRange.max;

    // Check all line values to see if we need to extend the range
    data.forEach((point) => {
      lines.forEach((line) => {
        const value = point[line.label];
        if (value !== undefined) {
          if (value < minValue) minValue = value;
          if (value > maxValue) maxValue = value;
        }
      });
    });

    // Add some padding if we extended
    if (minValue < yAxisRange.min || maxValue > yAxisRange.max) {
      const padding = (maxValue - minValue) * 0.1;
      return [minValue - padding, maxValue + padding];
    }

    return [yAxisRange.min, yAxisRange.max];
  }, [data, yAxisRange, lines]);

  // Calculate x-axis domain (always show at least 0-5s, compress as needed)
  const xDomain = useMemo(() => {
    if (!data || data.length === 0) {
      return [0, 5];
    }

    const maxTime = data[data.length - 1].time;
    return [0, Math.max(5, maxTime)];
  }, [data]);

  return (
    <div className={`bg-white rounded-lg shadow-md ${compact ? 'p-2 min-w-[280px]' : 'p-4 min-w-[400px]'}`}>
      {title && <h3 className={`m-0 text-gray-800 font-semibold text-center ${compact ? 'mb-2 text-sm' : 'mb-4 text-base'}`}>{title}</h3>}
      <ResponsiveContainer width="100%" height={compact ? 250 : 400}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            domain={xDomain}
            type="number"
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <YAxis
            domain={yDomain}
            label={{ value: yAxisLabel || 'Value', angle: -90, position: 'insideLeft' }}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <Tooltip
            formatter={(value: number) => (typeof value === 'number' ? value.toFixed(2) : value)}
            labelFormatter={(label: number) => `Time: ${label.toFixed(2)}s`}
            contentStyle={{ paddingTop: '10px' }}
          />
          <Legend height={5}/>
          {lines.map((line, index) => (
            <Line
              key={index}
              type="monotone"
              dataKey={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

registerGraph('line', LineGraph);

export default LineGraph;


