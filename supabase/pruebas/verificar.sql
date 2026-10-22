-- Se corre después de aplicar las migraciones dos veces. Falla con error si algo no cumple.
insert into subcuentas(alias, nombre, location_id, entorno, pit_cifrado) values ('prueba', 'Prueba', 'L1', 'prueba', 'v1.x.y.z');
insert into usuarios(telegram_id, nombre, rol) values (1, 'Admin', 'admin');
do $$ begin
  insert into usuarios(telegram_id, nombre, rol) values (2, 'Cliente sin subcuenta', 'cliente');
  raise exception 'un cliente sin subcuenta debió rechazarse';
exception when check_violation then null; end $$;
select registrar_uso(current_date, (select id from subcuentas), (select id from usuarios), 'claude-haiku-5-5', 100, 50, 10, 5, 0.001);
select registrar_uso(current_date, (select id from subcuentas), (select id from usuarios), 'claude-sonnet-5-5', 100, 50, 10, 5, 0.002);
do $$ begin
  if (select consultas from uso_diario) <> 2 or (select consultas_sonnet from uso_diario) <> 1 then
    raise exception 'registrar_uso no sumó bien';
  end if;
end $$;
insert into acciones_pendientes(chat_id, usuario_id, subcuenta_id, operacion, entrada, resumen)
  select 1, (select id from usuarios), (select id from subcuentas), 'crearContacto', '{"email":"a@b.co"}', 'x';
do $$ begin
  if not resolver_pendiente((select id from acciones_pendientes), 'ejecutada') then raise exception 'primera confirmación falló'; end if;
  if resolver_pendiente((select id from acciones_pendientes), 'ejecutada') then raise exception 'se ejecutó dos veces'; end if;
  if (select entrada from acciones_pendientes) <> '{}'::jsonb then raise exception 'la entrada no se borró'; end if;
end $$;
insert into acciones_pendientes(chat_id, usuario_id, subcuenta_id, operacion, entrada, resumen, vence)
  select 1, (select id from usuarios), (select id from subcuentas), 'crearContacto', '{}', 'vencida', now() - interval '1 minute';
do $$ begin
  if resolver_pendiente((select id from acciones_pendientes where resumen = 'vencida'), 'ejecutada') then raise exception 'se ejecutó una vencida'; end if;
end $$;
select limpiar_retencion();
set role anon;
do $$ begin perform * from subcuentas; raise exception 'anon leyó subcuentas'; exception when insufficient_privilege then null; end $$;
do $$ begin perform limpiar_retencion(); raise exception 'anon ejecutó funciones'; exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity) then
    raise exception 'hay tablas sin RLS';
  end if;
end $$;
