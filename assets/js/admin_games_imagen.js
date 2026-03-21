/**
 * ═══════════════════════════════════════════════════════════════
 *  EL PADRINO — admin_games_imagen.js
 *  Fragmento para agregar a admin.js: gestión de imagen en juegos
 *  
 *  INTEGRACIÓN:
 *  1. Importar uploadFile desde cloudinary.js (ya existente)
 *  2. Reemplazar/extender tu función modalCrearJuego() existente
 *  3. Reemplazar/extender tu función modalEditarJuego() existente
 * ═══════════════════════════════════════════════════════════════
 */

/* ─── Helper: render preview de imagen actual ─── */
function _imgPreviewHtml(urlActual) {
  if (!urlActual) return '';
  return `
    <div id="imgPreviewWrap" style="margin-top:.6rem;border-radius:8px;overflow:hidden;border:1px solid rgba(212,160,23,.22);max-height:120px;position:relative">
      <img src="${urlActual}" style="width:100%;max-height:120px;object-fit:cover;display:block" onerror="this.parentElement.style.display='none'">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,rgba(0,0,0,.6));display:flex;align-items:flex-end;padding:.4rem .6rem">
        <span style="font-size:.68rem;color:#fff;font-family:'Oswald',sans-serif;letter-spacing:.05em">Imagen actual</span>
      </div>
    </div>`;
}

/* ─── HTML del campo de imagen para incluir en el modal ─── */
function _campoImagenHtml(urlActual = null) {
  return `
  <div class="field" style="margin-bottom:1rem">
    <label>Imagen del sorteo
      <span style="font-weight:400;text-transform:none;font-size:.68rem;color:var(--muted)"> (opcional · recomendado 800×300px)</span>
    </label>

    <!-- Tabs: Subir archivo / URL de Cloudinary -->
    <div style="display:flex;gap:0;margin-bottom:.6rem;border-radius:7px;overflow:hidden;border:1px solid var(--border)">
      <button type="button" id="tabSubir" class="img-tab img-tab-active" onclick="switchImgTab('subir')">
        <i class="bi bi-upload"></i> Subir archivo
      </button>
      <button type="button" id="tabUrl" class="img-tab" onclick="switchImgTab('url')">
        <i class="bi bi-link-45deg"></i> URL Cloudinary
      </button>
    </div>

    <!-- Panel: subir archivo -->
    <div id="panelSubir">
      <div class="compra-upload-area" id="imgUploadArea" style="min-height:72px">
        <input type="file" id="imgFileInput" accept="image/jpeg,image/png,image/webp"
          style="position:absolute;inset:0;opacity:0;cursor:pointer;z-index:2"
          onchange="previewImgFile(this)">
        <div class="compra-upload-placeholder" id="imgUploadPlaceholder">
          <i class="bi bi-image" style="font-size:1.4rem;color:var(--dim)"></i>
          <span style="font-size:.8rem">Toca para elegir imagen (JPG/PNG, máx. 4MB)</span>
        </div>
        <img id="imgFilePreview" style="display:none;width:100%;max-height:110px;object-fit:cover;border-radius:6px;position:relative;z-index:1">
      </div>
    </div>

    <!-- Panel: URL manual -->
    <div id="panelUrl" style="display:none">
      <input type="url" id="imgUrlInput" placeholder="https://res.cloudinary.com/…"
        class="compra-input" style="width:100%"
        oninput="previewImgUrl(this.value)">
      <div id="imgUrlPreview" style="display:none;margin-top:.5rem;border-radius:7px;overflow:hidden;border:1px solid rgba(212,160,23,.2)">
        <img id="imgUrlPreviewImg" style="width:100%;max-height:110px;object-fit:cover;display:block" onerror="document.getElementById('imgUrlPreview').style.display='none'">
      </div>
    </div>

    ${_imgPreviewHtml(urlActual)}
    <div style="font-size:.68rem;color:var(--dim);margin-top:.4rem;display:flex;align-items:center;gap:.3rem">
      <i class="bi bi-info-circle" style="color:var(--gold2)"></i>
      Si no subes imagen, se mostrará el tema visual automático según el nombre
    </div>
  </div>

  <style>
    .img-tab {
      flex:1; padding:.38rem .5rem; font-family:'Oswald',sans-serif;
      font-size:.75rem; font-weight:600; letter-spacing:.06em;
      background:var(--ink3); color:var(--muted); border:none;
      cursor:pointer; transition:all .18s; display:flex; align-items:center;
      justify-content:center; gap:.3rem;
    }
    .img-tab:hover { color:var(--cream); }
    .img-tab-active { background:rgba(212,160,23,.14); color:var(--gold2); }
  </style>`;
}

/* ─── Funciones de UI del campo imagen (exponer globalmente) ─── */
window.switchImgTab = (tab) => {
  const isSubir = tab === 'subir';
  document.getElementById('panelSubir').style.display = isSubir ? 'block' : 'none';
  document.getElementById('panelUrl').style.display   = isSubir ? 'none'  : 'block';
  document.getElementById('tabSubir').classList.toggle('img-tab-active', isSubir);
  document.getElementById('tabUrl').classList.toggle('img-tab-active', !isSubir);
};

window.previewImgFile = (input) => {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('imgFilePreview');
    const ph  = document.getElementById('imgUploadPlaceholder');
    if (img) { img.src = ev.target.result; img.style.display = 'block'; }
    if (ph)  { ph.style.display = 'none'; }
  };
  reader.readAsDataURL(file);
};

window.previewImgUrl = (url) => {
  const wrap = document.getElementById('imgUrlPreview');
  const img  = document.getElementById('imgUrlPreviewImg');
  if (!url || !url.startsWith('http')) { if(wrap) wrap.style.display='none'; return; }
  if (img)  { img.src = url; }
  if (wrap) { wrap.style.display = 'block'; }
};

/* ─── Obtener URL final de imagen desde el modal ─── */
async function obtenerUrlImagen() {
  const panelSubir = document.getElementById('panelSubir');
  const isSubir = panelSubir && panelSubir.style.display !== 'none';

  if (isSubir) {
    const file = document.getElementById('imgFileInput')?.files[0];
    if (!file) return null; // sin imagen nueva
    if (file.size > 4 * 1024 * 1024) {
      Swal.showValidationMessage('Imagen muy grande (máx. 4MB)');
      return false; // señal de error
    }
    try {
      const url = await uploadFile(file, 'el-padrino/sorteos');
      return url;
    } catch {
      Swal.showValidationMessage('Error al subir imagen. Intenta de nuevo.');
      return false;
    }
  } else {
    const url = document.getElementById('imgUrlInput')?.value?.trim() || null;
    if (url && !url.startsWith('http')) {
      Swal.showValidationMessage('URL inválida');
      return false;
    }
    return url || null;
  }
}

/* ════════════════════════════════════════════════════════════════
   MODAL CREAR JUEGO — Versión completa con imagen
   Reemplaza tu función modalCrearJuego() existente
════════════════════════════════════════════════════════════════ */
window.modalCrearJuego = async () => {
  const { value: v } = await Swal.fire({
    title: 'Crear nuevo sorteo',
    html: `
    <div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem">
        <label>Nombre del sorteo *</label>
        <input id="gNombre" placeholder="Ej: El Padrino, Fuego & Gloria…" class="compra-input" style="width:100%">
      </div>
      <div class="field" style="margin-bottom:.85rem">
        <label>Descripción <span style="font-weight:400;text-transform:none;font-size:.68rem;color:var(--muted)">(opcional)</span></label>
        <input id="gDesc" placeholder="Breve descripción…" class="compra-input" style="width:100%">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin-bottom:.85rem">
        <div class="field">
          <label>Precio boleto (Bs) *</label>
          <select id="gPrecio" class="compra-select">
            <option value="0">Gratis</option>
            <option value="5">Bs 5</option>
            <option value="10" selected>Bs 10</option>
            <option value="15">Bs 15</option>
          </select>
        </div>
        <div class="field">
          <label>Capacidad máx. *</label>
          <input id="gCapacidad" type="number" min="10" max="100" value="20" class="compra-input" style="width:100%">
          <div style="font-size:.65rem;color:var(--muted);margin-top:.2rem">
            ≤25 → 1 ganador · &gt;25 → 3 ganadores
          </div>
        </div>
      </div>

      ${_campoImagenHtml(null)}
    </div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-plus-circle-fill"></i> Crear sorteo',
    cancelButtonText: 'Cancelar',
    width: 520,
    showLoaderOnConfirm: true,
    ...swal$,
    preConfirm: async () => {
      const nombre    = document.getElementById('gNombre')?.value?.trim();
      const desc      = document.getElementById('gDesc')?.value?.trim() || null;
      const precio    = Number(document.getElementById('gPrecio')?.value || 0);
      const capacidad = Number(document.getElementById('gCapacidad')?.value || 20);

      if (!nombre)          { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
      if (capacidad < 10)   { Swal.showValidationMessage('Mínimo 10 participantes'); return false; }
      if (capacidad > 200)  { Swal.showValidationMessage('Máximo 200 participantes'); return false; }

      // Subir imagen (puede ser null si no pusieron ninguna)
      const imagen_url = await obtenerUrlImagen();
      if (imagen_url === false) return false; // error ya mostrado

      return { nombre, desc, precio, capacidad, imagen_url };
    }
  });

  if (!v) return;

  const { error } = await supabase.from('games').insert({
    nombre:        v.nombre,
    descripcion:   v.desc,
    precio_boleto: v.precio,
    capacidad_max: v.capacidad,
    imagen_url:    v.imagen_url,
    estado:        'activo',
  });

  if (error) { ok$('Error al crear sorteo', error.message, 'error'); return; }
  toast('✅ Sorteo creado', 'success');
  loadGames?.(); // recargar lista si existe la función
};

/* ════════════════════════════════════════════════════════════════
   MODAL EDITAR JUEGO — Versión completa con imagen
   Reemplaza tu función modalEditarJuego() existente
════════════════════════════════════════════════════════════════ */
window.modalEditarJuego = async (gameId) => {
  const { data: game, error: gErr } = await supabase
    .from('games').select('*').eq('id', gameId).single();
  if (gErr || !game) { ok$('Error', 'No se encontró el sorteo', 'error'); return; }

  const { value: v } = await Swal.fire({
    title: `Editar: ${game.nombre}`,
    html: `
    <div style="text-align:left">
      <div class="field" style="margin-bottom:.85rem">
        <label>Nombre *</label>
        <input id="gNombre" value="${game.nombre||''}" class="compra-input" style="width:100%">
      </div>
      <div class="field" style="margin-bottom:.85rem">
        <label>Descripción</label>
        <input id="gDesc" value="${game.descripcion||''}" placeholder="Breve descripción…" class="compra-input" style="width:100%">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin-bottom:.85rem">
        <div class="field">
          <label>Precio boleto (Bs) *</label>
          <select id="gPrecio" class="compra-select">
            <option value="0" ${!game.precio_boleto?'selected':''}>Gratis</option>
            <option value="5" ${game.precio_boleto==5?'selected':''}>Bs 5</option>
            <option value="10" ${game.precio_boleto==10?'selected':''}>Bs 10</option>
            <option value="15" ${game.precio_boleto==15?'selected':''}>Bs 15</option>
          </select>
        </div>
        <div class="field">
          <label>Capacidad máx. *</label>
          <input id="gCapacidad" type="number" min="10" max="200" value="${game.capacidad_max||20}" class="compra-input" style="width:100%">
          <div style="font-size:.65rem;color:var(--muted);margin-top:.2rem">≤25 → 1G · &gt;25 → 3G</div>
        </div>
      </div>

      ${_campoImagenHtml(game.imagen_url)}

      ${game.imagen_url ? `
      <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--muted);cursor:pointer;margin-top:.3rem">
        <input type="checkbox" id="gQuitarImg" style="accent-color:#f87171">
        <span>Quitar imagen actual (volver al tema automático)</span>
      </label>` : ''}
    </div>`,
    showCancelButton: true,
    confirmButtonText: '<i class="bi bi-check-lg"></i> Guardar cambios',
    cancelButtonText: 'Cancelar',
    width: 520,
    showLoaderOnConfirm: true,
    ...swal$,
    preConfirm: async () => {
      const nombre    = document.getElementById('gNombre')?.value?.trim();
      const desc      = document.getElementById('gDesc')?.value?.trim() || null;
      const precio    = Number(document.getElementById('gPrecio')?.value || 0);
      const capacidad = Number(document.getElementById('gCapacidad')?.value || 20);
      const quitarImg = document.getElementById('gQuitarImg')?.checked || false;

      if (!nombre)          { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
      if (capacidad < 10)   { Swal.showValidationMessage('Mínimo 10 participantes'); return false; }
      if (capacidad > 200)  { Swal.showValidationMessage('Máximo 200 participantes'); return false; }

      let imagen_url = game.imagen_url; // mantener la actual por defecto

      if (quitarImg) {
        imagen_url = null; // borrar imagen
      } else {
        // Intentar obtener nueva imagen (solo si el usuario eligió una)
        const nuevaImg = await obtenerUrlImagen();
        if (nuevaImg === false) return false;
        if (nuevaImg !== null) imagen_url = nuevaImg; // solo actualizar si subió algo nuevo
      }

      return { nombre, desc, precio, capacidad, imagen_url };
    }
  });

  if (!v) return;

  const { error } = await supabase.from('games').update({
    nombre:        v.nombre,
    descripcion:   v.desc,
    precio_boleto: v.precio,
    capacidad_max: v.capacidad,
    imagen_url:    v.imagen_url,
  }).eq('id', gameId);

  if (error) { ok$('Error al guardar', error.message, 'error'); return; }
  toast('✅ Sorteo actualizado', 'success');
  loadGames?.();
};

/*
 * NOTA DE INTEGRACIÓN:
 * ─────────────────────
 * En tu admin.js, asegúrate de que en el SELECT de games incluyas imagen_url:
 *
 *   supabase.from('games').select('id,nombre,descripcion,precio_boleto,capacidad_max,imagen_url,estado')
 *
 * Y al renderizar la lista de juegos en admin, puedes mostrar un thumbnail pequeño:
 *
 *   ${g.imagen_url
 *     ? `<img src="${g.imagen_url}" style="width:48px;height:32px;object-fit:cover;border-radius:5px;border:1px solid var(--border)">`
 *     : `<div style="width:48px;height:32px;border-radius:5px;background:${getSorteoTheme(g.nombre).gradient};display:flex;align-items:center;justify-content:center;font-size:1.1rem">${getSorteoTheme(g.nombre).icon}</div>`
 *   }
 */
