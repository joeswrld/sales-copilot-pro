-- Create storage bucket for call recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access for playback
CREATE POLICY "Public can read recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'call-recordings');

-- Allow users to delete their own recordings
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);