
DROP POLICY IF EXISTS "team_attachments_read" ON storage.objects;

CREATE POLICY "team_attachments_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
      AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);
