alter table public.shopreel_integrations
alter column enabled_event_types
set default array[
  'inspection.completed',
  'inspection.finding.flagged',
  'inspection.media.captured',
  'workorder.approved',
  'workorder.completed',
  'media.before_after.added'
]::text[];

update public.shopreel_integrations
set enabled_event_types = (
  case
    when enabled_event_types is null then array[
      'inspection.completed',
      'inspection.finding.flagged',
      'inspection.media.captured',
      'workorder.approved',
      'workorder.completed',
      'media.before_after.added'
    ]::text[]
    when not ('inspection.media.captured' = any(enabled_event_types))
      then array_append(enabled_event_types, 'inspection.media.captured')
    else enabled_event_types
  end
)
where enabled_event_types is null
   or not ('inspection.media.captured' = any(enabled_event_types));
