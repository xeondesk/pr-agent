import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import type { ConfigSettings } from '@pr-agent/types';
import { MAX_TOKENS } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';
import { HelpMessage } from '../servers/help.js';

export function modifyAnswerSection(aiResponse: string): string | null {
  const modelAnswerAndRelevantSources = extractModelAnswerAndRelevantSources(aiResponse);
  if (modelAnswerAndRelevantSources !== null) {
    return '### :bulb: Auto-generated documentation-based answer:\n' + modelAnswerAndRelevantSources;
  }
  console.warn(`Either no answer section found, or that section is malformed: ${aiResponse}`);
  return null;
}

export function extractModelAnswerAndRelevantSources(aiResponse: string): string | null {
  if (aiResponse.includes('### Answer:\n')) {
    const answerAndSources = aiResponse.split('### Answer:\n').pop() || '';
    if (answerAndSources.includes('#### Relevant Sources:\n\n')) {
      const modelAnswerSection = answerAndSources.split('#### Relevant Sources:\n\n')[0];
      console.log(`Found model answer: ${modelAnswerSection}`);
      return modelAnswerSection.length > 0 ? answerAndSources : null;
    }
  }
  console.warn(`Either no answer section found, or that section is malformed: ${aiResponse}`);
  return null;
}

export function getMaximalTextInputLengthForTokenCountEstimation(): number {
  const model = '';
  if (model.includes('claude-3-7-sonnet')) return 900000;
  return Infinity;
}

export function returnDocumentHeadings(text: string, ext: string): string {
  try {
    const lines = text.split('\n');
    const headings = new Set<string>();

    if (!text || !/[a-zA-Z]/.test(text)) {
      console.error('Empty or non text content found.');
      return '';
    }

    if (ext === '.md' || ext === '.mdx') {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          headings.add(trimmed);
        }
      }
    } else if (ext === '.rst') {
      const sectionChars = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
      const markerLines: Array<[number, number]> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        if (line && line.split('').every((c) => c === line[0]) && sectionChars.has(line[0])) {
          markerLines.push([i, line.length]);
        }
      }

      for (const [idx, length] of markerLines) {
        if (idx > 0 && lines[idx - 1].trimEnd() && lines[idx - 1].trimEnd().length <= length) {
          headings.add(lines[idx - 1].trimEnd());
        }
      }
    } else {
      console.error(`Unsupported file extension: ${ext}`);
      return '';
    }

    return Array.from(headings).join('\n');
  } catch (e) {
    console.error('Unexpected exception thrown. Returning empty result.');
    return '';
  }
}

export function mapDocumentationFilesToContents(
  basePath: string,
  docFiles: string[],
  maxAllowedFileLen: number = 5000
): Record<string, string> {
  try {
    const returnedDict: Record<string, string> = {};
    for (const file of docFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        if (!/[a-zA-Z]/.test(content)) continue;
        const trimmedContent = content.length > maxAllowedFileLen
          ? content.slice(0, maxAllowedFileLen)
          : content;
        const filePath = file.replace(basePath, '');
        returnedDict[filePath] = trimmedContent.trim();
      } catch (e: any) {
        console.warn(`Error while reading the file ${file}: ${e.message}`);
        continue;
      }
    }
    if (Object.keys(returnedDict).length === 0) {
      console.error("Couldn't find any usable documentation files. Returning empty dict.");
    }
    return returnedDict;
  } catch (e) {
    console.error('Unexpected exception thrown. Returning empty dict.');
    return {};
  }
}

export function aggregateDocumentationFilesForPromptContents(
  filePathToContents: Record<string, string>,
  returnJustHeadings: boolean = false
): string {
  try {
    let docsPrompt = '';
    let idx = 0;
    for (const filePath of Object.keys(filePathToContents)) {
      const fileContents = filePathToContents[filePath].trim();
      if (!fileContents) {
        console.error(`Got empty file contents for: ${filePath}. Skipping this file.`);
        continue;
      }
      if (returnJustHeadings) {
        const fileHeadings = returnDocumentHeadings(fileContents, path.extname(filePath)).trim();
        if (fileHeadings) {
          docsPrompt += `\n==file name==\n\n${filePath}\n\n==index==\n\n${idx}\n\n==file headings==\n\n${fileHeadings}\n=========\n\n`;
        } else {
          docsPrompt += `\n==file name==\n\n${filePath}\n\n==index==\n\n${idx}\n\n`;
        }
      } else {
        docsPrompt += `\n==file name==\n\n${filePath}\n\n==file content==\n\n${fileContents}\n=========\n\n`;
      }
      idx++;
    }
    return docsPrompt;
  } catch (e) {
    console.error('Unexpected exception thrown. Returning empty result.');
    return '';
  }
}

export function formatMarkdownQAndAResponse(
  questionStr: string,
  responseStr: string,
  relevantSections: Array<Record<string, string>>,
  supportedSuffixes: string[],
  baseUrlPrefix: string,
  baseUrlSuffix: string = ''
): string {
  try {
    const prefix = baseUrlPrefix.replace(/\/+$/, '');
    let answerStr = '';
    answerStr += `### Question: \n${questionStr}\n\n`;
    answerStr += `### Answer:\n${responseStr.trim()}\n\n`;
    answerStr += `#### Relevant Sources:\n\n`;

    for (const section of relevantSections) {
      const file = (section.file_name || '').replace(/^\//, '').trim();
      const extMatch = supportedSuffixes.find((suffix) => file.endsWith(suffix));
      if (!extMatch) {
        console.warn(`Unsupported file extension: ${file}`);
        continue;
      }
      const headerStr = (section.relevant_section_header_string || '').trim();
      if (headerStr) {
        const markdownHeader = formatMarkdownHeader(headerStr);
        if (prefix) {
          answerStr += `> - ${prefix}/${file}${baseUrlSuffix}#${markdownHeader}\n`;
        }
      } else {
        answerStr += `> - ${prefix}/${file}${baseUrlSuffix}\n`;
      }
    }

    return answerStr;
  } catch (e) {
    console.error('Unexpected exception thrown. Returning empty result.');
    return '';
  }
}

export function formatMarkdownHeader(header: string): string {
  try {
    let cleaned = header.replace(/^[#\s💎\n]+|[#\s💎\n]+$/g, '');
    const replacements: Record<string, string> = {
      "'": '', '`': '', '(': '', ')': '', ',': '', '.': '', '?': '', '!': '', ' ': '-',
    };
    const pattern = new RegExp(
      Object.keys(replacements).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'g'
    );
    return cleaned.replace(pattern, (m) => replacements[m] || m).toLowerCase();
  } catch {
    return '';
  }
}

export function cleanMarkdownContent(content: string): string {
  try {
    let cleaned = content.replace(/<!--.*?-->/gs, '');
    cleaned = cleaned.replace(/^---\s*\n[\s\S]*?\n---\s*\n/m, '');
    cleaned = cleaned.replace(/^\+\+\+\s*\n[\s\S]*?\n\+\+\+\s*\n/m, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/<div[^>]*>|<\/div>|<span[^>]*>|<\/span>/gi, '');
    cleaned = cleaned.replace(/!\[(.*?)\]/g, '![]');
    cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
    cleaned = cleaned.replace(
      /<(?!table|tr|td|th|thead|tbody)([a-zA-Z][a-zA-Z0-9]*)[^>]*>([\s\S]*?)<\/\1>/gi,
      '$2'
    );
    return cleaned.trim();
  } catch (e) {
    console.error('Unexpected exception thrown. Returning empty result.');
    return '';
  }
}

export class PredictionPreparator {
  private aiHandler: AIHandler;
  private systemPrompt: string;
  private userPrompt: string;

  constructor(
    aiHandler: AIHandler,
    vars: Record<string, unknown>,
    systemPrompt: string,
    userPrompt: string
  ) {
    this.aiHandler = aiHandler;
    const environment = new TemplateEngine();
    this.systemPrompt = environment.render(systemPrompt, vars);
    this.userPrompt = environment.render(userPrompt, vars);
  }

  async call(model: string): Promise<string> {
    try {
      const messages: AIMessage[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: this.userPrompt },
      ];
      const response = await this.aiHandler.complete(messages);
      return response.content;
    } catch (e) {
      console.error('Caught exception during prediction.');
      throw e;
    }
  }
}

class TemplateEngine {
  render(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }
}

export class PRHelpDocs {
  private ctxUrl!: string;
  private question: string | null = null;
  private returnAsString!: boolean;
  private repoUrlGivenExplicitly!: boolean;
  private repoUrl!: string;
  private repoDesiredBranch: string | null = null;
  private includeRootReadmeFile!: boolean;
  private supportedDocExts!: string[];
  private docsPath!: string;
  private gitProvider: any;
  private aiHandler!: AIHandler;
  private vars!: Record<string, unknown>;
  private tokenHandler: any = null;
  private getSettings!: () => ConfigSettings;

  constructor(
    ctxUrl: string,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any,
    args: string[] | undefined = undefined,
    returnAsString: boolean = false
  ) {
    try {
      this.ctxUrl = ctxUrl;
      this.question = args && args.length > 0 ? args[0] : null;
      this.returnAsString = returnAsString;
      this.gitProvider = gitProvider;
      this.getSettings = getSettings;
      this.repoUrlGivenExplicitly = false;
      this.aiHandler = aiHandler;

      const s = getSettings();
      this.repoUrl = (s as any).pr_help_docs?.repo_url || '';
      this.repoDesiredBranch = (s as any).pr_help_docs?.repo_default_branch || 'main';
      this.includeRootReadmeFile = !(s as any).pr_help_docs?.exclude_root_readme;
      this.supportedDocExts = (s as any).pr_help_docs?.supported_doc_exts || ['.md', '.mdx'];
      this.docsPath = (s as any).pr_help_docs?.docs_path || '.';

      if (!this.repoUrl) {
        this.repoUrlGivenExplicitly = false;
        this.repoUrl = this.gitProvider.getGitRepoUrl?.(ctxUrl) || '';
        this.repoDesiredBranch = null;
      } else {
        this.repoUrlGivenExplicitly = true;
      }

      this.vars = {
        docsUrl: this.repoUrl,
        question: this.question,
        snippets: '',
      };
      this.tokenHandler = null;
    } catch (e) {
      console.error('Caught exception during init');
      this.question = null;
    }
  }

  async run(): Promise<string | null> {
    if (!this.question) {
      console.warn('No question provided. Will do nothing.');
      return null;
    }

    try {
      const docsFilepathToContents = this.genFilenamesToContentsMapFromRepo();
      let docsPrompt = aggregateDocumentationFilesForPromptContents(docsFilepathToContents);

      if (Object.keys(docsFilepathToContents).length === 0 || !docsPrompt) {
        console.warn('Could not find any usable documentation. Returning with no result...');
        return null;
      }

      let docsPromptToSend = docsPrompt;
      const maxAllowedTxtInput = getMaximalTextInputLengthForTokenCountEstimation();

      const invokeHeadings = this.trimDocsInput(
        docsPromptToSend,
        maxAllowedTxtInput,
        true
      ) as boolean;

      if (invokeHeadings) {
        docsPromptToSend = await this.rankDocsAndReturnThemAsPrompt(
          docsFilepathToContents,
          maxAllowedTxtInput
        );
      }

      if (!docsPromptToSend) {
        console.error('Failed to generate docs prompt for model. Returning with no result...');
        return null;
      }

      this.vars.snippets = docsPromptToSend.trim();

      const s = this.getSettings();
      const predictor = new PredictionPreparator(
        this.aiHandler,
        this.vars,
        (s as any).pr_help_docs_prompts?.system || '',
        (s as any).pr_help_docs_prompts?.user || ''
      );
      const model = s.config?.model || 'gpt-4';
      const response = await predictor.call(model);
      const responseYaml = this.loadYaml(response);

      if (!responseYaml) {
        console.error('Failed to parse the AI response.', response);
        return null;
      }

      const responseStr = responseYaml.response;
      const relevantSections = responseYaml.relevant_sections;

      if (!responseStr || !relevantSections) {
        console.error('Failed to extract response/relevant sections.', {
          response,
          responseStr,
          relevantSections,
        });
        return null;
      }

      if (String(responseYaml.question_is_relevant ?? '1') === '0') {
        console.warn('Question is not relevant. Returning without an answer...', { response });
        return null;
      }

      let answerStr = this.formatModelAnswer(responseStr, relevantSections);

      if (this.returnAsString) {
        return answerStr;
      }

      if (answerStr && s.config?.publish_output) {
        this.gitProvider.publishComment(answerStr);
      } else {
        console.log('Answer:', { answerStr });
      }

      return answerStr;
    } catch (e) {
      console.error('Failed to provide answer to given user question');
      return null;
    }
  }

  private findDocFiles(absDocsPath: string, ignoreReadme: boolean = false, maxAllowedFiles: number = 5000): string[] {
    try {
      const matchingFiles: string[] = [];
      const dotlessExts = this.supportedDocExts.map((ext) => ext.toLowerCase().replace(/^\./, ''));
      let fileCntr = 0;

      const walkDir = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            if (
              ignoreReadme &&
              dir === absDocsPath &&
              dotlessExts.some((ext) => entry.name.toLowerCase() === `readme.${ext}`)
            ) {
              continue;
            }
            if (dotlessExts.some((ext) => entry.name.toLowerCase().endsWith(`.${ext}`))) {
              fileCntr++;
              matchingFiles.push(fullPath);
              if (fileCntr >= maxAllowedFiles) {
                console.warn(`Found at least ${maxAllowedFiles} files in ${absDocsPath}, skipping the rest.`);
                return;
              }
            }
          }
        }
      };

      walkDir(absDocsPath);
      return matchingFiles;
    } catch (e) {
      console.error('Unexpected exception thrown. Returning empty list.');
      return [];
    }
  }

  private genFilenamesToContentsMapFromRepo(): Record<string, string> {
    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-docs-'));
      console.log(`About to clone repository: ${this.repoUrl} to temporary directory: ${tmpDir}...`);

      const clonedRoot = this.gitProvider.clone?.(this.repoUrl, tmpDir, false);
      if (!clonedRoot) {
        throw new Error(`Failed to clone ${this.repoUrl} to ${tmpDir}`);
      }

      console.log('About to gather relevant documentation files...');
      const docFiles: string[] = [];

      if (this.includeRootReadmeFile) {
        const entries = fs.readdirSync(clonedRoot.path);
        for (const entry of entries) {
          if (entry.toLowerCase().startsWith('readme.')) {
            docFiles.push(path.join(clonedRoot.path, entry));
          }
        }
      }

      const absDocsPath = path.join(clonedRoot.path, this.docsPath);
      if (fs.existsSync(absDocsPath)) {
        docFiles.push(
          ...this.findDocFiles(absDocsPath, this.docsPath === '.')
        );
        if (docFiles.length === 0) {
          console.warn(
            `No documentation files found matching file extensions: ${this.supportedDocExts} under repo: ${this.repoUrl} path: ${this.docsPath}. Returning empty dict.`
          );
          return {};
        }
      }

      console.log(`For context ${this.ctxUrl} and repo: ${this.repoUrl} will be using the following documentation files:`, { docFiles });
      return mapDocumentationFilesToContents(clonedRoot.path, docFiles);
    } catch (e) {
      console.error('Unexpected exception thrown. Returning empty dict.');
      return {};
    }
  }

  private trimDocsInput(
    docsInput: string,
    maxAllowedTxtInput: number,
    onlyReturnIfTrimNeeded: boolean = false
  ): boolean | string {
    try {
      let text = docsInput;

      if (text.length >= maxAllowedTxtInput) {
        console.warn(
          `Text length: ${text.length} exceeds the current returned limit of ${maxAllowedTxtInput}. Trimming the text...`
        );
        if (onlyReturnIfTrimNeeded) return true;
        text = text.slice(0, maxAllowedTxtInput);
      }

      const tokenCount = this.countTokens(text);
      console.log(`Estimated token count of documentation to send to model: ${tokenCount}`);

      const s = this.getSettings();
      const model = s.config?.model || 'gpt-4';
      const maxTokensFull = (MAX_TOKENS as Record<string, number>)[model] || 128000;
      const deltaOutput = 5000;

      if (tokenCount > maxTokensFull - deltaOutput) {
        if (onlyReturnIfTrimNeeded) return true;
        text = cleanMarkdownContent(text);
        console.log(`Token count ${tokenCount} exceeds the limit ${maxTokensFull - deltaOutput}. Attempting to clip text to fit within the limit...`);
        text = this.clipTokens(text, maxTokensFull - deltaOutput);
      }

      if (onlyReturnIfTrimNeeded) return false;
      return text;
    } catch (e) {
      console.error('Unexpected exception thrown. Rethrowing it...');
      throw e;
    }
  }

  private async rankDocsAndReturnThemAsPrompt(
    docsFilepathToContents: Record<string, string>,
    maxAllowedTxtInput: number
  ): Promise<string> {
    try {
      let docsPromptToSend = aggregateDocumentationFilesForPromptContents(
        docsFilepathToContents,
        true
      );

      const trimmed = this.trimDocsInput(docsPromptToSend, maxAllowedTxtInput, false);
      if (typeof trimmed !== 'string' || !trimmed) {
        console.error('trimDocsInput returned an empty result.');
        return '';
      }
      docsPromptToSend = trimmed;

      this.vars.snippets = docsPromptToSend.trim();

      const s = this.getSettings();
      const predictor = new PredictionPreparator(
        this.aiHandler,
        this.vars,
        (s as any).pr_help_docs_headings_prompts?.system || '',
        (s as any).pr_help_docs_headings_prompts?.user || ''
      );
      const model = s.config?.model || 'gpt-4';
      const response = await predictor.call(model);
      const responseYaml = this.loadYaml(response);

      if (!responseYaml) {
        console.error('Failed to parse the AI response.', { response });
        return '';
      }

      const validIndices: number[] = (responseYaml.relevant_files_ranking || [])
        .filter((entry: any) => {
          const idx = parseInt(entry.idx, 10);
          return idx >= 0 && idx < Object.keys(docsFilepathToContents).length;
        })
        .map((entry: any) => parseInt(entry.idx, 10));

      const filePaths = Object.keys(docsFilepathToContents);
      const selectedDocsDict: Record<string, string> = {};
      for (const idx of validIndices) {
        selectedDocsDict[filePaths[idx]] = docsFilepathToContents[filePaths[idx]];
      }

      docsPromptToSend = aggregateDocumentationFilesForPromptContents(selectedDocsDict);
      const trimmedResult = this.trimDocsInput(docsPromptToSend, maxAllowedTxtInput, false);
      if (typeof trimmedResult !== 'string' || !trimmedResult) {
        console.error('trimDocsInput returned an empty result.');
        return '';
      }

      return trimmedResult;
    } catch (e) {
      console.error('Unexpected exception thrown. Returning empty result.');
      return '';
    }
  }

  private formatModelAnswer(responseStr: string, relevantSections: Array<Record<string, string>>): string {
    try {
      const [canonicalUrlPrefix, canonicalUrlSuffix] =
        this.gitProvider.getCanonicalUrlParts?.({
          repoGitUrl: this.repoUrlGivenExplicitly ? this.repoUrl : null,
          desiredBranch: this.repoDesiredBranch,
        }) || ['', ''];

      let answerStr = formatMarkdownQAndAResponse(
        this.question || '',
        responseStr,
        relevantSections,
        this.supportedDocExts,
        canonicalUrlPrefix,
        canonicalUrlSuffix
      );

      if (answerStr) {
        answerStr = modifyAnswerSection(answerStr) || answerStr;
      }

      if (answerStr && this.returnAsString) {
        console.log('Chat help docs answer', { answerStr });
        return answerStr;
      }

      if (!answerStr) {
        console.log('No answer found');
        return '';
      }

      if (this.gitProvider.isSupported?.('gfmMarkdown') && (this.getSettings() as any).pr_help_docs?.enable_help_text) {
        answerStr += '<hr>\n\n<details> <summary><strong>💡 Tool usage guide:</strong></summary><hr> \n\n';
        answerStr += HelpMessage.getHelpDocsUsageGuide();
        answerStr += '\n</details>\n';
      }

      return answerStr;
    } catch (e) {
      console.error('Unexpected exception thrown. Returning empty result.');
      return '';
    }
  }

  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private clipTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  }

  private loadYaml(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      try {
        const result: any = {};
        const lines = text.split('\n');
        let currentKey = '';
        let currentValue = '';

        for (const line of lines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0 && colonIdx < 40) {
            if (currentKey && currentValue.trim()) {
              result[currentKey.trim()] = currentValue.trim();
            }
            currentKey = line.substring(0, colonIdx);
            currentValue = line.substring(colonIdx + 1);
          } else {
            currentValue += '\n' + line;
          }
        }
        if (currentKey && currentValue.trim()) {
          result[currentKey.trim()] = currentValue.trim();
        }
        if (result['relevant_files_ranking'] && typeof result['relevant_files_ranking'] === 'string') {
          result['relevant_files_ranking'] = this.parseYamlList(result['relevant_files_ranking']);
        }
        if (result['relevant_sections'] && typeof result['relevant_sections'] === 'string') {
          result['relevant_sections'] = this.parseYamlList(result['relevant_sections']);
        }
        return result;
      } catch {
        return null;
      }
    }
  }

  private parseYamlList(val: string): any[] {
    const items: any[] = [];
    const lines = val.split('\n');
    let current: Record<string, string> = {};
    let inItem = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '-') {
        if (Object.keys(current).length > 0) {
          items.push(current);
          current = {};
        }
        inItem = true;
      } else if (inItem) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const key = trimmed.substring(0, colonIdx).trim();
          const value = trimmed.substring(colonIdx + 1).trim();
          current[key] = value;
        }
      }
    }
    if (Object.keys(current).length > 0) {
      items.push(current);
    }
    return items;
  }
}
