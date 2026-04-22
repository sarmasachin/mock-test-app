ALTER TABLE tests
ADD COLUMN IF NOT EXISTS dynamic_fluctuation_on_publish BOOLEAN NOT NULL DEFAULT true;
