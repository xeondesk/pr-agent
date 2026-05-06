'use client';

import { useState } from 'react';

interface FileDiff {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface DiffViewerProps {
  files: FileDiff[];
  diff?: string;
}

export function DiffViewer({ files }: DiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    files.length > 0 ? files[0].filename : null
  );
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const selectedFileDiff = files.find((f) => f.filename === selectedFile);

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">
            Files Changed ({files.length})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('unified')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'unified'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 rounded text-sm ${
                viewMode === 'split'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Split
            </button>
          </div>
        </div>

        {/* File List */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {files.map((file) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFile(file.filename)}
              className={`px-3 py-2 rounded text-sm whitespace-nowrap transition ${
                selectedFile === file.filename
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className="truncate">{file.filename}</span>
              <span className="ml-2 text-xs">
                +{file.additions} -{file.deletions}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto font-mono text-sm bg-gray-900">
        {selectedFileDiff ? (
          <DiffContent patch={selectedFileDiff.patch || ''} />
        ) : (
          <div className="p-4 text-gray-400">No file selected</div>
        )}
      </div>
    </div>
  );
}

function DiffContent({ patch }: { patch: string }) {
  const lines = patch.split('\n');

  return (
    <div className="bg-gray-900">
      {lines.map((line, idx) => {
        let bgColor = 'bg-gray-900';
        let textColor = 'text-gray-300';

        if (line.startsWith('+')) {
          bgColor = 'bg-green-900/20';
          textColor = 'text-green-400';
        } else if (line.startsWith('-')) {
          bgColor = 'bg-red-900/20';
          textColor = 'text-red-400';
        } else if (line.startsWith('@@')) {
          bgColor = 'bg-blue-900/20';
          textColor = 'text-blue-300';
        }

        return (
          <div
            key={idx}
            className={`${bgColor} ${textColor} px-4 py-1 border-l-4 border-gray-800`}
          >
            <span className="inline-block w-12 text-gray-500 text-right pr-4">
              {idx}
            </span>
            <span className="font-mono text-xs break-words">{line}</span>
          </div>
        );
      })}
    </div>
  );
}
