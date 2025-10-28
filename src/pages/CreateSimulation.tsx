import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function CreateSimulation() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJSON, setExtractedJSON] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch('https://duncanajohnson--gist-openai-stream-chat-endpoint.modal.run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
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
        
        // Add assistant message
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
        
        // Check if we have JSON in the response
        const json = extractJSON(assistantContent);
        if (json) {
          setExtractedJSON(json);
        }
      } else if (data.type === 'error') {
        console.error('API error:', data.error);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `[Error: ${data.error}]`,
          },
        ]);
      }
    } catch (error) {
      console.error('Error calling chat API:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, there was an error communicating with the AI: ${error}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        
        // Validate it has required fields
        if (json.title && json.objects) {
          // Immediately navigate to the simulation
          navigate('/simulation/dynamic', { state: { config: json } });
        } else {
          alert('Invalid simulation JSON file. Missing required fields (title, objects).');
        }
      } catch (error) {
        alert('Error parsing JSON file: ' + error);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download JSON
  const handleDownload = () => {
    if (!extractedJSON) return;
    
    const dataStr = JSON.stringify(extractedJSON, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${extractedJSON.title || 'simulation'}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Open simulation
  const handleOpenSimulation = () => {
    if (!extractedJSON) return;
    navigate('/simulation/dynamic', { state: { config: extractedJSON } });
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 py-8">
      <div className="bg-white rounded-xl shadow-md overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Header */}
        <div className="bg-primary text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">Create AI Simulation</h1>
            <p className="text-sm opacity-90">Describe the simulation you want to create</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="bg-white text-primary px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-sm font-medium"
            >
              Upload JSON
            </label>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ height: 'calc(100% - 180px)' }}>
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-12">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
              <p className="text-gray-600">
                Describe the physics simulation you'd like to create, or upload a JSON file.
              </p>
              <div className="mt-6 text-left max-w-md mx-auto bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold mb-2">Example prompts:</p>
                <ul className="text-sm space-y-1 text-gray-700">
                  <li>• "Create a pendulum simulation"</li>
                  <li>• "Show projectile motion with angle control"</li>
                  <li>• "Make a bouncing ball with gravity control"</li>
                </ul>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-800 rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Action Buttons (when JSON is detected) */}
        {extractedJSON && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex gap-3">
            <button
              onClick={handleOpenSimulation}
              className="flex-1 bg-primary text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Open Simulation
            </button>
            <button
              onClick={handleDownload}
              className="px-6 py-2 bg-white text-primary border-2 border-primary rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Download JSON
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe your simulation..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={2}
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateSimulation;

