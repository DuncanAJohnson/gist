import type { OutputValueConfig, OutputGroupConfig } from '../../schemas/simulation';

interface OutputProps {
  config: OutputValueConfig;
  value: number | string | undefined;
}

function Output({ config, value }: OutputProps) {
  const { label, unit = '' } = config;
  const displayValue = typeof value === 'number' ? value.toFixed(2) : (value ?? '—');
  
  return (
    <div className="flex flex-row items-center justify-between py-2 px-3 rounded whitespace-nowrap">
      <span className="text-sm text-gray-700 font-medium">{label}: </span>
      <span className="text-sm text-primary font-semibold font-mono ml-2 inline-block text-right min-w-[120px]">
        {displayValue} {unit}
      </span>
    </div>
  );
}

interface OutputGroupProps {
  config: OutputGroupConfig;
  getValue: (targetObj: string, property: string) => number | string | undefined;
}

function OutputGroup({ config, getValue }: OutputGroupProps) {
  const { title, values } = config;

  return (
    <div className="flex flex-col gap-1">
      {title && (
        <h4 className="text-sm font-semibold text-gray-800 px-3 py-1">{title}</h4>
      )}
      {values.map((valueConfig, index) => (
        <Output
          key={`${valueConfig.targetObj}-${valueConfig.property}-${index}`}
          config={valueConfig}
          value={getValue(valueConfig.targetObj, valueConfig.property)}
        />
      ))}
    </div>
  );
}

export { Output, OutputGroup };
export default Output;
