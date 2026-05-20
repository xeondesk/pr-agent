import { getSettings } from './config.js';
import { getLogger } from './logger.js';

export const RE_HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[ ]?(.*)/;

export function decodeIfBytes(value: unknown): string {
  if (value instanceof Uint8Array || value instanceof Buffer) {
    const encodingsToTry = ['utf-8', 'iso-8859-1', 'latin-1', 'ascii', 'utf-16'];
    for (const encoding of encodingsToTry) {
      try {
        const decoder = new TextDecoder(encoding);
        return decoder.decode(value as Buffer);
      } catch {
        continue;
      }
    }
    return '';
  }
  return value as string;
}

export function shouldSkipPatch(filename: string): boolean {
  const settings = getSettings();
  const patchExtensionSkipTypes = settings.get('config.patch_extension_skip_types') as string[] | undefined;
  if (patchExtensionSkipTypes && filename) {
    return patchExtensionSkipTypes.some(skipType => filename.endsWith(skipType));
  }
  return false;
}

export function extractHunkHeaders(match: RegExpMatchArray): {
  sectionHeader: string;
  size1: number;
  size2: number;
  start1: number;
  start2: number;
} {
  const res = [...match];
  for (let i = 0; i < res.length; i++) {
    if (res[i] === undefined) res[i] = '0';
  }
  let start1: number, size1: number, start2: number, size2: number;
  try {
    start1 = parseInt(res[1], 10);
    size1 = parseInt(res[2] || '1', 10);
    start2 = parseInt(res[3], 10);
    size2 = parseInt(res[4] || '1', 10);
  } catch {
    start1 = parseInt(res[1], 10);
    size1 = parseInt(res[2] || '1', 10);
    size2 = parseInt(res[3] || '1', 10);
    start2 = 0;
  }
  const sectionHeader = res[5] || '';
  return { sectionHeader, size1, size2, start1, start2 };
}

export function checkIfHunkLinesMatchesToFile(
  i: number,
  originalLines: string[],
  patchLines: string[],
  start1: number
): boolean {
  try {
    if (i + 1 < patchLines.length && patchLines[i + 1][0] === ' ') {
      if (patchLines[i + 1].trim() !== originalLines[start1 - 1]?.trim()) {
        const originalLine = originalLines[start1 - 1]?.trim() ?? '';
        const encodings = ['iso-8859-1', 'latin-1', 'ascii', 'utf-16'];
        for (const encoding of encodings) {
          try {
            const encoded = new TextEncoder().encode(originalLine);
            const decoded = new TextDecoder(encoding).decode(encoded);
            if (decoded.trim() === patchLines[i + 1].trim()) {
              getLogger().info(`Detected different encoding in hunk header line ${start1}, needed encoding: ${encoding}`);
              return false;
            }
          } catch {
            continue;
          }
        }
        getLogger().info(
          `Invalid hunk in PR, line ${start1} in hunk header doesn't match the original file content`
        );
        return false;
      }
    }
  } catch {
    // ignore
  }
  return true;
}

export function extendPatch(
  originalFileStr: string,
  patchStr: string,
  patchExtraLinesBefore: number = 0,
  patchExtraLinesAfter: number = 0,
  filename: string = '',
  newFileStr: string = ''
): string {
  if (!patchStr || (patchExtraLinesBefore === 0 && patchExtraLinesAfter === 0) || !originalFileStr) {
    return patchStr;
  }

  originalFileStr = decodeIfBytes(originalFileStr);
  newFileStr = decodeIfBytes(newFileStr);
  if (!originalFileStr) {
    return patchStr;
  }

  if (shouldSkipPatch(filename)) {
    return patchStr;
  }

  try {
    return processPatchLines(patchStr, originalFileStr, patchExtraLinesBefore, patchExtraLinesAfter, newFileStr);
  } catch (e) {
    getLogger().warning(`Failed to extend patch: ${e}`);
    return patchStr;
  }
}

export function processPatchLines(
  patchStr: string,
  originalFileStr: string,
  patchExtraLinesBefore: number,
  patchExtraLinesAfter: number,
  newFileStr: string = ''
): string {
  const settings = getSettings();
  const allowDynamicContext = settings.get('config.allow_dynamic_context') as boolean ?? false;
  const patchExtraLinesBeforeDynamic = settings.get('config.max_extra_lines_before_dynamic_context') as number ?? 0;

  const fileOriginalLines = originalFileStr.split('\n');
  const fileNewLines = newFileStr ? newFileStr.split('\n') : [];
  const lenOriginalLines = fileOriginalLines.length;
  const patchLines = patchStr.split('\n');
  const extendedPatchLines: string[] = [];

  let isValidHunk = true;
  let start1 = -1, size1 = -1, start2 = -1, size2 = -1;

  try {
    for (let i = 0; i < patchLines.length; i++) {
      const line = patchLines[i];
      if (line.startsWith('@@')) {
        const match = line.match(RE_HUNK_HEADER);
        if (match) {
          if (isValidHunk && start1 !== -1 && patchExtraLinesAfter > 0) {
            const deltaLinesOriginal = fileOriginalLines
              .slice(start1 + size1 - 1, start1 + size1 - 1 + patchExtraLinesAfter)
              .map(l => ` ${l}`);
            extendedPatchLines.push(...deltaLinesOriginal);
          }

          const { sectionHeader, size1: sz1, size2: sz2, start1: st1, start2: st2 } = extractHunkHeaders(match);
          size1 = sz1; size2 = sz2; start1 = st1; start2 = st2;

          isValidHunk = checkIfHunkLinesMatchesToFile(i, fileOriginalLines, patchLines, start1);

          let extendedStart1: number, extendedSize1: number, extendedStart2: number, extendedSize2: number;
          let deltaLinesOriginal: string[] = [];

          if (isValidHunk && (patchExtraLinesBefore > 0 || patchExtraLinesAfter > 0)) {
            const calcContextLimits = (patchLinesBefore: number) => {
              let extStart1 = Math.max(1, start1 - patchLinesBefore);
              let extSize1 = size1 + (start1 - extStart1) + patchExtraLinesAfter;
              let extStart2 = Math.max(1, start2 - patchLinesBefore);
              let extSize2 = size2 + (start2 - extStart2) + patchExtraLinesAfter;
              if (extStart1 - 1 + extSize1 > lenOriginalLines) {
                const deltaCap = extStart1 - 1 + extSize1 - lenOriginalLines;
                extSize1 = Math.max(extSize1 - deltaCap, size1);
                extSize2 = Math.max(extSize2 - deltaCap, size2);
              }
              return { extendedStart1: extStart1, extendedSize1: extSize1, extendedStart2: extStart2, extendedSize2: extSize2 };
            };

            if (allowDynamicContext && fileNewLines.length > 0) {
              ({ extendedStart1, extendedSize1, extendedStart2, extendedSize2 } = calcContextLimits(patchExtraLinesBeforeDynamic));

              const linesBeforeOriginal = fileOriginalLines.slice(extendedStart1 - 1, start1 - 1);
              const linesBeforeNew = fileNewLines.slice(extendedStart2 - 1, start2 - 1);
              let foundHeader = false;

              for (let j = 0; j < linesBeforeOriginal.length; j++) {
                if (sectionHeader && linesBeforeOriginal[j].includes(sectionHeader)) {
                  extendedStart1 += j;
                  extendedStart2 += j;
                  extendedSize1 -= j;
                  extendedSize2 -= j;
                  const linesBeforeOriginalDynamic = linesBeforeOriginal.slice(j);
                  const linesBeforeNewDynamic = linesBeforeNew.slice(j);
                  if (JSON.stringify(linesBeforeOriginalDynamic) === JSON.stringify(linesBeforeNewDynamic)) {
                    foundHeader = true;
                  }
                  break;
                }
              }

              if (!foundHeader) {
                ({ extendedStart1, extendedSize1, extendedStart2, extendedSize2 } = calcContextLimits(patchExtraLinesBefore));
              }
            } else {
              ({ extendedStart1, extendedSize1, extendedStart2, extendedSize2 } = calcContextLimits(patchExtraLinesBefore));
            }

            deltaLinesOriginal = fileOriginalLines
              .slice(extendedStart1 - 1, start1 - 1)
              .map(l => ` ${l}`);

            if (fileNewLines.length > 0) {
              const deltaLinesNew = fileNewLines
                .slice(extendedStart2 - 1, start2 - 1)
                .map(l => ` ${l}`);
              if (JSON.stringify(deltaLinesOriginal) !== JSON.stringify(deltaLinesNew)) {
                let foundMiniMatch = false;
                for (let j = 0; j < deltaLinesOriginal.length; j++) {
                  if (JSON.stringify(deltaLinesOriginal.slice(j)) === JSON.stringify(deltaLinesNew.slice(j))) {
                    deltaLinesOriginal = deltaLinesOriginal.slice(j);
                    extendedStart1 += j;
                    extendedSize1 -= j;
                    extendedStart2 += j;
                    extendedSize2 -= j;
                    foundMiniMatch = true;
                    break;
                  }
                }
                if (!foundMiniMatch) {
                  extendedStart1 = start1;
                  extendedSize1 = size1;
                  extendedStart2 = start2;
                  extendedSize2 = size2;
                  deltaLinesOriginal = [];
                }
              }
            }

            if (sectionHeader && !allowDynamicContext) {
              for (const dl of deltaLinesOriginal) {
                if (dl.includes(sectionHeader)) {
                  break;
                }
              }
            }
          } else {
            deltaLinesOriginal = [];
            extendedStart1 = start1;
            extendedSize1 = size1;
            extendedStart2 = start2;
            extendedSize2 = size2;
          }

          extendedPatchLines.push('');
          extendedPatchLines.push(`@@ -${extendedStart1},${extendedSize1} +${extendedStart2},${extendedSize2} @@ ${sectionHeader}`);
          extendedPatchLines.push(...deltaLinesOriginal);
          continue;
        }
      }
      extendedPatchLines.push(line);
    }

    if (start1 !== -1 && patchExtraLinesAfter > 0 && isValidHunk) {
      const deltaLinesOriginal = fileOriginalLines
        .slice(start1 + size1 - 1, start1 + size1 - 1 + patchExtraLinesAfter)
        .map(l => ` ${l}`);
      extendedPatchLines.push(...deltaLinesOriginal);
    }
  } catch (e) {
    getLogger().warning(`Failed to extend patch: ${e}`);
    return patchStr;
  }

  return extendedPatchLines.join('\n');
}

export function omitDeletionHunks(patchLines: string[]): string {
  const tempHunk: string[] = [];
  const addedPatched: string[] = [];
  let addHunk = false;
  let insideHunk = false;

  for (const line of patchLines) {
    if (line.startsWith('@@')) {
      const match = line.match(RE_HUNK_HEADER);
      if (match) {
        if (insideHunk && addHunk) {
          addedPatched.push(...tempHunk);
        }
        tempHunk.length = 0;
        addHunk = false;
        tempHunk.push(line);
        insideHunk = true;
      }
    } else {
      tempHunk.push(line);
      if (line) {
        const editType = line[0];
        if (editType === '+') {
          addHunk = true;
        }
      }
    }
  }
  if (insideHunk && addHunk) {
    addedPatched.push(...tempHunk);
  }

  return addedPatched.join('\n');
}

export function handlePatchDeletions(
  patch: string,
  originalFileContentStr: string,
  newFileContentStr: string,
  fileName: string,
  editType: string = 'UNKNOWN'
): string | null {
  if (!newFileContentStr && (editType === 'DELETED' || editType === 'UNKNOWN')) {
    const settings = getSettings();
    const verbosity = settings.get('config.verbosity_level') as number ?? 0;
    if (verbosity > 0) {
      getLogger().info(`Processing file: ${fileName}, minimizing deletion file`);
    }
    return null;
  } else {
    const patchLines = patch.split('\n');
    const patchNew = omitDeletionHunks(patchLines);
    if (patch !== patchNew) {
      const settings = getSettings();
      const verbosity = settings.get('config.verbosity_level') as number ?? 0;
      if (verbosity > 0) {
        getLogger().info(`Processing file: ${fileName}, hunks were deleted`);
      }
      patch = patchNew;
    }
  }
  return patch;
}

export function decoupleAndConvertToHunksWithLinesNumbers(patch: string, file: Record<string, unknown>): string {
  if (file) {
    if ((file as Record<string, unknown>).edit_type === 'DELETED') {
      return `\n\n## File '${String((file as Record<string, unknown>).filename ?? '').trim()}' was deleted\n`;
    }
  }

  let patchWithLinesStr = file
    ? `\n\n## File: '${String((file as Record<string, unknown>).filename ?? '').trim()}'\n`
    : '';

  const patchLines = patch.split('\n');
  const newContentLines: string[] = [];
  const oldContentLines: string[] = [];
  let match: RegExpMatchArray | null = null;
  let start1 = -1, size1 = -1, start2 = -1, size2 = -1;
  let prevHeaderLine: string[] = [];
  let headerLine: string[] = [];

  for (let lineI = 0; lineI < patchLines.length; lineI++) {
    const line = patchLines[lineI];
    if (line.toLowerCase().includes('no newline at end of file')) {
      continue;
    }

    if (line.startsWith('@@')) {
      const currentHeaderLine = [line];
      match = line.match(RE_HUNK_HEADER);
      if (match && (newContentLines.length || oldContentLines.length)) {
        if (prevHeaderLine.length) {
          patchWithLinesStr += `\n${prevHeaderLine.join('\n')}\n`;
        }
        const isPlusLines = newContentLines.some(l => l.startsWith('+'));
        const isMinusLines = oldContentLines.some(l => l.startsWith('-'));

        if (isPlusLines || isMinusLines) {
          patchWithLinesStr = patchWithLinesStr.replace(/\s+$/, '') + '\n__new hunk__\n';
          for (let i = 0; i < newContentLines.length; i++) {
            patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
          }
        }
        if (isMinusLines) {
          patchWithLinesStr = patchWithLinesStr.replace(/\s+$/, '') + '\n__old hunk__\n';
          for (const lineOld of oldContentLines) {
            patchWithLinesStr += `${lineOld}\n`;
          }
        }
        newContentLines.length = 0;
        oldContentLines.length = 0;
      }
      if (match) {
        prevHeaderLine = currentHeaderLine;
        const h = extractHunkHeaders(match);
        size1 = h.size1;
        size2 = h.size2;
        start1 = h.start1;
        start2 = h.start2;
      }
    } else if (line.startsWith('+')) {
      newContentLines.push(line);
    } else if (line.startsWith('-')) {
      oldContentLines.push(line);
    } else {
      if (!line && lineI) {
        if (lineI + 1 < patchLines.length && patchLines[lineI + 1].startsWith('@@')) {
          continue;
        } else if (lineI + 1 === patchLines.length) {
          continue;
        }
      }
      newContentLines.push(line);
      oldContentLines.push(line);
    }
  }

  if (match && newContentLines.length) {
    patchWithLinesStr += `\n${patchLines.find(l => l.startsWith('@@')) ?? ''}\n`;
    const isPlusLines = newContentLines.some(l => l.startsWith('+'));
    const isMinusLines = oldContentLines.some(l => l.startsWith('-'));

    if (isPlusLines || isMinusLines) {
      patchWithLinesStr = patchWithLinesStr.replace(/\s+$/, '') + '\n__new hunk__\n';
      for (let i = 0; i < newContentLines.length; i++) {
        patchWithLinesStr += `${start2 + i} ${newContentLines[i]}\n`;
      }
    }
    if (isMinusLines) {
      patchWithLinesStr = patchWithLinesStr.replace(/\s+$/, '') + '\n__old hunk__\n';
      for (const lineOld of oldContentLines) {
        patchWithLinesStr += `${lineOld}\n`;
      }
    }
  }

  return patchWithLinesStr.replace(/\s+$/, '');
}

export function extractHunkLinesFromPatch(
  patch: string,
  fileName: string,
  lineStart: number,
  lineEnd: number,
  side: string,
  removeTrailingChars: boolean = true
): [string, string] {
  try {
    let patchWithLinesStr = `\n\n## File: '${fileName.trim()}'\n\n`;
    let selectedLines = '';
    const patchLines = patch.split('\n');
    let match: RegExpMatchArray | null = null;
    let start1 = -1, size1 = -1, start2 = -1, size2 = -1;
    let skipHunk = false;
    let selectedLinesNum = 0;

    for (const line of patchLines) {
      if (line.toLowerCase().includes('no newline at end of file')) {
        continue;
      }

      if (line.startsWith('@@')) {
        skipHunk = false;
        selectedLinesNum = 0;
        match = line.match(RE_HUNK_HEADER);

        const h = extractHunkHeaders(match!);
        size1 = h.size1;
        size2 = h.size2;
        start1 = h.start1;
        start2 = h.start2;

        if (side.toLowerCase() === 'left') {
          if (!(start1 <= lineStart && lineStart <= start1 + size1)) {
            skipHunk = true;
            continue;
          }
        } else if (side.toLowerCase() === 'right') {
          if (!(start2 <= lineStart && lineStart <= start2 + size2)) {
            skipHunk = true;
            continue;
          }
        }
        patchWithLinesStr += `\n${line}\n`;
      } else if (!skipHunk) {
        if (side.toLowerCase() === 'right' && lineStart <= start2 + selectedLinesNum && start2 + selectedLinesNum <= lineEnd) {
          selectedLines += line + '\n';
        }
        if (side.toLowerCase() === 'left' && start1 <= selectedLinesNum + start1 && selectedLinesNum + start1 <= lineEnd) {
          selectedLines += line + '\n';
        }
        patchWithLinesStr += line + '\n';
        if (!line.startsWith('-')) {
          selectedLinesNum += 1;
        }
      }
    }

    if (removeTrailingChars) {
      patchWithLinesStr = patchWithLinesStr.replace(/\s+$/, '');
      selectedLines = selectedLines.replace(/\s+$/, '');
    }

    return [patchWithLinesStr, selectedLines];
  } catch (e) {
    getLogger().error(`Failed to extract hunk lines from patch: ${e}`);
    return ['', ''];
  }
}
