interface OutputsProps {
  label: string;
  value: number | string;
  unit?: string;
}

function Outputs({ label, value, unit = '' }: OutputsProps) {
  const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
  
  return (
    <div className="flex-row justify-between items-center py-2 border-b border-gray-300 last:border-b-0">
      <span className="text-sm text-gray-700 font-medium">{label}:</span>
      <span className="text-sm text-primary font-semibold font-mono">
        {displayValue} {unit}
      </span>
    </div>
  );
}

export default Outputs;

