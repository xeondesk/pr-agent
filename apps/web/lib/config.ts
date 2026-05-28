import { z } from 'zod';

/**
 * Environment variable schema and validation
 * Run this at application startup to ensure all required variables are set
 */

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url('Invalid app URL'),
  NEXT_PUBLIC_APP_NAME: z.string().default('PR-Agent'),
  
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-4'),
  
  // GitHub
  GITHUB_API_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  
  // Security
  ENCRYPTION_KEY: z.string().min(64, 'Encryption key must be at least 64 characters (32 bytes in hex)'),
  API_SIGNATURE_SECRET: z.string().min(32, 'API signature secret must be at least 32 characters'),
  
  // Rate limiting
  RATE_LIMIT_ENABLED: z.string().default('true').transform(v => v === 'true'),
  RATE_LIMIT_REQUESTS_PER_MINUTE: z.string().default('60').transform(Number),
  RATE_LIMIT_BURST_SIZE: z.string().default('10').transform(Number),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_REQUEST_LOGGING: z.string().default('true').transform(v => v === 'true'),
  
  // Features
  ENABLE_WEBHOOKS: z.string().default('true').transform(v => v === 'true'),
  ENABLE_RATE_LIMITING: z.string().default('true').transform(v => v === 'true'),
  ENABLE_ANALYTICS: z.string().default('false').transform(v => v === 'true'),
  
  // Development
  DEBUG: z.string().default('false').transform(v => v === 'true'),
  NEXT_PUBLIC_MOCK_USER_ID: z.string().optional(),
  
  // Timeouts
  GITHUB_API_TIMEOUT_MS: z.string().default('10000').transform(Number),
  OPENAI_API_TIMEOUT_MS: z.string().default('30000').transform(Number),
  WEBHOOK_TIMEOUT_MS: z.string().default('30000').transform(Number),
  
  // Optional integrations
  SENTRY_DSN: z.string().url().optional(),
  ANALYTICS_ID: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig | null = null;

/**
 * Get validated environment configuration
 */
export function getConfig(): EnvConfig {
  if (config) {
    return config;
  }

  try {
    config = envSchema.parse(process.env);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(issue => {
        const path = issue.path.join('.');
        return `${path}: ${issue.message}`;
      }).join('\n');

      throw new Error(
        `Environment validation failed:\n${errors}\n\nSee .env.example for required variables.`
      );
    }
    throw error;
  }
}

/**
 * Validate configuration at startup
 * Call this in your app initialization
 */
export function validateConfig(): void {
  try {
    getConfig();
    console.log('[v0] Environment configuration validated successfully');
  } catch (error) {
    console.error('[v0] Configuration validation failed:', error);
    process.exit(1);
  }
}

/**
 * Check if specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof Omit<EnvConfig, 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL' | 'NEXT_PUBLIC_APP_NAME'>): boolean {
  const cfg = getConfig();
  const key = feature as keyof EnvConfig;
  const value = cfg[key];
  return typeof value === 'boolean' ? value : value === 'true';
}

/**
 * Get feature configuration
 */
export const features = {
  webhooks: () => isFeatureEnabled('ENABLE_WEBHOOKS'),
  rateLimiting: () => isFeatureEnabled('ENABLE_RATE_LIMITING'),
  analytics: () => isFeatureEnabled('ENABLE_ANALYTICS'),
  requestLogging: () => isFeatureEnabled('ENABLE_REQUEST_LOGGING'),
  debug: () => isFeatureEnabled('DEBUG'),
};

/**
 * Get API configuration
 */
export function getApiConfig() {
  const cfg = getConfig();
  return {
    openai: {
      apiKey: cfg.OPENAI_API_KEY,
      model: cfg.OPENAI_MODEL,
      timeout: cfg.OPENAI_API_TIMEOUT_MS,
    },
    github: {
      apiToken: cfg.GITHUB_API_TOKEN,
      webhookSecret: cfg.GITHUB_WEBHOOK_SECRET,
      appId: cfg.GITHUB_APP_ID,
      privateKey: cfg.GITHUB_PRIVATE_KEY,
      timeout: cfg.GITHUB_API_TIMEOUT_MS,
    },
    supabase: {
      url: cfg.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: cfg.SUPABASE_SERVICE_ROLE_KEY,
    },
  };
}

/**
 * Get security configuration
 */
export function getSecurityConfig() {
  const cfg = getConfig();
  return {
    encryptionKey: cfg.ENCRYPTION_KEY,
    apiSignatureSecret: cfg.API_SIGNATURE_SECRET,
    rateLimiting: {
      enabled: cfg.ENABLE_RATE_LIMITING,
      requestsPerMinute: cfg.RATE_LIMIT_REQUESTS_PER_MINUTE,
      burstSize: cfg.RATE_LIMIT_BURST_SIZE,
    },
  };
}

/**
 * Get logging configuration
 */
export function getLoggingConfig() {
  const cfg = getConfig();
  return {
    level: cfg.LOG_LEVEL,
    enableRequestLogging: cfg.ENABLE_REQUEST_LOGGING,
    debug: cfg.DEBUG,
  };
}

/**
 * Example .env.example content generator
 */
export const ENV_EXAMPLE = `# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=PR-Agent

# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxx...

# OpenAI (Required)
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4

# GitHub (Optional but recommended)
GITHUB_API_TOKEN=ghp_xxx
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_ID=xxx
GITHUB_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nxxx\\n-----END PRIVATE KEY-----

# Security (Required)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
API_SIGNATURE_SECRET=0123456789abcdef0123456789abcdef

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_BURST_SIZE=10

# Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# Features
ENABLE_WEBHOOKS=true
ENABLE_RATE_LIMITING=true
ENABLE_ANALYTICS=false

# Development
DEBUG=false
# NEXT_PUBLIC_MOCK_USER_ID=user_xxx

# Timeouts (milliseconds)
GITHUB_API_TIMEOUT_MS=10000
OPENAI_API_TIMEOUT_MS=30000
WEBHOOK_TIMEOUT_MS=30000

# Optional Integrations
# SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
# ANALYTICS_ID=xxx
`;
