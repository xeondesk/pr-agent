import { getSettings } from './config.js';
import { getLogger } from './logger.js';

interface FileLike {
  filename?: string;
  new?: { path?: string };
  old?: { path?: string };
  new_path?: string;
  old_path?: string;
  path?: { toString: () => string };
}

export function translateGlobsToRegexes(globs: string[]): string[] {
  const regexes: string[] = [];
  for (const pattern of globs) {
    regexes.push(globToRegex(pattern));
    if (pattern.startsWith('**/')) {
      regexes.push(globToRegex(pattern.slice(3)));
    }
  }
  return regexes;
}

function globToRegex(pattern: string): string {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
        if (i < pattern.length && pattern[i] === '/') {
          i++;
        }
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regexStr += '[^/]';
      i++;
    } else if (ch === '.') {
      regexStr += '\\.';
      i++;
    } else if (ch === '{') {
      const closeBrace = pattern.indexOf('}', i);
      if (closeBrace !== -1) {
        const group = pattern.slice(i + 1, closeBrace);
        const parts = group.split(',');
        regexStr += '(' + parts.map(p => p.trim()).map(p => globToRegex(p)).join('|') + ')';
        i = closeBrace + 1;
      } else {
        regexStr += '\\{';
        i++;
      }
    } else if (ch === '[') {
      const closeBracket = pattern.indexOf(']', i);
      if (closeBracket !== -1) {
        regexStr += pattern.slice(i, closeBracket + 1);
        i = closeBracket + 1;
      } else {
        regexStr += '\\[';
        i++;
      }
    } else if ('+^$()|\\'.includes(ch)) {
      regexStr += '\\' + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return '^' + regexStr + '$';
}

export function filterIgnored(
  files: FileLike[],
  platform: string = 'github'
): FileLike[] {
  try {
    const settings = getSettings();
    let patterns: string[] = [];

    const regexPatterns = settings.get('ignore.regex');
    if (regexPatterns) {
      if (typeof regexPatterns === 'string') {
        patterns = [regexPatterns as string];
      } else if (Array.isArray(regexPatterns)) {
        patterns = [...(regexPatterns as string[])];
      }
    }

    let globSetting = settings.get('ignore.glob');
    if (globSetting) {
      if (typeof globSetting === 'string') {
        globSetting = (globSetting as string).replace('[', '').replace(']', '').split(',');
      }
      if (Array.isArray(globSetting)) {
        patterns = patterns.concat(translateGlobsToRegexes(globSetting as string[]));
      }
    }

    const codeGenerators = settings.get('config.ignore_language_framework');
    if (codeGenerators) {
      if (Array.isArray(codeGenerators)) {
        for (const cg of codeGenerators as string[]) {
          const globPatterns = settings.get(`generated_code.${cg}`);
          if (globPatterns) {
            if (typeof globPatterns === 'string') {
              patterns = patterns.concat(translateGlobsToRegexes([globPatterns as string]));
            } else if (Array.isArray(globPatterns)) {
              patterns = patterns.concat(translateGlobsToRegexes(globPatterns as string[]));
            }
          }
        }
      }
    }

    const compiledPatterns: RegExp[] = [];
    for (const r of patterns) {
      try {
        compiledPatterns.push(new RegExp(r));
      } catch {
        // skip invalid regex
      }
    }

    if (files && Array.isArray(files)) {
      for (const r of compiledPatterns) {
        if (platform === 'github') {
          files = files.filter(f => f.filename && !r.test(f.filename));
        } else if (platform === 'bitbucket') {
          const filtered: FileLike[] = [];
          for (const f of files) {
            if (f.new && f.new.path && !r.test(f.new.path)) {
              filtered.push(f);
              continue;
            }
            if (f.old && f.old.path && !r.test(f.old.path)) {
              filtered.push(f);
              continue;
            }
          }
          files = filtered;
        } else if (platform === 'bitbucket_server') {
          files = files.filter(f => f.path?.toString && !r.test(f.path.toString()));
        } else if (platform === 'gitlab') {
          const filtered: FileLike[] = [];
          for (const f of files) {
            if (f.new_path && !r.test(f.new_path)) {
              filtered.push(f);
              continue;
            }
            if (f.old_path && !r.test(f.old_path)) {
              filtered.push(f);
              continue;
            }
          }
          files = filtered;
        } else if (platform === 'azure') {
          files = files.filter(f => !r.test(f as unknown as string));
        } else if (platform === 'gitea') {
          files = files.filter(f => {
            const ff = f as Record<string, string>;
            return !r.test(ff['filename'] ?? '');
          });
        }
      }
    }
  } catch (e) {
    console.error(`Could not filter file list: ${e}`);
  }

  return files;
}
