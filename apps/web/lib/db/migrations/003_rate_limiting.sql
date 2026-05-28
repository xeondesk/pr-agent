-- Migration 003: Rate Limiting and API Usage Tracking

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);

-- Rate limit configurations (configurable per plan)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan TEXT PRIMARY KEY DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  requests_per_minute INTEGER NOT NULL DEFAULT 30,
  requests_per_hour INTEGER NOT NULL DEFAULT 500,
  requests_per_day INTEGER NOT NULL DEFAULT 5000,
  concurrent_jobs INTEGER NOT NULL DEFAULT 5,
  max_diff_size INTEGER NOT NULL DEFAULT 1000000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default rate limits
INSERT INTO rate_limits (plan, requests_per_minute, requests_per_hour, requests_per_day, concurrent_jobs, max_diff_size)
VALUES
  ('free', 30, 500, 5000, 5, 1000000),
  ('pro', 60, 2000, 20000, 10, 5000000),
  ('enterprise', 200, 10000, 100000, 50, 10000000)
ON CONFLICT (plan) DO NOTHING;

-- User plan mapping
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;

-- Function to check rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(p_user_id UUID, p_endpoint TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER) AS $$
DECLARE
  v_plan TEXT;
  v_rpm INTEGER;
  v_recent_count INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM user_profiles WHERE id = p_user_id;
  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  SELECT requests_per_minute INTO v_rpm FROM rate_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_recent_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_recent_count >= v_rpm THEN
    RETURN QUERY SELECT false, 60;
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
