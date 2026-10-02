# 🗺️ Roadmap — Suite MISE v1.7.7 Altair "Datos para decidir"
**La Crêpe Parisienne · Grupo MYT** · Arquitectura: Ibrahim García (`ultimaibrahim`)
**Creado**: 2026-10-01 · **Punto de partida**: 1.7.6 (a–r) en DEV, pendiente de validar y subir a PROD.

> Tema: la 1.7.6 dejó Mise **estable, blindada y entendible**. La 1.7.7 convierte lo que Mise ya registra en **información para decidir** (gerencia) y lleva la captura al **celular de verdad**. Mismas reglas: letras por iteración, prueba que falla con el código anterior, doble changelog, `push:dev → push:prod → verificar_prod`.

---

## Fase 0 — Cerrar la 1.7.6 (antes de empezar la 1.7.7)
- [ ] Validación en DEV de 1.7.6o–r (`checklist_observacion.md`).
- [ ] Subir a PROD + 🚀 Configurar en los 3 libros + contraseña en cada libro + página de estado de PROD + avisar al equipo de los nombres nuevos de pestañas.
- [ ] Consolidar **v1.7.6 oficial** (entradas a–r plegadas, badge, `package.json`, `MISE_VERSION`), merge a `master`, tag `v1.7.6`.

## Fase 0.2 — Pedido de Ibrahim (01/oct, tras la subida de la 1.7.6)
- [x] *(1.7.7a)* **Entradas con conversión**: presentaciones × factor; fruta/verdura en kg exactos → domos/piezas por peso de la presentación.
- [ ] *(1.7.7b)* **Orden del Catálogo como default de picking** (por tienda o ambas) y desde ahí ajustar.
- [ ] *(1.7.7c)* **Monitor de progreso** en todos los procesos pesados de Bodega y tiendas.
- [ ] *(1.7.7d–e)* **Powerhouse**: medir y acelerar la carga, ficha por producto con pestañas (General · Unidades · Mín/Máx · Orden), nombres completos, diálogo sin bloqueo.

## Fase 0.5 — 🌐 Página de estado más útil (1.7.7a) · primera mejora tras PROD
- [ ] **Recepción de hoy por tienda**: "Andares: 12 pedidos · 9 registrados · 3 sin registrar" (lee Pedido/Surtido dentro de la misma recolección con caché de 10 min).
- [ ] **Movimientos de hoy**: entradas y traspasos registrados (con folio).
- [ ] **Unidades de pedido**: cuántos productos tienen factor activo y cuáles quedaron "a revisar".
- [ ] Publicación de la página por la implementación de prueba (`/dev`, siempre el código más reciente, solo el dueño) para no republicar en cada subida.

## Fase 1.5 — ✨ Gráficas dentro de las celdas (1.7.7)
- [ ] **`SPARKLINE`** en 📦 Inventario (y opcional en 📋 Catálogo): una barra por producto que muestra dónde está el saldo entre su mínimo y su máximo, sin leer números. Las celdas no interpretan HTML; `SPARKLINE`, texto enriquecido, `IMAGE` e `HYPERLINK` sí.

## Fase 1 — 📊 Reportes con funciones nativas de Sheets (1.7.7a–c) · prioridad alta
Lo que gerencia entiende sin explicación, construido con lo que Sheets hace mejor.
- [ ] **Hoja `📊 Reportes`** en Bodega: **tabla dinámica** (`Range.createPivotTable`) de consumo por producto × tienda × semana, alimentada por datos en formato fila: `🗒 LOG_SURTIDO` de cada tienda (vía `_SYNC_LOG_*`) y `🔄 Traspasos`. El Kardex no sirve directo (está "a lo ancho" por día).
- [ ] **Segmentaciones** (`createSlicer`) por tienda, categoría y semana: filtrar tocando un botón (tableta).
- [ ] **Gráfico** de consumo semanal por tienda (`EmbeddedChartBuilder`).
- [ ] Fórmulas `QUERY` / `SORT` / `FILTER`: "Top 10 más pedidos", "llegó de menos esta semana" (diferencias de recepción), "traspasos del mes".
- [ ] Verificar en la documentación oficial antes de usarlo: soporte de **Tablas de Sheets** y **vistas de filtro** desde Apps Script (posiblemente solo vía Sheets API avanzada).

## Fase 2 — 📱 Mise Móvil (webapp) (1.7.7d–f)
La app de Sheets no muestra menús ni diálogos; la webapp sí funciona en el teléfono.
- [ ] Webapp `doGet` (como la página de estado) para **📥 Entradas y traspasos**: teclado numérico real (`inputmode="decimal"`), botones grandes, búsqueda de producto, misma lógica y validaciones del servidor (`procesarEntradasKardex`).
- [ ] Después, **🚚 Surtido Rápido** de tienda en la webapp (la recepción es lo más usado desde el celular).
- [ ] Acceso por cuenta (solo dominio / correos permitidos), sin depender de permisos de hojas.

## Fase 3 — Experiencia en computadora (1.7.7g–h)
- [ ] **Monitor de progreso** para más procesos: guardar en Powerhouse, descontar manual, reconciliación, 🚀 Configurar de tiendas.
- [ ] **Barra lateral "Panel de Bodega"**: estado del sistema, accesos y monitor sin salir de la hoja (lo que era 🏠 INICIO, sin ocupar una pestaña).

## Fase 4 — Alertas y conteo (1.7.7i–j)
- [ ] **Alertas** por correo (o Telegram): tienda sin latido > 24 h, cierre nocturno fallido, productos bajo mínimo. Usan el mismo resumen de `obtenerEstadoSistema()`; un activador diario, sin consultas extra.
- [ ] **Hoja de conteo físico** (si el conteo del jueves se vuelve rutina): captura móvil, teórico vs. contado, mermas registradas y ajuste del saldo con folio.

## Fase 5 — Ingeniería (continua)
- [ ] **Aislar el emulador por suite** (prototipos por contexto): hoy algunas suites reemplazan `setFormulas` en el prototipo compartido.
- [ ] **Pedido por nombre, no por fila de `_SYNC`** (Developer Metadata o búsqueda por nombre en la tienda): permite retirar del todo el escritor remoto de Bodega y que altas/bajas no dependan del reordenamiento a distancia.
- [ ] Evaluar biblioteca **`MiseCore`** (código compartido Bodega/tiendas: huella, logger, fechas).

## Fuera de la 1.7.7
- Decisión sobre **Atlas** (`mise-web/`, `database/`): rama propia o archivo.
- **Manual visual** por rol (Ibrahim), apoyado en la página de estado y las etiquetas de la 1.7.6.

## Orden recomendado
Fase 0 → **Fase 1 (Reportes)** → Fase 2 (Entradas en webapp) → Fase 4 (alertas) → Fase 3 → Fase 5 en paralelo.
Razón: Reportes es lo que más ayuda en la conversación con gerencia y sale de datos que ya existen; la webapp es el mayor salto de facilidad de uso.
