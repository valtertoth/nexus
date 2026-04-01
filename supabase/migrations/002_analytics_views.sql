-- ============================================
-- Analytics Views & Functions
-- ============================================

-- Daily conversation stats (last 30 days)
CREATE OR REPLACE FUNCTION daily_conversation_stats(
  p_org_id UUID,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  day DATE,
  new_conversations BIGINT,
  resolved_conversations BIGINT,
  total_messages BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.day::DATE,
    COALESCE(c.cnt, 0) AS new_conversations,
    COALESCE(r.cnt, 0) AS resolved_conversations,
    COALESCE(m.cnt, 0) AS total_messages
  FROM generate_series(
    CURRENT_DATE - (p_days - 1),
    CURRENT_DATE,
    '1 day'::INTERVAL
  ) AS d(day)
  LEFT JOIN (
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
    FROM conversations
    WHERE org_id = p_org_id
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY DATE(created_at)
  ) c ON c.day = d.day::DATE
  LEFT JOIN (
    SELECT DATE(resolved_at) AS day, COUNT(*) AS cnt
    FROM conversations
    WHERE org_id = p_org_id
      AND resolved_at >= CURRENT_DATE - p_days
    GROUP BY DATE(resolved_at)
  ) r ON r.day = d.day::DATE
  LEFT JOIN (
    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
    FROM messages
    WHERE org_id = p_org_id
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY DATE(created_at)
  ) m ON m.day = d.day::DATE
  ORDER BY d.day;
END;
$$;

-- Agent performance metrics
CREATE OR REPLACE FUNCTION agent_performance(
  p_org_id UUID,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  conversations_handled BIGINT,
  messages_sent BIGINT,
  ai_approved BIGINT,
  ai_edited BIGINT,
  ai_discarded BIGINT,
  avg_response_time_seconds NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    COALESCE(conv.cnt, 0) AS conversations_handled,
    COALESCE(msg.cnt, 0) AS messages_sent,
    COALESCE(ai_a.cnt, 0) AS ai_approved,
    COALESCE(ai_e.cnt, 0) AS ai_edited,
    COALESCE(ai_d.cnt, 0) AS ai_discarded,
    COALESCE(msg.avg_resp, 0) AS avg_response_time_seconds
  FROM users u
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS cnt
    FROM conversations
    WHERE org_id = p_org_id
      AND created_at >= CURRENT_DATE - p_days
      AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  ) conv ON conv.assigned_to = u.id
  LEFT JOIN (
    SELECT sender_id, COUNT(*) AS cnt,
      EXTRACT(EPOCH FROM AVG(created_at - LAG(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at)))::NUMERIC AS avg_resp
    FROM messages
    WHERE org_id = p_org_id
      AND sender_type = 'agent'
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY sender_id
  ) msg ON msg.sender_id = u.id
  LEFT JOIN (
    SELECT sender_id, COUNT(*) AS cnt
    FROM messages
    WHERE org_id = p_org_id
      AND ai_approved = TRUE AND ai_edited = FALSE
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY sender_id
  ) ai_a ON ai_a.sender_id = u.id
  LEFT JOIN (
    SELECT sender_id, COUNT(*) AS cnt
    FROM messages
    WHERE org_id = p_org_id
      AND ai_approved = TRUE AND ai_edited = TRUE
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY sender_id
  ) ai_e ON ai_e.sender_id = u.id
  LEFT JOIN (
    SELECT sender_id, COUNT(*) AS cnt
    FROM messages
    WHERE org_id = p_org_id
      AND ai_approved = FALSE
      AND ai_suggested_response IS NOT NULL
      AND created_at >= CURRENT_DATE - p_days
    GROUP BY sender_id
  ) ai_d ON ai_d.sender_id = u.id
  WHERE u.org_id = p_org_id
  ORDER BY messages_sent DESC;
END;
$$;

-- AI usage summary
CREATE OR REPLACE FUNCTION ai_usage_summary(
  p_org_id UUID,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  total_suggestions BIGINT,
  total_tokens_used BIGINT,
  avg_latency_ms NUMERIC,
  approved_count BIGINT,
  edited_count BIGINT,
  discarded_count BIGINT,
  estimated_cost_usd NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_suggestions,
    COALESCE(SUM(total_tokens), 0) AS total_tokens_used,
    COALESCE(AVG(latency_ms), 0)::NUMERIC AS avg_latency_ms,
    COUNT(*) FILTER (WHERE was_approved = TRUE AND was_edited = FALSE) AS approved_count,
    COUNT(*) FILTER (WHERE was_approved = TRUE AND was_edited = TRUE) AS edited_count,
    COUNT(*) FILTER (WHERE was_approved = FALSE) AS discarded_count,
    -- Rough cost estimate: Claude Sonnet ~$3/1M input + $15/1M output tokens
    -- Simplified: ~$0.009 per 1K tokens average
    ROUND(COALESCE(SUM(total_tokens), 0) * 0.000009, 4) AS estimated_cost_usd
  FROM ai_usage_logs
  WHERE org_id = p_org_id
    AND created_at >= CURRENT_DATE - p_days;
END;
$$;
