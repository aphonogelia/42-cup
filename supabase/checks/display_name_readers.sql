-- Read-only pre-flight for dropping public.users.display_name.
-- Run on dev BEFORE 20261126130000_drop_display_name.sql. Nothing is modified.
--
-- Expected result on a database that only has the migrations in this repo:
--   column     -> public.users.display_name, exists
--   functions  -> public.leaderboard_period(...), prosrc mentions display_name
--   everything else -> no rows
-- Any other row is a manual object that still depends on the column: the drop
-- would either fail or silently change that object, so inspect it first.
--
-- Limitations: catalog dependencies only. Dynamic SQL built at runtime is not
-- visible here. A view that casts the whole row (e.g. row_to_json(users)) is
-- listed by the whole-row branch: it keeps working after the drop, but its
-- output stops containing the field.

SELECT 'column'::text AS section,
       'column'::text AS object_type,
       'public.users.display_name'::text AS object_name,
       CASE
         WHEN a.attnum IS NULL THEN 'MISSING'
         ELSE 'exists; not_null=' || a.attnotnull::text
              || '; default=' || COALESCE(pg_get_expr(ad.adbin, ad.adrelid), 'none')
       END::text AS detail
FROM (SELECT 1) AS one
LEFT JOIN pg_attribute a
       ON a.attrelid = 'public.users'::regclass
      AND a.attname = 'display_name'
      AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad
       ON ad.adrelid = a.attrelid
      AND ad.adnum = a.attnum

UNION

-- Views and materialized views with a column-level dependency on the column.
SELECT DISTINCT
       'views/matviews'::text,
       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END,
       n.nspname || '.' || c.relname,
       'column-level dependency on users.display_name'::text
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class c ON c.oid = r.ev_class
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE d.classid = 'pg_rewrite'::regclass
  AND d.refclassid = 'pg_class'::regclass
  AND d.refobjid = 'public.users'::regclass
  AND a.attnum > 0
  AND a.attname = 'display_name'
  AND NOT a.attisdropped
  AND c.oid <> 'public.users'::regclass

UNION

-- Same check through information_schema (views only; matviews are not exposed).
SELECT DISTINCT
       'views/matviews'::text,
       'view'::text,
       view_schema || '.' || view_name,
       'column-level dependency on users.display_name (information_schema)'::text
FROM information_schema.view_column_usage
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'display_name'

UNION

-- Views with a whole-row dependency: they do not name the column, but the row
-- they return changes when the column is dropped.
SELECT DISTINCT
       'views/matviews'::text,
       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END,
       n.nspname || '.' || c.relname,
       'whole-row dependency on public.users'::text
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class c ON c.oid = r.ev_class
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE d.classid = 'pg_rewrite'::regclass
  AND d.refclassid = 'pg_class'::regclass
  AND d.refobjid = 'public.users'::regclass
  AND d.refobjsubid = 0
  AND c.oid <> 'public.users'::regclass

UNION

-- Functions/procedures whose source mentions the column name (covers SQL and
-- PL/pgSQL text, including leaderboard_period before this migration).
SELECT
       'functions'::text,
       CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure'
                      WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' ELSE p.prokind::text END,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'prosrc mentions display_name'::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%display_name%'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')

UNION

-- Triggers can only reference one column through UPDATE OF or a WHEN clause.
-- Trigger function bodies are covered by the functions branch above.
SELECT DISTINCT
       'triggers'::text,
       'trigger'::text,
       c.oid::regclass::text || '.' || t.tgname,
       pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND (pg_get_triggerdef(t.oid) ILIKE '%display_name%' OR p.prosrc ILIKE '%display_name%')

UNION

-- Indexes that include the column, directly or in an expression predicate.
SELECT DISTINCT
       'indexes'::text,
       'index'::text,
       ic.relname,
       pg_get_indexdef(i.indexrelid)
FROM pg_index i
JOIN pg_class ic ON ic.oid = i.indexrelid
LEFT JOIN pg_attribute a
       ON a.attrelid = i.indrelid
      AND a.attnum = ANY (i.indkey)
WHERE i.indrelid = 'public.users'::regclass
  AND (a.attname = 'display_name' OR pg_get_indexdef(i.indexrelid) ILIKE '%display_name%')

UNION

-- RLS policies whose expression mentions the column.
SELECT
       'policies'::text,
       'policy'::text,
       schemaname || '.' || tablename || '.' || policyname,
       'cmd=' || cmd || '; using=' || COALESCE(qual, '-') || '; check=' || COALESCE(with_check, '-')
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND (COALESCE(qual, '') ILIKE '%display_name%' OR COALESCE(with_check, '') ILIKE '%display_name%')

UNION

-- Constraints that include the column in their key or definition.
SELECT
       'constraints'::text,
       CASE contype WHEN 'c' THEN 'check' WHEN 'f' THEN 'foreign key' WHEN 'p' THEN 'primary key'
                    WHEN 'u' THEN 'unique' WHEN 'x' THEN 'exclusion' ELSE contype::text END,
       conname,
       pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND (
        pg_get_constraintdef(oid) ILIKE '%display_name%'
        OR EXISTS (
          SELECT 1
          FROM unnest(conkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum
          WHERE a.attname = 'display_name'
        )
      )

UNION

-- Column-level grants are dropped with the column; list them so a stale
-- GRANT can be cleaned up if the column is ever recreated.
SELECT
       'privileges'::text,
       'column grant'::text,
       grantee || ' -> ' || privilege_type,
       'on public.users.display_name'::text
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'display_name'

ORDER BY section, object_type, object_name;
