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
- [x] *(29/sep)* Fusionar las entradas `1.7.5a … 1.7.5s` en una sola **v1.7.5 oficial** en `CHANGELOG.md`, `CHANGELOG_PUBLIC.md` e `historial_versiones.md`.
- [x] Badge del README y `package.json` → `1.7.5`; `MISE_VERSION` y cabeceras → `1.7.5` (la prueba `version.test.js` lo exige).
- [x] *(1.7.6j)* **🔐 Contraseña de administrador**: ya no está en el código ni en la documentación; solo su huella SHA-256 en `ADMIN_PASSWORD_HASH`, definida por el dueño desde el menú (🔐 Cambiar contraseña de administrador). Sin contraseña, lo destructivo queda bloqueado. La anterior quedó en el historial de git: ya no sirve.
- [x] **Git**: fusionar `feat/v1.10.0-altair` → `master` *(29/sep, tag `v1.7.5`)* (nombre heredado de la numeración vieja) y abrir `feat/v1.7.6-altair`.
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
- [~] **Un solo escritor de PEDIDO DIARIO** *(1.7.6b tienda unificada; 1.7.6k: el escritor remoto de Bodega solo actúa con altas/bajas —cuando las filas se recorren— y respeta el esquema de cada tienda. Quitarlo del todo exige que las filas del pedido no dependan del número de fila de `_SYNC`, p. ej. Developer Metadata o búsqueda por nombre: Fase 4)*
- [x] *(1.7.6j)* **Herramientas de desarrollo fuera de PROD**: `bdg/MiseDevTools.js` y `tienda/MiseDevTools.js` (solo DEV; menús tras guarda `typeof`); la reconciliación de un solo uso del 7/sep se eliminó.
- [x] *(1.7.6j)* **Código muerto**: 15 funciones fuera (con parser); `limpieza.test.js` impide que vuelva a acumularse.
- [x] *(1.7.6j)* **Logs**: `_log` y `registrarLog` eliminados; todo usa `MiseLogger`.
- [x] *(1.7.6k)* **Columnas ocultas muertas** — esquema 3: la J reservada se elimina en la migración nocturna; G DIFERENCIA (oculta, fórmula `H−F`) se queda por ahora: no se auditó si algo la lee; quitarla sería un esquema 4. Estructura detectada por encabezado.

---

## Fase 2.5 — Blindaje y UX de Bodega (pedido 28/sep)
- [x] *(1.7.6m)* **Revisar los HTML y modales**: inventario, `esc()` en los diálogos, `MiseReconciler` muerto fuera. Criterio de Ibrahim (29/sep): *keep it simple*, lo de un solo uso se retira.
- [x] *(1.7.6n)* **Traspaso desde la tienda**: retirado; traspasos solo desde Bodega.
- [x] *(1.7.6p)* **Traspasos desde el celular**: modo en `📥 Registrar entradas` (A2).
- [x] *(1.7.6p)* **Motor de conversión** pedido → bodega completo: vista en unidad de pedido, regla única (factor solo con unidad de pedido), factores visibles en el Catálogo (solo administrador).
- [x] *(1.7.6o)* **MAESTRO más amigable** → `📋 Catálogo` híbrido (hoja + Powerhouse), etiquetas claras, validaciones que rechazan, solo ACTIVO + MÍN/MÁX editables; pestañas por tarea en todo Bodega.
- [x] **Blindaje por capas** *(1.7.6c)*: instalables como dueño, hojas técnicas y Entradas protegidas, Kardex sin F:G ni G4 editables, `🔐 Auditoría de permisos`.
- [x] **Kardex simplificado** *(1.7.6d)*: visibles solo PRODUCTO, UNIDAD, SALDO ANTERIOR y las columnas de los días.
- [x] **Hoja `🏠 INICIO` en Bodega** *(hecha en 1.7.6d, retirada en 1.7.6e; sus accesos y estado viven desde 1.7.6h en la página de estado)*: accesos y acciones con casillas (funcionan en celular) y estado del sistema en la propia hoja.
- [ ] **Manual visual/tutorial** por rol, con qué funciona sin internet (lo arma Ibrahim; apoyo con página compartible).

## Fase 2.6 — Auditorías pendientes
- [ ] **Pruebas: aislar el emulador por suite** — algunas suites reemplazan métodos en el prototipo compartido (`setFormulas`, antes `setName`) y contaminan a las siguientes. Crear prototipos por contexto.
- [x] *(1.7.6l)* **`MiseSmartSync.reconciliarSemanaCompleta`**: auditada. No duplicaba (heredó la 1.7.6f), pero era **destructiva** (pedido de hoy como si fuera del lunes, vaciado en plena operación), usaba la semana de Andares para ambas y tardaba ~5 min. Ahora: días pasados, solo registros, por bodega. Además: guarda de semana en el descuento y "descontar ayer" corregido.
- [x] *(29/sep)* Skill `mise-gas-ops` actualizada con las trampas nuevas (`setFormulas` → `#NAME?`, protecciones vs activadores simples, huella del catálogo, DevTools, webapp versionada).

> Lo que depende de dejar pasar el tiempo (validación en operación real) vive en `documentacion/checklist_observacion.md`, separado de lo que se itera.

## Fase 3 — Arquitectura por eventos · Nivel 2 (1.7.6e–f)

Objetivo: **nadie escribe en el libro de otro**. Elimina el problema de permisos, el escritor remoto duplicado y la mayor parte de los ~30 s del Powerhouse.

- [x] *(1.7.6i, rediseñado)* **Bodega publica** → sin hoja `_META`: el catálogo ya viaja por el `IMPORTRANGE` de `_SYNC`; tienda y Bodega calculan la misma **huella** (producto · activo · picking).
- [x] *(1.7.6i)* **Tiendas se suscriben** *(decisión 29/sep: sin activador de 10 min; se revisa en `onOpen` instalable, reset 00:00 y, si hace falta, un activador cada hora)*: `_sincronizarSiCambioCatalogo()`: lee `_META` de Bodega; si cambió, se reordena y oculta inactivos localmente; no corre si alguien editó en los últimos 60 s.
- [x] *(1.7.6g)* **Latido** *(por eventos, sin activador propio: reset 00:00, respaldo 04:00, `onOpen` y `onEdit` instalables con máximo 1 escritura cada 10 min)*: cada tienda escribe `_ESTADO` (versión de código, esquema, último reset, última versión de catálogo aplicada, activadores).
- [x] *(1.7.6g resumen · 1.7.6h página)* **🩺 Página de estado (webapp `doGet` de Bodega, tipo Downdetector; solo Ibrahim al inicio)**: semáforo por componente (libros, cierre 23:00, reset 00:00, respaldo 04:00, `_SYNC`, semana de Kardex), historial de noches con tiempos por fase, incidentes del `🗒 LOG` (7 días), minutos de activadores consumidos, y lo que era 🏠 INICIO (accesos, versiones, próximas ejecuciones, saldos bajo mínimo). Lee un resumen en Bodega (no abre tiendas por visita) y lo expone como JSON para `mise-web`.
- [~] *(1.7.6k: el push solo refresca el enlace si no cambiaron posiciones; falta medir Powerhouse y cierre en la página de estado)* **El push remoto se reduce** a refrescar el enlace y el Powerhouse guarda solo el catálogo (objetivo: **< 5 s**).
- [~] *(1.7.6f: ledger en memoria, Kardex en bloque, log por cola, tiempos por fase y fix de doble descuento; falta medir en PROD y atacar la fase más lenta)* **`MiseSmartSync.ejecutarDescuento` tardó 114 s** en PROD (29/sep): perfilar por fase (abrir tiendas, leer Surtido/PEDIDO, escribir Kardex/LOG remoto) y bajarlo; parte se va con eventos (menos lecturas remotas).
- [ ] Cuota: ~4 min/día de los 90 min diarios de Google (medir tras una semana).

---

## Fase 4 — Roadmap (fuera de la 1.7.6)

- **Mise Móvil (Web App `doGet`)** — incluir la portada tipo INICIO (accesos, acciones, estado del sistema) que se probó en 1.7.6d: teclado numérico real (`inputmode="decimal"`), botones grandes, sin problemas de permisos ni de varias cuentas; empezar por 📥 Entradas o Surtido Rápido para que lo pruebe el gerente.
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
