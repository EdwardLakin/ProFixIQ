-- Complete the employee-document intake contract used by Workforce People.

alter table public.employee_documents
  add column if not exists original_filename text,
  add column if not exists content_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists uploaded_by uuid
    references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee_documents'::regclass
      and conname = 'employee_documents_file_size_chk'
  ) then
    alter table public.employee_documents
      add constraint employee_documents_file_size_chk
      check (file_size_bytes is null or file_size_bytes > 0);
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'employee_docs',
  'employee_docs',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
