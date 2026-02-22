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









-- ═══════════════════════════════════════════════════
-- EL PADRINO v3 — MIGRACIONES
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Agregar boletos a participations (cuántos boletos tiene ese usuario en la ronda)
ALTER TABLE participations
  ADD COLUMN IF NOT EXISTS boletos  int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lugar    int;  -- 1, 2 o 3

-- 2. Agregar boletos_solicitados a payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS boletos_solicitados int NOT NULL DEFAULT 1;

-- 3. Quitar constraint unique(round_id, user_id) de participations
--    para permitir múltiples registros del mismo usuario en una ronda
--    (o simplemente el campo boletos acumula, un solo registro por usuario)
-- NOTA: Si ya existe el unique constraint, coméntalo aquí:
-- ALTER TABLE participations DROP CONSTRAINT IF EXISTS participations_round_id_user_id_key;

-- 4. Columnas extra en rounds para guardar ganadores 2 y 3
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS ganador2_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ganador3_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caso_sorteo     text,
  ADD COLUMN IF NOT EXISTS premio_especial boolean DEFAULT false;

-- 5. Actualizar vista para incluir boletos totales por ronda
CREATE OR REPLACE VIEW v_rounds_active AS
SELECT
  r.id,
  r.game_id,
  r.numero,
  r.estado,
  r.created_at,
  g.nombre          AS game_nombre,
  g.precio_boleto,
  COALESCE(SUM(p.boletos), 0)        AS cupos_usados,
  25 - COALESCE(SUM(p.boletos), 0)   AS cupos_libres
FROM rounds r
JOIN games g ON g.id = r.game_id
LEFT JOIN participations p ON p.round_id = r.id
GROUP BY r.id, g.id;





create table prize_payments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  user_id uuid references profiles(id),
  lugar smallint, -- 1, 2 o 3
  monto numeric(10,2) not null,
  metodo text check (metodo in ('qr','efectivo')),
  referencia text,
  comprobante_url text,
  notas text,
  estado text default 'enviado' check (estado in ('enviado','confirmado')),
  registrado_por uuid references profiles(id),
  created_at timestamptz default now()
);

-- RLS: usuarios solo ven sus propios pagos
alter table prize_payments enable row level security;

create policy "usuario ve sus pagos" on prize_payments
  for select using (auth.uid() = user_id);

create policy "admin/trabajador gestiona" on prize_payments
  for all using (
    exists (
      select 1 from profiles
      where id = auth.uid()
      and rol in ('admin','trabajador')
      and estado = 'activo'
    )
  );



  -- Agregar campos de QR de cobros al perfil
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS qr_cobro_url    text,
  ADD COLUMN IF NOT EXISTS qr_metodo       text CHECK (qr_metodo IN ('tigo_money','billetera_bcb','qr_simple','efectivo_cuenta')),
  ADD COLUMN IF NOT EXISTS qr_verificado   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_subido_at    timestamptz;






  --migracciones 4
  -- ═══════════════════════════════════════════════════
-- EL PADRINO — MIGRACIONES COMPLETAS v4
-- Ejecutar TODO en Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 1. QR de cobros en profiles
-- ─────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS qr_cobro_url   text,
  ADD COLUMN IF NOT EXISTS qr_metodo      text CHECK (qr_metodo IN (
    'tigo_money',
    'billetera_bcb',
    'qr_simple',
    'efectivo_cuenta'
  )),
  ADD COLUMN IF NOT EXISTS qr_verificado  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_subido_at   timestamptz;

-- ─────────────────────────────────────────────────────
-- 2. Tabla prize_payments (pagos de premios a ganadores)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prize_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id       uuid REFERENCES rounds(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES profiles(id) ON DELETE CASCADE,
  lugar          smallint CHECK (lugar IN (1,2,3)),
  monto          numeric(10,2) NOT NULL,
  metodo         text CHECK (metodo IN ('qr','efectivo')),
  referencia     text,
  notas          text,
  estado         text DEFAULT 'enviado' CHECK (estado IN ('enviado','confirmado')),
  registrado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 3. RLS para prize_payments
-- ─────────────────────────────────────────────────────
ALTER TABLE prize_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuario ve sus premios" ON prize_payments;
CREATE POLICY "usuario ve sus premios" ON prize_payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin gestiona premios" ON prize_payments;
CREATE POLICY "admin gestiona premios" ON prize_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND rol IN ('admin','trabajador')
        AND estado = 'activo'
    )
  );

-- ─────────────────────────────────────────────────────
-- 4. Índice útil
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prize_payments_user  ON prize_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_prize_payments_round ON prize_payments(round_id);
CREATE INDEX IF NOT EXISTS idx_profiles_qr          ON profiles(qr_verificado) WHERE rol = 'usuario';

-- ─────────────────────────────────────────────────────
-- 5. Columnas multi-ganador en rounds (si no existen)
-- ─────────────────────────────────────────────────────
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS ganador2_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ganador3_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caso_sorteo     text,
  ADD COLUMN IF NOT EXISTS premio_especial boolean DEFAULT false;

-- ─────────────────────────────────────────────────────
-- 6. boletos en participations y payments (si no existen)
-- ─────────────────────────────────────────────────────
ALTER TABLE participations
  ADD COLUMN IF NOT EXISTS boletos int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lugar   int;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS boletos_solicitados int NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────
-- 7. Vista actualizada con boletos ponderados
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_rounds_active AS
SELECT
  r.id,
  r.game_id,
  r.numero,
  r.estado,
  r.created_at,
  g.nombre          AS game_nombre,
  g.precio_boleto,
  COALESCE(SUM(p.boletos), 0)        AS cupos_usados,
  25 - COALESCE(SUM(p.boletos), 0)   AS cupos_libres
FROM rounds r
JOIN games g ON g.id = r.game_id
LEFT JOIN participations p ON p.round_id = r.id
GROUP BY r.id, g.id;