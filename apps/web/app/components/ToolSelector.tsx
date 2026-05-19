'use client';

interface ToolSelectorProps {
  selectedTool: string;
  onSelectTool: (tool: string) => void;
}

const TOOLS = [
  { id: 'review', name: 'Review', description: 'Full PR analysis' },
  { id: 'describe', name: 'Describe', description: 'Change summary' },
  { id: 'improve', name: 'Improve', description: 'Suggestions' },
  { id: 'ask', name: 'Ask', description: 'Custom questions' },
];

export function ToolSelector({ selectedTool, onSelectTool }: ToolSelectorProps) {
  return (
    <div className="space-y-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSelectTool(tool.id)}
          className={`w-full text-left px-3 py-2 rounded transition-all ${
            selectedTool === tool.id
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <div className="font-semibold">{tool.name}</div>
          <div className="text-xs opacity-75">{tool.description}</div>
        </button>
      ))}
    </div>
  );
}
