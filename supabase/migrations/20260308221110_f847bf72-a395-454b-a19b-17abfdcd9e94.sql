
-- Add file attachment columns to team_messages
ALTER TABLE public.team_messages
  ADD COLUMN file_url text,
  ADD COLUMN file_name text,
  ADD COLUMN file_type text;

-- Create storage bucket for team attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-attachments', 'team-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow conversation participants to upload files
CREATE POLICY "Conversation participants can upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
    AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);

-- RLS: Allow conversation participants to view files
CREATE POLICY "Conversation participants can view"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
    AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);
