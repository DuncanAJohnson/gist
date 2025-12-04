import Panel from './Panel';
import { UNIT_ABBREV, type UnitType } from '../../lib/unitConversion';

interface ScaleProps {
  pixelsPerUnit: number;
  unit: UnitType;
}

function Scale({ pixelsPerUnit, unit }: ScaleProps) {
  const SCALE_WIDTH_PIXELS = 200;
  
  // Calculate the real-world measurement that 300 pixels represents
  const realWorldValue = SCALE_WIDTH_PIXELS / pixelsPerUnit;
  
  // Format the value nicely (remove trailing zeros, reasonable precision)
  const formatValue = (value: number): string => {
    if (value >= 100) {
      return value.toFixed(0);
    } else if (value >= 10) {
      return value.toFixed(1).replace(/\.0$/, '');
    } else if (value >= 1) {
      return value.toFixed(2).replace(/\.?0+$/, '');
    } else {
      return value.toPrecision(3).replace(/\.?0+$/, '');
    }
  };

  const unitLabel = UNIT_ABBREV[unit];
  const halfValue = formatValue(realWorldValue / 2);
  const fullValue = formatValue(realWorldValue);

  return (
    <Panel className="col-start-1 row-start-2 justify-self-end">
      <div className="flex flex-col items-center gap-1" style={{ width: SCALE_WIDTH_PIXELS }}>
        {/* Scale bar */}
        <div className="relative w-full h-6">
          {/* Main bar */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gray-800 rounded-full" />
          
          {/* End caps (big ticks) */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-800 rounded-full" />
          <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-800 rounded-full" />
          
          {/* Small tick marks */}
          <div className="absolute left-1/2 top-1/4 bottom-1/4 w-0.5 bg-gray-500" />
        </div>
        
        {/* Labels */}
        <div className="relative w-full text-xs font-medium text-gray-700">
          <span className="absolute left-0 -translate-x-1/2">0</span>
          <span className="absolute left-1/2 -translate-x-1/2">{halfValue} {unitLabel}</span>
          <span className="absolute right-0 translate-x-1/2">{fullValue} {unitLabel}</span>
        </div>
      </div>
    </Panel>
  );
}

export default Scale;

