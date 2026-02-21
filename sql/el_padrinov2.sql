-- ============================================
-- EL PADRINO - BASE DE DATOS v2
-- PostgreSQL / Supabase
-- Sistema de Sorteos con Rondas
-- ============================================

create extension if not exists "uuid-ossp";

-- ============================================
-- PERFIL DE USUARIO
-- ============================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    varchar(50) unique not null,
  email       text unique,
  saldo       numeric(10,2) default 0,
  rol         text default 'usuario'   check (rol    in ('admin','trabajador','usuario')),
  estado      text default 'activo'    check (estado in ('activo','suspendido')),
  avatar_url  text,
  created_at  timestamptz default now()
);

-- ============================================
-- SORTEOS (permanentes, se reutilizan)
-- ============================================
create table games (
  id          uuid default uuid_generate_v4() primary key,
  nombre      varchar(100) not null,
  descripcion text,
  precio_boleto numeric(10,2) default 0,  -- costo de participar
  estado      text default 'activo' check (estado in ('activo','inactivo')),
  created_at  timestamptz default now()
);

-- ============================================
-- RONDAS (cada partida de un sorteo)
-- ============================================
create table rounds (
  id          uuid default uuid_generate_v4() primary key,
  game_id     uuid references games(id) on delete cascade,
  numero      int not null,              -- ronda 1, 2, 3...
  estado      text default 'abierta' check (estado in ('abierta','cerrada','sorteada')),
  ganador_id  uuid references profiles(id) on delete set null,
  sorteado_at timestamptz,               -- cuándo se realizó el sorteo
  created_at  timestamptz default now(),
  unique(game_id, numero)                -- no puede haber dos rondas #3 en el mismo juego
);

-- ============================================
-- PARTICIPACIONES (reemplaza bets)
-- Cada fila = 1 boleto de 1 usuario en 1 ronda
-- ============================================
create table participations (
  id          uuid default uuid_generate_v4() primary key,
  round_id    uuid references rounds(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  resultado   text default 'pendiente' check (resultado in ('pendiente','ganada','perdida')),
  created_at  timestamptz default now(),
  unique(round_id, user_id)              -- un usuario no puede entrar dos veces a la misma ronda
);

-- ============================================
-- PAGOS / COMPROBANTES
-- Vinculados a una ronda específica
-- ============================================
create table payments (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references profiles(id) on delete cascade,
  round_id        uuid references rounds(id) on delete set null,  -- a qué ronda corresponde
  metodo          text check (metodo in ('yape','qr','transferencia','manual')),
  monto           numeric(10,2) not null,
  estado          text default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  comprobante_url text,
  referencia      text,
  revisado_por    uuid references profiles(id) on delete set null,
  created_at      timestamptz default now()
);

-- ============================================
-- MOVIMIENTOS DE BILLETERA
-- ============================================
create table wallet_movements (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade,
  tipo        text check (tipo in ('deposito','retiro','apuesta','ganancia')),
  monto       numeric(10,2) not null,
  referencia  text,
  created_at  timestamptz default now()
);

-- ============================================
-- PREMIOS
-- ============================================
create table prizes (
  id          uuid default uuid_generate_v4() primary key,
  nombre      text not null,
  descripcion text,
  imagen_url  text,
  estado      text default 'activo' check (estado in ('activo','inactivo')),
  created_at  timestamptz default now()
);

-- ============================================
-- LOGS DE SEGURIDAD
-- ============================================
create table security_logs (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid,
  accion      text,
  ip          text,
  created_at  timestamptz default now()
);

-- ============================================
-- ÍNDICES para performance con 100+ usuarios
-- ============================================
create index idx_rounds_game     on rounds(game_id);
create index idx_rounds_estado   on rounds(estado);
create index idx_parts_round     on participations(round_id);
create index idx_parts_user      on participations(user_id);
create index idx_payments_round  on payments(round_id);
create index idx_payments_estado on payments(estado);
create index idx_profiles_rol    on profiles(rol);

-- ============================================
-- VISTA ÚTIL: ronda activa con conteo de cupos
-- ============================================
create or replace view v_rounds_active as
select
  r.id,
  r.game_id,
  r.numero,
  r.estado,
  r.created_at,
  g.nombre   as game_nombre,
  g.precio_boleto,
  count(p.id) as cupos_usados,
  25 - count(p.id) as cupos_libres
from rounds r
join games g on g.id = r.game_id
left join participations p on p.round_id = r.id
group by r.id, g.id;