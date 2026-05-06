export class Compression {
  /**
   * Compress diff by removing redundant context lines
   */
  static compressDiff(diff: string, contextLines: number = 1): string {
    const lines = diff.split('\n');
    const result: string[] = [];
    let contextCount = 0;
    let inHunk = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Always keep file headers
      if (line.startsWith('diff --git') || line.startsWith('index ') || 
          line.startsWith('---') || line.startsWith('+++')) {
        result.push(line);
        continue;
      }

      // Keep hunk headers
      if (line.startsWith('@@')) {
        result.push(line);
        inHunk = true;
        contextCount = 0;
        continue;
      }

      // For change lines (+ or -)
      if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
        result.push(line);
        contextCount = 0;
      } 
      // For context lines
      else if (line.startsWith(' ') && inHunk) {
        if (contextCount < contextLines) {
          result.push(line);
          contextCount++;
        }
      }
      // Keep empty lines in context
      else if (line === '' && inHunk) {
        contextCount = 0;
      }
    }

    return result.join('\n');
  }

  /**
   * Truncate large diffs to max size
   */
  static truncateDiff(diff: string, maxLines: number = 500): string {
    const lines = diff.split('\n');
    if (lines.length <= maxLines) {
      return diff;
    }

    // Keep start and end with ellipsis in middle
    const keepStart = Math.floor(maxLines / 2);
    const keepEnd = maxLines - keepStart;
    
    return [
      ...lines.slice(0, keepStart),
      '... (diff truncated) ...',
      ...lines.slice(-keepEnd),
    ].join('\n');
  }

  /**
   * Summarize large text content
   */
  static summarizeText(text: string, maxLength: number = 2000): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n... (content truncated) ...';
  }
}
