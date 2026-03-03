-- Allow users to delete their own calls
CREATE POLICY "Users can delete own calls"
ON public.calls
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to update their own summaries
CREATE POLICY "Users can update own summaries"
ON public.call_summaries
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow users to delete their own summaries
CREATE POLICY "Users can delete own summaries"
ON public.call_summaries
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for calls table
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
