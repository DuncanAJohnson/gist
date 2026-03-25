import { useEffect, useRef } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../BaseSimulation';
import type { ExperimentalDataConfig } from './ExperimentalDataModal';
import type { UnitConverter } from '../../lib/unitConversion';

interface ExperimentalDataRendererProps {
  config: ExperimentalDataConfig;
  simulationTime: number;
  unitConverter: UnitConverter;
  canvasContainer: HTMLDivElement | null;
}

function interpolate(
  data: ExperimentalDataConfig['data'],
  time: number,
  key: 'x' | 'y'
): number | null {
  if (data.length === 0) return null;

  // Before first data point
  if (time <= data[0].time) {
    return data[0][key] ?? null;
  }
  // After last data point
  if (time >= data[data.length - 1].time) {
    return data[data.length - 1][key] ?? null;
  }

  // Find surrounding data points
  for (let i = 0; i < data.length - 1; i++) {
    if (time >= data[i].time && time <= data[i + 1].time) {
      const v0 = data[i][key];
      const v1 = data[i + 1][key];
      if (v0 === undefined || v1 === undefined) return null;
      const t = (time - data[i].time) / (data[i + 1].time - data[i].time);
      return v0 + t * (v1 - v0);
    }
  }

  return null;
}

function ExperimentalDataRenderer({
  config,
  simulationTime,
  unitConverter,
  canvasContainer,
}: ExperimentalDataRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Create and attach overlay canvas
  useEffect(() => {
    if (!canvasContainer) return;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10';

    // The container needs relative positioning for the overlay
    canvasContainer.style.position = 'relative';
    canvasContainer.appendChild(canvas);
    canvasRef.current = canvas;

    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, [canvasContainer]);

  // Draw on every render (driven by simulationTime changes)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !config.origin) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Get interpolated position in data units (relative to origin)
    const dataX = config.hasX ? interpolate(config.data, simulationTime, 'x') : null;
    const dataY = config.hasY ? interpolate(config.data, simulationTime, 'y') : null;

    // Subtract the initial data value so movement is relative to the picked origin
    const initialX = config.hasX ? (config.data[0]?.x ?? 0) : 0;
    const initialY = config.hasY ? (config.data[0]?.y ?? 0) : 0;

    // Convert data position to real-world simulation units
    // Origin is the picked position in real-world units
    let realX = config.origin.x;
    let realY = config.origin.y;

    if (dataX !== null) {
      const sign = config.positiveX === 'right' ? 1 : -1;
      realX += sign * (dataX - initialX);
    }
    if (dataY !== null) {
      const sign = config.positiveY === 'up' ? 1 : -1;
      realY += sign * (dataY - initialY);
    }

    // Convert to canvas pixels
    const canvasX = unitConverter.toPixelsX(realX);
    const canvasY = unitConverter.toPixelsY(realY);

    const SIZE = 12; // half-size in pixels

    ctx.globalAlpha = config.opacity;
    ctx.fillStyle = config.color;

    if (config.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, SIZE, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(canvasX - SIZE, canvasY - SIZE, SIZE * 2, SIZE * 2);
    }

    // Draw a subtle border
    ctx.globalAlpha = Math.min(config.opacity + 0.2, 1);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1.5;
    if (config.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, SIZE, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(canvasX - SIZE, canvasY - SIZE, SIZE * 2, SIZE * 2);
    }

    ctx.globalAlpha = 1;
  }, [simulationTime, config, unitConverter]);

  return null;
}

export default ExperimentalDataRenderer;
