export interface ParsedPatch {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  oldLines: number;
  newLines: number;
  hunks: Hunk[];
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export class PatchParser {
  parse(diff: string): ParsedPatch[] {
    const patches: ParsedPatch[] = [];
    const lines = diff.split('\n');
    let currentPatch: ParsedPatch | null = null;
    let currentHunk: Hunk | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // File header: diff --git a/file b/file
      if (line.startsWith('diff --git')) {
        if (currentPatch) {
          if (currentHunk) {
            currentPatch.hunks.push(currentHunk);
          }
          patches.push(currentPatch);
        }
        const match = line.match(/b\/(.*?)$/);
        currentPatch = {
          filename: match ? match[1] : 'unknown',
          additions: 0,
          deletions: 0,
          changes: 0,
          oldLines: 0,
          newLines: 0,
          hunks: [],
        };
        currentHunk = null;
      }

      // Hunk header: @@ -old +new @@
      if (line.startsWith('@@')) {
        if (currentHunk && currentPatch) {
          currentPatch.hunks.push(currentHunk);
        }
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match && currentPatch) {
          currentHunk = {
            oldStart: parseInt(match[1]),
            oldCount: parseInt(match[2] || '1'),
            newStart: parseInt(match[3]),
            newCount: parseInt(match[4] || '1'),
            lines: [],
          };
        }
      }

      // Count changes
      if (currentPatch && currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentPatch.additions++;
          currentPatch.changes++;
          currentHunk.lines.push(line);
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentPatch.deletions++;
          currentPatch.changes++;
          currentHunk.lines.push(line);
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push(line);
        }
      }
    }

    // Add final patch and hunk
    if (currentPatch) {
      if (currentHunk) {
        currentPatch.hunks.push(currentHunk);
      }
      patches.push(currentPatch);
    }

    return patches;
  }

  getSummary(diff: string): { files: number; additions: number; deletions: number } {
    const patches = this.parse(diff);
    return {
      files: patches.length,
      additions: patches.reduce((sum, p) => sum + p.additions, 0),
      deletions: patches.reduce((sum, p) => sum + p.deletions, 0),
    };
  }
}
