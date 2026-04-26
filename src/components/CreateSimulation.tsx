import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSimulation } from '../lib/simulationService';
import AiProviderSwitcher from './AiProviderSwitcher';
import {
  DEFAULT_PROVIDER,
  getModelForProvider,
  type AiProviderKind,
} from '../config/aiProviders';

interface CreateSimulationProps {
  isOpen: boolean;
  onClose: () => void;
  onJSONExtracted?: (json: any, userPrompt: string | null) => void;
  existingJSON?: any;
  compact?: boolean;
}

// Total number of pipeline stages emitted by the backend (skeleton + objects + 4
// parallel detail stages). Used to convert per-stage `done` events into a percentage.
// Keep in sync with `modal_functions/sim_pipeline/__init__.py:_build_stages`.
const TOTAL_STAGES = 6;

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
  const [stageLabel, setStageLabel] = useState<string>('');
  const [showJSONInput, setShowJSONInput] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProviderKind>(DEFAULT_PROVIDER);
  const simulationAiUrl = (import.meta as any).env.VITE_SIMULATION_AI_URL;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setExtractedJSON(null);
      setProgress(0);
      setStageLabel('');
      setShowJSONInput(false);
      setJsonInput('');
      setJsonError(null);
    }
  }, [isOpen]);

  // Extract JSON from text. Models sometimes wrap the config in prose or
  // markdown code fences, so we strip fences first, then scan for the first
  // balanced `{...}` block that parses into an object with `title` + `objects`.
  const extractJSON = (text: string): any | null => {
    const fenceStripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1');
    const candidates: string[] = [];

    for (let i = 0; i < fenceStripped.length; i++) {
      if (fenceStripped[i] !== '{') continue;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let j = i; j < fenceStripped.length; j++) {
        const ch = fenceStripped[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            candidates.push(fenceStripped.slice(i, j + 1));
            break;
          }
        }
      }
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.title && parsed.objects) return parsed;
      } catch {
        // try next candidate
      }
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

      // Create simulation (not from AI). Pasted JSON has no natural-language
      // prompt, so user_prompt is null.
      const simulationId = await createSimulation(parsed, false, null, null);

      if (onJSONExtracted) {
        onJSONExtracted(parsed, null);
      }

      onClose();
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      setJsonError(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle generating simulation with AI. The backend streams Server-Sent
  // Events: per-stage `progress` events (started/done with a human label),
  // a single `content` event carrying the assembled SimulationConfig JSON,
  // then `done`. On failure, a single `error` event closes the stream.
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
    setProgress(0);
    setStageLabel('Connecting…');

    // Stages currently in flight (started but not yet done). When parallel
    // detail stages run, multiple entries are present; we display the most
    // recently started one's label.
    const inFlight = new Map<string, string>();
    let completedCount = 0;
    let assembledContent = '';
    let streamError: string | null = null;

    try {
      const response = await fetch(simulationAiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          messages: messages,
          model: getModelForProvider(provider),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (!response.body) {
        throw new Error('Response has no body — streaming not supported by this transport.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read the SSE stream. Events are delimited by `\n\n`; each event is a
      // sequence of lines, only the `data: ...` lines carry the JSON payload.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6);
            let event: any;
            try {
              event = JSON.parse(dataStr);
            } catch {
              console.warn('Failed to parse SSE event:', dataStr);
              continue;
            }

            if (event.type === 'progress') {
              const { stage, status, label } = event;
              const display: string = label || stage;
              if (status === 'started') {
                inFlight.set(stage, display);
                setStageLabel(display);
              } else if (status === 'done') {
                inFlight.delete(stage);
                completedCount += 1;
                // Cap at 95% until we receive the final content + done so the
                // bar doesn't sit at 100% while we're still parsing.
                setProgress(Math.min(95, (completedCount / TOTAL_STAGES) * 100));
                const stillRunning = Array.from(inFlight.values());
                setStageLabel(stillRunning.length > 0
                  ? stillRunning[stillRunning.length - 1]
                  : 'Finalizing…');
              }
            } else if (event.type === 'content') {
              assembledContent += event.content || '';
            } else if (event.type === 'done') {
              setProgress(100);
              setStageLabel('Done');
            } else if (event.type === 'error') {
              streamError = event.error || 'Unknown error';
            }
          }
        }
      }

      if (streamError) {
        console.error('Pipeline error:', streamError);
        alert(`Error: ${streamError}`);
        return;
      }

      const json = extractJSON(assembledContent);
      if (json) {
        setExtractedJSON(json);
        if (onJSONExtracted) {
          onJSONExtracted(json, userInput);
        }
      } else {
        console.warn('AI stream finished but no valid simulation JSON was found. Raw content:', assembledContent);
        alert('The AI returned a response but no valid simulation JSON was found. Check the console for the raw output.');
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
              <span className="text-sm font-medium text-blue-800">Generating simulation…</span>
              <span className="text-xs text-blue-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              >
                <div className="h-full w-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse"></div>
              </div>
            </div>
            {stageLabel && (
              <div className="mt-2 text-xs text-blue-700">{stageLabel}</div>
            )}
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
          <div className="flex flex-col gap-2">
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
            <AiProviderSwitcher value={provider} onChange={setProvider} disabled={isStreaming} />
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
                    <span className="text-base font-medium text-blue-800">Generating simulation…</span>
                    <span className="text-sm text-blue-600">{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out relative"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="h-full w-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse"></div>
                    </div>
                  </div>
                  {stageLabel && (
                    <div className="mt-3 text-sm text-blue-700">{stageLabel}</div>
                  )}
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
              <div className="flex flex-col gap-2">
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
                <AiProviderSwitcher value={provider} onChange={setProvider} disabled={isStreaming} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateSimulation;
