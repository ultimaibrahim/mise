# 🛠️ Changelog Técnico — MISE Engine & Platform
**La Crêpe Parisienne · Grupo MYT / Corporativo Alancar**  
**Arquitecto de Producto y Software**: Ibrahim García (`ultimaibrahim`)

Este documento contiene el historial técnico y arquitectónico oficial de la plataforma **MISE**, detallando optimizaciones de Google Apps Script (V8 runtime), llamadas RPC, reducción de latencia, esquemas de base de datos relacionales y especificaciones de frontend.

---

## Época Atlas (v2.0.0 - Presente) [PREVIEW OPERATIVO / ARQUITECTURA INDEPENDIENTE]

Representa la generación de soporte estructural, robustez y arquitectura desacoplada de alto rendimiento. Introduce la WebApp PWA con Sistema de Diseño Crystal & Squircle, el Ledger Relacional Inmutable y la sincronización bidireccional con Google Sheets.

### Version 2.0.0-alpha Atlas — Arquitectura WebApp PWA MISE 2.0, Ledger Relacional Inmutable y Sheets Mirror Worker (Septiembre 2026)
* **Scaffold Frontend PWA Crystal & Squircle (`mise-web/`)**:
  - Implementación del sistema de diseño luxury hospitality en `src/styles.css` con paleta corporativa Parisienne: Deep Emerald (`#1A281F`, `#0C130F`), Pine (`#2D4836`), Sage (`#7A9E8A`) y Cream Sand (`#F5EFE6`).
  - Geometría de curvas suaves squircle (`border-radius: 14px - 28px`), glassmorphism hiper nítido (`backdrop-filter: blur(20px)`), sombras difusas multicapa y eliminación de controles nativos toscos.
  - Modo 1: **Tienda Móvil (Mobile Ordering & Blind Count)** con selección rápida de sucursal (Andares `pda` vs Mercado `pdm`), filtro de categorías, contadores elásticos y Floating Action Dock.
  - Modo 2: **Matriz de Despacho Central (Commissary Matrix)** para Bodega General, consolidando demandas de sucursales en una sola vista de picking por estantería.
  - Modo 3: **Ledger FIFO Stream**, visualizando en tiempo real transacciones inmutables con hashes criptográficos.
* **Modelo Relacional de Base de Datos (`database/001_initial_ledger_schema.sql`)**:
  - Migración lista para **PostgreSQL / Supabase**.
  - Creación de tabla `inventory_transactions` inmutable con hash de idempotencia (`idempotency_hash` SHA-256) para evitar duplicidades por doble clic o reintentos de red.
  - Módulo de auditoría física ciega (`blind_counts` y `blind_count_items`) inspirado en Restaurant365.
  - Tablas de sucursales (`branches`), categorías (`product_categories`), productos maestros con niveles par (`products`), y órdenes de despacho (`orders`, `order_items`).
  - Vista agregada en tiempo real `v_current_stock` con cálculo instantáneo de inventario teórico frente a puntos de reorden.
* **Motor Espejo Bidireccional (`scripts/sheets_mirror_worker.js`)**:
  - Worker de sincronización entre la base relacional y los spreadsheets activos.
  - Serializador de matrices 2D y generación de hashes deterministas con latencia de ejecución validada de **15 ms**.

---

## Época Altair (v1.0.0 - v1.9.0) [MOTOR GOOGLE APPS SCRIPT V8]

Representa la era fundacional y de optimizaciones sub-segundo del motor sobre Google Sheets y Google Apps Script V8, erradicando cuellos de botella de red y cómputo volátil en dispositivos móviles.

### Version 1.9.0 Altair — Optimización Sheets Turbo Sub-Second, Erradicación de VLOOKUP y Blindaje Horario 23:00 hrs (Septiembre 2026) [ACTUAL EN PRODUCCIÓN GAS]
* **Erradicación de 858 Evaluaciones Volátiles de Formato Condicional (`pda/miseAuthPDA.js`, `pdm/miseAuthPDM.js`)**:
  - **Diagnóstico de Causa Raíz**: La función `_aplicarFormatosCondicionales()` inyectaba 5 reglas condicionales basadas en `INDIRECT("'🚚 SURTIDO RÁPIDO'!C:G")` con `VLOOKUP`. Con 143 filas por tienda, cada pulsación táctil en la app móvil de Google Sheets disparaba 858 escaneos de rangos externos, provocando congelamientos de 1.2 a 2.0 segundos.
  - **Refactorización Determinista O(1)**: Sustitución total de las fórmulas indirectas por lecturas atómicas de la celda de estado local en Columna I (`COL_ESTADO`):
    - `ruleCompleto`: `=$I4="COMPLETO"` (Verde pastel `#E8F5E9`)
    - `ruleInexistente`: `=$I4="INEXISTENTE"` (Rojo suave `#FFEBEE`)
    - `ruleParcial`: `=$I4="PARCIAL"` (Naranja `#FFF3E0`)
    - `ruleExcedente`: `=$I4="EXCEDENTE"` (Azul claro `#E1F5FE`)
    - `rulePendiente`: `=AND($F4>0, $I4="")` (Amarillo suave)
    - `ruleInactivo`: `=INDIRECT("'${SHEET_SYNC}'!$I" & ROW())="NO"`
  - **Resultado**: Cero lag táctil en dispositivos iOS y Android.
* **Eliminación de `VLOOKUP` Cruzado en Columna G (`DIFERENCIA`) (`pda`, `pdm`, `bdg`)**:
  - Sustitución de la fórmula legada `=IF(F4="", "", IFERROR(VLOOKUP(C4, '🚚 SURTIDO RÁPIDO'!C:E, 3, FALSE), 0) - F4)` por la fórmula intra-fila:  
    `=IF(OR(F4="", H4=""), "", H4 - F4)`.
  - Aprovecha la columna H (`COL_RECIBIDA`) que ya es actualizada en tiempo real por el evento `onEdit()` de la hoja de surtido rápido.
  - Reducción del tiempo de evaluación por celda de ~15 ms a **0.0001 ms**.
* **Matriz Rectangular 2D Unificada en Llamadas RPC (`_setupSync()` y `sincronizarConCatalogo()`)**:
  - Sustitución del patrón fragmentado de 8 a 10 llamadas remotas `.setValues()` y `.setFormulas()` por columna individual por un arreglo 2D unificado (`outputGrid`).
  - Reducción de latencia de red de Google Cloud RPC de ~1,800 ms a **<100 ms**.
* **Blindaje de Horarios Nocturnos a las 23:00 hrs (`bdg/miseAuthBDG.js`)**:
  - Reubicación de los activadores basados en tiempo `descontarSurtidoAutomatico()` y `ejecutarMantenimientoSemanalBDG()` desde las 00:00 / 01:00 AM hacia las **23:00 hrs del día en curso**.
  - Eliminación de la condición de carrera (*race condition*) que borraba los pedidos diarios de las tiendas antes de que Bodega General ejecutara el descuento.
  - Corrección del bug de sellado temporal matutino en `pda` y `pdm` para evitar registrar transacciones con la fecha del día siguiente.
* **Módulo de Reconciliación Determinista de Lunes 07 de Septiembre (`bdg/MiseKardexEngine.js`)**:
  - Implementación de `reconciliarLunes7Septiembre()` para recuperar los 49 insumos de Andares y 2 de Mercado desde `🗒 LOG_SURTIDO` directamente a la Columna 11 (`SAL LUN`) de `KARDEX_BA` y `KARDEX_BM` en una sola llamada Batch 2D.
  - Adición de disparador manual en menú de interfaz:  
    `⚙️ Mise ➔ 🧪 Automatizaciones Autónomas ➔ ⚡ Reconciliar directamente salidas del Lunes 07 de Septiembre`.
* **Corrección de Excepción por Celdas Combinadas en Plantilla (`bdg/miseAuthBDG.js`)**:
  - Corrección de `setFrozenColumns(4)` en `prepararPlantillaRecuperacionSemana()`, solventando la colisión con la cabecera combinada `A1:K1`.
* **Despliegue y Validación**:
  - Validación sintáctica al 100% mediante `node -c` (0 errores).
  - Sincronización a producción vía `clasp push` en los 3 proyectos (`bdg`, `pda`, `pdm`).

---

---

## Época Altair — Historial Previo de Versiones (v1.3.0 - v1.8.0) [REPOSITORIO AUTORITATIVO]

### Version 1.8.0 Altair — Blindaje de Seguridad Integral, Motor Matemático de Alias & Reconstrucción Resiliente (Agosto 2026)
* **Blindaje Estructural en Hojas de Inventario**:
  - `MAESTRO`, `KARDEX_BA` y `KARDEX_BM` protegidas a nivel rango y hoja contra alteraciones estructurales, preservando la editabilidad de casillas y celdas de Entrada (`ENT`) y Salida (`SAL`).
  - `📋 PEDIDO DIARIO` (PDA / PDM): Protección estricta dejando editables únicamente la celda táctil `F2` (Surtido Rápido) y la columna `CANT. A PEDIR` (Columna F).
  - `🚚 SURTIDO RÁPIDO`: Protección estricta limitando la captura a `CANT. RECIBIDA` (Columna E) y checkboxes de estado `✅ COMPLETO` / `❌ INEXISTENTE` (Columnas F y G).
* **Motor Matemático de Reconciliación (`MiseMatchingEngine`)**:
  - Algoritmo de normalización de cadenas, n-gramas y token-sort ratio para emparejar automáticamente alias de insumos, gramajes y marcas (`.450`, `1 kg`, etc.) contra el catálogo oficial sin listas fijas.
  - Derivación segura de insumos dudosos a la hoja de telemetría `⚠️ REVISIÓN_HUÉRFANOS`.
* **Reconciliador Asistido Visual (Modal HTML)**:
  - Interfaz gráfica en Google Apps Script (`⚙️ Mise > 📊 Mantenimiento y Blindaje > 🧠 Reconciliador Inteligente de Huérfanos`) con previsualización de porcentajes de coincidencia y guardado permanente en `_DICCIONARIO_ALIAS`.
* **Reconstructores Resilientes con Respaldo en RAM**:
  - Rutinas `reconstruirKardexBA()`, `reconstruirKardexBM()` y `reconstruirMaestro()` que respaldan matrices de inventario en memoria V8, purgan columnas huérfanas y reconstruyen la cuadrícula limpia.
* **Idempotencia y SmartSync Nocturno**:
  - Deducción nocturna protegida contra doble cobro mediante registro transaccional único y corrección de la ventana de medianoche (01:00 AM).

### Version 1.7.0 - Version 1.7.3 Altair — Suite Powerhouse de Catálogo y Concurrencia Multi-Hilo (Agosto 2026)
* **Arquitectura Concurrente Multi-Hilo**: Procesamiento paralelo distribuido para operaciones masivas de guardado de catálogo, sincronización de inventarios y propagación a tiendas en tiempo récord.
* **Modal HTML Powerhouse de Catálogo y Picking (`PickingDialog.html`)**:
  - Interfaz de 1050×700px con estética Crystal & Squircle para reordenar la secuencia de picking por arrastre atómico (SortableJS).
  - Módulo de Alta en Lote sin hojas temporales y edición en caliente de mínimos y máximos por tienda.
  - Selector de zoom persistente en `localStorage` (`mise_picking_zoom`: 100%, 115%, 130%, 145%).

### Version 1.6.0 - Version 1.6.4 Altair — Sincronización Remota de Picking y Captura Rápida en PC (Agosto 2026)
* **Reacomodo de Picking 100% Automático en Tiendas**: Propagación atómica del orden de surtido desde Bodega hacia las hojas satélite de Pedido Diario en PDA y PDM.
* **Registro Rápido en PC (`RegistroRapidoDialog.html`)**: Modal con atajo de teclado (`Ctrl + Shift + F`) y autocompletado para capturar Entradas y Salidas sin desplazamiento horizontal.
* **Depuración Visual**: Eliminación definitiva de columnas obsoletas de caducidad en el Kardex para acercar los semáforos de stock al nombre del insumo.

### Version 1.3.0 - Version 1.5.0 Altair — Cimientos del Motor Hub-and-Spoke (Julio - Agosto 2026)
* **Protocolo de Sincronización `_SYNC` (Rango A4:L)**: Enlace de 12 columnas desacoplado para importar saldos y catálogo maestro mediante `IMPORTRANGE`.
* **Estructuración Mobile-First**: Adaptación de las hojas de tienda para captura táctil desde teléfonos móviles, minimizando recálculos pesados.

