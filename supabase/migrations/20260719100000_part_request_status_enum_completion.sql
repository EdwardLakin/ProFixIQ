-- Enum values must be committed before the lifecycle functions in the next
-- migration can use them. Keep this migration outside an explicit transaction.

alter type public.part_request_item_status add value if not exists 'partially_ordered';
alter type public.part_request_item_status add value if not exists 'partially_consumed';
alter type public.part_request_item_status add value if not exists 'partially_returned';
alter type public.part_request_item_status add value if not exists 'returned';

alter type public.part_request_status add value if not exists 'deferred';
