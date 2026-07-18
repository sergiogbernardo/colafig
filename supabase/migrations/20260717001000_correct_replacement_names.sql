-- Correct two labels from the printed Panini Update Set.

update public.stickers
set label = 'Elye Wahi'
where code = 'CIV 16 S'
  and variant_type = 'replacement';

update public.stickers
set label = 'Laros Duarte'
where code = 'CPV 11 S'
  and variant_type = 'replacement';

do $$
begin
  if not exists (
    select 1 from public.stickers
    where code = 'CIV 16 S'
      and label = 'Elye Wahi'
      and variant_type = 'replacement'
  ) or not exists (
    select 1 from public.stickers
    where code = 'CPV 11 S'
      and label = 'Laros Duarte'
      and variant_type = 'replacement'
  ) then
    raise exception 'Replacement label correction failed';
  end if;
end;
$$;
