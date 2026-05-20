import { z } from "zod";

// ============================================================
// PR Data Types
// ============================================================

export interface PRData {
  url: string;
  title: string;
  description: string;
  diff: string;
  files: PullFile[];
  author: string;
  baseBranch: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface PullFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: "added" | "modified" | "deleted" | "renamed";
  patch?: string;
}

// ============================================================
// Message Types
// ============================================================

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolUsed?: string;
}

// ============================================================
// Tool Types
// ============================================================

export interface ToolInput {
  prData: PRData;
  context?: string;
  userQuery?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Agent Types
// ============================================================

export interface AgentInput {
  prData: PRData;
  toolName: string;
  userQuery?: string;
  history?: Message[];
}

export interface AgentOutput {
  success: boolean;
  message: Message;
  error?: string;
}

// ============================================================
// Streaming Types
// ============================================================

export interface StreamChunk {
  type: "start" | "content" | "error" | "done";
  data?: string;
  error?: string;
}

// ============================================================
// AI Handler Types
// ============================================================

export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export interface AIStreamResponse {
  stream: AsyncGenerator<string, void, unknown>;
  tokensUsed: number;
}

// ============================================================
// Python: EDIT_TYPE enum (pr_agent/algo/types.py)
// ============================================================

export enum EDIT_TYPE {
  ADDED = 1,
  DELETED = 2,
  MODIFIED = 3,
  RENAMED = 4,
  UNKNOWN = 5,
}

// ============================================================
// Python: FilePatchInfo dataclass (pr_agent/algo/types.py)
// ============================================================

export interface FilePatchInfo {
  base_file: string;
  head_file: string;
  patch: string;
  filename: string;
  tokens?: number;
  edit_type?: EDIT_TYPE;
  old_filename?: string | null;
  num_plus_lines?: number;
  num_minus_lines?: number;
  language?: string | null;
  ai_file_summary?: string | null;
}

// ============================================================
// Python: Range(BaseModel) (pr_agent/algo/utils.py)
// ============================================================

export const RangeSchema = z.object({
  line_start: z.number().int().describe("should be 0-indexed"),
  line_end: z.number().int(),
  column_start: z.number().int().default(-1),
  column_end: z.number().int().default(-1),
});

export type Range = z.infer<typeof RangeSchema>;

// ============================================================
// Python: ModelType(str, Enum) (pr_agent/algo/utils.py)
// ============================================================

export enum ModelType {
  REGULAR = "regular",
  WEAK = "weak",
  REASONING = "reasoning",
}

// ============================================================
// Python: TodoItem TypedDict (pr_agent/algo/utils.py)
// ============================================================

export interface TodoItem {
  relevant_file: string;
  line_range: [number, number];
  content: string;
}

// ============================================================
// Python: PRReviewHeader(str, Enum) (pr_agent/algo/utils.py)
// ============================================================

export enum PRReviewHeader {
  REGULAR = "## PR Reviewer Guide",
  INCREMENTAL = "## Incremental PR Reviewer Guide",
}

// ============================================================
// Python: ReasoningEffort(str, Enum) (pr_agent/algo/utils.py)
// ============================================================

export enum ReasoningEffort {
  XHIGH = "xhigh",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  MINIMAL = "minimal",
  NONE = "none",
}

// ============================================================
// Python: PRDescriptionHeader(str, Enum) (pr_agent/algo/utils.py)
// ============================================================

export enum PRDescriptionHeader {
  DIAGRAM_WALKTHROUGH = "Diagram Walkthrough",
  FILE_WALKTHROUGH = "File Walkthrough",
}

// ============================================================
// Python: MAX_TOKENS dict (pr_agent/algo/__init__.py)
// ============================================================

export const MAX_TOKENS: Record<string, number> = {
  "text-embedding-ada-002": 8000,
  "gpt-3.5-turbo": 16000,
  "gpt-3.5-turbo-0125": 16000,
  "gpt-3.5-turbo-0613": 4000,
  "gpt-3.5-turbo-1106": 16000,
  "gpt-3.5-turbo-16k": 16000,
  "gpt-3.5-turbo-16k-0613": 16000,
  "gpt-4": 8000,
  "gpt-4-0613": 8000,
  "gpt-4-32k": 32000,
  "gpt-4-1106-preview": 128000,
  "gpt-4-0125-preview": 128000,
  "gpt-4o": 128000,
  "gpt-4o-2024-05-13": 128000,
  "gpt-4-turbo-preview": 128000,
  "gpt-4-turbo-2024-04-09": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4o-mini-2024-07-18": 128000,
  "gpt-4o-2024-08-06": 128000,
  "gpt-4o-2024-11-20": 128000,
  "gpt-4.5-preview": 128000,
  "gpt-4.5-preview-2025-02-27": 128000,
  "gpt-4.1": 1047576,
  "gpt-4.1-2025-04-14": 1047576,
  "gpt-4.1-mini": 1047576,
  "gpt-4.1-mini-2025-04-14": 1047576,
  "gpt-4.1-nano": 1047576,
  "gpt-4.1-nano-2025-04-14": 1047576,
  "gpt-5-nano": 200000,
  "gpt-5-mini": 200000,
  "gpt-5": 200000,
  "gpt-5-2025-08-07": 200000,
  "gpt-5.1": 200000,
  "gpt-5.1-2025-11-13": 200000,
  "gpt-5.1-chat-latest": 200000,
  "gpt-5.1-codex": 200000,
  "gpt-5.1-codex-mini": 200000,
  "gpt-5.2": 400000,
  "gpt-5.2-2025-12-11": 400000,
  "gpt-5.2-chat-latest": 128000,
  "gpt-5.2-codex": 400000,
  "gpt-5.3-codex": 400000,
  "gpt-5.3-chat": 128000,
  "gpt-5.4": 272000,
  "gpt-5.4-2026-03-05": 272000,
  "gpt-5.4-mini": 400000,
  "gpt-5.4-mini-2026-03-17": 400000,
  "gpt-5.4-nano": 400000,
  "gpt-5.4-nano-2026-03-17": 400000,
  "gpt-5.5": 1050000,
  "gpt-5.5-2026-04-23": 1050000,
  "o1-mini": 128000,
  "o1-mini-2024-09-12": 128000,
  "o1-preview": 128000,
  "o1-preview-2024-09-12": 128000,
  "o1-2024-12-17": 204800,
  "o1": 204800,
  "o3-mini": 204800,
  "o3-mini-2025-01-31": 204800,
  "o3": 200000,
  "o3-2025-04-16": 200000,
  "o4-mini": 200000,
  "o4-mini-2025-04-16": 200000,
  "claude-instant-1": 100000,
  "claude-2": 100000,
  "command-nightly": 4096,
  "deepseek/deepseek-chat": 128000,
  "deepseek/deepseek-reasoner": 64000,
  "openai/qwq-plus": 131072,
  "replicate/llama-2-70b-chat:2c1608e18606fad2812020dc541930f2d0495ce32eee50074220b87300bc16e1": 4096,
  "meta-llama/Llama-2-7b-chat-hf": 4096,
  "vertex_ai/codechat-bison": 6144,
  "vertex_ai/codechat-bison-32k": 32000,
  "vertex_ai/claude-3-haiku@20240307": 100000,
  "vertex_ai/claude-3-5-haiku@20241022": 100000,
  "vertex_ai/claude-haiku-4-5@20251001": 200000,
  "vertex_ai/claude-3-sonnet@20240229": 100000,
  "vertex_ai/claude-3-opus@20240229": 100000,
  "vertex_ai/claude-opus-4@20250514": 200000,
  "vertex_ai/claude-opus-4-1@20250805": 200000,
  "vertex_ai/claude-opus-4-5@20251101": 200000,
  "vertex_ai/claude-opus-4-6@20260120": 200000,
  "vertex_ai/claude-opus-4-6": 200000,
  "vertex_ai/claude-opus-4-7": 1000000,
  "vertex_ai/claude-3-5-sonnet@20240620": 100000,
  "vertex_ai/claude-3-5-sonnet-v2@20241022": 100000,
  "vertex_ai/claude-3-7-sonnet@20250219": 200000,
  "vertex_ai/claude-sonnet-4@20250514": 200000,
  "vertex_ai/claude-sonnet-4-5@20250929": 200000,
  "vertex_ai/claude-sonnet-4-6": 200000,
  "vertex_ai/gemini-1.5-pro": 1048576,
  "vertex_ai/gemini-2.5-pro-preview-03-25": 1048576,
  "vertex_ai/gemini-2.5-pro-preview-05-06": 1048576,
  "vertex_ai/gemini-2.5-pro-preview-06-05": 1048576,
  "vertex_ai/gemini-2.5-pro": 1048576,
  "vertex_ai/gemini-1.5-flash": 1048576,
  "vertex_ai/gemini-2.0-flash": 1048576,
  "vertex_ai/gemini-2.5-flash-preview-04-17": 1048576,
  "vertex_ai/gemini-2.5-flash-preview-05-20": 1048576,
  "vertex_ai/gemini-2.5-flash": 1048576,
  "vertex_ai/gemini-3-flash-preview": 1048576,
  "vertex_ai/gemini-3-pro-preview": 1048576,
  "vertex_ai/gemini-3.1-flash-lite-preview": 1048576,
  "vertex_ai/gemini-3.1-pro-preview": 1048576,
  "vertex_ai/gemma2": 8200,
  "gemini/gemini-1.5-pro": 1048576,
  "gemini/gemini-1.5-flash": 1048576,
  "gemini/gemini-2.0-flash": 1048576,
  "gemini/gemini-2.5-flash-preview-04-17": 1048576,
  "gemini/gemini-2.5-flash-preview-05-20": 1048576,
  "gemini/gemini-2.5-flash": 1048576,
  "gemini/gemini-2.5-pro-preview-03-25": 1048576,
  "gemini/gemini-2.5-pro-preview-05-06": 1048576,
  "gemini/gemini-2.5-pro-preview-06-05": 1048576,
  "gemini/gemini-2.5-pro": 1048576,
  "gemini/gemini-3-flash-preview": 1048576,
  "gemini/gemini-3-pro-preview": 1048576,
  "gemini/gemini-3.1-flash-lite-preview": 1048576,
  "gemini/gemini-3.1-pro-preview": 1048576,
  "codechat-bison": 6144,
  "codechat-bison-32k": 32000,
  "anthropic.claude-instant-v1": 100000,
  "anthropic.claude-v1": 100000,
  "anthropic.claude-v2": 100000,
  "anthropic/claude-3-opus-20240229": 100000,
  "anthropic/claude-opus-4-20250514": 200000,
  "anthropic/claude-opus-4-1-20250805": 200000,
  "anthropic/claude-opus-4-5-20251101": 200000,
  "anthropic/claude-opus-4-6": 200000,
  "anthropic/claude-opus-4-6-20260120": 200000,
  "anthropic/claude-opus-4-7": 1000000,
  "anthropic/claude-3-5-sonnet-20240620": 100000,
  "anthropic/claude-3-5-sonnet-20241022": 100000,
  "anthropic/claude-3-7-sonnet-20250219": 200000,
  "anthropic/claude-sonnet-4-20250514": 200000,
  "anthropic/claude-sonnet-4-5-20250929": 200000,
  "anthropic/claude-sonnet-4-6": 200000,
  "claude-opus-4-1-20250805": 200000,
  "claude-opus-4-5-20251101": 200000,
  "claude-opus-4-6": 200000,
  "claude-opus-4-6-20260120": 200000,
  "claude-opus-4-7": 1000000,
  "claude-3-7-sonnet-20250219": 200000,
  "claude-sonnet-4-6": 200000,
  "anthropic/claude-3-5-haiku-20241022": 100000,
  "anthropic/claude-haiku-4-5-20251001": 200000,
  "claude-haiku-4-5-20251001": 200000,
  "bedrock/anthropic.claude-instant-v1": 100000,
  "bedrock/anthropic.claude-v2": 100000,
  "bedrock/anthropic.claude-v2:1": 100000,
  "bedrock/anthropic.claude-3-sonnet-20240229-v1:0": 100000,
  "bedrock/anthropic.claude-opus-4-20250514-v1:0": 200000,
  "bedrock/anthropic.claude-opus-4-1-20250805-v1:0": 200000,
  "bedrock/anthropic.claude-opus-4-6-20260120-v1:0": 200000,
  "bedrock/anthropic.claude-opus-4-6-v1:0": 200000,
  "bedrock/anthropic.claude-opus-4-7": 1000000,
  "bedrock/anthropic.claude-3-haiku-20240307-v1:0": 100000,
  "bedrock/anthropic.claude-3-5-haiku-20241022-v1:0": 100000,
  "bedrock/anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/anthropic.claude-3-5-sonnet-20240620-v1:0": 100000,
  "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0": 100000,
  "bedrock/anthropic.claude-3-7-sonnet-20250219-v1:0": 200000,
  "bedrock/anthropic.claude-sonnet-4-20250514-v1:0": 200000,
  "bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/anthropic.claude-sonnet-4-6": 200000,
  "bedrock/us.anthropic.claude-opus-4-20250514-v1:0": 200000,
  "bedrock/us.anthropic.claude-opus-4-1-20250805-v1:0": 200000,
  "bedrock/us.anthropic.claude-opus-4-6-20260120-v1:0": 200000,
  "bedrock/global.anthropic.claude-opus-4-5-20251101-v1:0": 200000,
  "bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0": 200000,
  "bedrock/global.anthropic.claude-opus-4-6-v1:0": 200000,
  "bedrock/us.anthropic.claude-opus-4-6-v1:0": 200000,
  "bedrock/global.anthropic.claude-opus-4-7": 1000000,
  "bedrock/us.anthropic.claude-opus-4-7": 1000000,
  "bedrock/us.anthropic.claude-3-5-sonnet-20241022-v2:0": 100000,
  "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/au.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/jp.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/apac.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0": 200000,
  "bedrock/us.anthropic.claude-3-7-sonnet-20250219-v1:0": 200000,
  "bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0": 200000,
  "bedrock/global.anthropic.claude-sonnet-4-20250514-v1:0": 200000,
  "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/au.anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/us.anthropic.claude-sonnet-4-6": 200000,
  "bedrock/au.anthropic.claude-sonnet-4-6": 200000,
  "bedrock/apac.anthropic.claude-3-5-sonnet-20241022-v2:0": 100000,
  "bedrock/apac.anthropic.claude-3-7-sonnet-20250219-v1:0": 200000,
  "bedrock/apac.anthropic.claude-sonnet-4-20250514-v1:0": 200000,
  "bedrock/eu.anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/eu.anthropic.claude-sonnet-4-6": 200000,
  "bedrock/jp.anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/jp.anthropic.claude-sonnet-4-6": 200000,
  "bedrock/global.anthropic.claude-sonnet-4-5-20250929-v1:0": 200000,
  "bedrock/global.anthropic.claude-sonnet-4-6": 200000,
  "claude-3-5-sonnet": 100000,
  "bedrock/us.meta.llama4-scout-17b-instruct-v1:0": 128000,
  "bedrock/us.meta.llama4-maverick-17b-instruct-v1:0": 128000,
  "groq/openai/gpt-oss-120b": 131072,
  "groq/openai/gpt-oss-20b": 131072,
  "groq/qwen/qwen3-32b": 131000,
  "groq/moonshotai/kimi-k2-instruct": 131072,
  "groq/deepseek-r1-distill-llama-70b": 128000,
  "groq/meta-llama/llama-4-maverick-17b-128e-instruct": 131072,
  "groq/meta-llama/llama-4-scout-17b-16e-instruct": 131072,
  "groq/llama-3.3-70b-versatile": 128000,
  "groq/llama-3.1-8b-instant": 128000,
  "xai/grok-2": 131072,
  "xai/grok-2-1212": 131072,
  "xai/grok-2-latest": 131072,
  "xai/grok-3": 131072,
  "xai/grok-3-beta": 131072,
  "xai/grok-3-fast": 131072,
  "xai/grok-3-fast-beta": 131072,
  "xai/grok-3-mini": 131072,
  "xai/grok-3-mini-beta": 131072,
  "xai/grok-3-mini-fast": 131072,
  "xai/grok-3-mini-fast-beta": 131072,
  "ollama/llama3": 4096,
  "watsonx/meta-llama/llama-3-8b-instruct": 4096,
  "watsonx/meta-llama/llama-3-70b-instruct": 4096,
  "watsonx/meta-llama/llama-3-405b-instruct": 16384,
  "watsonx/ibm/granite-13b-chat-v2": 8191,
  "watsonx/ibm/granite-34b-code-instruct": 8191,
  "watsonx/mistralai/mistral-large": 32768,
  "deepinfra/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B": 128000,
  "deepinfra/deepseek-ai/DeepSeek-R1-Distill-Llama-70B": 128000,
  "deepinfra/deepseek-ai/DeepSeek-R1": 128000,
  "mistral/mistral-small-latest": 8191,
  "mistral/mistral-medium-latest": 8191,
  "mistral/mistral-large-2407": 128000,
  "mistral/mistral-large-latest": 128000,
  "mistral/open-mistral-7b": 8191,
  "mistral/open-mixtral-8x7b": 8191,
  "mistral/open-mixtral-8x22b": 8191,
  "mistral/codestral-latest": 8191,
  "mistral/open-mistral-nemo": 128000,
  "mistral/open-mistral-nemo-2407": 128000,
  "mistral/open-codestral-mamba": 256000,
  "mistral/codestral-mamba-latest": 256000,
  "codestral/codestral-latest": 8191,
  "codestral/codestral-2405": 8191,
};

// ============================================================
// Python: Model lists (pr_agent/algo/__init__.py)
// ============================================================

export const USER_MESSAGE_ONLY_MODELS: string[] = [
  "deepseek/deepseek-reasoner",
  "o1-mini",
  "o1-mini-2024-09-12",
  "o1-preview",
];

export const NO_SUPPORT_TEMPERATURE_MODELS: string[] = [
  "deepseek/deepseek-reasoner",
  "o1-mini",
  "o1-mini-2024-09-12",
  "o1",
  "o1-2024-12-17",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o1-preview",
  "o3",
  "o3-2025-04-16",
  "o4-mini",
  "o4-mini-2025-04-16",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5-mini",
];

export const SUPPORT_REASONING_EFFORT_MODELS: string[] = [
  "o3-mini",
  "o3-mini-2025-01-31",
  "o3",
  "o3-2025-04-16",
  "o4-mini",
  "o4-mini-2025-04-16",
];

export const CLAUDE_EXTENDED_THINKING_MODELS: string[] = [
  "anthropic/claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-20250219",
];

export const STREAMING_REQUIRED_MODELS: string[] = [
  "openai/qwq-plus",
];

// ============================================================
// Python: Logging types (pr_agent/log/__init__.py)
// ============================================================

export enum LoggingFormat {
  CONSOLE = "CONSOLE",
  JSON = "JSON",
}

export interface Logger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warning(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  critical(msg: string, ...args: unknown[]): void;
  success(msg: string, ...args: unknown[]): void;
  exception(msg: string, ...args: unknown[]): void;
  bind(...args: unknown[]): Logger;
  add(
    sink: unknown,
    level?: string,
    format?: string,
    colorize?: boolean,
    serialize?: boolean,
    filter?: (record: unknown) => boolean,
  ): number;
  remove(handlerId?: number): void;
}

export declare function getLogger(): Logger;

// ============================================================
// Python: Dynaconf Settings structure (pr_agent/settings/configuration.toml)
// ============================================================

export interface ConfigGitProviderSettings {
  deployment_type?: string;
  ratelimit_retries?: number;
  base_url?: string;
  publish_inline_comments_fallback_with_verification?: boolean;
  try_fix_invalid_inline_comments?: boolean;
  app_name?: string;
  ignore_bot_pr?: boolean;
}

export interface ConfigGitHubActionConfigSettings {
  auto_review?: boolean;
  auto_describe?: boolean;
  auto_improve?: boolean;
  pr_actions?: string[];
}

export interface ConfigGitHubAppSettings {
  bot_user?: string;
  override_deployment_type?: boolean;
  handle_pr_actions?: string[];
  pr_commands?: string[];
  handle_push_trigger?: boolean;
  push_trigger_ignore_bot_commits?: boolean;
  push_trigger_ignore_merge_commits?: boolean;
  push_trigger_wait_for_initial_review?: boolean;
  push_trigger_pending_tasks_backlog?: boolean;
  push_trigger_pending_tasks_ttl?: number;
  push_commands?: string[];
}

export interface ConfigGitLabSettings {
  url?: string;
  expand_submodule_diffs?: boolean;
  pr_commands?: string[];
  handle_push_trigger?: boolean;
  push_commands?: string[];
  ssl_verify?: boolean | string;
}

export interface ConfigGiteaSettings {
  url?: string;
  handle_push_trigger?: boolean;
  pr_commands?: string[];
  push_commands?: string[];
}

export interface ConfigBitbucketAppSettings {
  pr_commands?: string[];
  avoid_full_files?: boolean;
}

export interface ConfigBitbucketServerSettings {
  url?: string;
  pr_commands?: string[];
}

export interface ConfigAzureDevOpsSettings {
  default_comment_status?: string;
}

export interface ConfigAzureDevOpsServerSettings {
  pr_commands?: string[];
}

export interface ConfigLocalSettings {
  description_path?: string;
  review_path?: string;
}

export interface ConfigGerritSettings {
  url?: string;
  user?: string;
  patch_server_endpoint?: string;
  patch_server_token?: string;
}

export interface ConfigLiteLLMSettings {
  use_client?: boolean;
  drop_params?: boolean;
  enable_callbacks?: boolean;
  success_callback?: unknown[];
  failure_callback?: unknown[];
  service_callback?: unknown[];
  model_id?: string;
}

export interface ConfigPineconeSettings {
  api_key?: string;
  environment?: string;
}

export interface ConfigLanceDBSettings {
  uri?: string;
}

export interface ConfigQdrantSettings {
  url?: string;
  api_key?: string;
}

export interface ConfigBestPracticesSettings {
  content?: string;
  organization_name?: string;
  max_lines_allowed?: number;
  enable_global_best_practices?: boolean;
}

export interface ConfigAutoBestPracticesSettings {
  enable_auto_best_practices?: boolean;
  utilize_auto_best_practices?: boolean;
  extra_instructions?: string;
  content?: string;
  max_patterns?: number;
}

export interface ConfigPRSimilarIssueSettings {
  skip_comments?: boolean;
  force_update_dataset?: boolean;
  max_issues_to_scan?: number;
  vectordb?: string;
}

export interface ConfigPRFindSimilarComponentSettings {
  class_name?: string;
  file?: string;
  search_from_org?: boolean;
  allow_fallback_less_words?: boolean;
  number_of_keywords?: number;
  number_of_results?: number;
}

export interface ConfigPRReviewerSettings {
  require_score_review?: boolean;
  require_tests_review?: boolean;
  require_estimate_effort_to_review?: boolean;
  require_can_be_split_review?: boolean;
  require_security_review?: boolean;
  require_estimate_contribution_time_cost?: boolean;
  require_todo_scan?: boolean;
  require_ticket_analysis_review?: boolean;
  publish_output_no_suggestions?: boolean;
  persistent_comment?: boolean;
  extra_instructions?: string;
  num_max_findings?: number;
  final_update_message?: boolean;
  enable_review_labels_security?: boolean;
  enable_review_labels_effort?: boolean;
  require_all_thresholds_for_incremental_review?: boolean;
  minimal_commits_for_incremental_review?: number;
  minimal_minutes_for_incremental_review?: number;
  enable_intro_text?: boolean;
  enable_help_text?: boolean;
}

export interface ConfigPRDescriptionSettings {
  publish_labels?: boolean;
  add_original_user_description?: boolean;
  generate_ai_title?: boolean;
  use_bullet_points?: boolean;
  extra_instructions?: string;
  enable_pr_type?: boolean;
  final_update_message?: boolean;
  enable_help_text?: boolean;
  enable_help_comment?: boolean;
  enable_pr_diagram?: boolean;
  publish_description_as_comment?: boolean;
  publish_description_as_comment_persistent?: boolean;
  enable_semantic_files_types?: boolean;
  collapsible_file_list?: boolean | string;
  collapsible_file_list_threshold?: number;
  inline_file_summary?: boolean | string;
  use_description_markers?: boolean;
  enable_large_pr_handling?: boolean;
  include_generated_by_header?: boolean;
  max_ai_calls?: number;
  async_ai_calls?: boolean;
}

export interface ConfigPRQuestionsSettings {
  enable_help_text?: boolean;
  use_conversation_history?: boolean;
}

export interface ConfigPRCodeSuggestionsSettings {
  commitable_code_suggestions?: boolean;
  dual_publishing_score_threshold?: number;
  focus_only_on_problems?: boolean;
  extra_instructions?: string;
  enable_help_text?: boolean;
  enable_chat_text?: boolean;
  persistent_comment?: boolean;
  max_history_len?: number;
  publish_output_no_suggestions?: boolean;
  suggestions_score_threshold?: number;
  new_score_mechanism?: boolean;
  new_score_mechanism_th_high?: number;
  new_score_mechanism_th_medium?: number;
  auto_extended_mode?: boolean;
  num_code_suggestions_per_chunk?: number;
  max_number_of_calls?: number;
  parallel_calls?: boolean;
  final_clip_factor?: number;
  decouple_hunks?: boolean;
  demand_code_suggestions_self_review?: boolean;
  code_suggestions_self_review_text?: string;
  approve_pr_on_self_review?: boolean;
  fold_suggestions_on_self_review?: boolean;
}

export interface ConfigPRCustomPromptSettings {
  prompt?: string;
  suggestions_score_threshold?: number;
  num_code_suggestions_per_chunk?: number;
  self_reflect_on_custom_suggestions?: boolean;
  enable_help_text?: boolean;
}

export interface ConfigPRAddDocsSettings {
  extra_instructions?: string;
  docs_style?: string;
  file?: string;
  class_name?: string;
}

export interface ConfigPRUpdateChangelogSettings {
  push_changelog_changes?: boolean;
  extra_instructions?: string;
  add_pr_link?: boolean;
  skip_ci_on_push?: boolean;
}

export interface ConfigPRAnalyzeSettings {
  enable_help_text?: boolean;
}

export interface ConfigPRTestSettings {
  extra_instructions?: string;
  testing_framework?: string;
  num_tests?: number;
  avoid_mocks?: boolean;
  file?: string;
  class_name?: string;
  enable_help_text?: boolean;
}

export interface ConfigPRImproveComponentSettings {
  num_code_suggestions?: number;
  extra_instructions?: string;
  file?: string;
  class_name?: string;
}

export interface ConfigPRHelpSettings {
  force_local_db?: boolean;
  num_retrieved_snippets?: number;
}

export interface ConfigPRHelpDocsSettings {
  repo_url?: string;
  repo_default_branch?: string;
  docs_path?: string;
  exclude_root_readme?: boolean;
  supported_doc_exts?: string[];
  enable_help_text?: boolean;
}

export interface ConfigSettings {
  config: {
    model?: string;
    fallback_models?: string[];
    model_reasoning?: string;
    model_weak?: string;
    git_provider?: string;
    publish_output?: boolean;
    publish_output_progress?: boolean;
    verbosity_level?: number;
    use_extra_bad_extensions?: boolean;
    log_level?: string;
    use_wiki_settings_file?: boolean;
    use_repo_settings_file?: boolean;
    use_global_settings_file?: boolean;
    disable_auto_feedback?: boolean;
    ai_timeout?: number;
    skip_keys?: unknown[];
    custom_reasoning_model?: boolean;
    response_language?: string;
    max_description_tokens?: number;
    max_commits_tokens?: number;
    max_model_tokens?: number;
    custom_model_max_tokens?: number;
    model_token_count_estimate_factor?: number;
    patch_extension_skip_types?: string[];
    allow_dynamic_context?: boolean;
    max_extra_lines_before_dynamic_context?: number;
    patch_extra_lines_before?: number;
    patch_extra_lines_after?: number;
    secret_provider?: string;
    cli_mode?: boolean;
    output_relevant_configurations?: boolean;
    large_patch_policy?: string;
    duplicate_prompt_examples?: boolean;
    seed?: number;
    temperature?: number;
    ignore_pr_title?: string[];
    ignore_pr_target_branches?: string[];
    ignore_pr_source_branches?: string[];
    ignore_pr_labels?: string[];
    ignore_pr_authors?: string[];
    ignore_repositories?: string[];
    ignore_language_framework?: string[];
    is_auto_command?: boolean;
    enable_ai_metadata?: boolean;
    enable_custom_labels?: boolean;
    enable_auto_approval?: boolean;
    reasoning_effort?: string;
    enable_claude_extended_thinking?: boolean;
    extended_thinking_budget_tokens?: number;
    extended_thinking_max_output_tokens?: number;
    extract_issue_from_branch?: boolean;
    branch_issue_regex?: string;
    analytics_folder?: string;
  };
  pr_reviewer?: ConfigPRReviewerSettings;
  pr_description?: ConfigPRDescriptionSettings;
  pr_questions?: ConfigPRQuestionsSettings;
  pr_code_suggestions?: ConfigPRCodeSuggestionsSettings;
  pr_custom_prompt?: ConfigPRCustomPromptSettings;
  pr_add_docs?: ConfigPRAddDocsSettings;
  pr_update_changelog?: ConfigPRUpdateChangelogSettings;
  pr_analyze?: ConfigPRAnalyzeSettings;
  pr_test?: ConfigPRTestSettings;
  pr_improve_component?: ConfigPRImproveComponentSettings;
  pr_help?: ConfigPRHelpSettings;
  pr_config?: Record<string, unknown>;
  pr_review_prompt?: {
    system?: string;
    user?: string;
  };
  pr_questions_prompt?: {
    system?: string;
    user?: string;
  };
  pr_description_only_files_prompts?: Record<string, unknown>;
  pr_help_docs?: ConfigPRHelpDocsSettings;
  pr_similar_issue?: ConfigPRSimilarIssueSettings;
  pr_find_similar_component?: ConfigPRFindSimilarComponentSettings;
  github?: ConfigGitProviderSettings;
  github_action_config?: ConfigGitHubActionConfigSettings;
  github_app?: ConfigGitHubAppSettings;
  gitlab?: ConfigGitLabSettings;
  gitea?: ConfigGiteaSettings;
  bitbucket_app?: ConfigBitbucketAppSettings;
  bitbucket_server?: ConfigBitbucketServerSettings;
  azure_devops?: ConfigAzureDevOpsSettings;
  azure_devops_server?: ConfigAzureDevOpsServerSettings;
  local?: ConfigLocalSettings;
  gerrit?: ConfigGerritSettings;
  litellm?: ConfigLiteLLMSettings;
  pinecone?: ConfigPineconeSettings;
  lancedb?: ConfigLanceDBSettings;
  qdrant?: ConfigQdrantSettings;
  best_practices?: ConfigBestPracticesSettings;
  auto_best_practices?: ConfigAutoBestPracticesSettings;
}

export declare function getSettings(useContext?: boolean): ConfigSettings;
