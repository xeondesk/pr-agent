export { TokenCounter } from './tokenCounter.js';
export { PatchParser, type ParsedPatch, type Hunk } from './patchParser.js';
export { Compression } from './compression.js';
export { AIHandler, OpenAIHandler, type AIHandlerConfig, type AIMessage, type AIResponse, type AIStreamResponse } from './aiHandler.js';
export { CliArgs } from './cliArgs.js';
export { SettingsManager, getSettings, applySecretsManagerConfig, applySecretsToConfig } from './config.js';
export { translateGlobsToRegexes, filterIgnored } from './fileFilter.js';
export {
  RE_HUNK_HEADER,
  decodeIfBytes,
  shouldSkipPatch,
  extractHunkHeaders,
  checkIfHunkLinesMatchesToFile,
  extendPatch,
  processPatchLines,
  omitDeletionHunks,
  handlePatchDeletions,
  decoupleAndConvertToHunksWithLinesNumbers,
  extractHunkLinesFromPatch,
} from './gitPatchProcessing.js';
export type { FileInfo, LanguageGroup } from './languageHandler.js';
export { filterBadExtensions, isVaildFile, sortFilesByMainLanguages } from './languageHandler.js';
export { LoggingFormat, jsonFormat, analyticsFilter, invAnalyticsFilter, type Logger, setupLogger, getLogger } from './logger.js';
export {
  DELETED_FILES_,
  MORE_MODIFIED_FILES_,
  ADDED_FILES_,
  OUTPUT_BUFFER_TOKENS_SOFT_THRESHOLD,
  OUTPUT_BUFFER_TOKENS_HARD_THRESHOLD,
  MAX_EXTRA_LINES,
  type TokenHandler,
  capAndLogExtraLines,
  getPrDiff,
  getPrDiffMultiplePatches,
  prGenerateExtendedDiff,
  prGenerateCompressedDiff,
  generateFullPatch,
  retryWithFallbackModels,
  _getAllModels,
  _getAllDeployments,
  getPrMultiDiffs,
  addAiMetadataToDiffFiles,
  addAiSummaryTopPatch,
} from './prProcessing.js';
export {
  getModel,
  getSetting,
  emphasizeHeader,
  uniqueStrings,
  convertToMarkdownV2,
  extractRelevantLinesStr,
  ticketMarkdownLogic,
  processCanBeSplit,
  parseCodeSuggestion,
  tryFixJson,
  fixJsonEscapeChar,
  convertStrToDatetime,
  loadLargeDiff,
  updateSettingsFromArgs,
  _fixKeyValue,
  loadYaml,
  tryFixYaml,
  setCustomLabels,
  getUserLabels,
  getMaxTokens,
  clipTokens,
  replaceCodeTags,
  findLineNumberOfRelevantLineInFile,
  githubActionOutput,
  showRelevantConfigurations,
  setFileLanguages,
  processDescription,
  isValueNo,
  formatTodoItems,
} from './utils.js';
