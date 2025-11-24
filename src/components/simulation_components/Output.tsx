export interface OutputProps {
  label: string;
  value: number | string;
  unit?: string;
}

function Output({ label, value, unit = '' }: OutputProps) {
  const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
  
  return (
    <div className="flex flex-row items-center justify-between py-2 px-3 rounded whitespace-nowrap">
      <span className="text-sm text-gray-700 font-medium">{label}: </span>
      <span className="text-sm text-primary font-semibold font-mono ml-2 inline-block text-right min-w-[120px]">
        {displayValue} {unit}
      </span>
    </div>
  );
}

export default Output;

