import { useState, useMemo } from 'react';
import type { GraphConfig, LineConfig, DataPoint } from '../../schemas/simulation';

interface DataDownloadProps {
  graphs: GraphConfig[];
  graphData: DataPoint[][];
}

interface LineInfo {
  label: string;
  property: string;
  graphIndex: number;
}

function DataDownload({ graphs, graphData }: DataDownloadProps) {
  // Extract unique objects being tracked by graphs
  const objectsWithLines = useMemo(() => {
    const objectMap = new Map<string, LineInfo[]>();
    
    graphs.forEach((graph, graphIndex) => {
      if (graph.type === 'line' && graph.lines) {
        graph.lines.forEach((line: LineConfig) => {
          const existing = objectMap.get(line.targetObj) || [];
          existing.push({
            label: line.label,
            property: line.property,
            graphIndex,
          });
          objectMap.set(line.targetObj, existing);
        });
      }
    });
    
    return objectMap;
  }, [graphs]);

  const objects = useMemo(() => Array.from(objectsWithLines.keys()), [objectsWithLines]);
  
  const [selectedObject, setSelectedObject] = useState<string>(objects[0] || '');
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Get lines for the selected object
  const linesForObject = useMemo(() => {
    return objectsWithLines.get(selectedObject) || [];
  }, [objectsWithLines, selectedObject]);

  // Handle object selection change
  const handleObjectChange = (obj: string) => {
    setSelectedObject(obj);
    setSelectedLines(new Set()); // Clear selections when object changes
  };

  // Toggle a line selection
  const toggleLine = (label: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Generate and download CSV
  const handleDownload = () => {
    if (selectedLines.size === 0) {
      alert('Please select at least one data line to export.');
      return;
    }

    // Find which graph indices contain the selected lines
    const selectedLineInfos = linesForObject.filter((line) => selectedLines.has(line.label));
    
    // Build a map of time -> merged data point
    const timeMap = new Map<number, Record<string, number>>();
    
    selectedLineInfos.forEach((lineInfo) => {
      const data = graphData[lineInfo.graphIndex] || [];
      data.forEach((point) => {
        const existing = timeMap.get(point.time) || { time: point.time };
        if (point[lineInfo.label] !== undefined) {
          existing[lineInfo.label] = point[lineInfo.label];
        }
        timeMap.set(point.time, existing);
      });
    });

    // Sort by time and build CSV
    const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b);
    const selectedLabels = Array.from(selectedLines);
    
    // Header row
    const header = ['time', ...selectedLabels].join(',');
    
    // Data rows
    const rows = sortedTimes.map((time) => {
      const point = timeMap.get(time)!;
      const values = [time.toFixed(4), ...selectedLabels.map((label) => 
        point[label] !== undefined ? point[label].toFixed(6) : ''
      )];
      return values.join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedObject}_data.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Don't render if no objects are being tracked
  if (objects.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">      
      {/* Object Selector */}
      <div>
        <label className="block text-sm mb-1 text-gray-600">Object</label>
        <select
          value={selectedObject}
          onChange={(e) => handleObjectChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer"
        >
          {objects.map((obj) => (
            <option key={obj} value={obj}>
              {obj}
            </option>
          ))}
        </select>
      </div>

      {/* Line Selector (Multi-select Dropdown) */}
      <div className="relative">
        <label className="block text-sm mb-1 text-gray-600">Data Lines</label>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full px-3 py-2 text-sm text-left border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer flex justify-between items-center"
        >
          <span className="truncate text-gray-600">
            {selectedLines.size === 0
              ? 'Select lines...'
              : `${selectedLines.size} selected`}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isDropdownOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {linesForObject.map((line) => (
              <label
                key={line.label}
                className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedLines.has(line.label)}
                  onChange={() => toggleLine(line.label)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                />
                <span className="ml-2 text-sm text-gray-700">{line.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Download Button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={selectedLines.size === 0}
        className="w-full px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Download CSV
      </button>
    </div>
  );
}

export default DataDownload;
