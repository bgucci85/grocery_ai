"use client";

import { useState, useRef, useEffect } from "react";

const SAMPLE_JSON = `[
  {"site": "barbora", "url": "https://www.barbora.lt/produktas/XXXX"},
  {"site": "rimi", "url": "https://www.rimi.lt/e-parduotuve/produktas/YYYY"},
  {"site": "barbora", "query": "apelsinai 2kg"},
  {"site": "rimi", "query": "bananai 1kg", "qty": 2},
  {"site": "barbora", "query": "kiausiniai 10 vnt"}
]`;

interface LogLine {
  level: "info" | "warn" | "error" | "done";
  message: string;
}

interface JudgmentItem {
  originalRequest: string;
  status: "success" | "warning" | "failed";
  productAdded: string | null;
  quantityRequested: number;
  quantityAdded: number | null;
  matchScore: number;
  notes: string[];
}

interface JudgmentData {
  judgments: JudgmentItem[];
  originalItems: any[];
  addedItems: any[];
  failedItems: any[];
}

export default function Home() {
  const [inputMode, setInputMode] = useState<"simple" | "json">("simple");
  const [barboraItems, setBarboraItems] = useState(`2 vnt apelsinai
10 vnt kiausiniai arba https://barbora.lt/produktai/laisvai-laikomu-vistu-kiausiniai-10-vnt
pienas 1L`);
  const [rimiItems, setRimiItems] = useState(`duona arba ruginė duona
bananai 1kg`);
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [headful, setHeadful] = useState(true);  // Always enabled
  const [useOpenAI, setUseOpenAI] = useState(true);  // Always enabled
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [judgmentData, setJudgmentData] = useState<JudgmentData | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Parse simple text format into items
  const parseSimpleFormat = (text: string, site: "barbora" | "rimi") => {
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove bullet points (* or - at start)
        let cleanLine = line.replace(/^[*\-•]\s*/, '').trim();
        
        // Extract quantity from start (e.g., "2 vnt", "1500-2200 g")
        let qty = 1;
        
        // Try to match range first (e.g., "1500-2200 g")
        const rangeMatch = cleanLine.match(/^(\d+)-(\d+)\s*(vnt|g|kg|l|ml)\s+/i);
        if (rangeMatch) {
          // For ranges, use the lower bound and pass the full range in the query
          qty = 1; // Let the AI agent handle the range logic
          // Don't remove the range from cleanLine - it's part of the product description
        } else {
          // Try single quantity (e.g., "2 vnt")
          const qtyMatch = cleanLine.match(/^(\d+)\s*(vnt|g|kg|l|ml)\s+/i);
          if (qtyMatch) {
            qty = parseInt(qtyMatch[1]);
            cleanLine = cleanLine.substring(qtyMatch[0].length).trim();
          }
        }
        
        // Check for "arba" (or) alternatives
        if (cleanLine.includes(" arba ")) {
          const alternatives = cleanLine
            .split(" arba ")
            .map(alt => alt.trim())
            .filter(alt => alt.length > 0);
          
          // Return array of alternatives, each with same quantity
          return {
            site,
            alternatives: alternatives.map(alt => {
              if (alt.startsWith("http")) {
                return { type: "url" as const, value: alt };
              } else {
                return { type: "query" as const, value: alt };
              }
            }),
            qty
          };
        }
        
        // Single item (no alternatives)
        if (cleanLine.startsWith("http")) {
          // Format: URL
          return {
            site,
            url: cleanLine,
            qty
          };
        } else {
          // Format: "apelsinai 2kg" or "apelsinai"
          return {
            site,
            query: cleanLine,
            qty
          };
        }
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Reset state
    setLogs([]);
    setIsDone(false);
    setIsRunning(true);
    setJudgmentData(null);

    try {
      let items;
      
      if (inputMode === "simple") {
        // Use LLM to parse the simple format for better accuracy
        setLogs([{ level: "info", message: "🤖 Parsing your list with AI..." }]);
        
        const parseResponse = await fetch("/api/parse-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barboraText: barboraItems,
            rimiText: rimiItems,
          }),
        });

        if (!parseResponse.ok) {
          throw new Error("Failed to parse list with AI");
        }

        const parseResult = await parseResponse.json();
        items = parseResult.items;
        
        setLogs(prev => [...prev, { 
          level: "info", 
          message: `✓ Parsed ${items.length} items successfully` 
        }]);
      } else {
        // Parse JSON
        items = JSON.parse(jsonInput);
      }

      // Send request
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          headful,
          useOpenAI,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true });

        // Split by newlines and process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              // Check if this is judgment data
              if (parsed.type === "judgments") {
                setJudgmentData(parsed.data);
              } else {
                // Regular log line
                const logLine: LogLine = parsed;
                setLogs((prev) => [...prev, logLine]);

                if (logLine.level === "done") {
                  setIsDone(true);
                }
              }
            } catch (error) {
              console.error("Error parsing log line:", error);
            }
          }
        }
      }
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        {
          level: "error",
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const getLogColor = (level: LogLine["level"]) => {
    switch (level) {
      case "info":
        return "text-blue-400";
      case "warn":
        return "text-yellow-400";
      case "error":
        return "text-red-400";
      case "done":
        return "text-green-400 font-bold";
      default:
        return "text-gray-300";
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-center">
          🛒 Groceries Autocart
        </h1>
        <p className="text-center text-gray-400 mb-8">
          Barbora + Rimi | Automated cart filling
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input Form */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Configuration</h2>
              
              {/* Mode Toggle */}
              <div className="flex bg-gray-700 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setInputMode("simple")}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    inputMode === "simple"
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  📝 Simple
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("json")}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    inputMode === "json"
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {} JSON
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {inputMode === "simple" ? (
                <>
                  {/* Simple Mode - Two text areas */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-orange-400">
                      🟠 Barbora Items (one per line)
                    </label>
                    <textarea
                      value={barboraItems}
                      onChange={(e) => setBarboraItems(e.target.value)}
                      className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      disabled={isRunning}
                      placeholder="apelsinai 2kg&#10;2 vnt kiausiniai arba URL arba another product&#10;https://barbora.lt/produktas/...&#10;pienas 1L"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Format: "product name" or "2 vnt product" or "item arba alternative" or URL
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-green-400">
                      🟢 Rimi Items (one per line)
                    </label>
                    <textarea
                      value={rimiItems}
                      onChange={(e) => setRimiItems(e.target.value)}
                      className="w-full h-32 p-3 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      disabled={isRunning}
                      placeholder="duona&#10;bananai 1kg&#10;https://rimi.lt/produktas/...&#10;sultys 1L"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Format: "product name" or "product quantity" or URL
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Items JSON
                  </label>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    className="w-full h-64 p-3 bg-gray-700 border border-gray-600 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isRunning}
                    placeholder="Paste your JSON here..."
                  />
                </div>
              )}

              {/* Settings are now always enabled - hidden from UI */}
              <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-500/30">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-400 text-sm">✅ Headful mode (always on)</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-green-400 text-sm">🤖 AI Agent (always on)</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Optimized settings for best performance & accuracy
                </p>
              </div>

              <button
                type="submit"
                disabled={isRunning}
                className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
                  isRunning
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isRunning ? "Running..." : "Add to carts"}
              </button>
            </form>

            {/* Help Section */}
            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-sm font-semibold mb-2">💡 Quick Tips</h3>
              {inputMode === "simple" ? (
                <ul className="text-xs space-y-1 text-gray-300">
                  <li>• <strong>Paste directly from Excel/Sheets</strong> - one item per line</li>
                  <li>• <strong>🤖 LLM parses your list</strong> - handles any format intelligently</li>
                  <li>• "2 vnt apelsinai" - quantity at start</li>
                  <li>• "item arba URL arba another" - alternatives (will try in order)</li>
                  <li>• Bullet points (* - •) are automatically removed</li>
                  <li>• First run: browser opens for manual login</li>
                </ul>
              ) : (
                <ul className="text-xs space-y-1 text-gray-300">
                  <li>• Each item needs a <code className="text-blue-400">site</code> (barbora or rimi)</li>
                  <li>• Provide either <code className="text-blue-400">url</code> or <code className="text-blue-400">query</code></li>
                  <li>• Optional <code className="text-blue-400">qty</code> field (default: 1)</li>
                  <li>• 🤖 AI agent understands semantic matches</li>
                  <li>• First run: browser opens for manual login</li>
                </ul>
              )}
            </div>
          </div>

          {/* Right: Logs Panel */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Live Logs</h2>
              {isDone && (
                <span className="text-green-400 font-semibold">
                  ✅ Complete
                </span>
              )}
            </div>

            <div className="flex-1 bg-gray-900 rounded-lg p-4 overflow-y-auto font-mono text-sm h-[600px]">
              {logs.length === 0 ? (
                <p className="text-gray-500 italic">
                  Waiting for job to start...
                </p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className={`mb-1 ${getLogColor(log.level)}`}>
                    <span className="text-gray-500">[{log.level.toUpperCase()}]</span>{" "}
                    {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {isRunning && (
              <div className="mt-4 text-center text-sm text-gray-400">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                Processing...
              </div>
            )}
          </div>
        </div>

        {/* Cart Verification Report - Side by Side */}
        {judgmentData && judgmentData.judgments && judgmentData.judgments.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6 shadow-xl">
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <span className="mr-2">📊</span>
              Cart Verification Report
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Original Shopping List */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-blue-400">📝 Original Shopping List</h3>
                <div className="space-y-2">
                  {judgmentData.judgments.map((item, idx) => (
                    <div key={idx} className="p-3 bg-gray-800 rounded border border-gray-700">
                      <div className="text-sm text-gray-300">{item.originalRequest}</div>
                      <div className="text-xs text-gray-500 mt-1">Quantity: {item.quantityRequested}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Cart Verification Results */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-green-400">✅ Verification Results</h3>
                <div className="space-y-2">
                  {judgmentData.judgments.map((item, idx) => {
                    const getBgColor = () => {
                      if (item.status === "success") return "bg-green-900/30 border-green-500/50";
                      if (item.status === "warning") return "bg-yellow-900/30 border-yellow-500/50";
                      return "bg-red-900/30 border-red-500/50";
                    };

                    const getIcon = () => {
                      if (item.status === "success") return "✅";
                      if (item.status === "warning") return "⚠️";
                      return "❌";
                    };

                    const getScoreColor = () => {
                      if (item.matchScore >= 95) return "text-green-400";
                      if (item.matchScore >= 70) return "text-yellow-400";
                      if (item.matchScore >= 50) return "text-orange-400";
                      return "text-red-400";
                    };

                    return (
                      <div key={idx} className={`p-3 rounded border ${getBgColor()}`}>
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-lg">{getIcon()}</span>
                          <span className={`text-sm font-bold ${getScoreColor()}`}>
                            {item.matchScore}%
                          </span>
                        </div>
                        
                        {item.productAdded ? (
                          <>
                            <div className="text-sm text-gray-200 mb-1">
                              {item.productAdded}
                            </div>
                            <div className="text-xs text-gray-400">
                              Added: {item.quantityAdded} unit(s)
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-red-400">Not added</div>
                        )}

                        {item.notes && item.notes.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            {item.notes.map((note, noteIdx) => (
                              <div key={noteIdx} className="text-xs text-gray-400 mt-1">
                                • {note}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Overall Accuracy */}
            <div className="mt-4 p-4 bg-blue-900/30 rounded-lg border border-blue-500/30 text-center">
              <div className="text-sm text-gray-400 mb-1">Overall Accuracy</div>
              <div className="text-3xl font-bold text-blue-400">
                {judgmentData.judgments.length > 0
                  ? (
                      judgmentData.judgments.reduce((sum, item) => sum + item.matchScore, 0) /
                      judgmentData.judgments.length
                    ).toFixed(1)
                  : "0.0"}
                %
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

