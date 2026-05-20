import type { ConfigSettings, FilePatchInfo } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

export class PRAddDocs {
  private gitProvider: any;
  private mainLanguage: string;
  private aiHandler: AIHandler;
  private patchesDiff: string | null;
  private prediction: string | null;
  private cliMode: boolean;
  private vars: Record<string, unknown>;
  private tokenHandler: any;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    cliMode: boolean = false,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.mainLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.aiHandler = aiHandler;
    this.patchesDiff = null;
    this.prediction = null;
    this.cliMode = cliMode;
    this.getSettings = getSettings;

    const s = getSettings();
    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: gitProvider.getPrDescription(),
      language: this.mainLanguage,
      diff: '',
      extraInstructions: s.pr_add_docs?.extra_instructions || '',
      commitMessagesStr: gitProvider.getCommitMessages(),
      docsForLanguage: this.getDocsForLanguage(this.mainLanguage, s.pr_add_docs?.docs_style || 'numpy'),
    };

    this.tokenHandler = null;
  }

  async run(): Promise<void> {
    try {
      console.log('Generating code Docs for PR...');

      if (this.getSettings().config?.publish_output) {
        this.gitProvider.publishComment('Generating Documentation...', { isTemporary: true });
      }

      console.log('Preparing PR documentation...');
      await this.preparePrediction();
      const data = this.preparePrCodeDocs();

      if (!data || !data['Code Documentation']) {
        console.log('No code documentation found for PR.');
        return;
      }

      if (this.getSettings().config?.publish_output) {
        console.log('Pushing PR documentation...');
        this.gitProvider.removeInitialComment();
        console.log('Pushing inline code documentation...');
        this.pushInlineDocs(data);
      }
    } catch (e: any) {
      console.error(`Failed to generate code documentation for PR, error: ${e.message}`);
    }
  }

  private async preparePrediction(): Promise<void> {
    console.log('Getting PR diff...');
    const model = this.getSettings().config?.model || 'gpt-4';
    this.patchesDiff = this.getPrDiff(model);
    console.log('Getting AI prediction...');
    this.prediction = await this.getPrediction(model);
  }

  private async getPrediction(model: string): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = this.patchesDiff;

    const systemPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_add_docs_prompt?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      (this.getSettings() as any).pr_add_docs_prompt?.user || '',
      variables
    );

    if ((this.getSettings().config?.verbosity_level ?? 0) >= 2) {
      console.log(`\nSystem prompt:\n${systemPrompt}`);
      console.log(`\nUser prompt:\n${userPrompt}`);
    }

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private preparePrCodeDocs(): Record<string, unknown> {
    const docs = (this.prediction || '').trim();
    const data = this.loadYaml(docs);
    if (Array.isArray(data)) {
      return { 'Code Documentation': data };
    }
    return data || {};
  }

  private pushInlineDocs(data: Record<string, unknown>): void {
    const docs: any[] = [];

    const codeDocs = data['Code Documentation'] as any[];
    if (!codeDocs || codeDocs.length === 0) {
      this.gitProvider.publishComment('No code documentation found to improve this PR.');
      return;
    }

    for (const d of codeDocs) {
      try {
        if ((this.getSettings().config?.verbosity_level ?? 0) >= 2) {
          console.log(`add_docs: ${JSON.stringify(d)}`);
        }
        const relevantFile = d['relevant file'].trim();
        const relevantLine = parseInt(d['relevant line'], 10);
        const documentation = d['documentation'];
        const docPlacement = (d['doc placement'] || 'after').trim();

        if (documentation) {
          const newCodeSnippet = this.dedentCode(relevantFile, relevantLine, documentation, docPlacement, true);

          const body = `**Suggestion:** Proposed documentation\n\`\`\`suggestion\n${newCodeSnippet}\n\`\`\``;
          docs.push({
            body,
            relevant_file: relevantFile,
            relevant_lines_start: relevantLine,
            relevant_lines_end: relevantLine,
          });
        }
      } catch {
        if ((this.getSettings().config?.verbosity_level ?? 0) >= 2) {
          console.log(`Could not parse code docs: ${JSON.stringify(d)}`);
        }
      }
    }

    const isSuccessful = this.gitProvider.publishCodeSuggestions(docs);
    if (!isSuccessful) {
      console.log('Failed to publish code docs, trying to publish each docs separately');
      for (const docSuggestion of docs) {
        this.gitProvider.publishCodeSuggestions([docSuggestion]);
      }
    }
  }

  private dedentCode(
    relevantFile: string,
    relevantLinesStart: number,
    newCodeSnippet: string,
    docPlacement: string = 'after',
    addOriginalLine: boolean = false
  ): string {
    try {
      const diffFiles = this.gitProvider.diffFiles || this.gitProvider.getDiffFiles();
      let originalInitialLine: string | null = null;
      let file: any;

      for (const f of diffFiles) {
        if (f.filename.trim() === relevantFile) {
          file = f;
          const headLines = f.head_file?.split('\n') || [];
          if (headLines.length >= relevantLinesStart - 1) {
            originalInitialLine = headLines[relevantLinesStart - 1];
          }
          break;
        }
      }

      if (originalInitialLine && file) {
        const headLines = file.head_file?.split('\n') || [];
        let line: string;
        if (docPlacement === 'after') {
          line = headLines[relevantLinesStart] || '';
        } else {
          line = originalInitialLine;
        }

        const suggestedInitialLine = newCodeSnippet.split('\n')[0];
        const originalSpaces = line.length - line.trimStart().length;
        const suggestedSpaces = suggestedInitialLine.length - suggestedInitialLine.trimStart().length;
        const deltaSpaces = originalSpaces - suggestedSpaces;

        let result = newCodeSnippet;
        if (deltaSpaces > 0) {
          const indent = ' '.repeat(deltaSpaces);
          result = result
            .split('\n')
            .map((l) => indent + l)
            .join('\n')
            .trimEnd();
        }

        if (addOriginalLine) {
          if (docPlacement === 'after') {
            result = originalInitialLine + '\n' + result;
          } else {
            result = result.trimEnd() + '\n' + originalInitialLine;
          }
        }

        return result;
      }
    } catch (e: any) {
      if ((this.getSettings().config?.verbosity_level ?? 0) >= 2) {
        console.error(`Could not dedent code snippet for file ${relevantFile}, error: ${e.message}`);
      }
    }

    return newCodeSnippet;
  }

  private getDocsForLanguage(language: string, style: string): string {
    const lang = language.toLowerCase();
    if (lang === 'java') return 'Javadocs';
    if (['python', 'lisp', 'clojure'].includes(lang)) return `Docstring (${style})`;
    if (['javascript', 'typescript'].includes(lang)) return 'JSdocs';
    if (lang === 'c++') return 'Doxygen';
    return 'Docs';
  }

  getPrDiff(model: string): string | null {
    if (this.gitProvider.getPrDiff) {
      return this.gitProvider.getPrDiff(this.gitProvider, null, model, {
        addLineNumbersToHunks: true,
        disableExtraLines: false,
      });
    }
    return null;
  }

  renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }

  loadYaml(text: string): any {
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

      if (result['Code Documentation']) {
        const val = result['Code Documentation'];
        if (typeof val === 'string') {
          result['Code Documentation'] = this.parseListValue(val);
        }
      }

      return result;
    } catch {
      return null;
    }
  }

  private parseListValue(val: string): any[] {
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

export function getDocsForLanguage(language: string, style: string): string {
  const lang = language.toLowerCase();
  if (lang === 'java') return 'Javadocs';
  if (['python', 'lisp', 'clojure'].includes(lang)) return `Docstring (${style})`;
  if (['javascript', 'typescript'].includes(lang)) return 'JSdocs';
  if (lang === 'c++') return 'Doxygen';
  return 'Docs';
}
