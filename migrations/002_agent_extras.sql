ALTER TABLE agents ADD COLUMN transfers TEXT DEFAULT '[]';
ALTER TABLE agents ADD COLUMN level_up_reward TEXT;
ALTER TABLE agents ADD COLUMN referrals TEXT DEFAULT '[]';
