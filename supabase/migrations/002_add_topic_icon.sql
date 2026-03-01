-- Add icon column to topics for AI-determined Lucide icon name
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS icon text DEFAULT NULL;
