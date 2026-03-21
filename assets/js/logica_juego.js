/**
 * ═══════════════════════════════════════════════════════
 *  EL PADRINO — logica_juego.js
 *  Motor de premiación ponderado — Capacidad dinámica
 * ═══════════════════════════════════════════════════════
 *
 *  REGLAS DE PREMIACIÓN:
 *
 *  MODO 1 GANADOR (capacidad_max entre 10 y 25):
 *    → 1 ganador recibe ~70% del total recaudado
 *    → Ganancia del sistema: ~30%
 *
 *  MODO 3 GANADORES (capacidad_max > 25):
 *    → 1er lugar: 50% del total
 *    → 2do lugar: 30% del total
 *    → 3er lugar: 20% del total
 *    → Ganancia del sistema: ~30% (descontada antes de distribuir)
 *
 *  CASOS ESPECIALES:
 *    CASO A — Un solo comprador cubre todo → GRAN PADRINO
 *    CASO B — Exactamente 2 compradores cubren todo → DOBLE PADRINO
 *    CASO C — Alguien tiene ≥ mitad boletos → clasificado automático
 *
 *  PONDERACIÓN: boletos / total = probabilidad relativa
 */

/**
 * Determina si una ronda tiene 1 o 3 ganadores según capacidad
 */
export function getModoGanadores(capacidadMax) {
  const cap = capacidadMax || 25;
  return cap <= 25 ? 1 : 3;
}

/**
 * Calcula los premios según el total recaudado y modo
 * Retorna premios en Bs redondeados a números atractivos
 */
export function calcularPremios(totalRecaudado, capacidadMax, faseInicial = false) {
  const gananciaRate = faseInicial ? 0.20 : 0.30;
  const pool = totalRecaudado * (1 - gananciaRate);
  const modo = getModoGanadores(capacidadMax);

  // Redondear a múltiplos de 5 para premios atractivos
  const redondear = (n) => Math.round(n / 5) * 5;

  if (modo === 1) {
    return {
      modo: 1,
      gananciaRate,
      gananciaTotal: redondear(totalRecaudado * gananciaRate),
      premios: [
        { lugar: 1, monto: redondear(pool), porcentaje: 100 }
      ]
    };
  } else {
    return {
      modo: 3,
      gananciaRate,
      gananciaTotal: redondear(totalRecaudado * gananciaRate),
      premios: [
        { lugar: 1, monto: redondear(pool * 0.50), porcentaje: 50 },
        { lugar: 2, monto: redondear(pool * 0.30), porcentaje: 30 },
        { lugar: 3, monto: redondear(pool * 0.20), porcentaje: 20 }
      ]
    };
  }
}

/**
 * Elige un ganador ponderado (más boletos = más probabilidad)
 */
function sortearPonderado(pool) {
  if (!pool || !pool.length) return null;
  const total = pool.reduce((s, p) => s + p.boletos, 0);
  if (total <= 0) return pool[0];
  let rnd = Math.random() * total;
  for (const p of pool) {
    rnd -= p.boletos;
    if (rnd <= 0) return p;
  }
  return pool[pool.length - 1];
}

function removerDelPool(pool, userId) {
  return pool.filter(p => p.user_id !== userId);
}

/**
 * Función principal del sorteo — soporta capacidad dinámica
 */
export function realizarSorteo(participantes, capacidadMax = 25) {
  if (!participantes || !participantes.length) {
    return { caso: "SIN_PARTICIPANTES", descripcion: "No hay participantes", premioEspecial: false, ganadores: [] };
  }

  const modo = getModoGanadores(capacidadMax);
  const total = participantes.reduce((s, p) => s + p.boletos, 0);
  const mitad = Math.ceil(capacidadMax / 2);

  // Agrupar por usuario
  const mapaUsuarios = {};
  for (const p of participantes) {
    if (!mapaUsuarios[p.user_id]) mapaUsuarios[p.user_id] = { ...p };
    else mapaUsuarios[p.user_id].boletos += p.boletos;
  }
  const partes = Object.values(mapaUsuarios);
  const nJugadores = partes.length;

  /* ─── CASO A: Un solo jugador ─── */
  if (nJugadores === 1) {
    return {
      caso: "GRAN_PADRINO",
      descripcion: "¡Un solo jugador tomó todos los boletos!",
      premioEspecial: true,
      ganadores: [{ ...partes[0], lugar: 1, premio: "🎩 GRAN PADRINO — Premio especial" }]
    };
  }

  /* ─── CASO B: Exactamente 2 jugadores, modo 1 ganador ─── */
  if (modo === 1 && nJugadores === 2) {
    return {
      caso: "DOBLE_PADRINO",
      descripcion: "¡Dos jugadores se repartieron los boletos!",
      premioEspecial: true,
      ganadores: [
        { ...partes[0], lugar: 1, premio: "💎 DOBLE PADRINO" },
        { ...partes[1], lugar: 1, premio: "💎 DOBLE PADRINO" }
      ]
    };
  }

  /* ─── Sorteo ponderado según modo ─── */
  const maxGanadores = modo;
  let pool = [...partes];
  const ganadores = [];

  const grandPatrones = partes.filter(p => p.boletos >= mitad);
  const lugaresLabel = [
    { lugar: 1, premio: "🥇 1er Lugar" },
    { lugar: 2, premio: "🥈 2do Lugar" },
    { lugar: 3, premio: "🥉 3er Lugar" }
  ];

  if (grandPatrones.length >= 1 && modo === 1) {
    // Clasificado automático
    const g1 = sortearPonderado(grandPatrones);
    if (g1) {
      ganadores.push({ ...g1, lugar: 1, premio: "🥇 1er Lugar — Mayoría de boletos" });
    }
  } else {
    // Sorteo ponderado normal
    for (let i = 0; i < Math.min(maxGanadores, pool.length); i++) {
      let poolActual = pool;
      if (i === 2) {
        // Boost para 3er lugar: quienes tienen 5+ boletos tienen x2
        const boosted = pool.flatMap(p => p.boletos >= 5 ? [p, p] : [p]);
        poolActual = boosted;
      }
      const g = sortearPonderado(poolActual);
      if (!g) break;
      if (!ganadores.find(x => x.user_id === g.user_id)) {
        ganadores.push({ ...g, ...lugaresLabel[i] });
        pool = removerDelPool(pool, g.user_id);
      }
    }
  }

  const caso = grandPatrones.length >= 1 ? "GRAN_PATRON" : "ESTANDAR";
  const descripcion = grandPatrones.length >= 1
    ? "Jugador con mayoría de boletos toma la delantera"
    : modo === 1
      ? "Sorteo ponderado — 1 ganador"
      : "Sorteo ponderado — 3 ganadores";

  return { caso, descripcion, premioEspecial: false, ganadores };
}

export function mensajeNoGanador(boletos) {
  const frases = [
    ["El Padrino no olvida a sus leales.", "Vuelve a jugar y la suerte cambiará."],
    ["La fortuna es tímida, pero siempre regresa.", "Más boletos, más poder. Inténtalo de nuevo."],
    ["Hoy no fue, pero mañana es otro día.", "Los que persisten, terminan ganando."],
    ["Hasta los mejores pierden una batalla.", "La guerra la gana quien sigue adelante."],
    ["El destino te prepara algo mejor.", "Mientras tanto, sigue comprando boletos."],
  ];
  const idx = Math.min(Math.floor((boletos || 0) / 5), frases.length - 1);
  return frases[idx];
}

/**
 * Calcula probabilidades — ahora considera capacidad dinámica
 */
export function calcularChances(boletosComprados, boletosEnRonda, capacidadMax = 25) {
  const bc = Math.max(0, boletosComprados || 0);
  const br = Math.max(0, boletosEnRonda || 0);
  const totalConMios = br + bc;
  const pct = totalConMios > 0 ? Math.round((bc / totalConMios) * 100) : 0;
  const mitad = Math.ceil(capacidadMax / 2);
  const modo = getModoGanadores(capacidadMax);

  let tier, descripcion;
  if (bc >= capacidadMax) {
    tier = "GRAN_PADRINO";
    descripcion = "🎩 ¡Eres el Gran Padrino! Victoria asegurada + premio especial";
  } else if (bc >= mitad) {
    tier = "PATRON";
    descripcion = `💪 Mayoría del control — clasificado al 1er lugar`;
  } else if (bc >= 5) {
    tier = "CONTENDIENTE";
    descripcion = modo === 3
      ? "🎯 Contendiente fuerte — acceso preferencial"
      : "🎯 Contendiente fuerte — sorteo ponderado";
  } else if (bc >= 3) {
    tier = "JUGADOR";
    descripcion = "🎲 Buen intento — participas en el sorteo";
  } else {
    tier = "NOVATO";
    descripcion = "👤 Chance básico — considera comprar más boletos";
  }

  return { chance: pct, tier, descripcion };
}

export function nombreCaso(caso) {
  if (!caso) return "";
  const nombres = {
    GRAN_PADRINO:  "🎩 GRAN PADRINO",
    DOBLE_PADRINO: "💎 DOBLE PADRINO",
    GRAN_PATRON:   "👑 GRAN PATRÓN",
    ESTANDAR:      "🎲 SORTEO PONDERADO",
  };
  return nombres[caso] || caso;
}

/**
 * Paleta de imágenes/temáticas por nombre de sorteo
 * Retorna config de gradiente + ícono CSS para la tarjeta
 */
export function getSorteoTheme(nombre) {
  const n = (nombre || "").toLowerCase();

  if (n.includes("oro") || n.includes("gold") || n.includes("dorado"))
    return { gradient: "linear-gradient(135deg,#78350f,#b45309,#d97706)", icon: "🥇", accent: "#fbbf24", clase: "theme-oro" };
  if (n.includes("plata") || n.includes("silver"))
    return { gradient: "linear-gradient(135deg,#1e293b,#475569,#94a3b8)", icon: "🥈", accent: "#cbd5e1", clase: "theme-plata" };
  if (n.includes("rojo") || n.includes("sangre") || n.includes("fuego") || n.includes("llama"))
    return { gradient: "linear-gradient(135deg,#450a0a,#991b1b,#dc2626)", icon: "🔥", accent: "#f87171", clase: "theme-fuego" };
  if (n.includes("verde") || n.includes("esmeralda") || n.includes("jade"))
    return { gradient: "linear-gradient(135deg,#052e16,#166534,#16a34a)", icon: "💚", accent: "#4ade80", clase: "theme-esmeralda" };
  if (n.includes("azul") || n.includes("zafiro") || n.includes("cielo") || n.includes("ocean"))
    return { gradient: "linear-gradient(135deg,#0c1a2e,#1e3a5f,#2563eb)", icon: "💎", accent: "#60a5fa", clase: "theme-zafiro" };
  if (n.includes("negro") || n.includes("noche") || n.includes("sombra") || n.includes("oscuro"))
    return { gradient: "linear-gradient(135deg,#0a0a0a,#1c1917,#292524)", icon: "🌑", accent: "#a8a29e", clase: "theme-noche" };
  if (n.includes("diamante") || n.includes("crystal") || n.includes("cristal"))
    return { gradient: "linear-gradient(135deg,#0f172a,#312e81,#4f46e5)", icon: "💠", accent: "#a5b4fc", clase: "theme-diamante" };
  if (n.includes("sol") || n.includes("amanecer") || n.includes("dorado") || n.includes("ámbar"))
    return { gradient: "linear-gradient(135deg,#431407,#9a3412,#ea580c)", icon: "☀️", accent: "#fb923c", clase: "theme-amanecer" };
  if (n.includes("padrino") || n.includes("jefe") || n.includes("don") || n.includes("capo"))
    return { gradient: "linear-gradient(135deg,#1c0a00,#7c2d12,#b45309)", icon: "🎩", accent: "#d4a017", clase: "theme-padrino" };
  if (n.includes("corona") || n.includes("rey") || n.includes("reino") || n.includes("imperial"))
    return { gradient: "linear-gradient(135deg,#1e0a3c,#581c87,#7c3aed)", icon: "👑", accent: "#c084fc", clase: "theme-corona" };
  if (n.includes("bomba") || n.includes("suerte") || n.includes("jackpot") || n.includes("premio"))
    return { gradient: "linear-gradient(135deg,#0c4a6e,#0369a1,#0ea5e9)", icon: "💣", accent: "#38bdf8", clase: "theme-bomba" };
  if (n.includes("tigre") || n.includes("leon") || n.includes("bestia") || n.includes("fiera"))
    return { gradient: "linear-gradient(135deg,#422006,#92400e,#d97706)", icon: "🐯", accent: "#fcd34d", clase: "theme-tigre" };

  // Default elegante
  return { gradient: "linear-gradient(135deg,#1c1407,#3d2b0f,#8b1a1a)", icon: "🎰", accent: "#d4a017", clase: "theme-default" };
}
