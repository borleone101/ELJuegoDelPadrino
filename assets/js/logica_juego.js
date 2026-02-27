/**
 * ═══════════════════════════════════════════════════════
 *  EL PADRINO — logica_juego.js
 *  Motor de premiación ponderado para sorteos de 25 cupos
 * ═══════════════════════════════════════════════════════
 *
 *  REGLAS DE PREMIACIÓN (en orden de prioridad):
 *
 *  CASO A — Un solo comprador cubre los 25 boletos
 *    → GRAN PADRINO: 1er lugar único + premio especial Bs 100
 *
 *  CASO B — Exactamente 2 compradores cubren los 25 entre ambos
 *    → DOBLE PADRINO: ambos son 1er lugar + Bs 50 c/u
 *
 *  CASO C — Un comprador tiene ≥ 12 boletos (mitad o más)
 *    → Clasificado automático a 1er lugar
 *    → Resto: sorteo ponderado para 2do y 3er lugar
 *
 *  CASO D — Múltiples con ≥ 12 boletos
 *    → Todos califican a 1er / 2do lugar por sorteo ponderado
 *    → Resto: sorteo ponderado para 3er lugar
 *
 *  CASO E — Alguien con ≥ 5 boletos (pero < 12)
 *    → Clasificado a pool de 3er lugar con más probabilidad
 *
 *  CASO F — Sorteo estándar (todos < 5 boletos)
 *    → 3 ganadores elegidos por sorteo ponderado (más boletos = más chances)
 *
 *  PONDERACIÓN: boletos comprados / total boletos ronda = probabilidad relativa
 */

/**
 * Elige un ganador ponderado de un array de participantes
 * (más boletos = más probabilidad)
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

/**
 * Elimina un usuario del pool (ya fue elegido)
 */
function removerDelPool(pool, userId) {
  return pool.filter(p => p.user_id !== userId);
}

/**
 * Función principal: recibe los participantes de una ronda
 * y devuelve el resultado del sorteo con los ganadores y el caso aplicado.
 *
 * @param {Array} participantes - Lista con user_id, username, boletos
 * @returns {Object} ResultadoSorteo
 */
export function realizarSorteo(participantes) {
  if (!participantes || !participantes.length) {
    return { caso: "SIN_PARTICIPANTES", descripcion: "No hay participantes", premioEspecial: false, ganadores: [] };
  }

  const total = participantes.reduce((s, p) => s + p.boletos, 0);

  // Agrupar por usuario (por si hay duplicados)
  const mapaUsuarios = {};
  for (const p of participantes) {
    if (!mapaUsuarios[p.user_id]) mapaUsuarios[p.user_id] = { ...p };
    else mapaUsuarios[p.user_id].boletos += p.boletos;
  }
  const partes = Object.values(mapaUsuarios);
  const nJugadores = partes.length;

  /* ─── CASO A: Un solo jugador compró todo ─── */
  if (nJugadores === 1) {
    return {
      caso: "GRAN_PADRINO",
      descripcion: "¡Un solo jugador tomó todos los boletos!",
      premioEspecial: true,
      ganadores: [{
        ...partes[0],
        lugar: 1,
        premio: "🎩 GRAN PADRINO — Bs 100 de premio especial"
      }]
    };
  }

  /* ─── CASO B: Exactamente 2 jugadores cubren los 25 ─── */
  if (nJugadores === 2 && partes[0].boletos + partes[1].boletos === total) {
    return {
      caso: "DOBLE_PADRINO",
      descripcion: "¡Dos jugadores repartieron todos los boletos!",
      premioEspecial: true,
      ganadores: [
        { ...partes[0], lugar: 1, premio: "💎 DOBLE PADRINO — Bs 50 c/u" },
        { ...partes[1], lugar: 1, premio: "💎 DOBLE PADRINO — Bs 50 c/u" }
      ]
    };
  }

  /* ─── CASO C/D: Uno o más con ≥ 12 boletos ─── */
  const grandPatrones = partes.filter(p => p.boletos >= 12);
  if (grandPatrones.length >= 1) {
    const ganadores = [];
    let pool = [...partes];

    if (grandPatrones.length === 1) {
      ganadores.push({ ...grandPatrones[0], lugar: 1, premio: "🥇 1er Lugar — La Mitad del Control" });
      pool = removerDelPool(pool, grandPatrones[0].user_id);
    } else {
      let gpPool = [...grandPatrones];
      const g1 = sortearPonderado(gpPool);
      if (g1) {
        ganadores.push({ ...g1, lugar: 1, premio: "🥇 1er Lugar" });
        gpPool = removerDelPool(gpPool, g1.user_id);
        pool   = removerDelPool(pool, g1.user_id);
      }
      if (gpPool.length > 0) {
        const g2 = sortearPonderado(gpPool);
        if (g2) {
          ganadores.push({ ...g2, lugar: 2, premio: "🥈 2do Lugar" });
          pool = removerDelPool(pool, g2.user_id);
        }
      }
    }

    if (!ganadores.find(g => g.lugar === 2) && pool.length > 0) {
      const g2 = sortearPonderado(pool);
      if (g2) {
        ganadores.push({ ...g2, lugar: 2, premio: "🥈 2do Lugar" });
        pool = removerDelPool(pool, g2.user_id);
      }
    }

    if (pool.length > 0) {
      const poolCinco = pool.filter(p => p.boletos >= 5);
      const g3 = sortearPonderado(poolCinco.length > 0 ? poolCinco : pool);
      if (g3) ganadores.push({ ...g3, lugar: 3, premio: "🥉 3er Lugar" });
    }

    return {
      caso: "GRAN_PATRON",
      descripcion: "Jugadores con mitad o más del control toman la delantera",
      premioEspecial: false,
      ganadores
    };
  }

  /* ─── CASO E/F: Sorteo estándar ponderado ─── */
  let pool = [...partes];
  const ganadores = [];
  const lugares = [
    { lugar: 1, premio: "🥇 1er Lugar" },
    { lugar: 2, premio: "🥈 2do Lugar" },
    { lugar: 3, premio: "🥉 3er Lugar" }
  ];

  for (let i = 0; i < Math.min(3, pool.length); i++) {
    let poolActual = pool;
    if (i === 2) {
      // Boost ×2 para quienes tienen 5+ boletos en el pool del 3ro
      const boosted = pool.flatMap(p => p.boletos >= 5 ? [p, p] : [p]);
      poolActual = boosted;
    }
    const g = sortearPonderado(poolActual);
    if (!g) break;
    if (!ganadores.find(x => x.user_id === g.user_id)) {
      ganadores.push({ ...g, ...lugares[i] });
      pool = removerDelPool(pool, g.user_id);
    }
  }

  return {
    caso: "ESTANDAR",
    descripcion: "Sorteo ponderado — más boletos, más chances",
    premioEspecial: false,
    ganadores
  };
}

/**
 * Genera el texto motivacional para quien no ganó
 */
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
 * Calcula las probabilidades de ganar según boletos comprados
 *
 * @param {number} boletosComprados
 * @param {number} boletosEnRonda - total ya vendidos en la ronda (sin contar los propios)
 * @returns {{ chance: number, tier: string, descripcion: string }}
 */
export function calcularChances(boletosComprados, boletosEnRonda) {
  const bc = Math.max(0, boletosComprados || 0);
  const br = Math.max(0, boletosEnRonda  || 0);
  const totalConMios = br + bc;
  const pct = totalConMios > 0 ? Math.round((bc / totalConMios) * 100) : 0;

  let tier, descripcion;
  if (bc >= 25) {
    tier = "GRAN_PADRINO";
    descripcion = "🎩 ¡Eres el Gran Padrino! Victoria asegurada + premio especial";
  } else if (bc >= 12) {
    tier = "PATRON";
    descripcion = "💪 Control de la mitad — clasificado automático al 1er lugar";
  } else if (bc >= 5) {
    tier = "CONTENDIENTE";
    descripcion = "🎯 Contendiente fuerte — acceso preferencial al 3er lugar";
  } else if (bc >= 3) {
    tier = "JUGADOR";
    descripcion = "🎲 Buen intento — participas en el sorteo ponderado";
  } else {
    tier = "NOVATO";
    descripcion = "👤 Chance básico — considera comprar más boletos";
  }

  return { chance: pct, tier, descripcion };
}

/**
 * Formatea el nombre del caso para mostrar en UI
 * CORRECCIÓN: retorna string vacío si recibe null/undefined
 */
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