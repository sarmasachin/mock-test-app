-- Push notification campaign analytics (admin stats + per-device delivery/open).

CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  push_item_id VARCHAR(60) NOT NULL DEFAULT '',
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  target VARCHAR(32) NOT NULL DEFAULT 'all',
  deep_link VARCHAR(300) NOT NULL DEFAULT '',
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  total_attempted INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  deactivated_count INT NOT NULL DEFAULT 0,
  opened_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_at ON push_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_push_item_id ON push_campaigns (push_item_id);

CREATE TABLE IF NOT EXISTS push_delivery_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_token_hash VARCHAR(64) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'android',
  device_model VARCHAR(120) NOT NULL DEFAULT '',
  delivery_status VARCHAR(20) NOT NULL,
  fail_code VARCHAR(40) NOT NULL DEFAULT '',
  fail_detail VARCHAR(500) NOT NULL DEFAULT '',
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, device_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_events_campaign ON push_delivery_events (campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_events_campaign_status ON push_delivery_events (campaign_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_push_delivery_events_campaign_opened ON push_delivery_events (campaign_id, opened_at);
