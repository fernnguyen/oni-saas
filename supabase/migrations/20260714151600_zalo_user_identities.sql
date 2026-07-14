-- Create user_identities table to link external providers (like Zalo) to Supabase auth users

CREATE TABLE IF NOT EXISTS public.user_identities (
  id varchar(255) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider varchar(50) NOT NULL,
  provider_id varchar(255) NOT NULL,
  name varchar(255),
  avatar text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Unique constraint on provider and provider_id
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_id_idx 
  ON public.user_identities (provider, provider_id);

-- Enable RLS
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

-- Only admins/superusers can manage, users can read their own
CREATE POLICY "Users can view their own identities"
  ON public.user_identities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own identities"
  ON public.user_identities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own identities"
  ON public.user_identities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own identities"
  ON public.user_identities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
