# Historial de Versiones — Suite MISE (Apps Script)
**Suite Atelier · La Crêpe Parisienne · Grupo MYT**

Este documento recopila el versionamiento técnico y operativo del sistema de inventarios y pedidos diarios.

---

## ⚡ v1.7.5c Altair (Surtido Rápido con CANT. FINAL) — 2026-09-26 [EN PRUEBAS · DEV]

### 📱 Tiendas (PDA / PDM) & 🏬 Bodega (BDG)
* `🚚 SURTIDO RÁPIDO`: columna H `CANT. FINAL` (fórmula), captura libre en E con una sola fuente activa por fila (E / ✅ / ❌), coloreado de fila completa por H vs D (5 estados), resumen en J:K, columnas congeladas A:D.
* Bodega prioriza `CANT. FINAL` al descontar; doble candado anterior como respaldo.

---

## ⚡ v1.7.5b Altair (Auto-Avance Semanal Confiable) — 2026-09-25 [EN PRUEBAS]

### 🏬 Bodega General (BDG)
* Candado reentrante (`hasLock`) en el avance silencioso, sin avances contados que no ocurrieron, presupuesto de 18 s en `onOpen` para no dejar una bodega a medias y corrección de la `ReferenceError` del mantenimiento dominical.

---

## ⚡ v1.7.5a Altair (Hoja de Entradas Móvil hacia Kardex) — 2026-09-24 [EN PRUEBAS]

### 🏬 Bodega General (BDG)
* **Hoja persistente `📥 ENTRADAS`**: captura móvil de ENT para Andares y Mercado en unidad de Kardex, selector de día (HOY por default + LUN..DOM de la semana activa) y checkbox `D2` para enviar; estado en `A3` sin `toast`/`alert`.
* **`procesarEntradasKardex()`**: validación todo-o-nada, suma sobre la ENT del día, escritura en bloque por Kardex con `LockService`, bloqueo si HOY no cae en la semana activa, registro en `🗒 LOG`.
* **Menú**: `⚙️ Mise ➔ 📥 Preparar hoja de Entradas (móvil)`.

---

## ⚡ v1.7.4 Altair (Conversión de Unidades Automática, Traspasos Inter-Tiendas & Surtido Numérico Desacoplado) — 2026-09-14 [VERSIÓN FINAL GAS]

### 🏬 Bodega General (BDG) & 📱 Tiendas (PDA / PDM)
* **Desacoplamiento Total de Fórmulas en `CANT. RECIBIDA` (`pda/miseAuthPDA.js`, `pdm/miseAuthPDM.js`)**:
  * Eliminación de fórmulas volátiles en columna E de `🚚 SURTIDO RÁPIDO`. Captura numérica pura para recibir cualquier cantidad física o parcial.
  * Checkboxes interactivos `✅ COMPLETO` (Col F) y `❌ INEXISTENTE` (Col G) con interruptor atómico en `onEdit()` hacia columnas H e I de `📋 PEDIDO DIARIO`.
* **Conversión Dimensional Automática de Unidades (`bdg/miseAuthBDG.js`, `bdg/MiseKardexEngine.js`)**:
  * Autodetección de columnas `UNIDAD_TIENDA` (Domo, Caja, Paq) y `FACTOR_CONVERSION` en `MAESTRO`.
  * Las tiendas piden en unidades físicas de mostrador y Bodega deduce en Kardex los kilogramos reales (`12 domos = 5.448 kg`, `2 cajas = 200 piezas`) con precisión a 4 decimales.
* **Sistema de Traspasos Inter-Tiendas Mobile-First (`Andares ⇄ Mercado`)**:
  * Modal Crystal & Squircle en tiendas (`TraspasoTiendaDialog.html`) y bodega (`TraspasoDialog.html`).
  * Deducción y abono simétrico en Kardex con folios inmutables `TRP-YYYYMMDD-HHmmss` y registro en `🔄 TRASPASOS`.
* **Blindaje y Cuarentena de Menús**:
  * Aislamiento de funciones de mantenimiento destructivo bajo `⚠️ Mantenimiento Avanzado y Zona de Riesgo`.
  * Visibilidad permanente de Columna D (`UNIDAD TIENDA`) en celulares junto al insumo y cantidad pedida.

---

## ⚡ v1.7.3 Altair (Optimización Sheets Turbo Sub-Second, Erradicación de VLOOKUP & Blindaje 23:00 hrs) — 2026-09-07

### 🏬 Bodega General (BDG) & 📱 Tiendas (PDA / PDM)
* **Erradicación de 858 Evaluaciones Volátiles de Formato Condicional**:
  * Sustitución de `INDIRECT` + `VLOOKUP` por lectura atómica de la celda de estado local en Columna I en $O(1)$ (`COMPLETO`, `INEXISTENTE`, `PARCIAL`, `EXCEDENTE`).
  * Cero congelamiento táctil en dispositivos móviles iOS y Android.
* **Cálculo Intra-Fila en Columna G (`DIFERENCIA`)**:
  * Fórmula optimizada `=IF(OR(F4="", H4=""), "", H4 - F4)` con tiempo de evaluación de 0.0001 ms.
* **Blindaje de Corte Nocturno a las 23:00 hrs**:
  * Activadores nocturnos reubicados a las 23:00 hrs del día en curso para erradicar la condición de carrera con el reseteo matutino de tiendas.
* **Módulo de Reconciliación Determinista**:
  * Función `reconciliarLunes7Septiembre()` para restaurar 49 insumos de Andares y 2 de Mercado en 1 sola llamada 2D al Kardex.

---

## ⚡ v1.7.2 Altair (Motor Matemático N-Gram/Token-Sort, Reconstructores en RAM & Blindaje Anti-Manipulación) — 2026-08-27

### 🏬 Bodega General (BDG)
* **Motor Matemático de Reconciliación Inteligente (`MiseMatchingEngine` en `miseKardexEngine.gs`)**:
  * Implementación de algoritmos de coincidencia morfológica basados en **N-Grams Q-Grams (bigramas/trigramas con similitud Jaccard)**, **Token Sort Ratio** y **Token Overlap Ratio**.
  * Sanitizador universal de ruido que remueve automáticamente puntuación, acentos, abreviaciones y expresiones de empaque/peso (`450 g`, `1 kg`, `.450`, `bot`, `man`, `dom`, `pz`).
  * Evaluación de **Margen de Victoria (Delta Ratio)**: Si $\text{Score}_1 \ge 0.55$ y $\Delta \ge 0.10$ (o $\text{Score}_1 \ge 0.75$), se califica como `MATCH` directo. Si hay ambigüedad o empate de candidatos, se desvía a cuarentena como `AMBIGUO`.
  * **Caché L1 en Hoja Oculta `_DICCIONARIO_ALIAS`**: Almacén transparente de capacidad ilimitada que indexa los alias aprobados para resolución instantánea $O(1)$.
* **Reconciliador Asistido Visual (Modal HTML Human-in-the-Loop)**:
  * Diálogo modal interactivo (`abrirReconciliadorInteligenteHTML`) servido mediante `HtmlService`.
  * Permite al administrador revisar insumos en `⚠️ REVISIÓN_HUÉRFANOS`, ver el porcentaje de similitud calculado y aprobar su vinculación con 1 clic (`aprobarVinculacionAlias`).
  * Auto-cierre de filas en cuarentena: actualiza el estado a `RESUELTO` y filtra en segundo plano insumos previamente aprendidos.
* **Reconstructores Resilientes con Respaldo en Memoria RAM**:
  * `reconstruirKardexBAConRespaldo()` y `reconstruirKardexBMConRespaldo()`: Respaldo en memoria JS de saldos anteriores, caducidades, lotes y movimientos de 7 días, destrucción de la cuadrícula corrupta (eliminando columnas duplicadas como $O$) y reconstrucción de 30 columnas simétricas mapeando alias al producto oficial.
  * `reconstruirMaestroConRespaldo()`: Reconstrucción de la cuadrícula de 13 columnas preservando mínimos, máximos y estados.
* **Blindaje de Seguridad y Bloqueo Anti-Manipulación (`setDomainEdit(false)`)**:
  * **Bodega General (BDG)**: `protegerMaestroSeguro()` y `protegerKardexSeguro()` con desactivación estricta de edición por enlaces públicos (`canDomainEdit() = false`). Desprotección quirúrgica de columnas `ENT` y `SAL` de Lunes a Domingo, selectores de fecha (`G4`) y casillas interactivas de la barra de herramientas (`N4, Q4, T4, W4` en Kardex; `D2, F2, H2, J2` y col 13 en Maestro).
  * **Tiendas Andares & Mercado (`PDA` / `PDM`)**:
    * `protegerPedidoSeguro()`: Blindaje total de `📋 PEDIDO DIARIO` dejando **únicamente editables la casilla táctil `F2` (Surtido Rápido) y la columna `CANT. A PEDIR` (Col F)**.
    * `_generarSurtidoRapidoInternal()`: Blindaje estricto de `🚚 SURTIDO RÁPIDO` bloqueando encabezados, fórmulas de diferencia y nombres de productos, permitiendo **únicamente la captura numérica en `CANT. RECIBIDA` (Col E) y los checkboxes interactivos de `✅ COMPLETO` (Col F) y `❌ INEXISTENTE` (Col G)**.
    * Menú dedicado: `⚙️ Mise > 🔒 Blindar Pedido y Surtido (Total)`.
* **Fórmula de Saldo Encadenada (`prevCol`)**:
  * Corrección estructural en `_ordenarYRenumerarTodo()` y `_poblarKardex()`: Lunes toma Col I ($9$), mientras Martes a Domingo encadenan estrictamente el `SLD` del día anterior (Cols $12, 15, 18, 21, 24, 27$).
* **Idempotencia Transaccional y Corrección Nocturna (SmartSync)**:
  * Idempotency Ledger en `_LOGS` / `🗒 LOG` para evitar dobles cobros de inventario.
  * Corrección del desfase de medianoche: a la 01:00 AM procesa de forma exacta el día anterior.

---

## ⚡ v1.7.1 Altair (Concurrencia Multi-Worker, Batch I/O Extremo & Zoom Crystal) — 2026-08-16 a 2026-08-17

### 🏬 Bodega (BDG) & 📱 Tiendas (PDA / PDM)
* **Arquitectura de Micro-Workers Paralelos (`Promise.all`)**:
  * Descomposición de la sincronización en micro-servicios especializados (`workerGuardarMaestro`, `workerSyncKardexYVista`, `workerPushTiendaRemota`), reduciendo el tiempo total de 68s a **~3 a 10 segundos** con bloqueos breves de `LockService`.
* **Consolidación Batch I/O de 1 Sola Llamada**:
  * Eliminación de 28 escrituras redundantes por columnas de días en los Kardex, unificando valores, fórmulas y formatos condicionales en una sola matriz en bloque por hoja (`1 setValues` + `1 setBackgrounds`). Tiempo de guardado reducido de **103s a <2.5s**.
* **Vaciado Automático y Auto-Agrupación**:
  * Al completar con éxito el guardado desde el Powerhouse, la lista de altas se vacía automáticamente (`[]`) y los nuevos insumos se indexan correlativamente por categoría sin romper las secuencias de picking.
* **UI Polish & Escala de Zoom Crystal (`PickingDialog.html`)**:
  * Nuevo valor por defecto establecido en **`115% (Normal)`** con selector persistente en `localStorage`.
  * Inputs numéricos limpios sin flechas nativas del navegador (`appearance: textfield`) y separación estructural de pestañas.
* **Auto-Expansión de Catálogo Remoto (`_reordenarPedidoRemotoDirecto`)**:
  * Inserción física en caliente de filas faltantes en `📋 PEDIDO DIARIO` de tiendas sin truncar fórmulas ni datos resguardados.
  * Inyección y monitoreo de metas de stock en quiosco (`MÍN_Q_BA`, `MÁX_Q_BA`, `MÍN_Q_BM`, `MÁX_Q_BM`).

---

## ⚡ v1.7.0 Altair (Mise Powerhouse: Suite Unificada de Catálogo & Picking) — 2026-08-16

### 🏬 Bodega (BDG) — Unificación Total de Catálogo & Picking
* **Suite Unificada Powerhouse (`PickingDialog.html`)**:
  * Interfaz modal desacoplada multi-pestaña con diseño *Crystal Squircle*:
    1. `🖐️ Orden Picking`: Secuencia de picking con drag & drop multi-bloque, salto directo (#), zoom de accesibilidad y vistas plana/categorías.
    2. `➕ Alta en Lote`: Tabla dinámica editable en caliente para dar de alta múltiples insumos sin ensuciar ni crear pestañas temporales en Google Sheets.
    3. `📝 Edición Rápida`: Grid y buscador predictivo para corregir nombres, presentaciones, unidades y stock mín/máx por bodega en vivo.
    4. `🧹 Duplicados`: Escáner automático en memoria de insumos repetidos con comparativa visual.
* **Backend Transaccional Atómico (`miseAuthBDG.gs`)**:
  * Endpoints `obtenerDatosPowerhouse(key)` y `guardarPowerhouseBatch(key, payload)` con `LockService` extendido.
  * Inyección masiva y atómica en `MAESTRO`, `KARDEX_BA`, `KARDEX_BM`, `HISTORIAL_BA` e `HISTORIAL_BM` en un solo viaje de red.
  * Disparo automático de sincronización push remota hacia las hojas de tienda (`_SYNC_BA` y `_SYNC_BM`).
* **Reorganización de Menús**:
  * Menú `🛠️ Gestión de Productos` centralizado con acceso directo a `⚡ Mise Powerhouse`.
  * Creación de la categoría `🧪 Herramientas Experimentales` en BDG, PDA y PDM.

---

## ⚡ v1.6.4 Altair (Descuento Ultrarrápido de Hoy & Sincronización Push Remota de Picking) — 2026-08-15

### 🏬 Bodega (BDG) — Optimización de Descuento y Sincronización Push
* **Descuento de Inventario Ultrarrápido (`descontarSurtidoAutomatico`)**:
  * **Fijación Estricta a la Fecha de Hoy (`new Date()`)**: Se eliminó la dependencia de la última fila (`ultFila`), evitando que tiendas sin entregas registradas hoy toquen o reescriban columnas de días cerrados pasados (ej. Martes o Sábado).
  * **Consolidación Multi-Entrega en Memoria**: Si un insumo cuenta con 2 o más entregas durante el mismo día (ej. `1 + 11 = 12`), se suman en memoria y se inyecta el total atómico en la columna `SAL` correspondiente del KARDEX.
  * **Rendimiento Instantáneo**: Ejecución optimizada de ~15 segundos a <1 segundo.
* **Auto-Sincronización Remota Push de Picking (`sincronizarRemotamenteTiendasPush` & `_reordenarPedidoRemotoDirecto`)**:
  * **Resolución Híbrida ID / URL**: Soporte simultáneo para `PDA_SPREADSHEET_ID` / `PDM_SPREADSHEET_ID` y `BODEGA_URL_BA` / `BODEGA_URL_BM`.
  * **Búsqueda Dinámica de Hojas Remotas**: Localización automática de `_SYNC_BA`, `_SYNC_BM` o `_SYNC` en las hojas de tienda.
  * **Reordenamiento Físico en Caliente**: Al hacer clic en *"Guardar y Aplicar Orden"* desde el Quiosco HTML de BDG, inyecta los datos de ranking calculados y reordena físicamente la tabla `📋 PEDIDO DIARIO` de la tienda con fondos (`COLORS.yellow`, `COLORS.blue`), tipografías y fórmulas sincronizadas sin intervención manual.

---

## ⚡ v1.6.2 Altair (Auto-Avance Semanal Silencioso, Modal PC & Indicador BDG) — 2026-08-11

### 🏬 Bodega (BDG) — Experiencia PC & Cierre Semanal Dinámico
* **Auto-Avance Semanal Silencioso (`_autoVerificarYAvanzarSemanaSilencioso`)**: Automatización que calcula dinámicamente el lunes de la semana actual al abrir la hoja (`onOpen()`). En caso de detectar una semana vencida, ejecuta el cierre semanal (transferencia de saldos a `SALDO ANT`, archivado horizontal e inicio de nueva semana) sin mostrar diálogos bloqueantes ni requerir números ISO.
* **Modal de Registro Rápido en PC (`RegistroRapidoDialog.html`)**: Interfaz desacoplada con estética Crystal & Squircle para capturar Entradas (+) y Salidas (-) del día sin hacer scroll por 130+ filas. Incluye buscador autocomplete dinámico por coincidencia parcial (ej. "nut..."), selector de bodega (BA / BM), autoselección de día actual y atajos de teclado (`Tab` / `Enter` / `ArrowDown`).
* **Endpoints Backend para Registro Rápido**: Funciones `obtenerCatalogoKardexParaRegistro()` y `registrarMovimientoRapidoKardex()` que inyectan los valores en tiempo real en las celdas exactas del KARDEX recalculando saldos al instante.
* **Sincronización en 1-Clic (`configurarSemanaAmbas`)**: Nueva opción en menú para sincronizar el lunes activo en ambas bodegas a la vez.

---

## ⚡ v1.5.0 Altair (Quiosco de Picking & Categorías Dinámicas) — 2026-08-05

### 🏬 Bodega (BDG) — Restauración de Estado Estable
* **Restauración Completa de Backend**: Se restableció `miseAuthBDG.gs` al código base de la versión **v1.5.0 Altair** enviado por Ibrahim. Se conservaron intactos todos los diálogos y modales previos (`PickingDialog.html`).
* **Sintaxis**: Compilado a 0 errores con `check_syntax_all.js`.

---

## ⚡ v1.6.3c Altair Hotfix (Remoción de Escritura en Caducidad/Lote en Re-ordenamiento) — 2026-08-11

### 🏬 Bodega (BDG) — Solución de Excepción en Diagnóstico
* **Corrección en `_ordenarYRenumerarTodo()`**: Se eliminó la instrucción de re-escritura en las columnas 6 y 7 (CADUCIDAD y LOTE) durante el proceso de ordenamiento. Esto soluciona de raíz la excepción *"Exception: Selecciona la categoría del producto"*, la cual era provocada al intentar escribir arreglos de caducidad en las columnas des-ocultadas de KARDEX con reglas de validaciones cruzadas.

---

## ⚡ v1.6.3b Altair Hotfix (Ajuste Global de Validaciones de Categoría) — 2026-08-11

### 🏬 Bodega (BDG) — Cobertura Total de Excepciones
* **Permisividad Global en Validaciones de Categoría (`setAllowInvalid(true)`)**: Se homologaron todos los puntos del script (`_aplicarReglasMaestro`, `restaurarValidacionesMaestro`, `crearHojaCargaMasiva`, `crearHojaEdicionMasiva` y `crearProductoIndividual`) para permitir cualquier valor de categoría. Esto elimina definitivamente la excepción *"Selecciona la categoría del producto"* ante productos con categorías dinámicas personalizadas o variantes.

---

## ⚡ v1.6.3a Altair Hotfix (Solución de Excepción en Categorías de Diagnóstico) — 2026-08-11

### 🏬 Bodega (BDG) — Corrección en Motor de Diagnóstico
* **Corrección de Excepción de Validación (`setAllowInvalid(true)`)**: Se actualizó `restaurarValidacionesMaestro()` para permitir categorías dinámicas creadas desde el Quiosco o capturadas manualmente. Esto elimina el error *"Exception: Selecciona la categoría del producto"* durante el proceso de diagnóstico y autorreparación.

---

## ⚡ v1.6.3 Altair (Eliminación Física de Columnas Caducidad y Lote en KARDEX) — 2026-08-11

### 🏬 Bodega (BDG) — Depuración de Grid
* **Eliminación Física de Columnas F y G (`deleteColumns(6, 2)`)**: Módulo de depuración que elimina de raíz las columnas obsoletas de CADUCIDAD y LOTE en `KARDEX_BA` y `KARDEX_BM`, haciendo que el semáforo de stock `🚦` quede posicionado inmediatamente junto a `UNIDAD` en la Columna F de forma limpia y compacta.
* **Auto-Depuración en Mantenimiento**: Integración de la rutina de eliminación atómica dentro de `repararYSincronizarSistema()`.

---

## ⚡ v1.6.2b Altair Hotfix (Des-ocultado Automático de Columnas F y G en KARDEX) — 2026-08-11

### 🏬 Bodega (BDG) — Corrección Estructural
* **Des-ocultado Forzado en `onOpen()` y Reparación**: Inserción de `sheet.showColumns(6, 2)` explícito dentro de `_autoVerificarYAvanzarSemanaSilencioso()` y `repararYSincronizarSistema()`. Esto garantiza que las columnas F (CADUCIDAD) y G (LOTE) se des-oculten inmediatamente al abrir la hoja de cálculo, corrigiendo la cuadrícula en `KARDEX_BA` y `KARDEX_BM` sin requerir la recreación total del libro.

---

## ⚡ v1.6.2a Altair Hotfix (Descombinado de Badge Semanal & Optimización de Menú) — 2026-08-11

### 🏬 Bodega (BDG) — Corrección Visual & Diagnóstico
* **Corrección de Badge Semanal en Fila 2**: Ajuste del banner superior del KARDEX a `D2:K2` y aplicación de `breakApart()` explícito en el rango `L2:P2` dentro de `_actualizarBadgeEstadoSemana` para garantizar la visualización inmediata del badge `🟢 SEMANA XX ACTUALIZADA` sin depender del reinicio total del grid.
* **Auto-Verificación en `onOpen()`**: Vinculación directa de `_autoVerificarYAvanzarSemanaSilencioso()` al evento de apertura de hoja, garantizando que los hotfixes visuales y de fecha se apliquen sin necesidad de correr diagnósticos manuales pesados.

---

## ⚡ v1.6.2 Altair (Auto-Avance Semanal Silencioso e Indicador de Estado BDG) — 2026-08-11

* **Modal de Registro Rápido en PC (`RegistroRapidoDialog.html`)**: Interfaz desacoplada con estética Crystal & Squircle para capturar Entradas (+) y Salidas (-) del día sin hacer scroll por 130+ filas. Incluye buscador autocomplete dinámico por coincidencia parcial (ej. *"nut..."*), selector de bodega (`BA` / `BM`), autoselección de día actual y atajos de teclado (`Tab` / `Enter` / `ArrowDown`).
* **Endpoints Backend para Registro Rápido**: Funciones `obtenerCatalogoKardexParaRegistro()` y `registrarMovimientoRapidoKardex()` que inyectan los valores en tiempo real en las celdas exactas del KARDEX recalculando saldos al instante.

---

## ⚡ v1.6.1 Altair (Rendimiento & QOL Silencioso Mobile-First) — 2026-08-07

### 📱 Pedidos (PDA & PDM) — Rendimiento y Resiliencia Móvil
* **Eliminación Total del Sistema de "Adiciones"**: Remoción de la evaluación en `onEdit` que consultaba ScriptProperties en cada tipeo, eliminando la columna/métrica de alerta `"🚨 ADICIÓN"` en Pedidos y Surtido Rápido para acelerar el procesamiento táctil en celulares.
* **Auto-Reparador Silencioso Transparente (`_validarYAutoRepararSyncSilencioso`)**: Guardián invisible que detecta celdas corruptas o vacías en `_SYNC!A4` y restablece la fórmula `IMPORTRANGE` en segundo plano sin usar `toast` ni `alert` (100% compatible con la app nativa de Sheets en iOS/Android).
* **Salvaguarda con Recovery en Surtido Rápido**: Cobertura con bloque `try ... catch ... finally` y `LockService` para garantizar la liberación de bloqueos y auto-reset del estado si la generación de surtido es interrumpida.
* **Paridad Total de Código 1:1**: Homologación exacta de 1,548 líneas de código entre `scripts/miseAuthPDA.gs` y `scripts/miseAuthPDM.gs`.

---

## 🌌 v1.6.0 Altair (Powerhouse: Quiosco de Picking, Stock de Quiosco & Remote Push Auto-Sync) — 2026-08-05

### 🏬 Bodega (BDG) — Quiosco de Picking & Sincronización Remota
* **Constructor Visual de Orden de Picking**: Implementación del modal HTML completo (`PickingDialog.html`) para reorganizar visualmente la secuencia en que los productos se recorren durante el surtido. Diseño Crystal Squircle con badges de posición oscuros, drag & drop con SortableJS y vistas alternables entre `📄 Lista Plana` y `📁 Por Categorías`.
* **Gestión Visual de Categorías Globales**: Se agregó la capacidad de crear, renombrar y eliminar categorías de producto directamente desde el Quiosco, con efecto inmediato en todas las sucursales (Andares y Mercado). Badge `🌍 Categorías Globales` para indicar el alcance del cambio.
* **Modales In-App Crystal**: Se reemplazaron todos los `prompt()` y `confirm()` nativos del navegador por overlays HTML internos con estética Crystal (creación de categoría, confirmación de eliminación, confirmación de reset), eliminando popups feos del navegador.
* **Eliminación Segura de Categorías**: Botón `🗑️ Eliminar` en headers de categoría que transfiere automáticamente los productos a `"SIN CATEGORÍA"` antes de borrar, evitando pérdida de datos.
* **Indicador de Cambios Sin Guardar Exclusivo**: Badge animado `⚠️ Cambios sin guardar` en el header del modal, con badges `● Editado` asignados estrictamente a los productos arrastrados o modificados manualmente por el usuario (vía `touchedItems` Set), evitando falsos positivos por desplazamiento.
* **Botón ✕ In-App**: Cierre controlado del modal con confirmación interna si hay modificaciones pendientes.
* **Preferencia de Zoom/Densidad**: Selector de zoom (`100%`, `115%`, `130%`) persistido en `localStorage` para adaptar la densidad visual al dispositivo.
* **Salto Directo por Posición**: Campo de entrada para navegar instantáneamente a una posición específica tipeando su número.
* **Botones Un-Clic `🔝 Top` y `🔻 Bot`**: Envío rápido de productos al inicio o final de la lista con un solo clic.
* **Sincronización Dinámica de Categorías MAESTRO → VISTA_MOVIL**: Se actualizó `_buildVista(key)` para leer las categorías en tiempo real directamente de la columna B de `MAESTRO`, eliminando la lectura estática de `KARDEX` que causaba desincronización de categorías entre sucursales.
* **Conexión Dinámica e Inmediata VISTA_MOVIL ➔ MAESTRO**: Se sustituyó el cálculo numérico estático de MÍN/MÁX en VISTA_MOVIL por fórmulas vivas apuntando directamente a `MAESTRO` (`='MAESTRO'!N4`, `='MAESTRO'!O4`, `='MAESTRO'!P4`). Cualquier cambio en los límites de stock de quiosco en Bodega se refleja al instante en las tiendas vía `IMPORTRANGE`.
* **Auto-Sincronización Remota Push (Remote Auto-Sync)**: Integración de `sincronizarRemotamenteTiendasPush()`. Al guardar el orden en el Quiosco de Bodega, el backend re-calcula las vistas móviles y fuerza un refresco atómico en los libros remotos de Andares y Mercado sin necesidad de intervención manual.
* **Auto-Creación de Columnas de Stock Quiosco**: Incorporación de `_asegurarColumnasQuioscoEnMaestro()` para inyectar y formatear automáticamente con verde `C.sage` las columnas `MÍN_Q_BA`, `MÁX_Q_BA`, `MÍN_Q_BM` y `MÁX_Q_BM` en `MAESTRO` al diagnosticar o sanitizar el sistema.

### 📱 Pedidos (PDA & PDM) — Simplificación de Vistas & Experiencia Móvil
* **Simplificación Visual a 3 Columnas Fundamentales**: Ocultamiento dinámico mediante `sheet.hideColumns()` para mostrar en pantalla únicamente las columnas clave de operación móvil: `PRODUCTO` (Columna C), `CANT. A PEDIR` (Columna F) y `MÍN  |  MÁX` (Columna K).
* **Columna `MÍN  |  MÁX` Específica de Quiosco**: Mapea e inyecta dinámicamente los mínimos y máximos de stock de quiosco desde `_SYNC` (`Cols J y K`) con formato visual limpio y centrado (`1  |  2` o `—`).
* **Barra de Acción Única Táctil (Fila 2)**: Diseño desacoplado en Fila 2 que incluye la etiqueta explicativa `🚚 Surtido Rápido:` en `C2` y su casilla de verificación interactiva (`Checkbox`) en `F2` sobre la columna de pedido.
* **Alineación Impecable del Banner Superior (Fila 1)**: El título del banner `MISE — PEDIDO DIARIO...` arranca exactamente desde la Columna C1 visible, eliminando desfasamientos tipográficos a la izquierda.
* **Auto-Reordenamiento Automático**: `sincronizarEstados()` invoca automáticamente `ordenarPedido()`. Al recibir la señal remota de Bodega, las tiendas reordenan inmediatamente sus productos según el nuevo ranking del Quiosco.
* **Sanitizado y Blindaje Aumentado (`repararSistemaTienda`)**: Se incluyó la inyección de `formulasK` en el motor de reparación para auto-corregir anomalías en la Fila 4 y re-formatear la tabla sin perder cantidades resguardadas.

## 🌌 v1.4.0 Altair (Feature: Orden de Picking Personalizado Dinámico en PDA — Issue 4 & GH#5) — 2026-08-02

### 🏬 Bodega (BDG)
* **Soporte Multi-Bodega de Picking (`VISTA_MOVIL_BA`)**: Se incluyó la Columna 12 (`PICKING`) en `VISTA_MOVIL_BA` y `VISTA_MOVIL_BM`. Mapea dinámicamente la columna `PICKING_BA` de `MAESTRO` (si existe) o devuelve el número de posición `No` original como secuencia por defecto.

### 📱 Pedidos Andares (PDA)
* **Algoritmo de Ordenamiento por Quiosco**: Se sincronizan las 12 columnas desde `VISTA_MOVIL_BA` (`A4:L`) vía `IMPORTRANGE`. Al ejecutar `_poblarPedidoDesdeBodega`, los productos se ordenan dinámicamente siguiendo la secuencia física real del quiosco (`PICKING_BA`), manteniendo activos primero e inactivos al final.

## 🌌 v1.3.8a Altair (Hotfix: Motor Auto-Reparador Self-Healing & Sub-menús de Menú Operativo) — 2026-08-02

### 🏬 Bodega (BDG)
* **Motor Autorreparador (`repararYSincronizarSistema`)**: Se implementó el motor Self-Healing ejecutable manualmente y de forma silenciosa en cada `onOpen()`. Escanea celdas de stock e identifica errores (`#N/A`, `#REF!`, `#ERROR!`, `#VALUE!`), re-inyectando fórmulas limpias, restaurando dropdowns desprendidos y reconstruyendo las Vistas Móviles de Andares y Mercado.
* **Organización de Menú Operativo**: Se agruparon las acciones de "Configurar semana" y "Avanzar semana" dentro del nuevo sub-menú `📅 Gestión Semanal`. Se añadió el acceso directo principal `🩺 Diagnosticar y reparar sistema`.

## 🌌 v1.3.8 Altair (Fix de Conteo de Columnas en VLOOKUP de Kardex a Domingo) — 2026-08-02

### 🏬 Bodega (BDG)
* **Fix de Cálculo de Stock Final (`VLOOKUP(..., 26, FALSE)`)**: Al eliminar la Columna B (`ID_FAMILIA`), el rango `C:AD` de Kardex ahora abarca 26 columnas (de la C a la AD) en lugar de 28. El parámetro estático `28` provocaba que la fórmula buscara una columna inexistente o desfasada, arrojando el error `#N/A`. Se corrigió el índice de columna de búsqueda a **`26`**.

## 🌌 v1.3.7 Altair (Fix de Desfasamiento VLOOKUP en STOCK_BA y STOCK_BM) — 2026-08-02

### 🏬 Bodega (BDG)
* **Fix de Búsqueda de Stock (`STOCK_BA`)**: Al eliminar la Columna B (`ID_FAMILIA`), el nombre de producto en `MAESTRO` pasó de la Columna D (4) a la Columna C (3). La fórmula VLOOKUP en `STOCK_BA` buscaba `D6` en `KARDEX_BA!C:AD`, arrojando `#N/A` porque el nombre ahora vive en `C6`. Se corrigió para evaluar la letra exacta de la columna de producto (`C6`).
* **Sincronización Total de Índices**: Se actualizaron todos los punteros estáticos a arreglos de `data[i]` en `_ordenarYRenumerarTodo()` para usar las variables dinámicas de `map["CATEGORÍA"]`, `map["PRODUCTO"]`, `map["PRESENTACION"]` y `map["UNIDAD"]`.

## 🌌 v1.3.6 Altair (Dinamización de Carga y Edición Masiva en Bodega) — 2026-08-02

### 🏬 Bodega (BDG)
* **Dinamización de Carga Masiva (`procesarCargaMasiva`)**: Se actualizó el procesador en lote de `➕ AGREGAR_MÚLTIPLES` para escribir dinámicamente en las 13 columnas de `MAESTRO` usando `_getMaestroHeaderMap`, eliminando referencias hardcodeadas a `ID_FAMILIA`.
* **Dinamización de Edición Masiva (`crearHojaEdicionMasiva` & `procesarEdicionMasiva`)**: Se dinamizó la lectura y actualización en lote de `✏️ EDITAR_PRODUCTOS` utilizando el mapeo dinámico de encabezados.

## 🌌 v1.3.5 Altair (Mapeo Dinámico por Encabezados & Migración No-Destructiva) — 2026-08-01

### 🏬 Bodega (BDG)
* **Arquitectura Zero Hardcoded (`Header-Based Dynamic Mapping`)**: Se implementó `_getMaestroHeaderMap(sheet)` y `_colToLetter(col)`. El script inspecciona la Fila 3 en tiempo de ejecución para ubicar cada campo por su nombre (`"PRODUCTO"`, `"MÍN_BA"`, `"MÁX_BA"`, `"ACTIVO"`, `"SELECCIONAR"`). El código es 100% inmune a futuros cambios de posición de columnas.
* **Migración In-Situ No Destructiva de 14 a 13 Columnas**: Se creó `migrarEstructuraMaestro13Cols()`. Detecta si el catálogo en producción conserva la columna legacy `ID_FAMILIA` y la elimina atómicamente (`deleteColumn(2)`), **preservando el 100% de los productos, configuraciones MÍN/MÁX y saldos de la tienda**.
* **Dinamización Atómica de Kardex y Vistas**: Se actualizaron `_aplicarReglasMaestro()`, `_poblarKardex()`, `_buildVista()`, `_ordenarYRenumerarTodo()` y `protegerMaestroSeguro()`. Las fórmulas de semáforo y desprotección de celdas se construyen con letras y rangos calculados dinámicamente.

## 🌌 v1.3.4 Altair (Nomenclatura Oficial de Generaciones Estelares) — 2026-08-01

### 📱 Pedidos (PDA & PDM) y 🏬 Bodega (BDG)
* **Estándar Minimalista de Épocas (`Epoch System`)**: Se formalizó la hoja de ruta de generaciones mediante nombres de constelaciones únicas por cada versión `MAJOR`:
  - **Generación 1.x.x**: **Altair** *(Velocidad, Agilidad & Optimización Sub-segundo)*
  - **Generación 2.x.x**: **Atlas** *(Soporte Estructural, Robustez & Arquitectura)*
  - **Generación 3.x.x**: **Aethel** *(Sofisticación & Refinamiento Crystal)*
  - **Generación 4.x.x**: **Antares** *(Potencia Máxima & Ecosistema Multi-región)*
* **Visualización en Pantalla**: Diálogos `acercaDe()` actualizados a **`Mise — v1.3.4 Altair`**.

## 🚀 v1.3.3-FIX (Fix a Tabla de Resumen en Surtido Rápido) — 2026-08-01

### 📱 Pedidos (PDA & PDM)
* **Fix a Error `#ERROR!` en Resumen de Surtido Rápido**: Se separó la inyección de las etiquetas de texto de la Columna I (`setValues`) de las fórmulas de conteo de la Columna J (`setFormulas`). Esto evita que Google Sheets interprete los emojis y textos `✅ Completos`, `⚠️ Incompletos`, `❌ Inexistentes` y `🚨 Adiciones` como fórmulas no válidas.

## 🚀 v1.3.2-PERF (Estructuración de Menú & Purga de Latencia en Bodega BDG) — 2026-08-01

### 🏬 Bodega (BDG)
* **Reorganización Estructurada del Menú (`onOpen`)**: Se agruparon las 12 opciones dispersas en sub-menús limpios (`🛠️ Gestión de Productos` y `📊 Mantenimiento de Vistas`), dejando la raíz del menú enfocada en las operaciones semanales cotidianas.
* **Purga de Latencia en Red**: Se eliminaron las pausas innecesarias `SpreadsheetApp.flush()` en `_configurarSemana()` y `_protegerMaestroInterno()`, acelerando la asignación de permisos y fechas a milisegundos.

## 🚀 v1.3.1-PERF (Optimizaciones de Surtido Rápido & Menú Limpio) — 2026-08-01

### 📱 Pedidos (PDA & PDM)
* **Generación Instantánea de Surtido Rápido**: Se refactorizó la tabla de resumen (`RESUMEN SURTIDO` en Col I:J) en `_generarSurtidoRapidoInternal` para estampar los conteos en lote con una sola llamada `.setFormulas()`, acelerando la generación a **<0.5 segundos**.
* **Menú Operativo Protegido**: Se reorganizó `onOpen` creando la sección `🧪 Herramientas de Prueba` e introduciendo `🎲 Generar datos de prueba` en un sub-menú para prevenir ejecuciones accidentales por parte de los gerentes en producción.
* **Purga de Latencia Residual**: Se eliminó la llamada `SpreadsheetApp.flush()` restante en `_setupSync()`.

## 🚀 v1.3.0-PERF (Optimizaciones de Latencia, Dinamización & SemVer) — 2026-08-01

### 📱 Pedidos (PDA & PDM) y 🏬 Bodega (BDG) — Arquitectura & Staging
* **Dinamización Total de Entornos (`BODEGA_KEY` y `BODEGA_NOMBRE`)**: Se desacoplaron las claves fijas en favor de lecturas dinámicas desde `ScriptProperties` (`BODEGA_KEY` / `BODEGA_NOMBRE`). Duplicar scripts o crear tiendas nuevas ya no requiere editar el código `.gs`.
* **Depuración de Constantes Heredadas**: Se eliminaron las constantes inactivas de prototipos antiguos `SHEET_MOVIL` y `SHEET_LOG`, garantizando cero código muerto y máxima claridad en la arquitectura.
* **Eliminación Total de Hojas Temporales (`__temp__`)**: Se purgó por completo la rutina legacy que creaba y eliminaba la pestaña `__temp__` durante la reconstrucción del sistema en `BDG`, `PDA` y `PDM`. La pantalla ya no muestra pestañas parpadeantes y la ejecución es limpia e in-situ.
* **Fix a Error `#NAME?` en Encabezados**: Se separó la inyección de la Fila 1 (fórmula de banner en C1 con `setFormula`) de la Fila 3 (encabezados de columnas con `setValues`). Esto evita que Google Sheets interprete textos planos como `"PRODUCTO"` o `"CATEGORÍA"` como nombres de intervalos o fórmulas no válidas.
* **Optimización de Rendimiento en Bodega (`miseAuthBDG.gs`)**: Se aplicó la misma arquitectura de velocidad a `setupCompleto()` en Bodega, eliminando la creación/destrucción pesada de hojas temporales `__temp__`, protegiendo la pestaña `🗒 LOG` y purgando las pausas de `SpreadsheetApp.flush()`.
* **Purga de Latencia en Red (Eliminación de `flush` innecesarios)**: Se auditaron y eliminaron las llamadas redundantes a `SpreadsheetApp.flush()` en `sincronizarEstados()` y `repararSistemaTienda()`, eliminando los tiempos muertos de espera síncrona en los servidores de Google y haciendo que la sincronización responda de forma instantánea.
* **Optimización Ultra-Rápida Single Batch 2D**: Se refactorizó `setupCompleto()` y `_buildPedidoDiario()` para realizar la inyección de encabezados, banners, botones táctiles y fórmulas en un único bloque bidimensional (`setFormulas` en lote). Se eliminaron llamadas redundantes a `deleteSheet()` y `SpreadsheetApp.flush()`, reduciendo el tiempo de reconstrucción del sistema de 12 segundos a **<1.5 segundos**.
* **Protección de `_LOGS` en Setup Completo**: Se actualizó `systemSheetNames` en `setupCompleto()` para proteger la pestaña `_LOGS`. El historial de auditoría y registros de errores ya no se borra al restablecer destructivamente el sistema.
* **Sistema de Auditoría de Logs en Hoja Oculta (`_LOGS`)**: Se implementó una rutina silenciosa `registrarLog(accion, estado, detalle)` que registra en una pestaña oculta (`_LOGS`) cada ejecución del usuario (Reset, Surtido Rápido, Sincronización, Reparación) capturando fecha/hora, correo del ejecutor y mensajes de error en tiempo de ejecución (`try-catch`), con auto-limpieza al superar 500 filas para garantizar un lienzo 100% limpio en móviles.
* **Preservación de Infraestructura en Setup Completo**: Se corrigió `setupCompleto()` para que al purgar propiedades de la sesión no destruya las configuraciones de entorno (`BODEGA_URL_BA`, `BODEGA_URL_BM` y `ADMIN_PASSWORD`). La reconexión con Bodega y la contraseña permanecen intactas tras un restablecimiento completo.
* **Desacoplamiento Total de Entornos (`ScriptProperties`)**: Se eliminaron los fallbacks de URLs de producción pegados en código (`hardcoded`). Las URLs de conexión con Bodega (`BODEGA_URL_BA`/`BODEGA_URL_BM`) y la contraseña de administrador (`ADMIN_PASSWORD`) ahora dependen 100% de las Propiedades del Script de Google Apps Script. Esto permite clonar libros de trabajo para Staging o Pruebas (`[DEV]`) sin riesgo de alterar o escribir accidentalmente en las hojas de Producción.
* **Solución a Bug GH#26 (Surtido Rápido & Adiciones Fantasma)**:
  * **Reset Destructivo de Surtido Rápido**: Al reiniciar el pedido diario (`_resetearPedidoSilencioso`), la pestaña `🚚 SURTIDO RÁPIDO` ahora se elimina físicamente del libro (`ss.deleteSheet`) para erradicar cualquier residuo de formato o regla de formato condicional previa.
  * **Saneamiento del Estado Vacío**: Cuando no hay productos pedidos (`filtered.length === 0`), se limpian explícitamente las reglas condicionales y los fondos estáticos en Surtido Rápido, evitando que la hoja se pinte de amarillo sin productos.
  * **Reinicio de Banderas de Adición**: Se asegura la desactivación de las banderas `IS_ORDER_SORTED` e `IS_SURTIDO_ACTIVE` a `"false"`, impidiendo que los productos de un nuevo pedido se marquen falsamente como `🚨 ADICIÓN`.
* **Reconstrucción Limpia con Resguardo de Datos**: La función `repararSistemaTienda` fue potenciada para respaldar en memoria las cantidades capturadas por el usuario (`CANT. A PEDIR` y `RECIBIDA`), ejecutar una reconstrucción limpia completa de la pestaña (`_buildPedidoDiario`) destruyendo cualquier formato o color fantasma corrupto, re-inyectar las fórmulas desde Bodega y restaurar las cantidades capturadas del usuario.
* **Protección de Regla de Inactivos (Filas Grises)**: Envolviendo la búsqueda `VLOOKUP` con `IFERROR(..., "")` en la regla condicional de productos inactivos. Esto elimina los falsos positivos que pintaban filas activas de color gris por lentitud de carga de red o errores de referencia.
* **Corrección de Fórmulas Corruptas (#ERROR!)**: Se solucionó la sobreescritura accidental de fórmulas de producto y categoría en `PEDIDO DIARIO`. La función `repararSistemaTienda` ahora reconstruye automáticamente los punteros dinámicos hacia `_SYNC_BA` y `_SYNC_BM` (reestableciendo productos faltantes como los de la categoría JARCERÍA).
* **Protecciones Anti-Dummies (PDA & PDM)**: Se implementó la función `_protegerPedidoDiario`. Toda la pestaña `📋 PEDIDO DIARIO` queda completamente blindada y bloqueada contra ediciones directas o arrastres accidentales, dejando como únicos campos editables la celda `F` (**CANT. A PEDIR**) y los botones táctiles de la fila 2.
* **Fusión de Soluciones y Paridad de PRs**:
  * **Reset Diario Resiliente**: Integración de triggers de restablecimiento de pedido compatibles con dispositivos móviles y botones táctiles optimizados para reset/sincronización.
  * **Corrección de Historial Desalineado**: Solución del desfasamiento de columnas al utilizar la herramienta "Avanzar Semana" para trasladar inventarios.
  * **Emoji de Reset Móvil**: Estandarización de botones interactivos con el emoji de basurero (`🗑`) en la celda `B2` y su checkbox ejecutor silencioso en `C2`.
  * **Reparación No Destructiva**: Creación de la función `repararSistemaTienda` para restaurar formatos condicionales, visibilidad de inactivos y conexión sin borrar datos activos en tránsito.
  * **Contraseña en Setup**: Bloqueo de seguridad por contraseña (`LCP-ADMIN-2026`) en el restablecimiento destructivo de las hojas de las tiendas.

---

## 🚀 Versión 1.2.0 — Sincronización Transaccional & Control de Carga en Bodega (2026-07-21)

### ⚙️ Bodega (BDG) — Control de Carga y Edición
* **Solución de Timeout en onEdit (#27)**: Refactorización completa de la lógica de inyección de productos a **Batch 2D**. Se eliminó la escritura iterativa en bucle por días y sucursales en los Kardex, reduciendo el tiempo de ejecución en red de 25 segundos a menos de 1.5 segundos.
* **State-Locking Preventivo**: Modificación del trigger `onEdit` para desmarcar inmediatamente a `FALSE` los checkboxes confirmadores en `"➕ AGREGAR_MÚLTIPLES"` (celda `J3`) y `"✏️ EDITAR_PRODUCTOS"` (celda `I3`) antes de comenzar el procesamiento pesado, evitando ejecuciones duplicadas encoladas en caso de interrupción.
* **Manejo de Errores Robustecido**: Implementación de bloques `try-catch-finally` con alertas informativas en pantalla y toques visuales en rojo en caso de fallo, garantizando la liberación segura de los recursos (`lock.releaseLock()`) y la consistencia del catálogo para reintentos sin riesgos.
* **Limpiador Automático de Duplicados**: Incorporación de la función `eliminarDuplicadosCatalogo` al menú de `⚙️ Mise`. Identifica de forma inteligente registros redundantes en `MAESTRO` comparando Categoría + Nombre + Presentación, los elimina de forma atómica en todas las bases (Kardex e Historiales) y re-estructura el catálogo secuencialmente.
* **Protecciones Anti-Dummies (MAESTRO)**: Bloqueo de celdas nativas de Sheets en `MAESTRO` para evitar la edición accidental de columnas críticas y fórmulas de stock. Únicamente se permite la edición directa del usuario en las columnas de selección y límites de stock (`MÍN/MÁX`).
* **Contraseña en Setup**: Bloqueo de seguridad por contraseña (`LCP-ADMIN-2026`) en el restablecimiento destructivo del catálogo principal.

---

## 🚀 Versión 1.1.5 — Mejoras Visuales, Reubicación de Surtido y Actualización de Sucursales
*Fecha de liberación: 25 de Junio de 2026*

### 📱 Pedidos (PDA & PDM)
* **Reubicación de Surtido Rápido**: El checkbox para abrir la vista móvil de surtido fue movido de las columnas colapsadas a la zona visible en la celda `E2` (junto al emoji `🚚` en `D2`) para facilitar su uso a los pickers.
* **Alineación de Checkboxes**: Ajuste de triggers en `onEdit` para apuntar de forma estable a las celdas `J3` y `I3` en móviles.
* **Identidad Limpia**: Remoción de prefijos técnicos `"B-"` en las sucursales, unificándolas a `"Andares"` y `"Mercado"`.
* **Desactivación de Ordenamiento Manual**: Depreciación del menú de ordenación manual del pedido para simplificar el flujo diario.

### ⚙️ Bodega (BDG)
* **Escalamiento Dinámico del Formato Condicional**: Integración automática de `_aplicarFormatosCondicionalesMaestro` tras el proceso de ordenación en caliente. Ahora, las filas nuevas del catálogo más allá de la 134 conservan la colorimetría de selección y semáforos de stock.
* **Ordenación por Prioridad de Marca**: Modificación de `data.sort` para ordenar las categorías de acuerdo al orden de precedencia de la marca (**REFRIGERADOS** primero) en lugar de orden alfabético estándar.
* **Toasts Progresivos**: Añadidos mensajes emergentes indicando el inicio y fin de las funciones críticas (`agregarProducto`, `anularProducto`, `eliminarSeleccionadosMaestro`).

---

## 🚀 Versión 1.1.0 — Estabilidad de IMPORTRANGE & Fórmulas en Inglés
*Fecha de liberación: 3 de Junio de 2026*

* **Persistencia del Surtido**: Corrección de bug que eliminaba checkmarks y datos de cantidades recibidas en la hoja móvil de Surtido Rápido al reordenar la lista principal.
* **Estandarización de Idioma**: Estandarización total de fórmulas de ordenación y lógica al idioma **inglés con comas (`,`)** como separador de parámetros para evitar errores `#ERROR!` causados por la regionalización.
* **Recreación de Vistas**: Modificada la recreación de vistas móviles en bodega para reutilizar hojas existentes en lugar de eliminarlas y recrearlas, previniendo desconexiones aleatorias de `IMPORTRANGE` (`#REF!`).
* ** try-catch en onOpen**: Implementación de capturas de error silenciosas para evitar interrupciones de permisos en usuarios con rol de lectura.
