import { BaseTool } from '../baseTool.js';
import type { ToolInput, ToolResult, FilePatchInfo, ConfigSettings, PRDescriptionHeader, ModelType } from '@pr-agent/types';
import { PRDescriptionHeader as PRDescriptionHeaderEnum, ModelType as ModelTypeEnum } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

interface FileLabelInfo {
  filename: string;
  changesTitle: string;
  changesSummary: string;
  label: string;
}

export class DescribeTool {
  private gitProvider: any;
  private mainPrLanguage: string;
  private prId: string;
  private keysFix: string[];
  private aiHandler: AIHandler;
  private collapsibleFileListThreshold: number;
  private vars: Record<string, unknown>;
  private userDescription: string;
  private tokenHandler: any;
  private patchesDiff: string | null;
  private prediction: string | null;
  private fileLabelDict: Record<string, [string, string, string][]> | null;
  private data: any;
  private getSettings: () => ConfigSettings;

  constructor(
    prUrl: string,
    args: string[] | undefined = undefined,
    aiHandler: AIHandler,
    getSettings: () => ConfigSettings,
    gitProvider: any
  ) {
    this.gitProvider = gitProvider;
    this.mainPrLanguage = gitProvider.getMainPrLanguage
      ? gitProvider.getMainPrLanguage(gitProvider.getLanguages(), gitProvider.getFiles())
      : 'Unknown';
    this.prId = gitProvider.getPrId();
    this.keysFix = ['filename:', 'language:', 'changes_summary:', 'changes_title:', 'description:', 'title:'];

    const s = getSettings();
    if (s.pr_description?.enable_semantic_files_types && !gitProvider.isSupported('gfmMarkdown')) {
      console.log(`Disabling semantic files types for ${this.prId}, gfm_markdown not supported.`);
      if (s.pr_description) (s.pr_description as any).enable_semantic_files_types = false;
    }

    this.aiHandler = aiHandler;
    this.collapsibleFileListThreshold = s.pr_description?.collapsible_file_list_threshold ?? 8;
    const enablePrDiagram = !!(s.pr_description?.enable_pr_diagram && gitProvider.isSupported('gfmMarkdown'));

    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: gitProvider.getPrDescription({ full: false }),
      language: this.mainPrLanguage,
      diff: '',
      extraInstructions: s.pr_description?.extra_instructions || '',
      commitMessagesStr: gitProvider.getCommitMessages(),
      enableCustomLabels: s.config?.enable_custom_labels ?? false,
      customLabelsClass: '',
      enableSemanticFilesTypes: s.pr_description?.enable_semantic_files_types ?? false,
      relatedTickets: '',
      includeFileSummaryChanges: gitProvider.getDiffFiles().length <= this.collapsibleFileListThreshold,
      duplicatePromptExamples: s.config?.duplicate_prompt_examples ?? false,
      enablePrDiagram: enablePrDiagram,
    };

    this.userDescription = gitProvider.getUserDescription();
    this.tokenHandler = null;
    this.patchesDiff = null;
    this.prediction = null;
    this.fileLabelDict = null;
    this.data = null;
    this.getSettings = getSettings;
  }

  async run(): Promise<void> {
    try {
      console.log(`Generating a PR description for pr_id: ${this.prId}`);

      if (this.getSettings().config?.publish_output && !this.getSettings().config?.is_auto_command) {
        this.gitProvider.publishComment('Preparing PR description...', { isTemporary: true });
      }

      await this.extractAndCachePrTickets(this.gitProvider, this.vars);

      await this.preparePrediction();

      if (this.prediction) {
        this.prepareData();
      } else {
        console.warn(`Empty prediction, PR: ${this.prId}`);
        this.gitProvider.removeInitialComment();
        return;
      }

      if (this.getSettings().pr_description?.enable_semantic_files_types) {
        this.fileLabelDict = this.prepareFileLabels();
      }

      let prLabels: string[] = [];
      let prFileChanges: any[] = [];
      if (this.getSettings().pr_description?.publish_labels) {
        prLabels = this.prepareLabels();
      }

      let prTitle: string;
      let prBody: string;
      let changesWalkthrough: string;

      if (this.getSettings().pr_description?.use_description_markers) {
        const result = this.preparePrAnswerWithMarkers();
        prTitle = result.title;
        prBody = result.body;
        changesWalkthrough = result.walkthroughGfm;
        prFileChanges = result.prFileChanges;
      } else {
        const result = this.preparePrAnswer();
        prTitle = result.title;
        prBody = result.body;
        changesWalkthrough = result.changesWalkthrough;
        prFileChanges = result.prFileChanges;
        if (
          !this.gitProvider.isSupported('publishFileComments') ||
          !this.getSettings().pr_description?.inline_file_summary
        ) {
          prBody += '\n\n' + changesWalkthrough + '___\n\n';
        }
      }

      console.log('PR output', { title: prTitle, body: prBody });

      if (this.gitProvider.isSupported('gfmMarkdown') && this.getSettings().pr_description?.enable_help_text) {
        prBody +=
          '<hr>\n\n<details> <summary><strong>\u2728 Describe tool usage guide:</strong></summary><hr> \n\n';
        prBody += this.getDescribeUsageGuide();
        prBody += '\n</details>\n';
      } else if (this.getSettings().pr_description?.enable_help_comment && this.gitProvider.isSupported('gfmMarkdown')) {
        prBody +=
          '\n\n___\n\n> <details> <summary>  Need help?</summary><li>Type <code>/help how to ...</code> in the comments thread for any questions about PR-Agent usage.</li><li>Check out the <a href="https://qodo-merge-docs.qodo.ai/usage-guide/">documentation</a> for more information.</li></details>';
      }

      if (this.getSettings().config?.publish_output) {
        if (
          this.getSettings().pr_description?.publish_labels &&
          prLabels.length > 0 &&
          this.gitProvider.isSupported('getLabels')
        ) {
          const originalLabels = this.gitProvider.getPrLabels({ update: true }) || [];
          const userLabels = this.getUserLabels(originalLabels);
          const newLabels = [...prLabels, ...userLabels];
          if (
            JSON.stringify([...newLabels].sort()) !== JSON.stringify([...originalLabels].sort())
          ) {
            console.log(`Setting describe labels:`, newLabels);
            this.gitProvider.publishLabels(newLabels);
          }
        }

        if (this.getSettings().pr_description?.publish_description_as_comment) {
          const fullMarkdownDescription = `## Title\n\n${prTitle.trim()}\n\n___\n${prBody}`;
          if (this.getSettings().pr_description?.publish_description_as_comment_persistent) {
            this.gitProvider.publishPersistentComment(fullMarkdownDescription, {
              initialHeader: '## Title',
              updateHeader: true,
              name: 'describe',
              finalUpdateMessage: false,
            });
          } else {
            this.gitProvider.publishComment(fullMarkdownDescription);
          }
        } else {
          this.gitProvider.publishDescription(prTitle.trim(), prBody);
          if (
            this.getSettings().pr_description?.final_update_message &&
            !this.getSettings().config?.is_auto_command
          ) {
            const latestCommitUrl = this.gitProvider.getLatestCommitUrl();
            if (latestCommitUrl) {
              const prUrl = this.gitProvider.getPrUrl();
              const updateComment = `**[PR Description](${prUrl})** updated to latest commit (${latestCommitUrl})`;
              this.gitProvider.publishComment(updateComment);
            }
          }
        }
        this.gitProvider.removeInitialComment();
      } else {
        console.log('PR description generated but not published.');
      }
    } catch (e: any) {
      console.error(`Error generating PR description ${this.prId}: ${e.message}`);
    }
  }

  private async preparePrediction(): Promise<void> {
    const model = this.getSettings().config?.model || 'gpt-4';
    const useMarkers = this.getSettings().pr_description?.use_description_markers;
    if (useMarkers && !this.userDescription.includes('pr_agent:')) {
      console.log('Markers were enabled, but user description does not contain markers. Skipping AI prediction');
      return;
    }

    const largePrHandling =
      this.getSettings().pr_description?.enable_large_pr_handling &&
      this.getSettings()['pr_description_only_files_prompts'] !== undefined;

    const diff = this.getPrDiff(model, { largePrHandling, returnRemainingFiles: true });
    let patchesDiff: string | null;
    let remainingFilesList: string[];

    if (diff && typeof diff === 'object' && 'patchesDiff' in diff) {
      patchesDiff = (diff as any).patchesDiff;
      remainingFilesList = (diff as any).remainingFilesList || [];
    } else {
      patchesDiff = diff as string;
      remainingFilesList = [];
    }

    if (!largePrHandling || patchesDiff) {
      this.patchesDiff = patchesDiff;
      if (patchesDiff) {
        console.log('PR diff', this.patchesDiff);
        this.prediction = await this.getPrediction(model, patchesDiff, 'pr_description_prompt');
        if (this.getSettings().pr_description?.enable_semantic_files_types) {
          this.prediction = await this.extendUncoveredFiles(this.prediction || '');
        }
      } else {
        console.error(`Error getting PR diff ${this.prId}`);
        this.prediction = null;
      }
    }
  }

  private async getPrediction(
    model: string,
    patchesDiff: string,
    prompt: string = 'pr_description_prompt'
  ): Promise<string> {
    const variables = { ...this.vars };
    variables.diff = patchesDiff;

    const systemPrompt = this.renderTemplate(
      (this.getSettings() as any)[prompt]?.system || '',
      variables
    );
    const userPrompt = this.renderTemplate(
      (this.getSettings() as any)[prompt]?.user || '',
      variables
    );

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    return response.content;
  }

  private prepareData(): void {
    this.data = this.loadYaml(this.prediction || '', { keysFixYaml: this.keysFix });

    if (this.getSettings().pr_description?.add_original_user_description && this.userDescription) {
      this.data['User Description'] = this.userDescription;
    }

    const keys = ['User Description', 'title', 'type', 'labels', 'description', 'changes_diagram', 'pr_files'];
    for (const key of keys) {
      if (this.data[key] !== undefined) {
        const val = this.data[key];
        delete this.data[key];
        if (key === 'changes_diagram') {
          const sanitized = this.sanitizeDiagram(val);
          if (sanitized) {
            this.data[key] = sanitized;
          }
        } else {
          this.data[key] = val;
        }
      }
    }
  }

  private prepareLabels(): string[] {
    let prLabels: string[] = [];

    if (this.data['labels'] && this.data['labels'].length > 0) {
      if (Array.isArray(this.data['labels'])) {
        prLabels = this.data['labels'];
      } else if (typeof this.data['labels'] === 'string') {
        prLabels = this.data['labels'].split(',');
      }
    } else if (
      this.data['type'] &&
      this.data['type'].length > 0 &&
      this.getSettings().pr_description?.publish_labels
    ) {
      if (Array.isArray(this.data['type'])) {
        prLabels = this.data['type'];
      } else if (typeof this.data['type'] === 'string') {
        prLabels = this.data['type'].split(',');
      }
    }

    prLabels = prLabels.map((l) => l.trim());

    return prLabels;
  }

  private preparePrAnswerWithMarkers(): {
    title: string;
    body: string;
    walkthroughGfm: string;
    prFileChanges: any[];
  } {
    console.log(`Using description marker replacements ${this.prId}`);

    const aiTitle = this.data['title'] || this.vars['title'];
    const title = this.getSettings().pr_description?.generate_ai_title
      ? aiTitle
      : this.vars['title'] as string;

    let body = this.userDescription;

    const aiHeader = this.getSettings().pr_description?.include_generated_by_header
      ? `### \u{1F916} Generated by PR Agent at ${this.gitProvider.lastCommitId?.sha || ''}\n\n`
      : '';

    const aiType = this.data['type'];
    if (aiType && !/<!--\s*pr_agent:type\s*-->/.test(body)) {
      let prType: string;
      if (Array.isArray(aiType)) {
        prType = aiType.join(', ');
      } else {
        prType = aiType;
      }
      prType = `${aiHeader}${prType}`;
      body = body.replace('pr_agent:type', prType);
    }

    const aiSummary = this.data['description'];
    if (aiSummary && !/<!--\s*pr_agent:summary\s*-->/.test(body)) {
      const summary = `${aiHeader}${aiSummary}`;
      body = body.replace('pr_agent:summary', summary);
    }

    const aiWalkthrough = this.data['pr_files'];
    let walkthroughGfm = '';
    let prFileChanges: any[] = [];

    if (aiWalkthrough && !/<!--\s*pr_agent:walkthrough\s*-->/.test(body)) {
      try {
        const result = this.processPrFilesPrediction(walkthroughGfm, this.fileLabelDict);
        walkthroughGfm = result.walkthrough;
        prFileChanges = result.fileChanges;
        body = body.replace('pr_agent:walkthrough', walkthroughGfm);
      } catch (e: any) {
        console.error(`Failing to process walkthrough ${this.prId}: ${e.message}`);
        body = body.replace('pr_agent:walkthrough', '');
      }
    }

    const aiDiagram = this.data['changes_diagram'];
    if (aiDiagram) {
      body = body.replace(/<!--\s*pr_agent:diagram\s*-->|pr_agent:diagram/g, aiDiagram);
    }

    return { title, body, walkthroughGfm, prFileChanges };
  }

  private preparePrAnswer(): {
    title: string;
    body: string;
    changesWalkthrough: string;
    prFileChanges: any[];
  } {
    if (this.data['labels'] && this.gitProvider.isSupported('getLabels')) {
      delete this.data['labels'];
    }
    if (!this.getSettings().pr_description?.enable_pr_type) {
      delete this.data['type'];
    }

    const aiTitle = this.data['title'] || this.vars['title'];
    const title = this.getSettings().pr_description?.generate_ai_title
      ? aiTitle
      : this.vars['title'] as string;

    let prBody = '';
    let changesWalkthrough = '';
    let prFileChanges: any[] = [];
    const entries = Object.entries(this.data);

    for (let idx = 0; idx < entries.length; idx++) {
      const [key, value] = entries[idx];

      if (key === 'changes_diagram') {
        prBody += `### ${PRDescriptionHeaderEnum.DIAGRAM_WALKTHROUGH}\n\n`;
        prBody += `${value}\n\n`;
        continue;
      }

      if (key === 'pr_files') {
        const processedValue = this.fileLabelDict;
        if (
          key.toLowerCase().includes('pr_files') &&
          this.getSettings().pr_description?.enable_semantic_files_types
        ) {
          const result = this.processPrFilesPrediction('', processedValue);
          changesWalkthrough = result.walkthrough;
          prFileChanges = result.fileChanges;
          const initialStatus = this.getSettings().pr_description?.collapsible_file_list
            ? ' open'
            : '';
          changesWalkthrough =
            `<details${initialStatus}> <summary><h3> ${PRDescriptionHeaderEnum.FILE_WALKTHROUGH}</h3></summary>\n\n` +
            `${changesWalkthrough}\n\n</details>\n\n`;
        }
      } else {
        let keyPublish = key.replace(/:$/, '').replace(/_/g, ' ');
        keyPublish = keyPublish.charAt(0).toUpperCase() + keyPublish.slice(1);
        if (keyPublish === 'Type') keyPublish = 'PR Type';
        prBody += `### **${keyPublish}**\n`;
      }

      if (key.toLowerCase().includes('walkthrough') && key !== 'changes_diagram') {
        if (this.gitProvider.isSupported('gfmMarkdown')) {
          prBody += '<details> <summary>files:</summary>\n\n';
        }
        for (const file of value as any[]) {
          const filename = (file.filename || '').replace(/'/g, '`');
          const description = file.changes_in_file || '';
          prBody += `- \`${filename}\`: ${description}\n`;
        }
        if (this.gitProvider.isSupported('gfmMarkdown')) {
          prBody += '</details>\n';
        }
      } else if (key.toLowerCase().trim() === 'description') {
        let val = value;
        if (Array.isArray(val)) {
          val = val.map((v: string) => v.trim()).join(', ');
        }
        val = (val as string).replace(/\n-/, '\n\n-');
        prBody += `${val}\n`;
      } else if (key !== 'pr_files') {
        let val = value;
        if (Array.isArray(val)) {
          val = val.join(', ');
        }
        prBody += `${val}\n`;
      }

      if (idx < entries.length - 1 && key !== 'pr_files') {
        prBody += '\n\n___\n\n';
      }
    }

    return { title, body: prBody, changesWalkthrough, prFileChanges };
  }

  private prepareFileLabels(): Record<string, [string, string, string][]> {
    const fileLabelDict: Record<string, [string, string, string][]> = {};

    if (!this.data || typeof this.data !== 'object' || !this.data['pr_files']) {
      return fileLabelDict;
    }

    for (const file of this.data['pr_files']) {
      try {
        if (!file.changes_title || !file.filename || !file.label) {
          console.warn('Missing required fields in file label dict, skipping file');
          continue;
        }
        if (!file.changes_title) {
          console.warn('Empty changes title or summary in file label dict, skipping file');
          continue;
        }
        const filename = file.filename.replace(/'/g, '`').replace(/"/g, '`');
        const changesSummary = (file.changes_summary || '').trim();
        if (!changesSummary && this.vars['includeFileSummaryChanges']) {
          console.warn('Empty changes summary in file label dict, skipping file');
          continue;
        }
        const changesTitle = file.changes_title.trim();
        const label = file.label.trim().toLowerCase();
        if (!fileLabelDict[label]) {
          fileLabelDict[label] = [];
        }
        fileLabelDict[label].push([filename, changesTitle, changesSummary]);
      } catch {
        console.error('Error preparing file label dict');
      }
    }
    return fileLabelDict;
  }

  async extendUncoveredFiles(originalPrediction: string): Promise<string> {
    try {
      let prediction = originalPrediction;
      const originalPredictionLoaded = this.loadYaml(originalPrediction, {
        keysFixYaml: this.keysFix,
      });
      let originalPredictionDict: any;
      let filenamesPredicted: string[] = [];

      if (Array.isArray(originalPredictionLoaded)) {
        originalPredictionDict = { pr_files: originalPredictionLoaded };
      } else {
        originalPredictionDict = originalPredictionLoaded;
      }

      if (originalPredictionDict) {
        const files = originalPredictionDict.pr_files || [];
        filenamesPredicted = files
          .filter((f: any) => typeof f === 'object')
          .map((f: any) => (f.filename || '').trim());
      }

      const prFiles = this.gitProvider.getDiffFiles();
      let predictionExtra = 'pr_files:';
      const MAX_EXTRA_FILES_TO_OUTPUT = 100;
      let counterExtraFiles = 0;

      for (const file of prFiles) {
        if (filenamesPredicted.includes(file.filename)) continue;
        counterExtraFiles++;
        if (counterExtraFiles > MAX_EXTRA_FILES_TO_OUTPUT) {
          const extraFileYaml = `\n- filename: |\n    Additional files not shown\n  changes_title: |\n    ...\n  label: |\n    additional files`;
          predictionExtra += '\n' + extraFileYaml.trim();
          console.log(`Too many remaining files, clipping to ${MAX_EXTRA_FILES_TO_OUTPUT}`);
          break;
        }
        const extraFileYaml = `\n- filename: |\n    ${file.filename}\n  changes_title: |\n    ...\n  label: |\n    additional files`;
        predictionExtra += '\n' + extraFileYaml.trim();
      }

      if (counterExtraFiles > 0) {
        console.log(`Adding ${counterExtraFiles} unprocessed extra files to table prediction`);
        const predictionExtraDict = this.loadYaml(predictionExtra, {
          keysFixYaml: this.keysFix,
        });
        if (
          originalPredictionDict &&
          typeof originalPredictionDict === 'object' &&
          predictionExtraDict &&
          typeof predictionExtraDict === 'object' &&
          predictionExtraDict.pr_files
        ) {
          if (originalPredictionDict.pr_files) {
            originalPredictionDict.pr_files.push(...predictionExtraDict.pr_files);
          } else {
            originalPredictionDict.pr_files = predictionExtraDict.pr_files;
          }
          prediction = this.dumpYaml(originalPredictionDict);
        }
      }

      return prediction;
    } catch (e: any) {
      console.error(`Error extending uncovered files ${this.prId}: ${e.message}`);
      return originalPrediction;
    }
  }

  async extendAdditionalFiles(remainingFilesList: string[]): Promise<string> {
    let prediction = this.prediction || '';
    try {
      const originalPredictionDict = this.loadYaml(prediction, {
        keysFixYaml: this.keysFix,
      });
      let predictionExtra = 'pr_files:';
      for (const file of remainingFilesList) {
        const extraFileYaml = `\n- filename: |\n    ${file}\n  changes_summary: |\n    ...\n  changes_title: |\n    ...\n  label: |\n    additional files (token-limit)`;
        predictionExtra += '\n' + extraFileYaml.trim();
      }
      const predictionExtraDict = this.loadYaml(predictionExtra, {
        keysFixYaml: this.keysFix,
      });
      if (
        originalPredictionDict &&
        typeof originalPredictionDict === 'object' &&
        predictionExtraDict &&
        typeof predictionExtraDict === 'object'
      ) {
        originalPredictionDict.pr_files.push(...predictionExtraDict.pr_files);
        prediction = this.dumpYaml(originalPredictionDict);
      }
      return prediction;
    } catch (e: any) {
      console.error(`Error extending additional files ${this.prId}: ${e.message}`);
      return prediction;
    }
  }

  processPrFilesPrediction(
    prBody: string,
    value: Record<string, [string, string, string][]> | null
  ): { walkthrough: string; fileChanges: any[] } {
    const prComments: any[] = [];
    const useCollapsibleFileList = this.getSettings().pr_description?.collapsible_file_list;
    let numFiles = 0;

    if (value) {
      for (const semanticLabel of Object.keys(value)) {
        numFiles += value[semanticLabel].length;
      }
    }

    const useCollapsible =
      useCollapsibleFileList === true ||
      (useCollapsibleFileList === 'adaptive' && numFiles > this.collapsibleFileListThreshold);

    if (!this.gitProvider.isSupported('gfmMarkdown')) {
      return { walkthrough: prBody, fileChanges: prComments };
    }

    try {
      let body = prBody;
      body += '<table>';
      const header = 'Relevant files';
      body += `<thead><tr><th></th><th align="left">${header}</th></tr></thead>`;
      body += '<tbody>';

      if (value) {
        for (const semanticLabel of Object.keys(value)) {
          const sLabel = semanticLabel.replace(/['"]/g, '');
          body += `<tr><td><strong>${sLabel.charAt(0).toUpperCase() + sLabel.slice(1)}</strong></td>`;
          const listTuples = value[semanticLabel];

          if (useCollapsible) {
            body += `<td><details><summary>${listTuples.length} files</summary><table>`;
          } else {
            body += `<td><table>`;
          }

          for (const [filename, fileChangesTitle, fileChangeDescription] of listTuples) {
            const cleanFilename = filename.replace(/'/g, '`').trim();
            const filenamePublish = cleanFilename.split('/').pop() || cleanFilename;
            const publishName =
              fileChangesTitle && fileChangesTitle.trim() !== '...'
                ? `<strong>${filenamePublish}</strong><dd><code>${fileChangesTitle}</code></dd>`
                : `<strong>${filenamePublish}</strong>`;

            let diffPlusMinus = '';
            let deltaNbsp = '';
            const diffFiles = this.gitProvider.getDiffFiles();
            for (const f of diffFiles) {
              if (f.filename.toLowerCase().replace(/^\//, '') === cleanFilename.toLowerCase().replace(/^\//, '')) {
                diffPlusMinus = `+${f.num_plus_lines || 0}/-${f.num_minus_lines || 0}`;
                if (diffPlusMinus.length > 12 || diffPlusMinus === '+0/-0') {
                  diffPlusMinus = '[link]';
                }
                deltaNbsp = '&nbsp;'.repeat(Math.max(0, 8 - diffPlusMinus.length));
                break;
              }
            }

            let link = '';
            if (this.gitProvider.getLineLink) {
              link = this.gitProvider.getLineLink(cleanFilename, -1);
            }

            const desc = fileChangeDescription || '';
            body += `
<tr>
  <td>
    <details>
      <summary>${publishName}</summary>
<hr>
${cleanFilename}
${desc}
</details>
  </td>
  <td><a href="${link}">${diffPlusMinus}</a>${deltaNbsp}</td>
</tr>`;
          }

          if (useCollapsible) {
            body += '</table></details></td></tr>';
          } else {
            body += '</table></td></tr>';
          }
        }
      }

      body += '</tr></tbody></table>';
      return { walkthrough: body, fileChanges: prComments };
    } catch (e: any) {
      console.error(`Error processing pr files to markdown ${this.prId}: ${e.message}`);
      return { walkthrough: prBody, fileChanges: prComments };
    }
  }

  sanitizeDiagram(diagramRaw: string): string {
    if (typeof diagramRaw !== 'string') return '';
    let diagram = diagramRaw.trim();
    if (!diagram.startsWith('```mermaid')) return '';
    if (!diagram.endsWith('```')) diagram += '\n```';

    const lines = diagram.split('\n');
    const result = lines.map((line) => {
      return line.replace(/\["([^"]*?)"\]/g, (_m, p1) => '["' + p1.replace(/`/g, '') + '"]');
    });
    return '\n' + result.join('\n');
  }

  getPrDiff(model: string, opts?: any): string | { patchesDiff: string; remainingFilesList: string[] } | null {
    if (this.gitProvider.getPrDiff) {
      return this.gitProvider.getPrDiff(this.gitProvider, null, model, opts || {});
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

  loadYaml(text: string, opts?: { keysFixYaml?: string[] }): any {
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
      return result;
    } catch {
      return null;
    }
  }

  dumpYaml(obj: any): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const item of value) {
          if (typeof item === 'object') {
            lines.push(`-`);
            for (const [k, v] of Object.entries(item)) {
              lines.push(`  ${k}: ${v}`);
            }
          } else {
            lines.push(`  - ${item}`);
          }
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    return lines.join('\n');
  }

  getUserLabels(labels: string[]): string[] {
    return labels.filter((l) => !l.startsWith('Review effort') && !l.startsWith('Possible security concern'));
  }

  getDescribeUsageGuide(): string {
    return 'Use `/describe` to generate a PR description.';
  }

  private async extractAndCachePrTickets(gitProvider: any, vars: Record<string, unknown>): Promise<void> {
    const settings = this.getSettings();
    if (!(settings as any).pr_reviewer?.require_ticket_analysis_review) return;

    let relatedTickets: any[] = (settings as any).related_tickets || [];
    if (relatedTickets.length === 0) {
      const ticketsContent = await this.extractTickets(gitProvider);
      if (ticketsContent) {
        for (const ticket of ticketsContent) {
          if (ticket.sub_issues && ticket.sub_issues.length > 0) {
            for (const subIssue of ticket.sub_issues) {
              relatedTickets.push(subIssue);
            }
          }
          relatedTickets.push(ticket);
        }
        vars.relatedTickets = relatedTickets;
      }
    } else {
      vars.relatedTickets = relatedTickets;
    }
  }

  private async extractTickets(gitProvider: any): Promise<any[]> {
    const userDescription = gitProvider.getUserDescription();
    if (!userDescription) return [];
    const ticketPattern = /https:\/\/github[^/]+\/[^/]+\/[^/]+\/issues\/(\d+)/g;
    const matches = userDescription.match(ticketPattern);
    if (!matches) return [];
    const tickets: any[] = [];
    for (const url of matches.slice(0, 3)) {
      const issueNum = url.match(/issues\/(\d+)/)?.[1];
      if (issueNum) {
        tickets.push({ ticket_url: url, ticket_id: issueNum, title: '', body: '' });
      }
    }
    return tickets;
  }
}
