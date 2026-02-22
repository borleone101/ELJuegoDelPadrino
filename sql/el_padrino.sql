-- ============================================
-- EL PADRINO - BASE DE DATOS
-- PostgreSQL / Supabase
-- SOLO TABLAS (SIN POLICIES)
-- ============================================

-- EXTENSIONES
create extension if not exists "uuid-ossp";

-- ============================================
-- PERFIL DE USUARIO (extiende auth.users)
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username varchar(50) unique not null,
  saldo numeric(10,2) default 0,
  rol text default 'usuario',
  estado text default 'activo',
  avatar_url text,
  created_at timestamp with time zone default now()
);

-- ============================================
-- MOVIMIENTOS DE BILLETERA
-- ============================================
create table wallet_movements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  tipo text check (tipo in ('deposito','retiro','apuesta','ganancia')),
  monto numeric(10,2) not null,
  referencia text,
  created_at timestamp with time zone default now()
);

-- ============================================
-- JUEGOS
-- ============================================
create table games (
  id uuid default uuid_generate_v4() primary key,
  nombre varchar(50) not null,
  descripcion text,
  estado text default 'activo',
  created_at timestamp with time zone default now()
);

-- ============================================
-- APUESTAS
-- ============================================
create table bets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  game_id uuid references games(id),
  monto numeric(10,2) not null,
  resultado text check (resultado in ('ganada','perdida','pendiente')) default 'pendiente',
  ganancia numeric(10,2) default 0,
  created_at timestamp with time zone default now()
);

-- ============================================
-- PAGOS (YAPE / QR / MANUAL)
-- ============================================
create table payments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  metodo text check (metodo in ('yape','qr','manual')),
  monto numeric(10,2) not null,
  estado text default 'pendiente',
  comprobante_url text,
  referencia text,
  created_at timestamp with time zone default now()
);

-- ============================================
-- PREMIOS / SORTEOS
-- ============================================
create table prizes (
  id uuid default uuid_generate_v4() primary key,
  nombre text not null,
  descripcion text,
  imagen_url text,
  estado text default 'activo',
  created_at timestamp with time zone default now()
);

-- ============================================
-- LOGS DE SEGURIDAD (OPCIONAL)
-- ============================================
create table security_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid,
  accion text,
  ip text,
  created_at timestamp with time zone default now()
);



alter table profiles
add column email text unique;


alter table payments
add column revisado_por uuid;