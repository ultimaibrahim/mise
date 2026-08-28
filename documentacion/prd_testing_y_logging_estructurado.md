# PRD: Suite de Testing Automatizado & Telemetría Interna (MiseLogger)
**Suite MISE · Bodegas (BDG) & Tiendas (PDA / PDM)**  
**Época**: Altair (v1.7.4+)  
**Product Owner & Architect**: Ibrahim García (`ultimaibrahim`)  
**Estado**: En Implementación  

---

## 🎯 1. Resumen Ejecutivo y Propósito

El presente documento de especificación de requerimientos (PRD) establece la arquitectura y lineamientos para:
1. **Entorno de Testing Automatizado Pre-Despliegue**: Un harness de emulación en memoria de Google Apps Script (`SpreadsheetApp`, `LockService`, `PropertiesService`, `Session`) en Node.js que permite validar exhaustivamente funciones de negocio antes de publicarlas en producción.
2. **Módulo Nativo de Telemetría & Logging (`MiseLogger`)**: Un subsistema de observabilidad embebido directamente en cada archivo `.gs` (`miseAuthBDG.gs`, `miseAuthPDA.gs`, `miseAuthPDM.gs`) sin dependencias de `UrlFetchApp` ni enlaces cruzados frágiles de `IMPORTRANGE`.

---

## 📐 2. Especificación de Requerimientos

### 2.1 Módulo `MiseLogger`
* **Niveles Soportados**: `DEBUG`, `INFO`, `WARN`, `ERROR`, `PERF`.
* **Micro-Timers**: Medición de latencia de ejecución en milisegundos (`durationMs`) mediante `time(label)` y `timeEnd(label)`.
* **Captura de Errores**: Registro de mensaje de error y `Error.stack` completo indicando línea exacta de fallo.
* **Dual Output**:
  - **V8 / Cloud Logging Console**: `console.log`, `console.warn`, `console.error` con JSON semántico y emojis para depuración en vivo.
  - **Hoja `🗒 LOG`**: 7 columnas estructuradas (`TIMESTAMP`, `NIVEL`, `FUNCIÓN`, `DURACIÓN (ms)`, `DETALLE`, `USUARIO`, `STACK TRACE`).
* **Retrocompatibilidad**: Conservación de `_log(fn, msg)` redirigiendo transparentemente a `MiseLogger.info(fn, msg)`.

### 2.2 Framework de Pruebas Automatizadas
* Emulador de `SpreadsheetApp` (hojas, rangos 2D, formatos, fórmulas en inglés).
* Emulador de `LockService` y `PropertiesService`.
* Suites de validación de:
  - Consistencia de 13 columnas de `MAESTRO`.
  - Integridad del rango `A4:L` en sincronización de tiendas.
  - Guardado transaccional del catálogo y secuencia de picking.
  - Formato de fórmulas en inglés con comas (`,`).

---

## 📅 3. Mantenimiento y Evolución
Este módulo servirá como base de auditoría operativa para la Época Altair y futuras iteraciones de la Suite MISE.
