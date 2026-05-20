import { BaseTool } from '../baseTool.js';
import type { ToolInput, ToolResult, FilePatchInfo, ConfigSettings, ModelType } from '@pr-agent/types';
import { ModelType as ModelTypeEnum, MAX_TOKENS } from '@pr-agent/types';
import { AIHandler, type AIMessage } from '@pr-agent/core';

export class ImproveTool {
  private gitProvider: any;
  private mainLanguage: string;
  private aiHandler: AIHandler;
  private patchesDiff: string | null;
  private patchesDiffList: string[];
  private patchesDiffListNoLineNumbers: string[];
  private predictionList: any[];
  private data: any;
  private prediction: any;
  private prUrl: string;
  private cliMode: boolean;
  private vars: Record<string, unknown>;
  private prCodeSuggestionsPromptSystem: string;
  private prCodeSuggestionsPromptUser: string;
  private tokenHandler: any;
  private progressResponse: any;
  private progress: string;
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
    this.patchesDiffList = [];
    this.patchesDiffListNoLineNumbers = [];
    this.predictionList = [];
    this.data = null;
    this.prediction = null;
    this.prUrl = prUrl;
    this.cliMode = cliMode;
    this.progressResponse = null;
    this.getSettings = getSettings;

    const numCodeSuggestions = getSettings().pr_code_suggestions?.num_code_suggestions_per_chunk || 4;
    const descResult = gitProvider.getPrDescription({ splitChangesWalkthrough: true });

    this.vars = {
      title: gitProvider.pr?.title || '',
      branch: gitProvider.getPrBranch(),
      description: descResult?.description || '',
      language: this.mainLanguage,
      diff: '',
      diffNoLineNumbers: '',
      numCodeSuggestions,
      extraInstructions: getSettings().pr_code_suggestions?.extra_instructions || '',
      commitMessagesStr: gitProvider.getCommitMessages(),
      relevantBestPractices: '',
      isAiMetadata: getSettings().config?.enable_ai_metadata ?? false,
      focusOnlyOnProblems: getSettings().pr_code_suggestions?.focus_only_on_problems ?? false,
      date: new Date().toISOString().split('T')[0],
      duplicatePromptExamples: getSettings().config?.duplicate_prompt_examples ?? false,
    };

    if (getSettings().pr_code_suggestions?.decouple_hunks ?? true) {
      this.prCodeSuggestionsPromptSystem = (getSettings() as any).pr_code_suggestions_prompt?.system || '';
      this.prCodeSuggestionsPromptUser = (getSettings() as any).pr_code_suggestions_prompt?.user || '';
    } else {
      this.prCodeSuggestionsPromptSystem = (getSettings() as any).pr_code_suggestions_prompt_not_decoupled?.system || '';
      this.prCodeSuggestionsPromptUser = (getSettings() as any).pr_code_suggestions_prompt_not_decoupled?.user || '';
    }

    this.tokenHandler = null;
    this.progress =
      '## Generating PR code suggestions\n\n' +
      'Work in progress ...<br>\n' +
      '<img src="https://codium.ai/images/pr_agent/dual_ball_loading-crop.gif" width=48>';
  }

  async run(): Promise<void> {
    try {
      const files = this.gitProvider.getFiles();
      if (!files || files.length === 0) {
        console.log(`PR has no files: ${this.prUrl}, skipping code suggestions`);
        return;
      }

      console.log('Generating code suggestions for PR...');

      if (
        this.getSettings().config?.publish_output &&
        this.getSettings().config?.publish_output_progress &&
        !this.getSettings().config?.is_auto_command
      ) {
        if (this.gitProvider.isSupported('gfmMarkdown')) {
          this.progressResponse = this.gitProvider.publishComment(this.progress);
        } else {
          this.gitProvider.publishComment('Preparing suggestions...', { isTemporary: true });
        }
      }

      const data = await this.preparePredictionMain();
      if (!data) {
        await this.publishNoSuggestions();
        return;
      }
      this.data = data;

      if (!data || !data.code_suggestions || data.code_suggestions.length === 0) {
        await this.publishNoSuggestions();
        return;
      }

      if (this.getSettings().config?.publish_output) {
        this.gitProvider.removeInitialComment();

        if (
          !this.getSettings().pr_code_suggestions?.commitable_code_suggestions &&
          this.gitProvider.isSupported('gfmMarkdown')
        ) {
          let prBody = this.generateSummarizedSuggestions(data);

          if (this.getSettings().pr_code_suggestions?.demand_code_suggestions_self_review) {
            prBody = await this.addSelfReviewText(prBody);
          }

          if (
            this.getSettings().pr_code_suggestions?.enable_chat_text &&
            this.getSettings().config?.is_auto_command
          ) {
            prBody +=
              '\n\n>\u{1F4A1}Need additional feedback ? start a [PR chat](https://chromewebstore.google.com/detail/ephlnjeghhogofkifjloamocljapahnl) \n\n';
          }
          if (this.getSettings().pr_code_suggestions?.enable_help_text) {
            prBody +=
              '<hr>\n\n<details> <summary><strong>\u{1F4A1} Tool usage guide:</strong></summary><hr> \n\n';
            prBody += this.getImproveUsageGuide();
            prBody += '\n</details>\n';
          }

          if (this.getSettings().pr_code_suggestions?.persistent_comment) {
            this.publishPersistentCommentWithHistory(prBody, {
              initialHeader: '## PR Code Suggestions \u2728',
              updateHeader: true,
              name: 'suggestions',
              finalUpdateMessage: false,
              maxPreviousComments: this.getSettings().pr_code_suggestions?.max_history_len || 4,
              progressResponse: this.progressResponse,
            });
          } else {
            if (this.progressResponse) {
              this.gitProvider.editComment(this.progressResponse, { body: prBody });
            } else {
              this.gitProvider.publishComment(prBody);
            }
          }

          if ((this.getSettings().pr_code_suggestions?.dual_publishing_score_threshold || 0) > 0) {
            await this.dualPublishing(data);
          }
        } else {
          await this.pushInlineCodeSuggestions(data);
          if (this.progressResponse) {
            this.gitProvider.removeComment(this.progressResponse);
          }
        }
      } else {
        console.log('Code suggestions generated for PR, but not published');
        const prBody = this.generateSummarizedSuggestions(data);
      }
    } catch (e: any) {
      console.error(`Failed to generate code suggestions for PR, error: ${e.message}`);
      if (this.getSettings().config?.publish_output) {
        if (this.progressResponse) {
          this.gitProvider.removeComment(this.progressResponse);
        } else {
          try {
            this.gitProvider.removeInitialComment();
            this.gitProvider.publishComment('Failed to generate code suggestions for PR');
          } catch {
            // ignore
          }
        }
      }
    }
  }

  private async addSelfReviewText(prBody: string): Promise<string> {
    const text = this.getSettings().pr_code_suggestions?.code_suggestions_self_review_text || '';
    let body = prBody + `\n\n- [ ]  ${text}`;
    const approvePr = this.getSettings().pr_code_suggestions?.approve_pr_on_self_review ?? false;
    const foldSuggestions = this.getSettings().pr_code_suggestions?.fold_suggestions_on_self_review ?? false;
    if (approvePr && !foldSuggestions) {
      body += ' <!-- approve pr self-review -->';
    } else if (foldSuggestions && !approvePr) {
      body += ' <!-- fold suggestions self-review -->';
    } else {
      body += ' <!-- approve and fold suggestions self-review -->';
    }
    return body;
  }

  private async publishNoSuggestions(): Promise<void> {
    const prBody = '## PR Code Suggestions \u2728\n\nNo code suggestions found for the PR.';
    if (
      this.getSettings().config?.publish_output &&
      (this.getSettings().pr_code_suggestions?.publish_output_no_suggestions ?? true)
    ) {
      console.warn('No code suggestions found for the PR.');
      if (this.progressResponse) {
        this.gitProvider.editComment(this.progressResponse, { body: prBody });
      } else {
        this.gitProvider.publishComment(prBody);
      }
    }
  }

  private async dualPublishing(data: any): Promise<void> {
    const dataAboveThreshold: any = { code_suggestions: [] };
    try {
      const threshold = this.getSettings().pr_code_suggestions?.dual_publishing_score_threshold || 0;
      for (const suggestion of data.code_suggestions) {
        if (
          parseInt(suggestion.score, 10) >= threshold &&
          suggestion.improved_code
        ) {
          dataAboveThreshold.code_suggestions.push({ ...suggestion });
          if (!dataAboveThreshold.code_suggestions[dataAboveThreshold.code_suggestions.length - 1].existing_code) {
            dataAboveThreshold.code_suggestions[dataAboveThreshold.code_suggestions.length - 1].existing_code =
              suggestion.improved_code;
          }
        }
      }
      if (dataAboveThreshold.code_suggestions.length > 0) {
        console.log(
          `Publishing ${dataAboveThreshold.code_suggestions.length} suggestions in dual publishing mode`
        );
        await this.pushInlineCodeSuggestions(dataAboveThreshold);
      }
    } catch (e: any) {
      console.error(`Failed to publish dual publishing suggestions, error: ${e.message}`);
    }
  }

  publishPersistentCommentWithHistory(
    prComment: string,
    opts: {
      initialHeader: string;
      updateHeader?: boolean;
      name?: string;
      finalUpdateMessage?: boolean;
      maxPreviousComments?: number;
      progressResponse?: any;
      onlyFold?: boolean;
    }
  ): any {
    const extractLink = (commentText: string): string => {
      const match = commentText.match(/<!--.*?-->/);
      if (match) {
        return ` up to commit ${match[0].slice(4, -3).trim()}`;
      }
      return '';
    };

    const historyHeader = '#### Previous suggestions';
    const lastCommitNum = this.gitProvider.getLatestCommitUrl()?.split('/').pop()?.slice(0, 7) || '';
    const latestSuggestionHeader = opts.onlyFold
      ? `\n\n- [x]  ${this.getSettings().pr_code_suggestions?.code_suggestions_self_review_text || ''}`
      : `Latest suggestions up to ${lastCommitNum}`;
    const latestCommitHtmlComment = `<!-- ${lastCommitNum} -->`;

    const maxPrev = opts.maxPreviousComments || 4;

    if (maxPrev > 0) {
      try {
        const prevComments = this.gitProvider.getIssueComments() || [];
        for (const comment of prevComments) {
          if (comment.body?.startsWith(opts.initialHeader)) {
            const prevSuggestions = comment.body;
            const foundComment = comment;

            if (!prevSuggestions.includes(historyHeader.trim())) {
              const tableIndex = prevSuggestions.indexOf('<table>');
              if (tableIndex === -1) {
                this.gitProvider.editComment(foundComment, { body: prComment });
                continue;
              }
              const upToCommitTxt = extractLink(prevSuggestions.slice(0, tableIndex));
              const prevSuggestionTable = prevSuggestions.slice(
                tableIndex,
                prevSuggestions.lastIndexOf('</table>') + '</table>'.length
              );
              const tick = prevSuggestionTable.includes('\u2705') ? '\u2705 ' : '';
              const foldedTable = `<details><summary>${tick}${(opts.name || '').charAt(0).toUpperCase() + (opts.name || '').slice(1)}${upToCommitTxt}</summary>\n<br>${prevSuggestionTable}\n\n</details>`;

              const newSuggestionTable = prComment.replace(opts.initialHeader, '').trim();
              let prCommentUpdated =
                `${opts.initialHeader}\n${latestCommitHtmlComment}\n\n` +
                `${latestSuggestionHeader}\n${newSuggestionTable}\n\n___\n\n` +
                `${historyHeader}${foldedTable}\n`;
              this.gitProvider.editComment(opts.progressResponse || foundComment, { body: prCommentUpdated });
              if (opts.progressResponse) {
                this.gitProvider.removeComment(foundComment);
              }
              return opts.progressResponse || foundComment;
            } else {
              const sections = prevSuggestions.split(historyHeader.trim());
              let latestTable = sections[0].trim();
              let prevSuggestionTable = sections[1]?.replace(historyHeader, '').trim() || '';

              const tableInd = latestTable.indexOf('<table>');
              const upToCommitTxt = extractLink(latestTable.slice(0, tableInd));
              latestTable = latestTable.slice(tableInd, latestTable.lastIndexOf('</table>') + '</table>'.length);

              let count = prevSuggestions.split(`\n<details><summary>${(opts.name || '').charAt(0).toUpperCase() + (opts.name || '').slice(1)}`).length - 1;
              count += prevSuggestions.split(`\n<details><summary>\u2705 ${(opts.name || '').charAt(0).toUpperCase() + (opts.name || '').slice(1)}`).length - 1;
              if (count >= maxPrev) {
                const searchStr = `<details><summary>${(opts.name || '').charAt(0).toUpperCase() + (opts.name || '').slice(1)} up to commit`;
                const lastIdx = prevSuggestionTable.lastIndexOf(searchStr);
                if (lastIdx !== -1) {
                  prevSuggestionTable = prevSuggestionTable.slice(0, lastIdx);
                }
              }

              const tick = latestTable.includes('\u2705') ? '\u2705 ' : '';
              const lastPrevTable = `\n<details><summary>${tick}${(opts.name || '').charAt(0).toUpperCase() + (opts.name || '').slice(1)}${upToCommitTxt}</summary>\n<br>${latestTable}\n\n</details>`;
              prevSuggestionTable = lastPrevTable + '\n' + prevSuggestionTable;

              const newSuggestionTable = prComment.replace(opts.initialHeader, '').trim();
              let prCommentUpdated =
                `${opts.initialHeader}\n${latestCommitHtmlComment}\n\n` +
                `${latestSuggestionHeader}\n\n${newSuggestionTable}\n\n___\n\n` +
                `${historyHeader}\n${prevSuggestionTable}\n`;

              this.gitProvider.editComment(opts.progressResponse || foundComment, { body: prCommentUpdated });
              if (opts.progressResponse) {
                this.gitProvider.removeComment(foundComment);
              }
              return opts.progressResponse || foundComment;
            }
          }
        }
      } catch (e: any) {
        console.error(`Failed to update persistent review, error: ${e.message}`);
      }
    }

    const body = prComment.replace(opts.initialHeader, '').trim();
    const finalComment = `${opts.initialHeader}\n\n${latestCommitHtmlComment}\n\n${body}\n\n`;
    if (opts.progressResponse) {
      this.gitProvider.editComment(opts.progressResponse, { body: finalComment });
      return opts.progressResponse;
    } else {
      return this.gitProvider.publishComment(finalComment);
    }
  }

  private async preparePredictionMain(): Promise<any> {
    const model = this.getSettings().config?.model || 'gpt-4';
    const decoupleHunks = this.getSettings().pr_code_suggestions?.decouple_hunks ?? true;

    if (decoupleHunks) {
      this.patchesDiffList = this.getPrMultiDiffs(model, {
        maxCalls: this.getSettings().pr_code_suggestions?.max_number_of_calls || 5,
        addLineNumbers: true,
      });
      this.patchesDiffListNoLineNumbers = this.removeLineNumbers(this.patchesDiffList);
    } else {
      this.patchesDiffListNoLineNumbers = this.getPrMultiDiffs(model, {
        maxCalls: this.getSettings().pr_code_suggestions?.max_number_of_calls || 5,
        addLineNumbers: false,
      });
      this.patchesDiffList = await this.convertToDecoupledWithLineNumbers(
        this.patchesDiffListNoLineNumbers,
        model
      );
      if (!this.patchesDiffList || this.patchesDiffList.length === 0) {
        this.patchesDiffList = this.getPrMultiDiffs(model, {
          maxCalls: this.getSettings().pr_code_suggestions?.max_number_of_calls || 5,
          addLineNumbers: true,
        });
      }
    }

    if (this.patchesDiffList && this.patchesDiffList.length > 0) {
      console.log(`Number of PR chunk calls: ${this.patchesDiffList.length}`);

      const parallel = this.getSettings().pr_code_suggestions?.parallel_calls ?? false;
      if (parallel) {
        const promises = this.patchesDiffList.map((patchesDiff, i) =>
          this.getPrediction(model, patchesDiff, this.patchesDiffListNoLineNumbers[i])
        );
        this.predictionList = await Promise.all(promises);
      } else {
        this.predictionList = [];
        for (let i = 0; i < this.patchesDiffList.length; i++) {
          const prediction = await this.getPrediction(
            model,
            this.patchesDiffList[i],
            this.patchesDiffListNoLineNumbers[i]
          );
          this.predictionList.push(prediction);
        }
      }

      const data: any = { code_suggestions: [] };
      const scoreThreshold = Math.max(1, this.getSettings().pr_code_suggestions?.suggestions_score_threshold || 1);

      for (let j = 0; j < this.predictionList.length; j++) {
        const predictions = this.predictionList[j];
        if (predictions && predictions.code_suggestions) {
          for (let i = 0; i < predictions.code_suggestions.length; i++) {
            try {
              const prediction = predictions.code_suggestions[i];
              const score = parseInt(prediction.score, 10) || 1;
              if (score >= scoreThreshold) {
                data.code_suggestions.push(prediction);
              } else {
                console.log(`Removing suggestions ${i} from call ${j}, because score is ${score}`);
              }
            } catch (e: any) {
              console.error(`Error processing suggestion ${i} in call ${j}: ${e.message}`);
            }
          }
        }
      }
      this.data = data;
      return data;
    } else {
      console.warn('Empty PR diff list');
      this.data = null;
      return null;
    }
  }

  private async getPrediction(
    model: string,
    patchesDiff: string,
    patchesDiffNoLineNumbers: string
  ): Promise<any> {
    const variables = { ...this.vars };
    variables.diff = patchesDiff;
    variables.diffNoLineNumbers = patchesDiffNoLineNumbers;

    const systemPrompt = this.renderTemplate(this.prCodeSuggestionsPromptSystem, variables);
    const userPrompt = this.renderTemplate(this.prCodeSuggestionsPromptUser, variables);

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.aiHandler.complete(messages);
    const data = this.preparePrCodeSuggestions(response.content);

    const modelReflect = (this.getSettings().config as any)?.model_reasoning || model;
    const responseReflect = await this.selfReflectOnSuggestions(
      data.code_suggestions,
      patchesDiff,
      modelReflect
    );

    if (responseReflect) {
      await this.analyzeSelfReflectionResponse(data, responseReflect);
    } else {
      for (let i = 0; i < data.code_suggestions.length; i++) {
        data.code_suggestions[i].score = 7;
        data.code_suggestions[i].score_why = '';
      }
    }

    return data;
  }

  private async analyzeSelfReflectionResponse(data: any, responseReflect: string): Promise<void> {
    const responseReflectYaml = this.loadYaml(responseReflect);
    const codeSuggestionsFeedback = responseReflectYaml?.code_suggestions || [];

    if (codeSuggestionsFeedback.length > 0 && codeSuggestionsFeedback.length === data.code_suggestions.length) {
      for (let i = 0; i < data.code_suggestions.length; i++) {
        try {
          const suggestion = data.code_suggestions[i];
          suggestion.score = codeSuggestionsFeedback[i].suggestion_score;
          suggestion.score_why = codeSuggestionsFeedback[i].why;

          if (suggestion.relevant_lines_start === undefined) {
            const rlStart = codeSuggestionsFeedback[i].relevant_lines_start;
            const rlEnd = codeSuggestionsFeedback[i].relevant_lines_end;
            suggestion.relevant_lines_start = rlStart ?? -1;
            suggestion.relevant_lines_end = rlEnd ?? -1;
            if (suggestion.relevant_lines_start < 0 || suggestion.relevant_lines_end < 0) {
              suggestion.score = 0;
            }
          }

          suggestion = this.validateOneLinerSuggestionNotRepeatingCode(suggestion);

          if (suggestion.existing_code === suggestion.improved_code) {
            console.log(`Edited improved suggestion ${i + 1}, because equal to existing code`);
            if (this.getSettings().pr_code_suggestions?.commitable_code_suggestions) {
              suggestion.improved_code = '';
            } else {
              suggestion.existing_code = '';
            }
          }
        } catch (e: any) {
          console.error(`Error processing suggestion ${i}: ${e.message}`);
          suggestion.score = 7;
          suggestion.score_why = '';
        }
      }
    }
  }

  private preparePrCodeSuggestions(predictions: string): any {
    const data = this.loadYaml(predictions, {
      keysFixYaml: ['relevant_file', 'suggestion_content', 'existing_code', 'improved_code'],
      firstKey: 'code_suggestions',
      lastKey: 'label',
    });

    const result: any = Array.isArray(data) ? { code_suggestions: data } : { ...data };
    if (!result.code_suggestions) result.code_suggestions = [];

    const suggestionList: any[] = [];
    const oneSentenceSummaryList: string[] = [];

    for (let i = 0; i < result.code_suggestions.length; i++) {
      try {
        const suggestion = result.code_suggestions[i];
        const neededKeys = ['one_sentence_summary', 'label', 'relevant_file'];
        let isValid = true;
        for (const key of neededKeys) {
          if (!(key in suggestion)) {
            isValid = false;
            console.log(`Skipping suggestion ${i + 1}, because it does not contain '${key}'`);
            break;
          }
        }
        if (!isValid) continue;

        if (this.getSettings().pr_code_suggestions?.focus_only_on_problems) {
          if (suggestion.label?.toLowerCase().includes('critical')) {
            suggestion.label = 'possible issue';
          }
        }

        if (oneSentenceSummaryList.includes(suggestion.one_sentence_summary)) {
          console.log(`Skipping suggestion ${i + 1}, because it is a duplicate`);
          continue;
        }

        if (
          suggestion.suggestion_content?.includes('const') &&
          suggestion.suggestion_content?.includes('instead') &&
          suggestion.suggestion_content?.includes('let')
        ) {
          console.log(`Skipping suggestion ${i + 1}, because it uses 'const instead let'`);
          continue;
        }

        if (suggestion.existing_code !== undefined && suggestion.improved_code !== undefined) {
          suggestion = this.truncateIfNeeded(suggestion);
          oneSentenceSummaryList.push(suggestion.one_sentence_summary);
          suggestionList.push(suggestion);
        } else {
          console.log(
            `Skipping suggestion ${i + 1}, because it does not contain 'existing_code' or 'improved_code'`
          );
        }
      } catch (e: any) {
        console.error(`Error processing suggestion ${i + 1}: ${e.message}`);
      }
    }

    result.code_suggestions = suggestionList;
    return result;
  }

  private truncateIfNeeded(suggestion: any): any {
    const maxLen = this.getSettings().pr_code_suggestions?.max_code_suggestion_length || 0;
    const truncMsg = this.getSettings().pr_code_suggestions?.suggestion_truncation_message || '';
    if (maxLen > 0 && suggestion.improved_code?.length > maxLen) {
      console.log(
        `Truncated suggestion from ${suggestion.improved_code.length} to ${maxLen}`
      );
      suggestion.improved_code = suggestion.improved_code.slice(0, maxLen) + `\n${truncMsg}`;
    }
    return suggestion;
  }

  private async pushInlineCodeSuggestions(data: any): Promise<void> {
    const codeSuggestions: any[] = [];

    if (!data.code_suggestions || data.code_suggestions.length === 0) {
      console.log('No suggestions found to improve this PR.');
      if (this.progressResponse) {
        return this.gitProvider.editComment(this.progressResponse, {
          body: 'No suggestions found to improve this PR.',
        });
      } else {
        return this.gitProvider.publishComment('No suggestions found to improve this PR.');
      }
    }

    for (const d of data.code_suggestions) {
      try {
        const relevantFile = d.relevant_file.trim();
        const relevantLinesStart = parseInt(d.relevant_lines_start, 10);
        const relevantLinesEnd = parseInt(d.relevant_lines_end, 10);
        const content = (d.suggestion_content || '').trim();
        let newCodeSnippet = (d.improved_code || '').trim();
        const label = (d.label || '').trim();

        if (newCodeSnippet) {
          newCodeSnippet = this.dedentCode(relevantFile, relevantLinesStart, newCodeSnippet);
        }

        const score = d.score;
        const body = score
          ? `**Suggestion:** ${content} [${label}, importance: ${score}]\n\`\`\`suggestion\n${newCodeSnippet}\n\`\`\``
          : `**Suggestion:** ${content} [${label}]\n\`\`\`suggestion\n${newCodeSnippet}\n\`\`\``;

        codeSuggestions.push({
          body,
          relevant_file: relevantFile,
          relevant_lines_start: relevantLinesStart,
          relevant_lines_end: relevantLinesEnd,
          original_suggestion: d,
        });
      } catch {
        console.log(`Could not parse suggestion: ${d}`);
      }
    }

    const isSuccessful = this.gitProvider.publishCodeSuggestions(codeSuggestions);
    if (!isSuccessful) {
      console.log('Failed to publish code suggestions, trying each separately');
      for (const cs of codeSuggestions) {
        this.gitProvider.publishCodeSuggestions([cs]);
      }
    }
  }

  private dedentCode(relevantFile: string, relevantLinesStart: number, newCodeSnippet: string): string {
    try {
      const diffFiles =
        this.gitProvider.diffFiles || this.gitProvider.getDiffFiles();
      let originalInitialLine: string | null = null;

      for (const file of diffFiles) {
        if (file.filename.trim() === relevantFile) {
          if (file.head_file) {
            const fileLines = file.head_file.split('\n');
            if (relevantLinesStart > fileLines.length) {
              console.warn('relevant_lines_start out of range');
              return newCodeSnippet;
            }
            originalInitialLine = fileLines[relevantLinesStart - 1];
          } else {
            console.warn('head_file is missing');
            return newCodeSnippet;
          }
          break;
        }
      }

      if (originalInitialLine) {
        const suggestedInitialLine = newCodeSnippet.split('\n')[0];
        const originalSpaces = originalInitialLine.length - originalInitialLine.trimStart().length;
        const suggestedSpaces = suggestedInitialLine.length - suggestedInitialLine.trimStart().length;
        const deltaSpaces = originalSpaces - suggestedSpaces;
        if (deltaSpaces > 0) {
          const indentChar = originalInitialLine.startsWith('\t') ? '\t' : ' ';
          newCodeSnippet =
            newCodeSnippet
              .split('\n')
              .map((line) => indentChar.repeat(deltaSpaces) + line)
              .join('\n')
              .trimEnd();
        }
      }
    } catch (e: any) {
      console.error(`Error when dedenting code snippet for file ${relevantFile}: ${e.message}`);
    }
    return newCodeSnippet;
  }

  private validateOneLinerSuggestionNotRepeatingCode(suggestion: any): any {
    try {
      const existingCode = (suggestion.existing_code || '').trim();
      if (existingCode.includes('...')) return suggestion;
      const newCode = (suggestion.improved_code || '').trim();
      const relevantFile = (suggestion.relevant_file || '').trim();
      const diffFiles = this.gitProvider.getDiffFiles();

      for (const file of diffFiles) {
        if (file.filename.trim() === relevantFile) {
          if (!file.head_file) {
            console.log('head_file is empty');
            return suggestion;
          }
          const headFile = file.head_file;
          const baseFile = file.base_file;
          if (baseFile?.includes(existingCode) && !headFile.includes(existingCode) && headFile.includes(newCode)) {
            suggestion.score = 0;
            console.warn('existing_code is in base file but not in head file, setting score to 0');
          }
          break;
        }
      }
    } catch (e: any) {
      console.error(`Error validating one-liner suggestion: ${e.message}`);
    }
    return suggestion;
  }

  private removeLineNumbers(patchesDiffList: string[]): string[] {
    try {
      return patchesDiffList.map((patchesDiff) => {
        const lines = patchesDiff.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.length > 0) {
            if (/^\d+$/.test(line)) {
              lines[i] = '';
            } else if (/^\d/.test(line)) {
              for (let j = 0; j < line.length; j++) {
                if (!/\d/.test(line[j])) {
                  lines[i] = line.slice(j + 1);
                  break;
                }
              }
            }
          }
        }
        return lines.join('\n');
      });
    } catch {
      return patchesDiffList;
    }
  }

  private async convertToDecoupledWithLineNumbers(
    patchesDiffListNoLineNumbers: string[],
    model: string
  ): Promise<string[]> {
    try {
      const patchesDiffList: string[] = [];
      for (const patchPrompt of patchesDiffListNoLineNumbers) {
        const filePrefix = '## File: ';
        const patches = patchPrompt.trim().split(`\n${filePrefix}`);
        const patchesNew = [...patches];

        for (let i = 0; i < patchesNew.length; i++) {
          let prefix: string;
          const parts = patchesNew[i].split('\n@@');
          if (i === 0) {
            prefix = parts[0].trim();
          } else {
            prefix = filePrefix + parts[0].slice(1).trim();
          }

          const rest = parts.slice(1).join('\n@@');
          const decoupled = this.decoupleAndConvertToHunksWithLineNumbers(prefix + '\n\n' + rest);
          patchesNew[i] = prefix + '\n\n' + decoupled.trim();
          patchesNew[i] = patchesNew[i].trim();
        }

        let patchFinal = patchesNew.join('\n\n\n');
        const maxTokens = MAX_TOKENS[model] || 128000;
        const deltaOutput = 2000;
        const tokenCount = this.countTokens(patchFinal);
        if (tokenCount > maxTokens - deltaOutput) {
          console.warn(`Token count ${tokenCount} exceeds limit, clipping`);
          patchFinal = this.clipTokens(patchFinal, maxTokens - deltaOutput);
        }
        patchesDiffList.push(patchFinal);
      }
      return patchesDiffList;
    } catch (e: any) {
      console.error(`Error converting to decoupled with line numbers: ${e.message}`);
      return [];
    }
  }

  private decoupleAndConvertToHunksWithLineNumbers(patch: string): string {
    const lines = patch.split('\n');
    const result: string[] = [];
    let currentHunk: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (currentHunk.length > 0) {
          result.push(...currentHunk);
          currentHunk = [];
        }
        inHunk = true;
        currentHunk.push(line);
      } else if (inHunk) {
        if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
          currentHunk.push(line);
        } else {
          if (currentHunk.length > 0) {
            result.push(...currentHunk);
            currentHunk = [];
          }
          inHunk = false;
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }
    if (currentHunk.length > 0) {
      result.push(...currentHunk);
    }
    return result.join('\n');
  }

  private generateSummarizedSuggestions(data: any): string {
    try {
      let prBody = '## PR Code Suggestions \u2728\n\n';

      if (!data.code_suggestions || data.code_suggestions.length === 0) {
        prBody += 'No suggestions found to improve this PR.';
        return prBody;
      }

      if (this.getSettings().config?.is_auto_command) {
        prBody += 'Explore these optional code suggestions:\n\n';
      }

      prBody += '<table>';
      prBody +=
        '<thead><tr><td><strong>Category</strong></td><td align=left><strong>Suggestion</strong></td><td align=center><strong>Impact</strong></td></tr>';
      prBody += '<tbody>';

      const suggestionsLabels: Record<string, any[]> = {};
      for (const suggestion of data.code_suggestions) {
        const label = (suggestion.label || '').trim().replace(/['"]/g, '');
        if (!suggestionsLabels[label]) {
          suggestionsLabels[label] = [];
        }
        suggestionsLabels[label].push(suggestion);
      }

      const sortedLabels = Object.entries(suggestionsLabels).sort(
        (a, b) => Math.max(...b[1].map((s: any) => s.score)) - Math.max(...a[1].map((s: any) => s.score))
      );

      for (const [label, suggestions] of sortedLabels) {
        const sortedSuggestions = [...suggestions].sort(
          (a: any, b: any) => b.score - a.score
        );
        const numSuggestions = sortedSuggestions.length;

        prBody += `<tr><td rowspan=${numSuggestions}>${label.charAt(0).toUpperCase() + label.slice(1)}</td>\n`;

        for (let i = 0; i < sortedSuggestions.length; i++) {
          const suggestion = sortedSuggestions[i];
          const relevantFile = (suggestion.relevant_file || '').trim();
          const rls = parseInt(suggestion.relevant_lines_start, 10);
          const rle = parseInt(suggestion.relevant_lines_end, 10);
          const rangeStr = rls === rle ? `[${rls}]` : `[${rls}-${rle}]`;

          let codeSnippetLink = '';
          try {
            codeSnippetLink = this.gitProvider.getLineLink(relevantFile, rls, rle);
          } catch {
            codeSnippetLink = '';
          }

          const suggestionContent = (suggestion.suggestion_content || '').trim();
          const existingCode = (suggestion.existing_code || '') + '\n';
          const improvedCode = (suggestion.improved_code || '') + '\n';

          const existingLines = existingCode.split('\n');
          const improvedLines = improvedCode.split('\n');
          const diff = this.computeDiff(existingLines, improvedLines);

          let exampleCode = `\`\`\`diff\n${diff}\n\`\`\`\n`;

          if (i === 0) {
            prBody += `<td>\n\n`;
          } else {
            prBody += `<tr><td>\n\n`;
          }

          const summary = (suggestion.one_sentence_summary || '').trim().replace(/\.$/, '');

          prBody += `\n\n<details><summary>${summary}</summary>\n\n___\n\n`;
          prBody += `**${suggestionContent}**\n\n`;
          prBody += `[${relevantFile} ${rangeStr}](${codeSnippetLink})\n\n`;
          prBody += `${exampleCode.trim()}\n`;

          if (suggestion.score_why) {
            prBody += `<details><summary>Suggestion importance[1-10]: ${suggestion.score}</summary>\n\n`;
            prBody += `__\n\nWhy: ${suggestion.score_why}\n\n`;
            prBody += `</details>`;
          }

          prBody += `</details>`;

          const scoreInt = parseInt(suggestion.score, 10) || 0;
          const scoreStr = this.getScoreStr(scoreInt);
          prBody += `</td><td align=center>${scoreStr}\n\n</td></tr>`;
        }
      }

      prBody += '</tr></tbody></table>';
      return prBody;
    } catch (e: any) {
      console.log(`Failed to publish summarized code suggestions, error: ${e.message}`);
      return '';
    }
  }

  private getScoreStr(score: number): string {
    const thHigh = this.getSettings().pr_code_suggestions?.new_score_mechanism_th_high ?? 9;
    const thMedium = this.getSettings().pr_code_suggestions?.new_score_mechanism_th_medium ?? 7;
    if (score >= thHigh) return 'High';
    if (score >= thMedium) return 'Medium';
    return 'Low';
  }

  private async selfReflectOnSuggestions(
    suggestionList: any[],
    patchesDiff: string,
    model: string,
    prevSuggestionsStr: string = '',
    dedicatedPrompt: string = ''
  ): Promise<string> {
    if (!suggestionList || suggestionList.length === 0) return '';

    try {
      const suggestionStr = suggestionList
        .map((s, i) => `suggestion ${i + 1}: ${JSON.stringify(s)}`)
        .join('\n\n');

      const variables: Record<string, unknown> = {
        suggestion_list: suggestionList,
        suggestion_str: suggestionStr,
        diff: patchesDiff,
        num_code_suggestions: suggestionList.length,
        prev_suggestions_str: prevSuggestionsStr,
        is_ai_metadata: this.getSettings().config?.enable_ai_metadata ?? false,
        duplicate_prompt_examples: this.getSettings().config?.duplicate_prompt_examples ?? false,
      };

      let systemPromptReflect: string;
      let userPromptReflect: string;

      if (dedicatedPrompt) {
        systemPromptReflect = this.renderTemplate(
          (this.getSettings() as any)[dedicatedPrompt]?.system || '',
          variables
        );
        userPromptReflect = this.renderTemplate(
          (this.getSettings() as any)[dedicatedPrompt]?.user || '',
          variables
        );
      } else {
        systemPromptReflect = this.renderTemplate(
          (this.getSettings() as any).pr_code_suggestions_reflect_prompt?.system || '',
          variables
        );
        userPromptReflect = this.renderTemplate(
          (this.getSettings() as any).pr_code_suggestions_reflect_prompt?.user || '',
          variables
        );
      }

      const messages: AIMessage[] = [
        { role: 'system', content: systemPromptReflect },
        { role: 'user', content: userPromptReflect },
      ];

      const response = await this.aiHandler.complete(messages);
      return response.content;
    } catch (e: any) {
      console.log(`Could not reflect on suggestions, error: ${e.message}`);
      return '';
    }
  }

  private computeDiff(oldLines: string[], newLines: string[]): string {
    const result: string[] = [];
    let oi = 0;
    let ni = 0;
    while (oi < oldLines.length || ni < newLines.length) {
      if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
        result.push(' ' + oldLines[oi]);
        oi++;
        ni++;
      } else {
        if (oi < oldLines.length) {
          result.push('-' + oldLines[oi]);
          oi++;
        }
        if (ni < newLines.length) {
          result.push('+' + newLines[ni]);
          ni++;
        }
      }
    }
    return result.join('\n');
  }

  private getPrMultiDiffs(
    model: string,
    opts?: { maxCalls?: number; addLineNumbers?: boolean }
  ): string[] {
    if (this.gitProvider.getPrMultiDiffs) {
      return this.gitProvider.getPrMultiDiffs(this.gitProvider, null, model, opts || {});
    }
    return [this.getPrDiff(model) || ''].filter(Boolean);
  }

  private getPrDiff(model: string): string | null {
    if (this.gitProvider.getPrDiff) {
      return this.gitProvider.getPrDiff(this.gitProvider, null, model, {
        addLineNumbersToHunks: true,
        disableExtraLines: false,
      });
    }
    return null;
  }

  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = variables[trimmedKey];
      return value !== undefined ? String(value) : match;
    });
  }

  private loadYaml(
    text: string,
    opts?: { keysFixYaml?: string[]; firstKey?: string; lastKey?: string }
  ): any {
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

      if (opts?.firstKey && result[opts.firstKey]) {
        const val = result[opts.firstKey];
        if (typeof val === 'string') {
          result[opts.firstKey] = this.loadYaml(val, opts);
        }
      }

      return result;
    } catch {
      return null;
    }
  }

  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private clipTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length > maxChars) {
      return text.slice(0, maxChars);
    }
    return text;
  }

  getImproveUsageGuide(): string {
    return 'Use `/improve` to get code improvement suggestions.';
  }
}
