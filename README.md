# ⚡ Suite MISE · Enterprise Inventory & Supply Chain Engine
> **Plataforma Integral de Telemetría de Inventarios, Reconciliación Inteligente de Insumos, Picking Dinámico y Sincronización Asíncrona para Cadenas Retail y Restauración.**

[![Version](https://img.shields.io/badge/version-1.7.4--Altair-2E7D32.svg?style=flat-square)](CHANGELOG_PUBLIC.md)
[![Runtime](https://img.shields.io/badge/runtime-Google%20Apps%20Script%20V8-4285F4.svg?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![Management](https://img.shields.io/badge/managed%20with-Google%20Clasp-34A853.svg?style=flat-square)](https://github.com/google/clasp)
[![Tests](https://img.shields.io/badge/tests-100%25%20passing%20%28Node%20V8%20VM%29-388E3C.svg?style=flat-square)](tests/)
[![Architecture](https://img.shields.io/badge/architecture-Multi--Worker%20Concurrent%20%7C%20Hub--and--Spoke-5C6BC0.svg?style=flat-square)](#-arquitectura-del-sistema)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=flat-square)](LICENSE)
[![AI-Driven Development](https://img.shields.io/badge/AI--Driven-Development-7A9E8A.svg?style=flat-square)](#)

---

## 🧭 Propósito y Contexto Operativo

**Suite MISE** es un motor distribuido de gestión de almacenes y cadena de suministro construido sobre el entorno V8 de **Google Apps Script** y **Google Sheets**, diseñado para resolver la fricción crítica entre centros de distribución generales (bodegas) y puntos de venta periféricos (quioscos y tiendas).

Elimina el desabasto imprevisto, automatiza el cálculo de saldos en tiempo real y ofrece interfaces táctiles de alta velocidad para operarios de almacén y encargados de tienda en dispositivos móviles.

---

## 🏛️ Arquitectura del Sistema

Opera bajo una topología distribuida de **tres niveles (Hub-and-Spoke)** diseñada para desacoplar el módulo central de almacenamiento de las terminales de venta en quioscos, garantizando atomicidad transaccional y cero colisiones operativas:

```mermaid
graph TD
    subgraph HUB ["🏬 HUB CENTRAL · BODEGA GENERAL (BDG)"]
        M["📋 MAESTRO (Catálogo Oficial)"]
        K_BA["📊 KARDEX_BA (Unidad A)"]
        K_BM["📊 KARDEX_BM (Unidad B)"]
        ENG["🧠 MiseMatchingEngine\n(N-Grams / Token-Sort / Delta)"]
        ALIAS["🗄️ _DICCIONARIO_ALIAS (Caché L1 O(1))"]
        REC["🏗️ RAM Reconstructors"]
        LOG_BDG["🗒 LOG (Telemetría y Auditoría)"]
        
        M <--> ENG
        ENG <--> ALIAS
        K_BA <--> REC
        K_BM <--> REC
    end

    subgraph SYNC_ENGINE ["🔄 MOTOR DE SINCRONIZACIÓN ASÍNCRONA"]
        VM_BA["👁️ VISTA_MOVIL_BA"]
        VM_BM["👁️ VISTA_MOVIL_BM"]
        SYNC["⏰ SmartSync Nightly Daemon\n(01:00 AM Idempotent Trigger)"]
    end

    subgraph KIOSKS ["📱 TERMINALES DE TIENDA / QUIOSCOS (PDA / PDM)"]
        P_BA["📋 PEDIDO DIARIO (Unidad A)"]
        SR_BA["🚚 SURTIDO RÁPIDO (Unidad A)"]
        P_BM["📋 PEDIDO DIARIO (Unidad B)"]
        SR_BM["🚚 SURTIDO RÁPIDO (Unidad B)"]
    end

    %% Flujos de lectura e importación
    K_BA --> VM_BA
    K_BM --> VM_BM
    VM_BA -->|_SYNC_BA IMPORTRANGE| P_BA
    VM_BM -->|_SYNC_BM IMPORTRANGE| P_BM
    P_BA -.->|Filtro en caliente| SR_BA
    P_BM -.->|Filtro en caliente| SR_BM

    %% Flujo transaccional nocturno
    P_BA -->|Lectura de surtido| SYNC
    P_BM -->|Lectura de surtido| SYNC
    SYNC -->|Deduplicación & Descuento Atómico| K_BA
    SYNC -->|Deduplicación & Descuento Atómico| K_BM
    SYNC -->|Hash Ledger Transactional Log| LOG_BDG
```

---

## ⚡ Módulos y Especificaciones Técnicas

1. **Kardex Multi-Worker Concurrente**:
   - Bitácora transaccional por lotes con reconstrucción en memoria RAM para evitar lecturas de rango repetidas en Google Sheets API (`Batch Operations`).
2. **Matching Engine con Resolución Difusa (Fuzzy Matching)**:
   - Resuelve discrepancias ortográficas y de tecleo en nombres de insumos utilizando distancia de Levenshtein, N-Grams y token sort con caché L1 `O(1)`.
3. **Quiosco de Picking y Registro Rápido**:
   - Diálogos modales optimizados (1050x700px en escritorio y responsivos en móviles) para captura táctil ágil sin bloquear la navegación de la hoja.
4. **Sincronización Asíncrona Idempotente**:
   - Trigger programado de conciliación nocturna con hashing de transacciones para garantizar deduplicación exacta.

---

## 🧪 Pruebas Unitarias

La suite incluye una batería de pruebas unitarias que simulan el entorno Google Apps Script en Node.js (V8 VM):

```bash
node tests/run_all.js
```

## 📄 Licencia

Este proyecto está distribuido bajo los términos de la licencia **GNU Affero General Public License v3.0 (GNU AGPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## 👨‍💻 Autor & Arquitectura

Diseñado e implementado por **Ibrahim García** ([@ultimaibrahim](https://github.com/ultimaibrahim)) · Guadalajara, México.
