import { useState } from 'react';

interface JsonEditorProps {
  initialJSON: any;
  onSave: (json: any) => void;
  onClose: () => void;
}

function JsonEditor({ initialJSON, onSave, onClose }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => {
    return JSON.stringify(initialJSON, null, 2);
  });
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      // Validate it has required fields
      if (!parsed.title || !parsed.objects) {
        setError('Invalid JSON: Missing required fields (title, objects)');
        return;
      }
      setError(null);
      onSave(parsed);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity pointer-events-auto"
        onClick={onClose}
      />
      
      {/* Slide-out panel */}
      <div className="absolute left-0 top-0 bottom-0 w-[600px] bg-white shadow-2xl transform transition-transform pointer-events-auto">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-primary text-white px-6 py-4 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Tweak Simulation JSON</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-2xl leading-none"
            >
              x
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {error && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-200">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setError(null);
              }}
              className="flex-1 w-full p-4 font-mono text-sm border-0 resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JsonEditor;

