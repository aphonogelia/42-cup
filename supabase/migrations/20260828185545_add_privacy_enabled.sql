ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS privacy_enabled boolean NOT NULL DEFAULT true;