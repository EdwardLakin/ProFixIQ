-- Enum values must be committed before later migrations use them.
-- Keep this migration outside an explicit transaction.

alter type public.part_request_status add value if not exists 'partially_ordered';
alter type public.part_request_status add value if not exists 'partially_consumed';
alter type public.part_request_status add value if not exists 'partially_returned';
alter type public.part_request_status add value if not exists 'returned';
