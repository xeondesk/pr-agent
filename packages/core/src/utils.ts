import * as crypto from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { encodingForModel } from 'js-tiktoken';
import {
  FilePatchInfo,
  EDIT_TYPE,
  MAX_TOKENS,
  PRReviewHeader,
  PRDescriptionHeader,
  TodoItem,
} from '@pr-agent/types';
import { getSettings } from './config.js';
import { getLogger } from './logger.js';
import { RE_HUNK_HEADER, extractHunkLinesFromPatch } from './gitPatchProcessing.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dedentText(text: string): string {
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return text;
  const indent = Math.min(
    ...nonEmptyLines.map(line => {
      const match = line.match(/^[ \t]*/);
      return match ? match[0].length : 0;
    })
  );
  return lines.map(line => line.slice(indent)).join('\n');
}

function simpleUnifiedDiff(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const result: string[] = [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: Array<{ type: 'keep' | 'delete' | 'add'; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'keep', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'delete', line: oldLines[i - 1] });
      i--;
    }
  }

  result.push('--- original');
  result.push('+++ modified');
  let inHunk = false;
  let hunkStart1 = 1, hunkStart2 = 1;
  let hunkLen1 = 0, hunkLen2 = 0;
  const hunkLines: string[] = [];

  function flushHunk() {
    if (hunkLines.length === 0) return;
    result.push(`@@ -${hunkStart1},${hunkLen1} +${hunkStart2},${hunkLen2} @@`);
    result.push(...hunkLines);
    hunkLen1 = 0;
    hunkLen2 = 0;
    hunkLines.length = 0;
  }

  let idx1 = 1, idx2 = 1;
  for (const op of ops) {
    if (op.type === 'keep') {
      if (inHunk && hunkLen1 > 0 && hunkLen2 > 0) {
        hunkLines.push(` ${op.line}`);
        hunkLen1++;
        hunkLen2++;
      }
      idx1++;
      idx2++;
    } else if (op.type === 'delete') {
      if (!inHunk) {
        hunkStart1 = idx1;
        hunkStart2 = idx2;
        inHunk = true;
      }
      hunkLines.push(`-${op.line}`);
      hunkLen1++;
      idx1++;
    } else if (op.type === 'add') {
      if (!inHunk) {
        hunkStart1 = idx1;
        hunkStart2 = idx2;
        inHunk = true;
      }
      hunkLines.push(`+${op.line}`);
      hunkLen2++;
      idx2++;
    }
  }
  flushHunk();
  return result.join('\n');
}

function getCloseMatches(word: string, possibilities: string[], n: number = 3, cutoff: number = 0.6): string[] {
  function similarity(a: string, b: string): number {
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length < b.length ? a : b;
    if (longer.length === 0) return 1.0;
    const editDist = levenshtein(longer, shorter);
    return (longer.length - editDist) / longer.length;
  }
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
        }
      }
    }
    return dp[m][n];
  }

  const scored = possibilities
    .map(p => ({ word: p, score: similarity(word, p) }))
    .filter(s => s.score >= cutoff)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map(s => s.word);
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  return text;
}

export function getModel(modelType?: 'model_weak' | 'model_reasoning'): string {
  const settings = getSettings();
  if (modelType === 'model_weak' && settings.get('config.model_weak')) {
    return settings.get('config.model_weak') as string;
  } else if (modelType === 'model_reasoning' && settings.get('config.model_reasoning')) {
    return settings.get('config.model_reasoning') as string;
  }
  return (settings.config as Record<string, unknown>).model as string ?? '';
}

export function getSetting(key: string): unknown {
  try {
    key = key.toUpperCase();
    return getSettings().get(key);
  } catch {
    return getSettings().get(key);
  }
}

export function emphasizeHeader(text: string, onlyMarkdown?: boolean, referenceLink?: string): string {
  try {
    const colonPosition = text.indexOf(': ');
    if (colonPosition !== -1) {
      if (onlyMarkdown) {
        if (referenceLink) {
          return `[**${text.slice(0, colonPosition + 1)}**](${referenceLink})\n` + text.slice(colonPosition + 1);
        }
        return `**${text.slice(0, colonPosition + 1)}**\n` + text.slice(colonPosition + 1);
      }
      if (referenceLink) {
        return `<strong><a href='${referenceLink}'>${text.slice(0, colonPosition + 1)}</a></strong><br>` + text.slice(colonPosition + 1);
      }
      return '<strong>' + text.slice(0, colonPosition + 1) + '</strong><br>' + text.slice(colonPosition + 1);
    }
    return text;
  } catch (e) {
    getLogger().exception(`Failed to emphasize header: ${e}`);
    return text;
  }
}

export function uniqueStrings(inputList: string[]): string[] {
  if (!inputList || !Array.isArray(inputList)) {
    return inputList;
  }
  const seen = new Set<string>();
  const uniqueList: string[] = [];
  for (const item of inputList) {
    if (!seen.has(item)) {
      uniqueList.push(item);
      seen.add(item);
    }
  }
  return uniqueList;
}

export function convertToMarkdownV2(
  outputData: Record<string, unknown>,
  gfmSupported: boolean = true,
  incrementalReview?: string,
  gitProvider?: unknown,
  files?: unknown[]
): string {
  const emojis: Record<string, string> = {
    'Can be split': '🔀',
    'Key issues to review': '⚡',
    'Recommended focus areas for review': '⚡',
    'Score': '🏅',
    'Relevant tests': '🧪',
    'Focused PR': '✨',
    'Relevant ticket': '🎫',
    'Security concerns': '🔒',
    'Todo sections': '📝',
    'Insights from user\'s answers': '📝',
    'Code feedback': '🤖',
    'Estimated effort to review [1-5]': '⏱️',
    'Contribution time cost estimate': '⏳',
    'Ticket compliance check': '🎫',
  };

  let markdownText = '';
  if (!incrementalReview) {
    markdownText += `${PRReviewHeader.REGULAR} 🔍\n\n`;
  } else {
    markdownText += `${PRReviewHeader.INCREMENTAL} 🔍\n\n`;
    markdownText += `⏮️ Review for commits since previous PR-Agent review ${incrementalReview}.\n\n`;
  }

  if (!outputData || !isRecord(outputData.review)) {
    return '';
  }

  const review = outputData.review as Record<string, unknown>;
  if (getSettings().get('pr_reviewer.enable_intro_text')) {
    markdownText += 'Here are some key observations to aid the review process:\n\n';
  }

  if (gfmSupported) {
    markdownText += '<table>\n';
  }

  const todoSummary = review['todo_summary'] as string | undefined;
  delete review['todo_summary'];

  for (const [key, value] of Object.entries(review)) {
    if (value === null || value === '' || (isRecord(value) && Object.keys(value).length === 0) || (Array.isArray(value) && value.length === 0)) {
      if (!['can_be_split', 'key_issues_to_review'].includes(key.toLowerCase())) {
        continue;
      }
    }

    let keyNice = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const emoji = emojis[keyNice] ?? '';

    if (keyNice.includes('Estimated effort to review')) {
      keyNice = 'Estimated effort to review';
      let valueStr = String(value).trim();
      let valueInt: number;
      if (/^\d+$/.test(valueStr)) {
        valueInt = parseInt(valueStr, 10);
      } else {
        try {
          valueInt = parseInt(valueStr.split(',')[0], 10);
        } catch {
          continue;
        }
      }
      const blueBars = '🔵'.repeat(valueInt);
      const whiteBars = '⚪'.repeat(5 - valueInt);
      const displayValue = `${valueInt} ${blueBars}${whiteBars}`;
      if (gfmSupported) {
        markdownText += `<tr><td>${emoji}&nbsp;<strong>${keyNice}</strong>: ${displayValue}</td></tr>\n`;
      } else {
        markdownText += `### ${emoji} ${keyNice}: ${displayValue}\n\n`;
      }
    } else if (keyNice.toLowerCase().includes('relevant tests')) {
      const valueStr = String(value).trim().toLowerCase();
      if (gfmSupported) {
        markdownText += '<tr><td>';
        if (isValueNo(valueStr)) {
          markdownText += `${emoji}&nbsp;<strong>No relevant tests</strong>`;
        } else {
          markdownText += `${emoji}&nbsp;<strong>PR contains tests</strong>`;
        }
        markdownText += '</td></tr>\n';
      } else {
        if (isValueNo(valueStr)) {
          markdownText += `### ${emoji} No relevant tests\n\n`;
        } else {
          markdownText += `### ${emoji} PR contains tests\n\n`;
        }
      }
    } else if (keyNice.toLowerCase().includes('ticket compliance check')) {
      markdownText = ticketMarkdownLogic(emoji, markdownText, value, gfmSupported);
    } else if (keyNice.toLowerCase().includes('contribution time cost estimate')) {
      const v = value as Record<string, string>;
      if (gfmSupported) {
        markdownText += `<tr><td>${emoji}&nbsp;<strong>Contribution time estimate</strong> (best, average, worst case): `;
        markdownText += `${v['best_case'].replace('m', ' minutes')} | ${v['average_case'].replace('m', ' minutes')} | ${v['worst_case'].replace('m', ' minutes')}`;
        markdownText += '</td></tr>\n';
      } else {
        markdownText += `### ${emoji} Contribution time estimate (best, average, worst case): `;
        markdownText += `${v['best_case'].replace('m', ' minutes')} | ${v['average_case'].replace('m', ' minutes')} | ${v['worst_case'].replace('m', ' minutes')}\n\n`;
      }
    } else if (keyNice.toLowerCase().includes('security concerns')) {
      if (gfmSupported) {
        markdownText += '<tr><td>';
        if (isValueNo(value)) {
          markdownText += `${emoji}&nbsp;<strong>No security concerns identified</strong>`;
        } else {
          markdownText += `${emoji}&nbsp;<strong>Security concerns</strong><br><br>\n\n`;
          const val = emphasizeHeader(String(value).trim());
          markdownText += val;
        }
        markdownText += '</td></tr>\n';
      } else {
        if (isValueNo(value)) {
          markdownText += `### ${emoji} No security concerns identified\n\n`;
        } else {
          markdownText += `### ${emoji} Security concerns\n\n`;
          const val = emphasizeHeader(String(value).trim(), true);
          markdownText += `${val}\n\n`;
        }
      }
    } else if (keyNice.toLowerCase().includes('todo sections')) {
      if (gfmSupported) {
        markdownText += '<tr><td>';
        if (isValueNo(value)) {
          markdownText += `✅&nbsp;<strong>No TODO sections</strong>`;
        } else {
          const todoItems = formatTodoItems(value, gitProvider, gfmSupported);
          markdownText += `${emoji}&nbsp;<strong>TODO sections</strong>\n<br><br>\n`;
          markdownText += todoItems;
        }
        markdownText += '</td></tr>\n';
      } else {
        if (isValueNo(value)) {
          markdownText += `### ✅ No TODO sections\n\n`;
        } else {
          const todoItems = formatTodoItems(value, gitProvider, gfmSupported);
          markdownText += `### ${emoji} TODO sections\n\n`;
          markdownText += todoItems;
        }
      }
    } else if (keyNice.toLowerCase().includes('can be split')) {
      if (gfmSupported) {
        markdownText += `<tr><td>`;
        markdownText += processCanBeSplit(emoji, value);
        markdownText += `</td></tr>\n`;
      }
    } else if (keyNice.toLowerCase().includes('key issues to review')) {
      if (isValueNo(value)) {
        if (gfmSupported) {
          markdownText += `<tr><td>${emoji}&nbsp;<strong>No major issues detected</strong></td></tr>\n`;
        } else {
          markdownText += `### ${emoji} No major issues detected\n\n`;
        }
      } else {
        const issues = value as Array<Record<string, unknown>>;
        if (gfmSupported) {
          markdownText += `<tr><td>`;
          markdownText += `${emoji}&nbsp;<strong>Recommended focus areas for review</strong><br><br>\n\n`;
        } else {
          markdownText += `### ${emoji} Recommended focus areas for review\n\n#### \n`;
        }
        for (const issue of issues) {
          try {
            if (!issue || !isRecord(issue)) continue;
            const relevantFile = String(issue['relevant_file'] ?? '').trim();
            let issueHeader = String(issue['issue_header'] ?? '').trim();
            if (issueHeader.toLowerCase() === 'possible bug') {
              issueHeader = 'Possible Issue';
            }
            const issueContent = String(issue['issue_content'] ?? '').trim();
            const startLine = parseInt(String(issue['start_line'] ?? '0').trim(), 10);
            const endLine = parseInt(String(issue['end_line'] ?? '0').trim(), 10);

            let relevantLinesStr = extractRelevantLinesStr(endLine, files, relevantFile, startLine, true);
            let referenceLink: string | undefined;
            if (gitProvider && typeof (gitProvider as Record<string, unknown>).getLineLink === 'function') {
              referenceLink = (gitProvider as Record<string, (arg1: string, arg2: number, arg3: number) => string>).getLineLink(relevantFile, startLine, endLine);
            }

            let issueStr: string;
            if (gfmSupported) {
              if (referenceLink && referenceLink.length > 0) {
                if (relevantLinesStr) {
                  issueStr = `<details><summary><a href='${referenceLink}'><strong>${issueHeader}</strong></a>\n\n${issueContent}\n</summary>\n\n${relevantLinesStr}\n\n</details>`;
                } else {
                  issueStr = `<a href='${referenceLink}'><strong>${issueHeader}</strong></a><br>${issueContent}`;
                }
              } else {
                issueStr = `<strong>${issueHeader}</strong><br>${issueContent}`;
              }
            } else {
              if (referenceLink && referenceLink.length > 0) {
                issueStr = `[**${issueHeader}**](${referenceLink})\n\n${issueContent}\n\n`;
              } else {
                issueStr = `**${issueHeader}**\n\n${issueContent}\n\n`;
              }
            }
            markdownText += `${issueStr}\n\n`;
          } catch (e) {
            getLogger().exception(`Failed to process 'Recommended focus areas for review': ${e}`);
          }
        }
        if (gfmSupported) {
          markdownText += '</td></tr>\n';
        }
      }
    } else {
      if (gfmSupported) {
        markdownText += `<tr><td>${emoji}&nbsp;<strong>${keyNice}</strong>: ${value}</td></tr>\n`;
      } else {
        markdownText += `### ${emoji} ${keyNice}: ${value}\n\n`;
      }
    }
  }

  if (gfmSupported) {
    markdownText += '</table>\n';
  }

  return markdownText;
}

export function extractRelevantLinesStr(
  endLine: number,
  files: unknown[] | undefined,
  relevantFile: string,
  startLine: number,
  useDedent?: boolean
): string {
  try {
    let relevantLinesStr = '';
    if (files) {
      const langFiles = setFileLanguages(files as any[]) as any[];
      for (const file of langFiles) {
        if (file.filename?.trim() === relevantFile) {
          if (!file.head_file) {
            const patch = file.patch;
            getLogger().info(`No content found in file: '${file.filename}' for 'extractRelevantLinesStr'. Using patch instead`);
            const [_, selectedLines] = extractHunkLinesFromPatch(patch, file.filename, startLine, endLine, 'right');
            if (!selectedLines) {
              getLogger().error(`Failed to extract relevant lines from patch: ${file.filename}`);
              return '';
            }
            relevantLinesStr = '';
            for (const line of selectedLines.split('\n')) {
              if (line.startsWith('-')) continue;
              relevantLinesStr += line.slice(1) + '\n';
            }
          } else {
            const fileLines = file.head_file.split('\n');
            relevantLinesStr = fileLines.slice(startLine - 1, endLine).join('\n');
          }

          if (useDedent && relevantLinesStr) {
            relevantLinesStr = dedentText(relevantLinesStr);
          }
          relevantLinesStr = `\`\`\`${file.language ?? ''}\n${relevantLinesStr}\n\`\`\``;
          break;
        }
      }
    }
    return relevantLinesStr;
  } catch (e) {
    getLogger().exception(`Failed to extract relevant lines: ${e}`);
    return '';
  }
}

export function ticketMarkdownLogic(emoji: string, markdownText: string, value: unknown, gfmSupported: boolean): string {
  let ticketComplianceStr = '';
  let complianceEmoji = '';
  const allComplianceLevels: string[] = [];

  if (Array.isArray(value)) {
    for (const ticketAnalysis of value) {
      try {
        const ticketUrl = String(ticketAnalysis['ticket_url'] ?? '').trim();
        let explanation = '';
        let ticketComplianceLevel = '';
        const fullyCompliantStr = String(ticketAnalysis['fully_compliant_requirements'] ?? '').trim();
        const notCompliantStr = String(ticketAnalysis['not_compliant_requirements'] ?? '').trim();
        const requiresFurtherHumanVerification = String(ticketAnalysis['requires_further_human_verification'] ?? '').trim();

        if (!fullyCompliantStr && !notCompliantStr) {
          getLogger().debug(`Ticket compliance has no requirements`, { artifact: { ticket_url: ticketUrl } });
          continue;
        }

        if (fullyCompliantStr) {
          if (notCompliantStr) {
            ticketComplianceLevel = 'Partially compliant';
          } else {
            ticketComplianceLevel = requiresFurtherHumanVerification ? 'PR Code Verified' : 'Fully compliant';
          }
        } else if (notCompliantStr) {
          ticketComplianceLevel = 'Not compliant';
        }

        if (ticketComplianceLevel) {
          allComplianceLevels.push(ticketComplianceLevel);
        }

        if (fullyCompliantStr) {
          explanation += `Compliant requirements:\n\n${fullyCompliantStr}\n\n`;
        }
        if (notCompliantStr) {
          explanation += `Non-compliant requirements:\n\n${notCompliantStr}\n\n`;
        }
        if (requiresFurtherHumanVerification) {
          explanation += `Requires further human verification:\n\n${requiresFurtherHumanVerification}\n\n`;
        }
        const ticketId = ticketUrl.split('/').pop() ?? ticketUrl;
        ticketComplianceStr += `\n\n**[${ticketId}](${ticketUrl}) - ${ticketComplianceLevel}**\n\n${explanation}\n\n`;

        if (requiresFurtherHumanVerification) {
          getLogger().debug(`Ticket compliance requires further human verification`, {
            artifact: { ticket_url: ticketUrl, requires_further_human_verification: requiresFurtherHumanVerification, compliance_level: ticketComplianceLevel },
          });
        }
      } catch (e) {
        getLogger().exception(`Failed to process ticket compliance: ${e}`);
        continue;
      }
    }

    let complianceLevel = '';
    if (allComplianceLevels.length > 0) {
      if (allComplianceLevels.every(l => l === 'Fully compliant')) {
        complianceLevel = 'Fully compliant';
        complianceEmoji = '✅';
      } else if (allComplianceLevels.every(l => l === 'PR Code Verified')) {
        complianceLevel = 'PR Code Verified';
        complianceEmoji = '✅';
      } else if (allComplianceLevels.some(l => l === 'Not compliant')) {
        if (allComplianceLevels.some(l => l === 'Fully compliant' || l === 'PR Code Verified')) {
          complianceLevel = 'Partially compliant';
          complianceEmoji = '🔶';
        } else {
          complianceLevel = 'Not compliant';
          complianceEmoji = '❌';
        }
      } else if (allComplianceLevels.some(l => l === 'Partially compliant')) {
        complianceLevel = 'Partially compliant';
        complianceEmoji = '🔶';
      } else {
        complianceLevel = 'PR Code Verified';
        complianceEmoji = '✅';
      }
      getSettings().set('config.extra_statistics', { compliance_level: complianceLevel });
    }

    if (gfmSupported) {
      markdownText += `<tr><td>\n\n`;
      markdownText += `**${emoji} Ticket compliance analysis ${complianceEmoji}**\n\n`;
      markdownText += ticketComplianceStr;
      markdownText += `</td></tr>\n`;
    } else {
      markdownText += `### ${emoji} Ticket compliance analysis ${complianceEmoji}\n\n`;
      markdownText += ticketComplianceStr + '\n\n';
    }
  }

  return markdownText;
}

export function processCanBeSplit(emoji: string, value: unknown): string {
  try {
    const keyNice = 'Multiple PR themes';
    let markdownText = '';
    if (!value || (Array.isArray(value) && value.length === 1)) {
      markdownText += `${emoji} <strong>No multiple PR themes</strong>\n\n`;
    } else {
      markdownText += `${emoji} <strong>${keyNice}</strong><br><br>\n\n`;
      const splits = value as Array<Record<string, unknown>>;
      for (const split of splits) {
        const title = String(split['title'] ?? '');
        const relevantFiles = split['relevant_files'] as string[] ?? [];
        markdownText += `<details><summary>\nSub-PR theme: <b>${title}</b></summary>\n\n`;
        markdownText += `___\n\nRelevant files:\n\n`;
        for (const file of relevantFiles) {
          markdownText += `- ${file}\n`;
        }
        markdownText += `___\n\n`;
        markdownText += `</details>\n\n`;
      }
    }
    return markdownText;
  } catch (e) {
    getLogger().exception(`Failed to process can be split: ${e}`);
    return '';
  }
}

export function parseCodeSuggestion(codeSuggestion: Record<string, unknown>, i: number = 0, gfmSupported: boolean = true): string {
  let markdownText = '';
  if (gfmSupported && 'relevant_line' in codeSuggestion) {
    markdownText += '<table>';
    for (const [subKey, subValue] of Object.entries(codeSuggestion)) {
      try {
        if (subKey.toLowerCase() === 'relevant_file') {
          const relevantFile = String(subValue).replace(/^[`"']+|[`"']+$/g, '');
          markdownText += `<tr><td>relevant file</td><td>${relevantFile}</td></tr>`;
        } else if (subKey.toLowerCase() === 'suggestion') {
          markdownText += `<tr><td>${subKey} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td><td>\n\n<strong>\n\n${String(subValue).trim()}\n\n</strong>\n</td></tr>`;
        } else if (subKey.toLowerCase() === 'relevant_line') {
          markdownText += `<tr><td>relevant line</td>`;
          const subValueList = String(subValue).split('](');
          let relevantLine = subValueList[0].replace(/^`/, '').replace(/^\[/, '');
          if (subValueList.length > 1) {
            const link = subValueList[1].replace(/\)$/, '').replace(/`/g, '');
            markdownText += `<td><a href='${link}'>${relevantLine}</a></td>`;
          } else {
            markdownText += `<td>${relevantLine}</td>`;
          }
          markdownText += '</tr>';
        }
      } catch (e) {
        getLogger().exception(`Failed to parse code suggestion: ${e}`);
      }
    }
    markdownText += '</table>';
    markdownText += '<hr>';
  } else {
    for (const [subKey, subValue] of Object.entries(codeSuggestion)) {
      const sk = typeof subKey === 'string' ? subKey.trimEnd() : subKey;
      let sv = typeof subValue === 'string' ? subValue.trimEnd() : subValue;
      if (isRecord(sv)) {
        markdownText += `  - **${sk}:**\n`;
        for (const [codeKey, codeValue] of Object.entries(sv)) {
          const codeStr = `\`\`\`\n${codeValue}\n\`\`\``;
          const indented = '        ' + codeStr.split('\n').join('\n        ');
          markdownText += `    - **${codeKey}:**\n${indented}\n`;
        }
      } else {
        if (String(sk).toLowerCase().includes('relevant_file')) {
          markdownText += `\n  - **${sk}:** ${sv}  \n`;
        } else {
          markdownText += `   **${sk}:** ${sv}  \n`;
        }
        if (!String(sk).toLowerCase().includes('relevant_line')) {
          markdownText = markdownText.replace(/\n$/, '') + '   \n';
        }
      }
    }
    markdownText += '\n';
  }
  return markdownText;
}

export function tryFixJson(review: string, maxIter: number = 10, codeSuggestions: boolean = false): unknown {
  if (review.endsWith('}')) {
    return fixJsonEscapeChar(review);
  }

  let data: unknown = {};
  const closingBracket = codeSuggestions ? ']}' : ']}}';

  if (
    review.lastIndexOf("'Code feedback': [") > 0 ||
    review.lastIndexOf('"Code feedback": [') > 0 ||
    review.lastIndexOf("'Code suggestions': [") > 0 ||
    review.lastIndexOf('"Code suggestions": [') > 0
  ) {
    const regex = /\}\s*,/g;
    const matches: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(review)) !== null) {
      matches.push(match.index + match[0].length);
    }
    if (matches.length === 0) return data;
    let lastCodeSuggestionInd = matches[matches.length - 1] - 1;
    let validJson = false;
    let iterCount = 0;

    while (lastCodeSuggestionInd > 0 && !validJson && iterCount < maxIter) {
      try {
        data = JSON.parse(review.slice(0, lastCodeSuggestionInd) + closingBracket);
        validJson = true;
        review = review.slice(0, lastCodeSuggestionInd).trim() + closingBracket;
      } catch {
        review = review.slice(0, lastCodeSuggestionInd);
        const innerMatches: number[] = [];
        const innerRegex = /\}\s*,/g;
        let innerMatch: RegExpExecArray | null;
        while ((innerMatch = innerRegex.exec(review)) !== null) {
          innerMatches.push(innerMatch.index + innerMatch[0].length);
        }
        if (innerMatches.length === 0) break;
        lastCodeSuggestionInd = innerMatches[innerMatches.length - 1] - 1;
        iterCount++;
      }
    }

    if (!validJson) {
      getLogger().error('Unable to decode JSON response from AI');
      data = {};
    }
  }

  return data;
}

export function fixJsonEscapeChar(jsonMessage?: string): unknown {
  try {
    return JSON.parse(jsonMessage!);
  } catch (e: unknown) {
    const msg = (e as Error).message;
    const parts = msg.split(' ');
    const lastPart = parts[parts.length - 1].replace(')', '');
    const idxToReplace = parseInt(lastPart, 10);
    if (isNaN(idxToReplace)) return {};
    const chars = jsonMessage!.split('');
    chars[idxToReplace] = ' ';
    return fixJsonEscapeChar(chars.join(''));
  }
}

export function convertStrToDatetime(dateStr: string): Date {
  return new Date(dateStr);
}

export function loadLargeDiff(filename: string, newFileContentStr: string, originalFileContentStr: string, showWarning: boolean = true): string {
  if (!originalFileContentStr && !newFileContentStr) {
    return '';
  }

  try {
    const orig = ((originalFileContentStr ?? '') + '\n').trimEnd() + '\n';
    const newStr = ((newFileContentStr ?? '') + '\n').trimEnd() + '\n';
    const diff = simpleUnifiedDiff(orig, newStr);
    const verbosity = getSettings().get('config.verbosity_level') as number ?? 0;
    if (verbosity >= 2 && showWarning) {
      getLogger().info(`File was modified, but no patch was found. Manually creating patch: ${filename}.`);
    }
    return diff;
  } catch (e) {
    getLogger().exception(`Failed to generate patch for file: ${filename}`);
    return '';
  }
}

export function updateSettingsFromArgs(args: string[]): string[] {
  const otherArgs: string[] = [];
  if (args) {
    for (const arg of args) {
      const trimmed = arg.trim();
      if (trimmed.startsWith('--')) {
        const withoutDash = trimmed.replace(/^--+/, '').trim();
        const vals = withoutDash.split('=', 2);
        if (vals.length !== 2) {
          if (vals.length > 2) {
            getLogger().error(`Invalid argument format: ${arg}`);
          }
          otherArgs.push(arg);
          continue;
        }
        const [key, value] = _fixKeyValue(vals[0], vals[1]);
        getSettings().set(key, value);
        getLogger().info(`Updated setting ${key} to: "${value}"`);
      } else {
        otherArgs.push(arg);
      }
    }
  }
  return otherArgs;
}

export function _fixKeyValue(key: string, value: string): [string, unknown] {
  key = key.trim().toUpperCase();
  value = value.trim();
  let parsedValue: unknown = value;
  try {
    parsedValue = yaml.load(value);
  } catch (e) {
    getLogger().debug(`Failed to parse YAML for config override ${key}=${value}`, { exc_info: e });
  }
  return [key, parsedValue];
}

export function loadYaml(responseText: string, keysFixYaml: string[] = [], firstKey: string = '', lastKey: string = ''): unknown {
  const responseTextOriginal = responseText;
  responseText = responseText
    .replace(/^yaml/, '')
    .replace(/^```yaml/, '')
    .trimEnd()
    .replace(/```$/, '')
    .trim();
  try {
    return yaml.load(responseText);
  } catch (e) {
    getLogger().warning(`Initial failure to parse AI prediction: ${e}`);
    const data = tryFixYaml(responseText, keysFixYaml, firstKey, lastKey, responseTextOriginal);
    if (!data) {
      getLogger().error(`Failed to parse AI prediction after fallbacks`, { artifact: { response_text: responseText } });
    } else {
      getLogger().info(`Successfully parsed AI prediction after fallbacks`, { artifact: { response_text: responseText } });
    }
    return data;
  }
}

export function tryFixYaml(
  responseText: string,
  keysFixYaml: string[] = [],
  firstKey: string = '',
  lastKey: string = '',
  responseTextOriginal: string = ''
): unknown {
  const responseTextLines = responseText.split('\n');

  const keysYaml = [
    'relevant line:', 'suggestion content:', 'relevant file:', 'existing code:',
    'improved code:', 'label:', 'why:', 'suggestion_summary:',
    ...keysFixYaml,
  ];

  // first fallback - try to convert 'relevant line: ...' to 'relevant line: |-\n        ...'
  let responseTextLinesCopy = [...responseTextLines];
  for (let i = 0; i < responseTextLinesCopy.length; i++) {
    for (const key of keysYaml) {
      if (responseTextLinesCopy[i].includes(key) && !responseTextLinesCopy[i].includes('|')) {
        responseTextLinesCopy[i] = responseTextLinesCopy[i].replace(key, `${key} |\n        `);
      }
    }
  }
  try {
    const data = yaml.load(responseTextLinesCopy.join('\n'));
    getLogger().info(`Successfully parsed AI prediction after adding |-\n`);
    return data;
  } catch {
    // continue
  }

  // 1.5 fallback - try to convert '|' to '|2'
  let responseTextCopy = responseText.replace(/\|\n/g, '|2\n');
  try {
    const data = yaml.load(responseTextCopy);
    getLogger().info(`Successfully parsed AI prediction after replacing | with |2`);
    return data;
  } catch {
    responseTextLinesCopy = responseTextCopy.split('\n');
    for (let i = 0; i < responseTextLinesCopy.length; i++) {
      const initialSpace = responseTextLinesCopy[i].length - responseTextLinesCopy[i].trimStart().length;
      if (initialSpace === 2 && !responseTextLinesCopy[i].includes('|2') && responseTextLinesCopy[i].includes('}')) {
        responseTextLinesCopy[i] = '    ' + responseTextLinesCopy[i].trimStart();
      }
    }
    try {
      const data = yaml.load(responseTextLinesCopy.join('\n'));
      getLogger().info(`Successfully parsed AI prediction after replacing | with |2 and adding spaces`);
      return data;
    } catch {
      // continue
    }
  }

  // second fallback - extract yaml snippet
  const snippetPattern = /```yaml([\s\S]*?)```(?=\s*$|")/;
  let snippet = snippetPattern.exec(responseTextLinesCopy.join('\n'));
  if (!snippet && responseTextOriginal) {
    snippet = snippetPattern.exec(responseTextOriginal);
  }
  if (snippet) {
    let snippetText = snippet[0];
    try {
      const data = yaml.load(snippetText.replace(/^```yaml/, '').replace(/`+$/, ''));
      getLogger().info(`Successfully parsed AI prediction after extracting yaml snippet`);
      return data;
    } catch {
      // continue
    }
  }

  // third fallback - remove leading/trailing curly brackets
  responseTextCopy = responseText.trim().replace(/^{/, '').replace(/}$/, '').replace(/:+\n*$/, '');
  try {
    const data = yaml.load(responseTextCopy);
    getLogger().info(`Successfully parsed AI prediction after removing curly brackets`);
    return data;
  } catch {
    // continue
  }

  // forth fallback - extract by first_key and last_key
  if (firstKey && lastKey) {
    let indexStart = responseText.indexOf(`\n${firstKey}:`);
    if (indexStart === -1) {
      indexStart = responseText.indexOf(`${firstKey}:`);
    }
    const indexLastCode = responseText.lastIndexOf(`${lastKey}:`);
    let indexEnd = responseText.indexOf('\n\n', indexLastCode);
    if (indexEnd === -1) {
      indexEnd = responseText.length;
    }
    let extracted = responseText.slice(indexStart, indexEnd).trim().replace(/^```yaml/, '').replace(/`+$/, '').trim();
    if (extracted) {
      try {
        const data = yaml.load(extracted);
        getLogger().info(`Successfully parsed AI prediction after extracting yaml snippet`);
        return data;
      } catch {
        // continue
      }
    }
  }

  // fifth fallback - remove leading '+'
  responseTextLinesCopy = responseTextLines.map(line => {
    if (line.startsWith('+')) {
      return ' ' + line.slice(1);
    }
    return line;
  });
  try {
    const data = yaml.load(responseTextLinesCopy.join('\n'));
    getLogger().info(`Successfully parsed AI prediction after removing leading '+'`);
    return data;
  } catch {
    // continue
  }

  // sixth fallback - replace tabs with spaces
  if (responseText.includes('\t')) {
    responseTextCopy = responseText.replace(/\t/g, '    ');
    try {
      const data = yaml.load(responseTextCopy);
      getLogger().info(`Successfully parsed AI prediction after replacing tabs with spaces`);
      return data;
    } catch {
      // continue
    }
  }

  // seventh fallback - add indent for sections of code blocks
  responseTextCopy = responseText;
  let responseTextCopyLines = responseTextCopy.split('\n');
  const improveSections = ['existing_code:', 'improved_code:', 'response:', 'why:'];
  const describeSections = ['description:', 'title:', 'changes_diagram:', 'pr_files:', 'pr_ticket:'];
  const allSections = [...improveSections, ...describeSections];
  let startLine = -1;
  for (let i = 0; i < responseTextCopyLines.length; i++) {
    const lineStripped = responseTextCopyLines[i].trimEnd();
    if (allSections.some(key => lineStripped.includes(key))) {
      startLine = i;
    } else if (
      lineStripped.endsWith(': |') ||
      lineStripped.endsWith(': |-') ||
      lineStripped.endsWith(': |2') ||
      keysYaml.some(key => lineStripped.endsWith(key))
    ) {
      startLine = -1;
    } else if (startLine !== -1) {
      responseTextCopyLines[i] = '    ' + responseTextCopyLines[i];
    }
  }
  responseTextCopy = responseTextCopyLines.join('\n').replace(/ \|\n/g, ' |2\n');
  try {
    const data = yaml.load(responseTextCopy);
    getLogger().info(`Successfully parsed AI prediction after adding indent for sections of code blocks`);
    return data;
  } catch {
    // continue
  }

  // eighth fallback - remove pipe chars at the root-level dicts
  responseTextCopy = responseText.replace(/^\|+\n/, '');
  try {
    const data = yaml.load(responseTextCopy);
    getLogger().info(`Successfully parsed AI prediction after removing pipe chars`);
    return data;
  } catch {
    // continue
  }

  // ninth fallback - try different encodings
  const encodingsToTry = ['latin-1', 'utf-16le'];
  for (const encoding of encodingsToTry) {
    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(responseText);
      const decoder = new TextDecoder(encoding);
      const decoded = decoder.decode(bytes);
      const data = yaml.load(decoded);
      if (data) {
        getLogger().info(`Successfully parsed AI prediction after decoding with ${encoding} encoding`);
        return data;
      }
    } catch {
      // continue
    }
  }

  return null;
}

export function setCustomLabels(variables: Record<string, unknown>, gitProvider?: unknown): void {
  if (!getSettings().get('config.enable_custom_labels')) {
    return;
  }

  const labels = getSettings().get('custom_labels') as Record<string, { description: string }> | undefined;
  if (!labels || Object.keys(labels).length === 0) {
    const defaultLabels = ['Bug fix', 'Tests', 'Bug fix with tests', 'Enhancement', 'Documentation', 'Other'];
    const labelsList = defaultLabels.map(l => `      - ${l}`).join('\n');
    variables['custom_labels'] = labelsList;
    return;
  }

  let customLabelsClass = 'class Label(str, Enum):';
  const labelsMinimalToLabelsDict: Record<string, string> = {};
  let counter = 0;
  for (const [k, v] of Object.entries(labels)) {
    const description = "'" + v.description.trim().replace(/\n/g, '\\n') + "'";
    customLabelsClass += `\n    ${k.toLowerCase().replace(/ /g, '_')} = ${description}`;
    labelsMinimalToLabelsDict[k.toLowerCase().replace(/ /g, '_')] = k;
    counter++;
  }
  variables['custom_labels_class'] = customLabelsClass;
  variables['labels_minimal_to_labels_dict'] = labelsMinimalToLabelsDict;
}

export function getUserLabels(currentLabels: string[] = []): string[] {
  try {
    const enableCustomLabels = (getSettings().get('config.enable_custom_labels') as boolean) ?? false;
    const customLabels = (getSettings().get('custom_labels') as Record<string, unknown>) ?? {};
    const userLabels: string[] = [];
    for (const label of currentLabels) {
      if (['bug fix', 'tests', 'enhancement', 'documentation', 'other'].includes(label.toLowerCase())) {
        continue;
      }
      if (enableCustomLabels) {
        if (label in customLabels) {
          continue;
        }
      }
      userLabels.push(label);
    }
    if (userLabels.length > 0) {
      getLogger().debug(`Keeping user labels: ${userLabels}`);
    }
    return userLabels;
  } catch (e) {
    getLogger().exception(`Failed to get user labels: ${e}`);
    return currentLabels;
  }
}

export function getMaxTokens(model: string): number {
  const settings = getSettings();
  let maxTokensModel: number;

  if (model in MAX_TOKENS) {
    maxTokensModel = MAX_TOKENS[model];
  } else {
    const customMax = settings.get('config.custom_model_max_tokens') as number ?? 0;
    if (customMax > 0) {
      maxTokensModel = customMax;
    } else {
      const errorMsg = `Model ${model} is not defined in MAX_TOKENS and no custom_model_max_tokens is set`;
      getLogger().error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  const maxModelTokens = settings.get('config.max_model_tokens') as number ?? 0;
  if (maxModelTokens > 0) {
    maxTokensModel = Math.min(maxModelTokens, maxTokensModel);
  }
  return maxTokensModel;
}

export function clipTokens(
  text: string,
  maxTokens: number,
  addThreeDots: boolean = true,
  numInputTokens?: number,
  deleteLastLine: boolean = false
): string {
  if (!text) {
    return text;
  }

  try {
    let inputTokens: number;
    if (numInputTokens === undefined) {
      const encoder = encodingForModel('gpt-4' as any);
      inputTokens = encoder.encode(text).length;
    } else {
      inputTokens = numInputTokens;
    }

    if (inputTokens <= maxTokens) {
      return text;
    }
    if (maxTokens < 0) {
      return '';
    }

    const numChars = text.length;
    const charsPerToken = numChars / inputTokens;
    const factor = 0.9;
    const numOutputChars = Math.floor(factor * charsPerToken * maxTokens);

    if (numOutputChars > 0) {
      let clippedText = text.slice(0, numOutputChars);
      if (deleteLastLine) {
        const lastNewline = clippedText.lastIndexOf('\n');
        if (lastNewline !== -1) {
          clippedText = clippedText.slice(0, lastNewline);
        }
      }
      if (addThreeDots) {
        clippedText += '\n...(truncated)';
      }
      return clippedText;
    }
    return '';
  } catch (e) {
    getLogger().warning(`Failed to clip tokens: ${e}`);
    return text;
  }
}

export function replaceCodeTags(text: string): string {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const parts = escaped.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = '<code>' + parts[i] + '</code>';
  }
  return parts.join('');
}

export function findLineNumberOfRelevantLineInFile(
  diffFiles: any[],
  relevantFile: string,
  relevantLineInFile: string,
  absolutePosition?: number
): [number, number] {
  let position = -1;
  if (absolutePosition === undefined) {
    absolutePosition = -1;
  }

  if (!diffFiles) {
    return [position, absolutePosition];
  }

  for (const file of diffFiles) {
    if (file.filename && file.filename.trim() === relevantFile) {
      const patch = file.patch;
      const patchLines = patch.split('\n');
      let delta = 0;
      let start1 = 0, size1 = 0, start2 = 0, size2 = 0;

      if (absolutePosition !== -1) {
        for (let i = 0; i < patchLines.length; i++) {
          const line = patchLines[i];
          if (line.startsWith('@@')) {
            delta = 0;
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
              const groups = [...match];
              for (let g = 0; g < groups.length; g++) {
                if (groups[g] === undefined) groups[g] = '0';
              }
              start1 = parseInt(groups[1], 10);
              size1 = parseInt(groups[2] || '1', 10);
              start2 = parseInt(groups[3], 10);
              size2 = parseInt(groups[4] || '1', 10);
            }
          } else if (!line.startsWith('-')) {
            delta += 1;
          }

          const absolutePositionCurr = start2 + delta - 1;
          if (absolutePositionCurr === absolutePosition) {
            position = i;
            break;
          }
        }
      } else {
        const matches = getCloseMatches(relevantLineInFile, patchLines, 3, 0.93);
        if (matches.length === 1 && matches[0].startsWith('+')) {
          relevantLineInFile = matches[0];
        }

        for (let i = 0; i < patchLines.length; i++) {
          const line = patchLines[i];
          if (line.startsWith('@@')) {
            delta = 0;
            const match = line.match(RE_HUNK_HEADER);
            if (match) {
              const groups = [...match];
              for (let g = 0; g < groups.length; g++) {
                if (groups[g] === undefined) groups[g] = '0';
              }
              start1 = parseInt(groups[1], 10);
              size1 = parseInt(groups[2] || '1', 10);
              start2 = parseInt(groups[3], 10);
              size2 = parseInt(groups[4] || '1', 10);
            }
          } else if (!line.startsWith('-')) {
            delta += 1;
          }

          if (line.includes(relevantLineInFile) && line[0] !== '-') {
            position = i;
            absolutePosition = start2 + delta - 1;
            break;
          }
        }

        if (position === -1 && relevantLineInFile[0] === '+') {
          const noPlusLine = relevantLineInFile.slice(1).trimStart();
          for (let i = 0; i < patchLines.length; i++) {
            const line = patchLines[i];
            if (line.startsWith('@@')) {
              delta = 0;
              const match = line.match(RE_HUNK_HEADER);
              if (match) {
                const groups = [...match];
                for (let g = 0; g < groups.length; g++) {
                  if (groups[g] === undefined) groups[g] = '0';
                }
                start1 = parseInt(groups[1], 10);
                size1 = parseInt(groups[2] || '1', 10);
                start2 = parseInt(groups[3], 10);
                size2 = parseInt(groups[4] || '1', 10);
              }
            } else if (!line.startsWith('-')) {
              delta += 1;
            }

            if (line.includes(noPlusLine) && line[0] !== '-') {
              position = i;
              absolutePosition = start2 + delta - 1;
              break;
            }
          }
        }
      }
    }
  }
  return [position, absolutePosition];
}

export function githubActionOutput(data: unknown, key: string): void {
  try {
    if (!getSettings().get('github_action_config.enable_output')) {
      return;
    }

    const keyData = isRecord(data) ? data[key] : {};
    const outputPath = process.env['GITHUB_OUTPUT'];
    if (outputPath) {
      fs.appendFileSync(outputPath, `${key}=${JSON.stringify(keyData)}\n`);
    }
  } catch (e) {
    getLogger().error(`Failed to write to GitHub Action output: ${e}`);
  }
}

export function showRelevantConfigurations(relevantSection?: string): string {
  const skipKeys = [
    'ai_disclaimer', 'ai_disclaimer_title', 'analytics_folder', 'secret_provider', 'skip_keys',
    'app_id', 'redirect', 'trial_prefix_message', 'no_eligible_message', 'identity_provider',
    'allowed_repos', 'app_name',
  ];
  const extraSkipKeys = getSettings().get('config.skip_keys') as string[] ?? [];
  skipKeys.push(...extraSkipKeys);

  let markdownText = '';
  markdownText += '\n<hr>\n<details> <summary><strong>🛠️ Relevant configurations:</strong></summary> \n\n';
  markdownText += '<br>These are the relevant configurations for this tool:\n\n';
  markdownText += '**[config**]\n```yaml\n\n';

  const configSection = getSettings().config as Record<string, unknown>;
  for (const [key, value] of Object.entries(configSection)) {
    if (skipKeys.includes(key)) continue;
    markdownText += `${key}: ${value}\n`;
  }
  markdownText += '\n```\n';

  if (relevantSection) {
    markdownText += `\n**[${relevantSection}]**\n\`\`\`yaml\n\n`;
    const section = getSettings().get(relevantSection) as Record<string, unknown> ?? {};
    for (const [key, value] of Object.entries(section)) {
      if (skipKeys.includes(key)) continue;
      markdownText += `${key}: ${value}\n`;
    }
    markdownText += '\n```';
  }

  markdownText += '\n</details>\n';
  return markdownText;
}

export function setFileLanguages(files: any[]): any[] {
  try {
    if (files.length > 0 && files[0].language) {
      return files;
    }

    const languageExtensionMapOrg = getSettings().get('language_extension_map_org') as Record<string, string[]> ?? {};
    const extensionToLanguage: Record<string, string> = {};
    for (const [language, extensions] of Object.entries(languageExtensionMapOrg)) {
      for (const ext of extensions) {
        extensionToLanguage[ext] = language;
      }
    }

    for (const file of files) {
      const ext = file.filename ? '.' + file.filename.split('.').pop() : '';
      let langName = 'txt';
      if (ext && ext in extensionToLanguage) {
        langName = extensionToLanguage[ext];
      }
      file.language = langName.toLowerCase();
    }
  } catch (e) {
    getLogger().exception(`Failed to set file languages: ${e}`);
  }

  return files;
}

export function processDescription(description: string): [string, any[]] {
  if (!description) {
    return ['', []];
  }

  let baseDescriptionStr: string;
  let changesWalkthroughStr = '';
  let files: any[] = [];

  if (description.includes(PRDescriptionHeader.FILE_WALKTHROUGH)) {
    try {
      const escapedHeader = PRDescriptionHeader.FILE_WALKTHROUGH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexPattern = new RegExp(
        `<details.*?>\\s*<summary>\\s*<h3>\\s*${escapedHeader}\\s*</h3>\\s*</summary>`,
        's'
      );
      let descriptionSplit = description.split(regexPattern);
      if (descriptionSplit.length === 1) {
        getLogger().debug('Could not find regex pattern for file walkthrough, falling back to simple split');
        descriptionSplit = description.split(PRDescriptionHeader.FILE_WALKTHROUGH, 1);
      }
      if (descriptionSplit.length < 2) {
        getLogger().error('Failed to split description into base and changes walkthrough', { artifact: { description } });
        return [description.trim(), []];
      }
      baseDescriptionStr = descriptionSplit[0].trim();
      changesWalkthroughStr = descriptionSplit.length > 1 ? descriptionSplit[1] : '';
    } catch (e) {
      getLogger().warning(`Failed to split description using regex, falling back to simple split: ${e}`);
      const descSplit = description.split(PRDescriptionHeader.FILE_WALKTHROUGH, 2);
      baseDescriptionStr = descSplit[0].trim();
      if (descSplit.length > 1) {
        changesWalkthroughStr = descSplit[1];
      }
    }
  } else {
    return [description.trim(), []];
  }

  try {
    if (changesWalkthroughStr) {
      if (changesWalkthroughStr.includes('</table>\n\n___')) {
        changesWalkthroughStr = changesWalkthroughStr.slice(0, changesWalkthroughStr.indexOf('</table>\n\n___'));
      } else if (changesWalkthroughStr.includes('\n___')) {
        changesWalkthroughStr = changesWalkthroughStr.slice(0, changesWalkthroughStr.indexOf('\n___'));
      }

      const pattern = /<tr>\s*<td>\s*(<details>\s*<summary>(.*?)<\/summary>(.*?)<\/details>)\s*<\/td>/gs;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(changesWalkthroughStr)) !== null) {
        try {
          const fileData = match[1];
          const innerPattern = /<details>\s*<summary><strong>(.*?)<\/strong>\s*<dd><code>(.*?)<\/code>.*?<\/summary>\s*<hr>\s*(.*?)\s*(?:<li>|•)(.*?)<\/details>/s;
          let res = innerPattern.exec(fileData);
          if (!res || res.length < 5) {
            const backPattern = /<details>\s*<summary><strong>(.*?)<\/strong><dd><code>(.*?)<\/code>.*?<\/summary>\s*<hr>\s*(.*?)\n\n\s*(.*?)<\/details>/s;
            res = backPattern.exec(fileData);
          }
          if (!res || res.length < 5) {
            const hyphenPattern = /<details>\s*<summary><strong>(.*?)<\/strong>\s*<dd><code>(.*?)<\/code>.*?<\/summary>\s*<hr>\s*(.*?)\s*-\s*(.*?)\s*<\/details>/s;
            res = hyphenPattern.exec(fileData);
          }
          if (res && res.length >= 5) {
            let shortFilename = res[1].trim();
            const shortSummary = res[2].trim();
            let longFilename = res[3].trim();
            if (longFilename.endsWith('<ul>')) {
              longFilename = longFilename.slice(0, -4).trim();
            }
            let longSummary = res[4].trim();
            longSummary = longSummary.replace(/<br>\s*\*/g, '\n*').replace(/<br>/g, '').replace(/\n/g, '<br>');
            longSummary = htmlToText(longSummary).trim();
            if (longSummary.startsWith('\\-')) {
              longSummary = '* ' + longSummary.slice(2);
            } else if (!longSummary.startsWith('*')) {
              longSummary = '* ' + longSummary;
            }

            files.push({
              short_file_name: shortFilename,
              full_file_name: longFilename,
              short_summary: shortSummary,
              long_summary: longSummary,
            });
          } else {
            if (!fileData.includes('<code>...</code>')) {
              getLogger().warning(`Failed to parse description`, { artifact: { description: fileData } });
            }
          }
        } catch (e) {
          getLogger().exception(`Failed to process description: ${e}`, { artifact: { description: match[1] } });
        }
      }
    }
  } catch (e) {
    getLogger().exception(`Failed to process description: ${e}`);
  }

  return [baseDescriptionStr, files];
}

export function isValueNo(value: unknown): boolean {
  if (!value) return true;
  const valueStr = String(value).trim().toLowerCase();
  if (valueStr === 'no' || valueStr === 'none' || valueStr === 'false') return true;
  return false;
}

function formatTodoItem(todoItem: TodoItem, gitProvider: unknown, gfmSupported: boolean): string {
  const relevantFile = (todoItem.relevant_file ?? '').trim();
  const lineNumber = (todoItem as unknown as Record<string, unknown>).line_number ?? '';
  const content = todoItem.content ?? '';
  let referenceLink: string | undefined;
  if (gitProvider && typeof (gitProvider as Record<string, unknown>).getLineLink === 'function') {
    referenceLink = (gitProvider as Record<string, (a: string, b: unknown, c: unknown) => string>).getLineLink(
      relevantFile, lineNumber, lineNumber
    );
  }
  let fileRef = `${relevantFile} [${lineNumber}]`;
  if (referenceLink) {
    if (gfmSupported) {
      fileRef = `<a href='${referenceLink}'>${fileRef}</a>`;
    } else {
      fileRef = `[${fileRef}](${referenceLink})`;
    }
  }

  if (content) {
    return `${fileRef}: ${content.trim()}`;
  }
  return fileRef;
}

export function formatTodoItems(value: unknown, gitProvider?: unknown, gfmSupported?: boolean): string {
  let markdownText = '';
  const MAX_ITEMS = 5;

  const items = Array.isArray(value) ? value : [value];

  if (gfmSupported) {
    markdownText += '<ul>\n';
    const truncated = items.length > MAX_ITEMS ? items.slice(0, MAX_ITEMS) : items;
    for (const item of truncated) {
      markdownText += `<li>${formatTodoItem(item as TodoItem, gitProvider, gfmSupported ?? true)}</li>\n`;
    }
    markdownText += '</ul>\n';
  } else {
    const truncated = items.length > MAX_ITEMS ? items.slice(0, MAX_ITEMS) : items;
    for (const item of truncated) {
      markdownText += `- ${formatTodoItem(item as TodoItem, gitProvider, gfmSupported ?? true)}\n`;
    }
  }
  return markdownText;
}
