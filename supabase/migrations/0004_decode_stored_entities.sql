-- One-time repair for names imported before the BGG proxy decoded HTML entities.
--
-- BoardGameGeek double-encodes its text: the XML attribute holds `&amp;#039;`, so the
-- proxy's XML parse left a literal `&#039;` behind and that is what got stored — hence
-- rows reading "Sink N&#039; Sand". supabase/functions/bgg/index.ts now decodes the
-- second layer on import; this fixes the rows already on the shelf.
--
-- Only `name` is touched. `notes` is typed by hand and never passed through the parser.

create or replace function public._decode_html_entities(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text := input;
  digits text;
begin
  -- Decimal references, e.g. &#039; and &#8211;.
  for digits in
    select (regexp_matches(input, '&#(\d{1,7});', 'g'))[1]
  loop
    -- Out-of-range values and lone surrogates are left as written: chr() raises on
    -- them, which would abort the whole migration over one malformed name.
    if digits::bigint between 1 and 1114111
       and digits::bigint not between 55296 and 57343 then
      result := replace(result, '&#' || digits || ';', chr(digits::int));
    end if;
  end loop;

  result := replace(result, '&quot;', '"');
  result := replace(result, '&apos;', '''');
  result := replace(result, '&lt;', '<');
  result := replace(result, '&gt;', '>');
  -- Last, so decoding never manufactures a fresh entity out of neighbouring text.
  result := replace(result, '&amp;', '&');
  return result;
end;
$$;

update public.games
   set name = public._decode_html_entities(name)
 where name ~ '&(#[0-9]{1,7}|amp|quot|apos|lt|gt);';

drop function public._decode_html_entities(text);
