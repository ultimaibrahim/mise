# 🗺️ Plan de Trabajo — Cierre v1.7.5 y Suite MISE v1.7.6 Altair
**La Crêpe Parisienne · Grupo MYT** · Arquitectura: Ibrahim García (`ultimaibrahim`)
**Creado**: 2026-09-28 · **Estado de partida**: PROD en `v1.7.5r` (se queda ahí hasta cerrar la Fase 0; la 1.7.6 se desarrolla en `feat/v1.7.6-altair` y se prueba en DEV) (BDG, PDA y PDM idénticos al repo), 55 pruebas en verde.

> Cómo usar este plan: marcar `[x]` al cerrar cada punto (en el mismo commit que lo resuelve). Cada fase se libera como iteración con letra (`1.7.6a`, `b`, …) por el flujo `push:dev → pruebas → push:prod → verificar_prod`. La versión oficial `1.7.6` se consolida al terminar la Fase 3.

---

## Fase 0 — Cierre de la v1.7.5 (esta semana; bloquea el inicio de la 1.7.6)

### Validación en operación real
- [ ] **Mañana (29/sep)**: `🗒 LOG` de Bodega muestra el descuento de las 23:00 con la regla "sin registro → 0" (`SIN_REGISTRO`), `ULTIMO_CIERRE` visible en *Acerca de*.
- [ ] **Mañana**: reset de las 00:00 en ambas tiendas y enlace `_SYNC` vivo (*Acerca de → Conexión* ✅).
- [ ] **Mañana**: el semáforo de colores de PEDIDO DIARIO se ve bien con un pedido nuevo (el caso de hoy fue puntual).
- [ ] **Jueves (1/oct)**: conteo físico → saldos iniciales en SALDO ANT de ambos Kardex (borrar solo el contenido de SALDO ANT y ENT/SAL, nunca las columnas SLD).
- [ ] **Lunes (5/oct)**: ambos badges en `🟢 SEMANA 41 ACTUALIZADA` sin intervención (cierre dominical u `onOpenBodegaInstalable`).
- [ ] *Acerca de* de Bodega: **4 activadores** (si no, `🚀 Configurar este libro`).

### Consolidación
- [ ] Fusionar las entradas `1.7.5a … 1.7.5r` en una sola **v1.7.5 oficial** en `CHANGELOG.md`, `CHANGELOG_PUBLIC.md` e `historial_versiones.md`.
- [ ] Badge del README y `package.json` → `1.7.5`; `MISE_VERSION` y cabeceras → `1.7.5` (la prueba `version.test.js` lo exige).
- [ ] **🔐 Contraseña `LCP-ADMIN-2026`**: está en el código y en la documentación de un repo **público**. Moverla a la propiedad `ADMIN_PASSWORD` (sin respaldo en código), cambiarla y eliminarla del texto.
- [ ] **Git**: fusionar `feat/v1.10.0-altair` → `master` (nombre heredado de la numeración vieja) y abrir `feat/v1.7.6-altair`.
- [ ] **Trabajo de Atlas sin commit** (`mise-web/`, `database/`, archivos de agentes en la raíz y `tests/`): decidir entre commit aparte en su propia rama o archivarlo. No mezclar con Altair.

---

## Fase 1 — Bugs conocidos (1.7.6a) · prioridad alta, poco riesgo

- [x] **📥 ENTRADAS valida la semana solo contra `KARDEX_BA!G4`** *(1.7.6a)* (`_lunesSemanaActivaKardex`). Si Mercado va desfasada, sus entradas caen en la columna de otra semana (pasó hasta el 28/sep). → Validar y resolver el día **por bodega** y bloquear solo la bodega desfasada.
- [x] **⚡ Registro Rápido (PC) reemplaza ENT/SAL** *(1.7.6a: decisión de Ibrahim → función eliminada; Bodega pasa a mobile-first)* (`registrarMovimientoRapidoKardex` usa `setValue`): si el descuento nocturno ya escribió SAL ese día, la pisa. → Decidir con Ibrahim: **sumar** (como Entradas) o **editar** con confirmación explícita.
- [ ] **Historial de Mercado, semanas 38–39**: quedó mezclado por el atasco (el bloque 38 trae dos semanas y el 39 salió vacío). → Solo documentar; el conteo del jueves reinicia saldos. Opcional: nota en `HISTORIAL_BM`.
- [ ] Revisar `🗒 LOG` de la primera semana completa y convertir cada `WARN`/`ERROR` recurrente en un punto de esta fase.

---

## Fase 2 — Limpieza y una sola fuente de verdad (1.7.6b–d)

- [x] **Un solo archivo de tienda** *(1.7.6b: `tienda/miseTienda.js` + `scripts/build-tienda.js`)*: `pda/miseAuthPDA.js` y `pdm/miseAuthPDM.js` difieren en 3 líneas. Crear `tienda/miseTienda.js` (la sucursal sale de `BODEGA_KEY`/`BODEGA_NOMBRE`) y que `mise-env.js` lo suba a ambos proyectos. Adiós a las divergencias (log de surtido, etc.).
- [~] **Un solo escritor de PEDIDO DIARIO** *(1.7.6b: `_filaPedido()` unifica las 3 copias de la tienda; falta el escritor remoto de Bodega → Fase 3)*: hoy hay 4 (`_actualizarAvisoPedido`, `ordenarPedido`, `_reconstruirPedidoDiarioCore` y el escritor remoto de Bodega `_reordenarPedidoRemotoDirecto`). Unificar en `_escribirFilasPedido()`; el escritor remoto desaparece en la Fase 3.
- [ ] **Herramientas de desarrollo fuera de PROD**: mover a `MiseDevTools.js` (solo DEV vía `.claspignore`) — reconciliador del 7/sep, inyección de recuperación, datos aleatorios de prueba, forzar LOG, reconciliador de huérfanos; menús condicionados a `MISE_ENV`.
- [ ] **Código muerto**: 9 funciones sin referencias en BDG y 4 en tiendas (lista en la sesión del 28/sep: `crearVistaMovilBA/BM` duplicadas, `runTests`, `limpiarProps`, `crearHojaCargaMasiva`, `crearHojaEdicionMasiva`, `abrirPowerhouse`, `obtenerProductosPickingHTML`, `_validarOAvanzarSemanaBDG`, `invalidarCache`, `instalarTriggers`, `desinstalarTriggers`, `avanzarSemanaInfo`). Confirmar con `grep` antes de borrar.
- [ ] **Logs**: unificar `_log`, `registrarLog` y `MiseLogger` en `MiseLogger`.
- [ ] **Columnas ocultas muertas** (esquema 3 del motor de migración): quitar `J ADICIÓN` (función retirada en v1.6.1) y evaluar `G DIFERENCIA`, ajustando los índices en un solo cambio probado. Las demás columnas ocultas son del motor y se quedan. Alternativa sin riesgo: agruparlas (➖/➕).

---

## Fase 2.5 — Blindaje y UX de Bodega (pedido 28/sep)
- [x] **Blindaje por capas** *(1.7.6c)*: instalables como dueño, hojas técnicas y Entradas protegidas, Kardex sin F:G ni G4 editables, `🔐 Auditoría de permisos`.
- [x] **Kardex simplificado** *(1.7.6d)*: visibles solo PRODUCTO, UNIDAD, SALDO ANTERIOR y las columnas de los días.
- [x] **Hoja `🏠 INICIO` en Bodega** *(1.7.6d)*: accesos y acciones con casillas (funcionan en celular) y estado del sistema en la propia hoja.
- [ ] **Manual visual/tutorial** por rol, con qué funciona sin internet (lo arma Ibrahim; apoyo con página compartible).

## Fase 3 — Arquitectura por eventos · Nivel 2 (1.7.6e–f)

Objetivo: **nadie escribe en el libro de otro**. Elimina el problema de permisos, el escritor remoto duplicado y la mayor parte de los ~30 s del Powerhouse.

- [ ] **Bodega publica**: `_META!VERSION` (hash de catálogo + picking + activos + hora) al guardar en el Powerhouse, al cambiar ACTIVO y en `_buildVista`.
- [ ] **Tiendas se suscriben**: activador cada 10 min `_sincronizarSiCambioCatalogo()`: lee `_META` de Bodega; si cambió, se reordena y oculta inactivos localmente; no corre si alguien editó en los últimos 60 s.
- [ ] **Latido**: cada tienda escribe `_ESTADO` (versión de código, esquema, último reset, última versión de catálogo aplicada, activadores).
- [ ] **🩺 Panel de salud en Bodega**: una fila por libro con su latido; alerta si una tienda no late en más de 24 h.
- [ ] **El push remoto se reduce** a refrescar el enlace (carril rápido opcional) y el Powerhouse guarda solo el catálogo (objetivo: **< 5 s**).
- [ ] Cuota: ~4 min/día de los 90 min diarios de Google (medir tras una semana).

---

## Fase 4 — Roadmap (fuera de la 1.7.6)

- **Mise Móvil (Web App `doGet`)**: teclado numérico real (`inputmode="decimal"`), botones grandes, sin problemas de permisos ni de varias cuentas; empezar por 📥 Entradas o Surtido Rápido para que lo pruebe el gerente.
- **Biblioteca `MiseCore`**: código compartido por los 3 libros.
- **Developer Metadata**: etiquetar filas por ID de producto (inmunidad total al orden de filas).
- **Alertas** por correo o Telegram: stock bajo, tienda sin latido, cierre nocturno fallido.
- **Hoja `📋 CONTEO INICIAL/SEMANAL`**: si el conteo del jueves se repite semanalmente (la idea del gerente), captura móvil con comparación contra el teórico y registro de mermas.

---

## Reglas que aplican a todo el plan
- Cada fix lleva una **prueba que falla con el código anterior** (emulador fiel: celdas combinadas, congeladas y errores diferidos).
- **Doble changelog en el mismo commit**, hotfixes incluidos; sin atribución a la IA.
- `push:dev` → pruebas → `push:prod` (también exige pruebas) → `verificar_prod.sh`.
- Pedir la **traza del `🗒 LOG`** (`archivo:línea:columna`) antes de teorizar sobre un error de producción.
- Referencias: skill `mise-gas-ops` (arquitectura, trampas 1–15, pruebas en VM) y `documentacion/deuda_tecnica_optimizacion_avanzada.md`.
