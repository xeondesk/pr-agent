import {
  FilePatchInfo,
  EDIT_TYPE,
  ModelType,
} from '@pr-agent/types';
import { getSettings } from './config.js';
import { getLogger } from './logger.js';
import {
  extendPatch,
  handlePatchDeletions,
  decoupleAndConvertToHunksWithLinesNumbers,
} from './gitPatchProcessing.js';
import { sortFilesByMainLanguages } from './languageHandler.js';
import { clipTokens, getMaxTokens, getModel } from './utils.js';

export const DELETED_FILES_ = 'Deleted files:\n';

export const MORE_MODIFIED_FILES_ = 'Additional modified files (insufficient token budget to process):\n';

export const ADDED_FILES_ = 'Additional added files (insufficient token budget to process):\n';

export const OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD = 1500;
export const OUTPUT_BUFFER_TOKENS_HARD_THRESHOLD = 1000;
export const MAX_EXTRA_LINES = 10;

export interface TokenHandler {
  prompt_tokens: number;
  count_tokens: (text: string) => number;
}

export function capAndLogExtraLines(value: number, direction: string): number {
  if (value > MAX_EXTRA_LINES) {
    getLogger().warning(`patch_extra_lines_${direction} was ${value}, capping to ${MAX_EXTRA_LINES}`);
    return MAX_EXTRA_LINES;
  }
  return value;
}

export function getPrDiff(
  gitProvider: any,
  tokenHandler: TokenHandler,
  model: string,
  addLineNumbersToHunks: boolean = false,
  disableExtraLines: boolean = false,
  largePrHandling: boolean = false,
  returnRemainingFiles: boolean = false
): string | [string, any[]] {
  let PATCH_EXTRA_LINES_BEFORE: number;
  let PATCH_EXTRA_LINES_AFTER: number;

  if (disableExtraLines) {
    PATCH_EXTRA_LINES_BEFORE = 0;
    PATCH_EXTRA_LINES_AFTER = 0;
  } else {
    PATCH_EXTRA_LINES_BEFORE = (getSettings().get('config.patch_extra_lines_before') as number) ?? 0;
    PATCH_EXTRA_LINES_AFTER = (getSettings().get('config.patch_extra_lines_after') as number) ?? 0;
    PATCH_EXTRA_LINES_BEFORE = capAndLogExtraLines(PATCH_EXTRA_LINES_BEFORE, 'before');
    PATCH_EXTRA_LINES_AFTER = capAndLogExtraLines(PATCH_EXTRA_LINES_AFTER, 'after');
  }

  let diffFiles: any[];
  try {
    diffFiles = gitProvider.get_diff_files();
  } catch (e) {
    getLogger().error(`Rate limit exceeded for git provider API. original message ${e}`);
    throw e;
  }

  const prLanguages = sortFilesByMainLanguages(gitProvider.get_languages(), diffFiles);
  if (prLanguages && prLanguages.length > 0) {
    try {
      getLogger().info(`PR main language: ${prLanguages[0].language}`);
    } catch {
      // ignore
    }
  }

  const [patchesExtended, totalTokens, patchesExtendedTokens] = prGenerateExtendedDiff(
    prLanguages, tokenHandler, addLineNumbersToHunks,
    PATCH_EXTRA_LINES_BEFORE, PATCH_EXTRA_LINES_AFTER
  );

  if (totalTokens + OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD < getMaxTokens(model)) {
    getLogger().info(`Tokens: ${totalTokens}, total tokens under limit: ${getMaxTokens(model)}, returning full diff.`);
    return patchesExtended.join('\n');
  }

  getLogger().info(`Tokens: ${totalTokens}, total tokens over limit: ${getMaxTokens(model)}, pruning diff.`);

  const [
    patchesCompressedList, totalTokensList, deletedFilesList,
    remainingFilesList, fileDict, filesInPatchesList
  ] = prGenerateCompressedDiff(
    prLanguages, tokenHandler, model, addLineNumbersToHunks, largePrHandling
  );

  if (largePrHandling && patchesCompressedList.length > 1) {
    getLogger().info(`Large PR handling mode, and found ${patchesCompressedList.length} patches with original diff.`);
    return '';
  }

  const patchesCompressed = patchesCompressedList[0] || [];
  const totalTokensNew = totalTokensList[0];
  const filesInPatch = filesInPatchesList[0];

  const maxTokens = getMaxTokens(model) - OUTPUT_BUFFER_TOKENS_HARD_THRESHOLD;
  let currToken = totalTokensNew;
  let finalDiff = patchesCompressed.join('\n');
  const deltaTokens = 10;
  let addedListStr = '';
  let modifiedListStr = '';
  let deletedListStr = '';
  const unprocessedFiles: string[] = [];

  if ((maxTokens - currToken) > deltaTokens) {
    for (const [filename, fileValues] of Object.entries(fileDict as Record<string, any>)) {
      if (filesInPatch.includes(filename)) continue;
      if (fileValues.edit_type === EDIT_TYPE.ADDED) {
        unprocessedFiles.push(filename);
        addedListStr = addedListStr
          ? `${addedListStr}\n${filename}`
          : `${ADDED_FILES_}\n${filename}`;
      } else if (fileValues.edit_type === EDIT_TYPE.MODIFIED || fileValues.edit_type === EDIT_TYPE.RENAMED) {
        unprocessedFiles.push(filename);
        modifiedListStr = modifiedListStr
          ? `${modifiedListStr}\n${filename}`
          : `${MORE_MODIFIED_FILES_}\n${filename}`;
      } else if (fileValues.edit_type === EDIT_TYPE.DELETED) {
        deletedListStr = deletedListStr
          ? `${deletedListStr}\n${filename}`
          : `${DELETED_FILES_}\n${filename}`;
      }
    }
  }

  addedListStr = clipTokens(addedListStr, maxTokens - currToken);
  if (addedListStr) {
    finalDiff = `${finalDiff}\n\n${addedListStr}`;
    currToken += tokenHandler.count_tokens(addedListStr) + 2;
  }
  modifiedListStr = clipTokens(modifiedListStr, maxTokens - currToken);
  if (modifiedListStr) {
    finalDiff = `${finalDiff}\n\n${modifiedListStr}`;
    currToken += tokenHandler.count_tokens(modifiedListStr) + 2;
  }
  deletedListStr = clipTokens(deletedListStr, maxTokens - currToken);
  if (deletedListStr) {
    finalDiff = `${finalDiff}\n\n${deletedListStr}`;
  }

  getLogger().debug(
    `After pruning, addedListStr: ${addedListStr}, modifiedListStr: ${modifiedListStr}, deletedListStr: ${deletedListStr}`
  );

  if (!returnRemainingFiles) {
    return finalDiff;
  }
  return [finalDiff, remainingFilesList];
}

export function getPrDiffMultiplePatches(
  gitProvider: any,
  tokenHandler: TokenHandler,
  model: string,
  addLineNumbersToHunks: boolean = false,
  disableExtraLines: boolean = false
): [string[][], number[], string[], string[], any, string[][]] {
  let diffFiles: any[];
  try {
    diffFiles = gitProvider.get_diff_files();
  } catch (e) {
    getLogger().error(`Rate limit exceeded for git provider API. original message ${e}`);
    throw e;
  }

  const prLanguages = sortFilesByMainLanguages(gitProvider.get_languages(), diffFiles);
  if (prLanguages && prLanguages.length > 0) {
    try {
      getLogger().info(`PR main language: ${prLanguages[0].language}`);
    } catch {
      // ignore
    }
  }

  const [
    patchesCompressedList, totalTokensList, deletedFilesList,
    remainingFilesList, fileDict, filesInPatchesList
  ] = prGenerateCompressedDiff(
    prLanguages, tokenHandler, model, addLineNumbersToHunks, true
  );

  return [patchesCompressedList, totalTokensList, deletedFilesList, remainingFilesList, fileDict, filesInPatchesList];
}

export function prGenerateExtendedDiff(
  prLanguages: any[],
  tokenHandler: TokenHandler,
  addLineNumbersToHunks: boolean,
  patchExtraLinesBefore: number = 0,
  patchExtraLinesAfter: number = 0
): [string[], number, number[]] {
  let totalTokens = tokenHandler.prompt_tokens;
  const patchesExtended: string[] = [];
  const patchesExtendedTokens: number[] = [];

  for (const lang of prLanguages) {
    for (const file of lang.files) {
      const originalFileContentStr = file.base_file;
      const newFileContentStr = file.head_file;
      const patch = file.patch;
      if (!patch) continue;

      let extendedPatch = extendPatch(
        originalFileContentStr, patch,
        patchExtraLinesBefore, patchExtraLinesAfter, file.filename,
        newFileContentStr
      );
      if (!extendedPatch) {
        getLogger().warning(`Failed to extend patch for file: ${file.filename}`);
        continue;
      }

      let fullExtendedPatch: string;
      if (addLineNumbersToHunks) {
        fullExtendedPatch = decoupleAndConvertToHunksWithLinesNumbers(extendedPatch, file);
      } else {
        extendedPatch = extendedPatch.replace(/\n@@ /g, '\n\n@@ ');
        fullExtendedPatch = `\n\n## File: '${file.filename.trim()}'\n\n${extendedPatch.trim()}\n`;
      }

      if (file.ai_file_summary && getSettings().get('config.enable_ai_metadata')) {
        fullExtendedPatch = addAiSummaryTopPatch(file, fullExtendedPatch);
      }

      const patchTokens = tokenHandler.count_tokens(fullExtendedPatch);
      file.tokens = patchTokens;
      totalTokens += patchTokens;
      patchesExtendedTokens.push(patchTokens);
      patchesExtended.push(fullExtendedPatch);
    }
  }

  return [patchesExtended, totalTokens, patchesExtendedTokens];
}

export function prGenerateCompressedDiff(
  topLangs: any[],
  tokenHandler: TokenHandler,
  model: string,
  convertHunksToLineNumbers: boolean,
  largePrHandling: boolean
): [string[][], number[], string[], string[], any, string[][]] {
  const deletedFilesList: string[] = [];

  const sortedFiles: any[] = [];
  for (const lang of topLangs) {
    sortedFiles.push(...lang.files.sort((a: any, b: any) => b.tokens - a.tokens));
  }

  const fileDict: Record<string, { patch: string; tokens: number; edit_type: number }> = {};
  for (const file of sortedFiles) {
    const originalFileContentStr = file.base_file;
    const newFileContentStr = file.head_file;
    let patch = file.patch;
    if (!patch) continue;

    patch = handlePatchDeletions(patch, originalFileContentStr, newFileContentStr, file.filename, file.edit_type) as string;
    if (patch === null) {
      if (!deletedFilesList.includes(file.filename)) {
        deletedFilesList.push(file.filename);
      }
      continue;
    }

    if (convertHunksToLineNumbers) {
      patch = decoupleAndConvertToHunksWithLinesNumbers(patch, file);
    }

    const newPatchTokens = tokenHandler.count_tokens(patch);
    fileDict[file.filename] = { patch, tokens: newPatchTokens, edit_type: file.edit_type };
  }

  const maxTokensModel = getMaxTokens(model);

  const filesInPatchesList: string[][] = [];
  const remainingFilesList = sortedFiles.map((f: any) => f.filename);
  const patchesList: string[][] = [];
  const totalTokensList: number[] = [];

  let [totalTokens, patches, newRemaining, filesInPatch] = generateFullPatch(
    convertHunksToLineNumbers, fileDict, maxTokensModel, remainingFilesList, tokenHandler
  );
  patchesList.push(patches);
  totalTokensList.push(totalTokens);
  filesInPatchesList.push(filesInPatch);

  if (largePrHandling) {
    const NUMBER_OF_ALLOWED_ITERATIONS = ((getSettings().get('pr_description.max_ai_calls') as number) ?? 1) - 1;
    for (let i = 0; i < NUMBER_OF_ALLOWED_ITERATIONS - 1; i++) {
      if (newRemaining.length > 0) {
        [totalTokens, patches, newRemaining, filesInPatch] = generateFullPatch(
          convertHunksToLineNumbers, fileDict, maxTokensModel, newRemaining, tokenHandler
        );
        if (patches.length > 0) {
          patchesList.push(patches);
          totalTokensList.push(totalTokens);
          filesInPatchesList.push(filesInPatch);
        }
      } else {
        break;
      }
    }
  }

  return [patchesList, totalTokensList, deletedFilesList, newRemaining, fileDict, filesInPatchesList];
}

export function generateFullPatch(
  convertHunksToLineNumbers: boolean,
  fileDict: Record<string, { patch: string; tokens: number; edit_type: number }>,
  maxTokensModel: number,
  remainingFilesListPrev: string[],
  tokenHandler: TokenHandler
): [number, string[], string[], string[]] {
  let totalTokens = tokenHandler.prompt_tokens;
  const patches: string[] = [];
  const remainingFilesListNew: string[] = [];
  const filesInPatchList: string[] = [];

  for (const [filename, data] of Object.entries(fileDict)) {
    if (!remainingFilesListPrev.includes(filename)) continue;

    const patch = data.patch;
    const newPatchTokens = data.tokens;
    const editType = data.edit_type;

    if (totalTokens > maxTokensModel - OUTPUT_BUFFER_TOKENS_HARD_THRESHOLD) {
      getLogger().warning(`File was fully skipped, no more tokens: ${filename}.`);
      continue;
    }

    if (totalTokens + newPatchTokens > maxTokensModel - OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD) {
      const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
      if (verbosity >= 2) {
        getLogger().warning(`Patch too large, skipping it: '${filename}'`);
      }
      remainingFilesListNew.push(filename);
      continue;
    }

    if (patch) {
      let patchFinal: string;
      if (!convertHunksToLineNumbers) {
        patchFinal = `\n\n## File: '${filename.trim()}'\n\n${patch.trim()}\n`;
      } else {
        patchFinal = '\n\n' + patch.trim();
      }
      patches.push(patchFinal);
      totalTokens += tokenHandler.count_tokens(patchFinal);
      filesInPatchList.push(filename);
      const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
      if (verbosity >= 2) {
        getLogger().info(`Tokens: ${totalTokens}, last filename: ${filename}`);
      }
    }
  }

  return [totalTokens, patches, remainingFilesListNew, filesInPatchList];
}

export async function retryWithFallbackModels(
  f: (model: string) => Promise<any>,
  modelType?: string
): Promise<any> {
  const allModels = _getAllModels(modelType);
  const allDeployments = _getAllDeployments(allModels);

  for (let i = 0; i < allModels.length; i++) {
    const model = allModels[i];
    const deploymentId = allDeployments[i];
    try {
      getLogger().debug(
        `Generating prediction with ${model}${deploymentId ? ` from deployment ${deploymentId}` : ''}`
      );
      getSettings().set('openai.deployment_id', deploymentId);
      return await f(model);
    } catch (e) {
      getLogger().warning(
        `Failed to generate prediction with ${model}`,
        { artifact: { error: e } }
      );
      if (i === allModels.length - 1) {
        throw new Error(`Failed to generate prediction with any model of [${allModels.join(', ')}]`);
      }
    }
  }
}

export function _getAllModels(modelType?: string): string[] {
  let model: string;
  if (modelType === 'weak') {
    model = getModel('model_weak');
  } else if (modelType === 'reasoning') {
    model = getModel('model_reasoning');
  } else {
    model = ((getSettings().config as Record<string, unknown>).model as string) ?? '';
  }

  let fallbackModels = getSettings().get('config.fallback_models') as string[] | string;
  if (!Array.isArray(fallbackModels)) {
    fallbackModels = typeof fallbackModels === 'string'
      ? (fallbackModels as string).split(',').map((m: string) => m.trim())
      : [];
  }
  return [model, ...(fallbackModels as string[])];
}

export function _getAllDeployments(allModels: string[]): string[] {
  const deploymentId = getSettings().get('openai.deployment_id') as string | undefined;
  let fallbackDeployments = getSettings().get('openai.fallback_deployments') as string[] | string;
  if (!Array.isArray(fallbackDeployments) && fallbackDeployments) {
    fallbackDeployments = String(fallbackDeployments).split(',').map((d: string) => d.trim());
  }
  if (fallbackDeployments && (fallbackDeployments as string[]).length > 0) {
    const allDeployments = [deploymentId, ...(fallbackDeployments as string[])];
    if (allDeployments.length < allModels.length) {
      throw new Error(
        `The number of deployments (${allDeployments.length}) is less than the number of models (${allModels.length})`
      );
    }
    return allDeployments.filter((d): d is string => d != null);
  }
  return allModels.map(() => deploymentId ?? '');
}

export function getPrMultiDiffs(
  gitProvider: any,
  tokenHandler: TokenHandler,
  model: string,
  maxCalls: number = 5,
  addLineNumbers: boolean = true
): string[] {
  let diffFiles: any[];
  try {
    diffFiles = gitProvider.get_diff_files();
  } catch (e) {
    getLogger().error(`Rate limit exceeded for git provider API. original message ${e}`);
    throw e;
  }

  const prLanguages = sortFilesByMainLanguages(gitProvider.get_languages(), diffFiles);

  const PATCH_EXTRA_LINES_BEFORE = capAndLogExtraLines(
    (getSettings().get('config.patch_extra_lines_before') as number) ?? 0, 'before'
  );
  const PATCH_EXTRA_LINES_AFTER = capAndLogExtraLines(
    (getSettings().get('config.patch_extra_lines_after') as number) ?? 0, 'after'
  );

  const [patchesExtended, totalTokens] = prGenerateExtendedDiff(
    prLanguages, tokenHandler, addLineNumbers,
    PATCH_EXTRA_LINES_BEFORE, PATCH_EXTRA_LINES_AFTER
  );

  if (totalTokens + OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD < getMaxTokens(model)) {
    return patchesExtended.length > 0 ? [patchesExtended.join('\n')] : [];
  }

  const sortedFiles: any[] = [];
  for (const lang of prLanguages) {
    sortedFiles.push(...lang.files.sort((a: any, b: any) => b.tokens - a.tokens));
  }

  const patches: string[] = [];
  const finalDiffList: string[] = [];
  let currTotalTokens = tokenHandler.prompt_tokens;
  let callNumber = 1;

  for (const file of sortedFiles) {
    if (callNumber > maxCalls) {
      const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
      if (verbosity >= 2) {
        getLogger().info(`Reached max calls (${maxCalls})`);
      }
      break;
    }

    const originalFileContentStr = file.base_file;
    const newFileContentStr = file.head_file;
    let patch = file.patch;
    if (!patch) continue;

    patch = handlePatchDeletions(patch, originalFileContentStr, newFileContentStr, file.filename, file.edit_type) as string;
    if (patch === null) continue;

    if (addLineNumbers) {
      patch = decoupleAndConvertToHunksWithLinesNumbers(patch, file);
    } else {
      patch = `\n\n## File: '${file.filename.trim()}'\n\n${patch.trim()}\n`;
    }

    if (file.ai_file_summary && getSettings().get('config.enable_ai_metadata')) {
      patch = addAiSummaryTopPatch(file, patch);
    }
    const newPatchTokens = tokenHandler.count_tokens(patch);

    if (patch && (tokenHandler.prompt_tokens + newPatchTokens) > getMaxTokens(model) - OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD) {
      const largePatchPolicy = getSettings().get('config.large_patch_policy') as string ?? 'skip';
      if (largePatchPolicy === 'skip') {
        getLogger().warning(`Patch too large, skipping: ${file.filename}`);
        continue;
      } else if (largePatchPolicy === 'clip') {
        const deltaTokens = getMaxTokens(model) - OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD - tokenHandler.prompt_tokens;
        let patchClipped = clipTokens(patch, deltaTokens, true, newPatchTokens, true);
        const clippedTokens = tokenHandler.count_tokens(patchClipped);
        if (patchClipped && (tokenHandler.prompt_tokens + clippedTokens) > getMaxTokens(model) - OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD) {
          getLogger().warning(`Patch too large, skipping: ${file.filename}`);
          continue;
        } else {
          getLogger().info(`Clipped large patch for file: ${file.filename}`);
          patch = patchClipped;
        }
      } else {
        getLogger().warning(`Patch too large, skipping: ${file.filename}`);
        continue;
      }
    }

    if (patch && (currTotalTokens + newPatchTokens > getMaxTokens(model) - OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD)) {
      const finalDiff = patches.join('\n');
      finalDiffList.push(finalDiff);
      patches.length = 0;
      currTotalTokens = tokenHandler.prompt_tokens;
      callNumber++;
      if (callNumber > maxCalls) {
        const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
        if (verbosity >= 2) {
          getLogger().info(`Reached max calls (${maxCalls})`);
        }
        break;
      }
      const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
      if (verbosity >= 2) {
        getLogger().info(`Call number: ${callNumber}`);
      }
    }

    if (patch) {
      patches.push(patch);
      currTotalTokens += newPatchTokens;
      const verbosity = (getSettings().get('config.verbosity_level') as number) ?? 0;
      if (verbosity >= 2) {
        getLogger().info(`Tokens: ${currTotalTokens}, last filename: ${file.filename}`);
      }
    }
  }

  if (patches.length > 0) {
    const finalDiff = patches.join('\n');
    finalDiffList.push(finalDiff.trim());
  }

  return finalDiffList;
}

export function addAiMetadataToDiffFiles(gitProvider: any, prDescriptionFiles: any[]): void {
  try {
    if (!prDescriptionFiles || prDescriptionFiles.length === 0) {
      getLogger().warning('PR description files are empty.');
      return;
    }
    const availableFiles: Record<string, any> = {};
    for (const prFile of prDescriptionFiles) {
      availableFiles[(prFile.full_file_name ?? '').trim()] = prFile;
    }
    const diffFiles = gitProvider.get_diff_files();
    let foundAnyMatch = false;
    for (const file of diffFiles) {
      const filename = (file.filename ?? '').trim();
      if (filename in availableFiles) {
        file.ai_file_summary = availableFiles[filename];
        foundAnyMatch = true;
      }
    }
    if (!foundAnyMatch) {
      getLogger().error(
        `Failed to find any matching files between PR description and diff files.`,
        { artifact: { pr_description_files: prDescriptionFiles } }
      );
    }
  } catch (e) {
    getLogger().error(`Failed to add AI metadata to diff files: ${e}`);
  }
}

export function addAiSummaryTopPatch(file: any, fullExtendedPatch: string): string {
  try {
    const lines = fullExtendedPatch.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## File:') || line.startsWith('## file:')) {
        lines.splice(i + 1, 0, `### AI-generated changes summary:\n${file.ai_file_summary?.long_summary ?? ''}`);
        return lines.join('\n');
      }
    }
    return fullExtendedPatch;
  } catch (e) {
    getLogger().error(`Failed to add AI summary to the top of the patch: ${e}`);
    return fullExtendedPatch;
  }
}
