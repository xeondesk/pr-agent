export const config = {
  config: {
    model: "gpt-5.4-2026-03-05",
    fallback_models: ["gpt-5.4-mini"],
    git_provider: "github",
    publish_output: true,
    publish_output_progress: true,
    verbosity_level: 0,
    use_extra_bad_extensions: false,
    log_level: "DEBUG",
    use_wiki_settings_file: true,
    use_repo_settings_file: true,
    use_global_settings_file: true,
    disable_auto_feedback: false,
    ai_timeout: 120,
    skip_keys: [],
    custom_reasoning_model: false,
    response_language: "en-US",
    max_description_tokens: 500,
    max_commits_tokens: 500,
    max_model_tokens: 32000,
    custom_model_max_tokens: -1,
    model_token_count_estimate_factor: 0.3,
    patch_extension_skip_types: [".md", ".txt"],
    allow_dynamic_context: true,
    max_extra_lines_before_dynamic_context: 10,
    patch_extra_lines_before: 5,
    patch_extra_lines_after: 1,
    secret_provider: "",
    cli_mode: false,
    output_relevant_configurations: false,
    large_patch_policy: "clip",
    duplicate_prompt_examples: false,
    seed: -1,
    temperature: 0.2,
    ignore_pr_title: ["^\\[Auto\\]", "^Auto"],
    ignore_pr_target_branches: [],
    ignore_pr_source_branches: [],
    ignore_pr_labels: [],
    ignore_pr_authors: [],
    ignore_repositories: [],
    ignore_language_framework: [],
    is_auto_command: false,
    enable_ai_metadata: false,
    reasoning_effort: "medium",
    enable_claude_extended_thinking: false,
    extended_thinking_budget_tokens: 2048,
    extended_thinking_max_output_tokens: 4096,
    extract_issue_from_branch: true,
    branch_issue_regex: "",
  },

  pr_reviewer: {
    require_score_review: false,
    require_tests_review: true,
    require_estimate_effort_to_review: true,
    require_can_be_split_review: false,
    require_security_review: true,
    require_estimate_contribution_time_cost: false,
    require_todo_scan: false,
    require_ticket_analysis_review: true,
    publish_output_no_suggestions: true,
    persistent_comment: true,
    extra_instructions: "",
    num_max_findings: 3,
    final_update_message: true,
    enable_review_labels_security: true,
    enable_review_labels_effort: true,
    require_all_thresholds_for_incremental_review: false,
    minimal_commits_for_incremental_review: 0,
    minimal_minutes_for_incremental_review: 0,
    enable_intro_text: true,
    enable_help_text: false,
  },

  pr_description: {
    publish_labels: false,
    add_original_user_description: true,
    generate_ai_title: false,
    use_bullet_points: true,
    extra_instructions: "",
    enable_pr_type: true,
    final_update_message: true,
    enable_help_text: false,
    enable_help_comment: false,
    enable_pr_diagram: true,
    publish_description_as_comment: false,
    publish_description_as_comment_persistent: true,
    enable_semantic_files_types: true,
    collapsible_file_list: "adaptive",
    collapsible_file_list_threshold: 6,
    inline_file_summary: false,
    use_description_markers: false,
    enable_large_pr_handling: true,
    include_generated_by_header: true,
    max_ai_calls: 4,
    async_ai_calls: true,
  },

  pr_questions: {
    enable_help_text: false,
    use_conversation_history: true,
  },

  pr_code_suggestions: {
    commitable_code_suggestions: false,
    dual_publishing_score_threshold: -1,
    focus_only_on_problems: true,
    extra_instructions: "",
    enable_help_text: false,
    enable_chat_text: false,
    persistent_comment: true,
    max_history_len: 4,
    publish_output_no_suggestions: true,
    suggestions_score_threshold: 0,
    new_score_mechanism: true,
    new_score_mechanism_th_high: 9,
    new_score_mechanism_th_medium: 7,
    auto_extended_mode: true,
    num_code_suggestions_per_chunk: 3,
    max_number_of_calls: 3,
    parallel_calls: true,
    final_clip_factor: 0.8,
    decouple_hunks: false,
    demand_code_suggestions_self_review: false,
    code_suggestions_self_review_text: "**Author self-review**: I have reviewed the PR code suggestions, and addressed the relevant ones.",
    approve_pr_on_self_review: false,
    fold_suggestions_on_self_review: true,
  },

  pr_custom_prompt: {
    prompt: `The code suggestions should focus only on the following:
- ...
- ...
...
`,
    suggestions_score_threshold: 0,
    num_code_suggestions_per_chunk: 3,
    self_reflect_on_custom_suggestions: true,
    enable_help_text: false,
  },

  pr_add_docs: {
    extra_instructions: "",
    docs_style: "Sphinx",
    file: "",
    class_name: "",
  },

  pr_update_changelog: {
    push_changelog_changes: false,
    extra_instructions: "",
    add_pr_link: true,
    skip_ci_on_push: true,
  },

  pr_analyze: {
    enable_help_text: true,
  },

  pr_test: {
    extra_instructions: "",
    testing_framework: "",
    num_tests: 3,
    avoid_mocks: true,
    file: "",
    class_name: "",
    enable_help_text: false,
  },

  pr_improve_component: {
    num_code_suggestions: 4,
    extra_instructions: "",
    file: "",
    class_name: "",
  },

  pr_help: {
    force_local_db: false,
    num_retrieved_snippets: 5,
  },

  pr_config: {},

  pr_help_docs: {
    repo_url: "",
    repo_default_branch: "main",
    docs_path: "docs",
    exclude_root_readme: false,
    supported_doc_exts: [".md", ".mdx", ".rst"],
    enable_help_text: false,
  },

  github: {
    deployment_type: "user",
    ratelimit_retries: 5,
    base_url: "https://api.github.com",
    publish_inline_comments_fallback_with_verification: true,
    try_fix_invalid_inline_comments: true,
    app_name: "pr-agent",
    ignore_bot_pr: true,
  },

  github_action_config: {},

  github_app: {
    bot_user: "github-actions[bot]",
    override_deployment_type: true,
    handle_pr_actions: ["opened", "reopened", "ready_for_review"],
    pr_commands: [
      "/describe --pr_description.final_update_message=false",
      "/review",
      "/improve",
    ],
    handle_push_trigger: false,
    push_trigger_ignore_bot_commits: true,
    push_trigger_ignore_merge_commits: true,
    push_trigger_wait_for_initial_review: true,
    push_trigger_pending_tasks_backlog: true,
    push_trigger_pending_tasks_ttl: 300,
    push_commands: [
      "/describe",
      "/review",
    ],
  },

  gitlab: {
    url: "https://gitlab.com",
    expand_submodule_diffs: false,
    pr_commands: [
      "/describe --pr_description.final_update_message=false",
      "/review",
      "/improve",
    ],
    handle_push_trigger: false,
    push_commands: [
      "/describe",
      "/review",
    ],
  },

  gitea: {
    url: "https://gitea.com",
    handle_push_trigger: false,
    pr_commands: [
      "/describe",
      "/review",
      "/improve",
    ],
    push_commands: [
      "/describe",
      "/review",
    ],
  },

  bitbucket_app: {
    pr_commands: [
      "/describe --pr_description.final_update_message=false",
      "/review",
      "/improve --pr_code_suggestions.commitable_code_suggestions=true",
    ],
    avoid_full_files: false,
  },

  local: {},

  gerrit: {},

  bitbucket_server: {
    url: "",
    pr_commands: [
      "/describe --pr_description.final_update_message=false",
      "/review",
      "/improve --pr_code_suggestions.commitable_code_suggestions=true",
    ],
  },

  litellm: {
    enable_callbacks: false,
    success_callback: [],
    failure_callback: [],
    service_callback: [],
  },

  pr_similar_issue: {
    skip_comments: false,
    force_update_dataset: false,
    max_issues_to_scan: 500,
    vectordb: "pinecone",
  },

  pr_find_similar_component: {
    class_name: "",
    file: "",
    search_from_org: false,
    allow_fallback_less_words: true,
    number_of_keywords: 5,
    number_of_results: 5,
  },

  pinecone: {},

  lancedb: {
    uri: "./lancedb",
  },

  qdrant: {},

  best_practices: {
    content: "",
    organization_name: "",
    max_lines_allowed: 800,
    enable_global_best_practices: false,
  },

  auto_best_practices: {
    enable_auto_best_practices: true,
    utilize_auto_best_practices: true,
    extra_instructions: "",
    content: "",
    max_patterns: 5,
  },

  azure_devops: {
    default_comment_status: "closed",
  },

  azure_devops_server: {
    pr_commands: [
      "/describe",
      "/review",
      "/improve",
    ],
  },
};

export interface ConfigType {
  config: {
    model: string;
    fallback_models: string[];
    git_provider: string;
    publish_output: boolean;
    publish_output_progress: boolean;
    verbosity_level: number;
    use_extra_bad_extensions: boolean;
    log_level: string;
    use_wiki_settings_file: boolean;
    use_repo_settings_file: boolean;
    use_global_settings_file: boolean;
    disable_auto_feedback: boolean;
    ai_timeout: number;
    skip_keys: string[];
    custom_reasoning_model: boolean;
    response_language: string;
    max_description_tokens: number;
    max_commits_tokens: number;
    max_model_tokens: number;
    custom_model_max_tokens: number;
    model_token_count_estimate_factor: number;
    patch_extension_skip_types: string[];
    allow_dynamic_context: boolean;
    max_extra_lines_before_dynamic_context: number;
    patch_extra_lines_before: number;
    patch_extra_lines_after: number;
    secret_provider: string;
    cli_mode: boolean;
    output_relevant_configurations: boolean;
    large_patch_policy: string;
    duplicate_prompt_examples: boolean;
    seed: number;
    temperature: number;
    ignore_pr_title: string[];
    ignore_pr_target_branches: string[];
    ignore_pr_source_branches: string[];
    ignore_pr_labels: string[];
    ignore_pr_authors: string[];
    ignore_repositories: string[];
    ignore_language_framework: string[];
    is_auto_command: boolean;
    enable_ai_metadata: boolean;
    reasoning_effort: string;
    enable_claude_extended_thinking: boolean;
    extended_thinking_budget_tokens: number;
    extended_thinking_max_output_tokens: number;
    extract_issue_from_branch: boolean;
    branch_issue_regex: string;
  };
  pr_reviewer: {
    require_score_review: boolean;
    require_tests_review: boolean;
    require_estimate_effort_to_review: boolean;
    require_can_be_split_review: boolean;
    require_security_review: boolean;
    require_estimate_contribution_time_cost: boolean;
    require_todo_scan: boolean;
    require_ticket_analysis_review: boolean;
    publish_output_no_suggestions: boolean;
    persistent_comment: boolean;
    extra_instructions: string;
    num_max_findings: number;
    final_update_message: boolean;
    enable_review_labels_security: boolean;
    enable_review_labels_effort: boolean;
    require_all_thresholds_for_incremental_review: boolean;
    minimal_commits_for_incremental_review: number;
    minimal_minutes_for_incremental_review: number;
    enable_intro_text: boolean;
    enable_help_text: boolean;
  };
  pr_description: {
    publish_labels: boolean;
    add_original_user_description: boolean;
    generate_ai_title: boolean;
    use_bullet_points: boolean;
    extra_instructions: string;
    enable_pr_type: boolean;
    final_update_message: boolean;
    enable_help_text: boolean;
    enable_help_comment: boolean;
    enable_pr_diagram: boolean;
    publish_description_as_comment: boolean;
    publish_description_as_comment_persistent: boolean;
    enable_semantic_files_types: boolean;
    collapsible_file_list: string | boolean;
    collapsible_file_list_threshold: number;
    inline_file_summary: boolean | string;
    use_description_markers: boolean;
    enable_large_pr_handling: boolean;
    include_generated_by_header: boolean;
    max_ai_calls: number;
    async_ai_calls: boolean;
  };
  pr_questions: {
    enable_help_text: boolean;
    use_conversation_history: boolean;
  };
  pr_code_suggestions: {
    commitable_code_suggestions: boolean;
    dual_publishing_score_threshold: number;
    focus_only_on_problems: boolean;
    extra_instructions: string;
    enable_help_text: boolean;
    enable_chat_text: boolean;
    persistent_comment: boolean;
    max_history_len: number;
    publish_output_no_suggestions: boolean;
    suggestions_score_threshold: number;
    new_score_mechanism: boolean;
    new_score_mechanism_th_high: number;
    new_score_mechanism_th_medium: number;
    auto_extended_mode: boolean;
    num_code_suggestions_per_chunk: number;
    max_number_of_calls: number;
    parallel_calls: boolean;
    final_clip_factor: number;
    decouple_hunks: boolean;
    demand_code_suggestions_self_review: boolean;
    code_suggestions_self_review_text: string;
    approve_pr_on_self_review: boolean;
    fold_suggestions_on_self_review: boolean;
  };
  pr_custom_prompt: {
    prompt: string;
    suggestions_score_threshold: number;
    num_code_suggestions_per_chunk: number;
    self_reflect_on_custom_suggestions: boolean;
    enable_help_text: boolean;
  };
  pr_add_docs: {
    extra_instructions: string;
    docs_style: string;
    file: string;
    class_name: string;
  };
  pr_update_changelog: {
    push_changelog_changes: boolean;
    extra_instructions: string;
    add_pr_link: boolean;
    skip_ci_on_push: boolean;
  };
  pr_analyze: { enable_help_text: boolean };
  pr_test: {
    extra_instructions: string;
    testing_framework: string;
    num_tests: number;
    avoid_mocks: boolean;
    file: string;
    class_name: string;
    enable_help_text: boolean;
  };
  pr_improve_component: {
    num_code_suggestions: number;
    extra_instructions: string;
    file: string;
    class_name: string;
  };
  pr_help: { force_local_db: boolean; num_retrieved_snippets: number };
  pr_config: Record<string, never>;
  pr_help_docs: {
    repo_url: string;
    repo_default_branch: string;
    docs_path: string;
    exclude_root_readme: boolean;
    supported_doc_exts: string[];
    enable_help_text: boolean;
  };
  github: {
    deployment_type: string;
    ratelimit_retries: number;
    base_url: string;
    publish_inline_comments_fallback_with_verification: boolean;
    try_fix_invalid_inline_comments: boolean;
    app_name: string;
    ignore_bot_pr: boolean;
  };
  github_action_config: Record<string, never>;
  github_app: {
    bot_user: string;
    override_deployment_type: boolean;
    handle_pr_actions: string[];
    pr_commands: string[];
    handle_push_trigger: boolean;
    push_trigger_ignore_bot_commits: boolean;
    push_trigger_ignore_merge_commits: boolean;
    push_trigger_wait_for_initial_review: boolean;
    push_trigger_pending_tasks_backlog: boolean;
    push_trigger_pending_tasks_ttl: number;
    push_commands: string[];
  };
  gitlab: {
    url: string;
    expand_submodule_diffs: boolean;
    pr_commands: string[];
    handle_push_trigger: boolean;
    push_commands: string[];
  };
  gitea: {
    url: string;
    handle_push_trigger: boolean;
    pr_commands: string[];
    push_commands: string[];
  };
  bitbucket_app: {
    pr_commands: string[];
    avoid_full_files: boolean;
  };
  local: Record<string, never>;
  gerrit: Record<string, never>;
  bitbucket_server: {
    url: string;
    pr_commands: string[];
  };
  litellm: {
    enable_callbacks: boolean;
    success_callback: string[];
    failure_callback: string[];
    service_callback: string[];
  };
  pr_similar_issue: {
    skip_comments: boolean;
    force_update_dataset: boolean;
    max_issues_to_scan: number;
    vectordb: string;
  };
  pr_find_similar_component: {
    class_name: string;
    file: string;
    search_from_org: boolean;
    allow_fallback_less_words: boolean;
    number_of_keywords: number;
    number_of_results: number;
  };
  pinecone: Record<string, never>;
  lancedb: { uri: string };
  qdrant: Record<string, never>;
  best_practices: {
    content: string;
    organization_name: string;
    max_lines_allowed: number;
    enable_global_best_practices: boolean;
  };
  auto_best_practices: {
    enable_auto_best_practices: boolean;
    utilize_auto_best_practices: boolean;
    extra_instructions: string;
    content: string;
    max_patterns: number;
  };
  azure_devops: { default_comment_status: string };
  azure_devops_server: { pr_commands: string[] };
}
