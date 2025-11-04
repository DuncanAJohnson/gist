import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSimulation } from '../lib/simulationService';

interface CreateSimulationProps {
  isOpen: boolean;
  onClose: () => void;
  onJSONExtracted?: (json: any) => void;
  existingJSON?: any;
  compact?: boolean;
}

function CreateSimulation({
  isOpen,
  onClose,
  onJSONExtracted,
  existingJSON,
  compact = false,
}: CreateSimulationProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJSON, setExtractedJSON] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [showJSONInput, setShowJSONInput] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const simulationAiUrl = (import.meta as any).env.VITE_SIMULATION_AI_URL;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setExtractedJSON(null);
      setProgress(0);
      setShowJSONInput(false);
      setJsonInput('');
      setJsonError(null);
    }
  }, [isOpen]);

  // Fake loading progress that takes ~60 seconds
  useEffect(() => {
    if (!isStreaming) {
      setProgress(0);
      return;
    }

    const duration = 60000; // 60 seconds in milliseconds
    const startTime = Date.now();
    const updateInterval = 50; // Update every 50ms for smooth animation

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        setProgress((prev) => Math.max(prev, 95)); // Don't override if already at 100%
        clearInterval(interval);
        return;
      }

      // Non-linear easing function for more realistic progress
      // Starts fast, slows in middle, speeds up near end
      const t = elapsed / duration;
      // Using quadratic ease-in for faster start, cubic ease-out
      const easedProgress = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      setProgress((prev) => {
        // Don't update if already at 100% (set by API completion)
        if (prev >= 100) return prev;
        return Math.min(95, easedProgress * 100); // Cap at 95% until actual completion
      });
    }, updateInterval);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Extract JSON from text
  const extractJSON = (text: string): any | null => {
    try {
      // Find JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate it has required fields for a simulation
        if (parsed.title && parsed.objects) {
          return parsed;
        }
      }
    } catch (e) {
      // Not valid JSON or doesn't match schema
    }
    return null;
  };

  // Handle creating from JSON paste
  const handleCreateFromJSON = async () => {
    if (!jsonInput.trim()) return;

    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonInput.trim());
      
      // Validate it has required fields for a simulation
      if (!parsed.title || !parsed.objects) {
        setJsonError('JSON must have "title" and "objects" fields');
        return;
      }

      // Create simulation (not from AI)
      const simulationId = await createSimulation(parsed, false, null);
      
      if (onJSONExtracted) {
        onJSONExtracted(parsed);
      }
      
      onClose();
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      setJsonError(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle generating simulation with AI
  const handleGenerate = async () => {
    if (!input.trim() || isStreaming) return;

    const userInput = input.trim();
    const messages = existingJSON
      ? [
          {
            role: 'user' as const,
            content: `I want to edit this simulation. Current JSON: ${JSON.stringify(existingJSON, null, 2)}`,
          },
          {
            role: 'user' as const,
            content: userInput,
          },
        ]
      : [
          {
            role: 'user' as const,
            content: userInput,
          },
        ];

    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch(simulationAiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          model: 'gpt-5-mini',
          max_tokens: 100000,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.type === 'success') {
        const assistantContent = data.content;
        
        // Check if we have JSON in the response
        const json = extractJSON(assistantContent);
        if (json) {
          setExtractedJSON(json);
          if (onJSONExtracted) {
            onJSONExtracted(json);
          }
        }
      } else if (data.type === 'error') {
        console.error('API error:', data.error);
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error calling chat API:', error);
      alert(`Sorry, there was an error communicating with the AI: ${error}`);
    } finally {
      setProgress(100);
      // Small delay to show 100% before hiding
      setTimeout(() => {
        setIsStreaming(false);
      }, 300);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Early return checks after all hooks are called
  if (!simulationAiUrl) {
    console.error('Missing env.VITE_SIMULATION_AI_URL');
    return null;
  }

  // For compact mode, don't show modal wrapper - just return content
  // For non-compact mode, early return if not open
  if (!compact && !isOpen) return null;

  if (compact) {
    // Compact version for popup
    return (
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-[400px] max-w-[500px]">
        {extractedJSON && (
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
            ✓ JSON simulation detected!
          </div>
        )}
        {isStreaming && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-800">Generating simulation...</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div className="h-full w-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse"></div>
              </div>
            </div>
          </div>
        )}
        <div className="mb-3">
          {showJSONInput && (
            <div className="mt-2">
              <textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  setJsonError(null);
                }}
                placeholder="Paste JSON simulation configuration here..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-mono"
                rows={8}
              />
              {jsonError && (
                <div className="mt-2 text-sm text-red-600">{jsonError}</div>
              )}
              <button
                onClick={handleCreateFromJSON}
                disabled={!jsonInput.trim()}
                className="mt-2 px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Create Simulation
              </button>
            </div>
          )}
        </div>
        {!showJSONInput && (
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={existingJSON ? "Describe your edits..." : "Describe your simulation..."}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              rows={3}
              disabled={isStreaming}
            />
            <button
              onClick={handleGenerate}
              disabled={!input.trim() || isStreaming}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Generate
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full version for modal/page
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl" style={{ height: 'calc(90vh - 100px)' }}>
        <div className="bg-primary text-white px-6 py-4 flex justify-between items-center rounded-t-xl">
          <div>
            <h2 className="text-2xl font-semibold">Create New Simulation</h2>
            <p className="text-sm opacity-90">Describe the physics simulation you would like to create</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJSONInput(!showJSONInput)}
              className="text-sm text-white hover:text-gray-200 underline"
            >
              {showJSONInput ? 'Use AI instead' : 'Create from JSON'}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-80px)] flex flex-col">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {!existingJSON && (
              <div className="text-center text-gray-500 mt-12">
                <h2 className="text-xl font-semibold mb-2">Create a Simulation</h2>
                <p className="text-gray-600">
                  Describe the physics simulation you'd like to create.
                </p>
                <div className="mt-6 text-left max-w-md mx-auto bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold mb-2">Example prompts:</p>
                  <ul className="text-sm space-y-1 text-gray-700">
                    <li>• "Launch a rocket into space"</li>
                    <li>• "Have a pumpkin roll down a hill"</li>
                    <li>• "Show a collision between two objects"</li>
                  </ul>
                </div>
              </div>
            )}
            {isStreaming && (
              <div className="text-center mt-8 max-w-md mx-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-base font-medium text-blue-800">Generating simulation...</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out relative"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="h-full w-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons (when JSON is detected) */}
          {extractedJSON && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <div className="text-sm text-green-700 mb-2">✓ JSON simulation detected!</div>
            </div>
          )}

          {/* Input Area */}
          <div className="px-6 py-4 border-t border-gray-200">
            {showJSONInput ? (
              <div>
                <textarea
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value);
                    setJsonError(null);
                  }}
                  placeholder="Paste JSON simulation configuration here..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
                  rows={10}
                />
                {jsonError && (
                  <div className="mt-2 text-sm text-red-600">{jsonError}</div>
                )}
                <button
                  onClick={handleCreateFromJSON}
                  disabled={!jsonInput.trim()}
                  className="mt-3 px-6 py-3 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Create Simulation
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={existingJSON ? "Describe your edits..." : "Describe your simulation..."}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={3}
                  disabled={isStreaming}
                />
                <button
                  onClick={handleGenerate}
                  disabled={!input.trim() || isStreaming}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Generate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateSimulation;
