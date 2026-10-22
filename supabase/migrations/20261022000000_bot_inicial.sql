-- Etapa 6: tablas del bot de Telegram. Solo el servidor del bot las usa, con la service role key.
-- RLS activado y sin políticas: anon y authenticated no ven nada.

create extension if not exists pgcrypto;

create table if not exists public.subcuentas (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique check (alias ~ '^[a-z0-9][a-z0-9_]*$'),
  nombre text not null,
  location_id text not null,
  entorno text not null check (entorno in ('prueba', 'produccion')),
  pit_cifrado text not null,
  tope_diario_usd numeric(10, 2) not null default 5 check (tope_diario_usd >= 0),
  activa boolean not null default true,
  creada timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  nombre text not null,
  rol text not null check (rol in ('admin', 'cliente')),
  subcuenta_id uuid references public.subcuentas (id) on delete restrict,
  tope_diario_usd numeric(10, 2) not null default 2 check (tope_diario_usd >= 0),
  activo boolean not null default true,
  creado timestamptz not null default now(),
  -- Un cliente siempre queda atado a una subcuenta.
  constraint cliente_con_subcuenta check (rol = 'admin' or subcuenta_id is not null)
);

-- Subcuentas que cada admin puede usar.
create table if not exists public.accesos_admin (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  subcuenta_id uuid not null references public.subcuentas (id) on delete cascade,
  creado timestamptz not null default now(),
  primary key (usuario_id, subcuenta_id)
);

-- Subcuenta activa por chat (solo cuenta para admins; los clientes usan la suya).
create table if not exists public.estado_chat (
  chat_id bigint primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  subcuenta_id uuid not null references public.subcuentas (id) on delete cascade,
  actualizado timestamptz not null default now()
);

-- Últimos turnos de texto; retención corta (48 horas).
create table if not exists public.historial (
  id bigint generated always as identity primary key,
  chat_id bigint not null,
  subcuenta_id uuid not null references public.subcuentas (id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido text not null,
  creado timestamptz not null default now()
);
create index if not exists historial_chat_idx on public.historial (chat_id, subcuenta_id, id desc);

-- Escrituras esperando el botón Confirmar; vencen a los 10 minutos.
create table if not exists public.acciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  subcuenta_id uuid not null references public.subcuentas (id) on delete cascade,
  operacion text not null,
  entrada jsonb not null,
  resumen text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'ejecutada', 'cancelada', 'vencida', 'fallida')),
  vence timestamptz not null default now() + interval '10 minutes',
  creada timestamptz not null default now()
);
create index if not exists acciones_pendientes_chat_idx on public.acciones_pendientes (chat_id, estado);

-- Qué se hizo y quién, sin contenido de conversaciones; retención de 90 días.
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid references public.usuarios (id) on delete set null,
  telegram_id bigint not null,
  subcuenta_id uuid references public.subcuentas (id) on delete set null,
  accion text not null,
  tipo text,
  parametros jsonb not null default '{}'::jsonb,
  resultado text not null
);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha);

create table if not exists public.uso_diario (
  fecha date not null,
  subcuenta_id uuid not null references public.subcuentas (id) on delete cascade,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  tokens_entrada bigint not null default 0,
  tokens_salida bigint not null default 0,
  tokens_cache_lectura bigint not null default 0,
  tokens_cache_escritura bigint not null default 0,
  costo_usd numeric(12, 6) not null default 0,
  consultas integer not null default 0,
  consultas_haiku integer not null default 0,
  consultas_sonnet integer not null default 0,
  primary key (fecha, subcuenta_id, usuario_id)
);

-- Avisos ya enviados (por ejemplo, el del 80 % del tope), para no repetirlos en el día.
create table if not exists public.avisos (
  fecha date not null,
  clave text not null,
  creado timestamptz not null default now(),
  primary key (fecha, clave)
);

-- Updates de Telegram ya procesados (webhook de la Etapa 7); evita procesar dos veces.
create table if not exists public.eventos_webhook (
  update_id bigint primary key,
  recibido timestamptz not null default now(),
  procesado timestamptz
);

-- Suma atómica del uso de una consulta.
create or replace function public.registrar_uso(
  p_fecha date,
  p_subcuenta uuid,
  p_usuario uuid,
  p_modelo text,
  p_entrada bigint,
  p_salida bigint,
  p_cache_lectura bigint,
  p_cache_escritura bigint,
  p_costo numeric
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.uso_diario as u (
    fecha, subcuenta_id, usuario_id, tokens_entrada, tokens_salida, tokens_cache_lectura,
    tokens_cache_escritura, costo_usd, consultas, consultas_haiku, consultas_sonnet
  ) values (
    p_fecha, p_subcuenta, p_usuario, p_entrada, p_salida, p_cache_lectura, p_cache_escritura,
    p_costo, 1, (p_modelo like 'claude-haiku%')::int, (p_modelo like 'claude-sonnet%')::int
  )
  on conflict (fecha, subcuenta_id, usuario_id) do update set
    tokens_entrada = u.tokens_entrada + excluded.tokens_entrada,
    tokens_salida = u.tokens_salida + excluded.tokens_salida,
    tokens_cache_lectura = u.tokens_cache_lectura + excluded.tokens_cache_lectura,
    tokens_cache_escritura = u.tokens_cache_escritura + excluded.tokens_cache_escritura,
    costo_usd = u.costo_usd + excluded.costo_usd,
    consultas = u.consultas + 1,
    consultas_haiku = u.consultas_haiku + excluded.consultas_haiku,
    consultas_sonnet = u.consultas_sonnet + excluded.consultas_sonnet;
$$;

-- Toma una acción pendiente de forma atómica: solo una confirmación la ejecuta.
create or replace function public.resolver_pendiente(p_id uuid, p_estado text) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  filas integer;
begin
  update public.acciones_pendientes
     set estado = p_estado,
         entrada = case when p_estado = 'pendiente' then entrada else '{}'::jsonb end
   where id = p_id and estado = 'pendiente' and (p_estado <> 'ejecutada' or vence > now());
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

-- Retención: historial 48 h, auditoría 90 días, pendientes vencidas, eventos 7 días.
create or replace function public.limpiar_retencion() returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.historial where creado < now() - interval '48 hours';
  delete from public.auditoria where fecha < now() - interval '90 days';
  update public.acciones_pendientes set estado = 'vencida', entrada = '{}'::jsonb
   where estado = 'pendiente' and vence < now();
  delete from public.acciones_pendientes where creada < now() - interval '7 days';
  delete from public.eventos_webhook where recibido < now() - interval '7 days';
  delete from public.avisos where fecha < current_date - 7;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'subcuentas', 'usuarios', 'accesos_admin', 'estado_chat', 'historial',
    'acciones_pendientes', 'auditoria', 'uso_diario', 'avisos', 'eventos_webhook'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.registrar_uso(date, uuid, uuid, text, bigint, bigint, bigint, bigint, numeric) from anon, authenticated, public;
    revoke execute on function public.resolver_pendiente(uuid, text) from anon, authenticated, public;
    revoke execute on function public.limpiar_retencion() from anon, authenticated, public;
  end if;
end;
$$;
