import { useState, useEffect } from 'react';

interface AISimulationChatProps {
  onJSONExtracted?: (json: any) => void;
  existingJSON?: any;
  onClose?: () => void;
  compact?: boolean;
}

function AISimulationChat({
  onJSONExtracted,
  existingJSON,
  compact = false,
}: AISimulationChatProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJSON, setExtractedJSON] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const simulationAiUrl = (import.meta as any).env.VITE_SIMULATION_AI_URL;

  if (!simulationAiUrl) {
    console.error('Missing env.VITE_SIMULATION_AI_URL');
    return;
  }

  // Fake loading progress that takes ~40 seconds
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

  // Handle generating simulation
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
      </div>
    );
  }

  // Full version for modal/page
  return (
    <div className="flex flex-col h-full">
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
      </div>
    </div>
  );
}

export default AISimulationChat;

