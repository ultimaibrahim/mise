# 🔭 Checklist de observación — 29/sep al 6/oct/2026
**MISE Suite** · Lo que se valida **dejando pasar el tiempo** en operación real (no se itera: se observa).
Lo que se desarrolla vive en `plan_v1.7.6.md`. Marca `[x]` y anota fecha + resultado; si algo falla, pásalo al plan como bug.

> Herramienta principal: la **🌐 página de estado** (Bodega → Automatizaciones → 🌐 Abrir página de estado).
> DEV la tiene desde 1.7.6h; PROD la tendrá cuando se suba la 1.7.6.

## ⚠️ Mientras PROD siga en 1.7.5 (hasta subir la 1.7.6)
- **No usar** en Bodega PROD: "🔄 Reconciliar y descontar toda la semana activa" ni "🚚 Descontar pedidos de ayer (Manual)". En 1.7.5 toman el pedido **en curso** de las tiendas, lo descuentan en otro día y lo vacían (corregido en 1.7.6l).
- "Descontar Pedidos de Hoy" sí es seguro, pero solo después de que las tiendas terminaron de recibir (vacía el pedido del día).

## Esta noche · martes 29/sep
- [ ] **DEV · cierre 23:00**: en la página de estado, "Cierres nocturnos" muestra la barra por fases (tiendas · log · kardex · vistas · push). Anotar qué fase pesa más: decide la optimización del push.
- [ ] **PROD (1.7.5)**: el `🗒 LOG` de Bodega registra "Descuento completado" sin `ERROR`.

## Mañana · miércoles 30/sep
- [ ] **PROD**: reset de las 00:00 en Andares y Mercado (*Acerca de → Último reinicio diario* = 30/09).
- [ ] **PROD**: semáforo de colores del PEDIDO DIARIO correcto con el primer pedido del día, sin `#NAME?` (hotfix 1.7.5s).
- [ ] **PROD**: `🗒 LOG_SURTIDO` de ambas tiendas con encabezado "Fecha…" en la fila 1 y estados reales (nada de `#NAME?`).
- [ ] **DEV**: página de estado toda en 🟢 tras abrir cada tienda (latido "apertura", catálogo al día).
- [ ] **DEV · esquema 3 (1.7.6k)**: tras la migración de las 00:00 (o menú 🔄 Aplicar actualización de estructura pendiente), en ambas tiendas DEV: MÍN | MÁX en la columna J, sin columna vacía entre ESTADO y MÍN | MÁX, semáforo con colores, capturas del día en su producto, y `🗒 LOG` con "Esquema 2 → 3 … 0 sin restaurar". Existen `_RESPALDO_PEDIDO_v3` y `_RESPALDO_SURTIDO_v3` ocultas.
- [ ] **DEV · 1.7.6o**: 🚀 Configurar en Bodega DEV → pestañas con los nombres nuevos y en orden; los semáforos de 📦 Inventario y 📋 Catálogo siguen pintando; 📋 Catálogo con etiquetas en la fila 2. Con la **cuenta de prueba en tableta**: escribir letras, un negativo o un máximo menor que el mínimo → rechazo con mensaje; editar cualquier otra columna → bloqueado.
- [ ] **DEV · 1.7.6p**: en 📥 Registrar entradas cambiar A2 a "🔄 Andares → Mercado", traspasar 1 producto → SAL en Andares, ENT en Mercado y folio en 🔄 Traspasos. En el Catálogo, capturar en 2–3 productos la unidad de pedido y el factor (fresa domo 0.454; guantes caja 100; conos paquete 50) → al día siguiente, el descuento en kg/pz cuadra y la tienda ve su saldo en domos/cajas.
- [ ] **DEV · 1.7.6q–r**: 🚀 Configurar abre la ventana de progreso y marca los 11 pasos; en el Catálogo escribir una presentación "Domo 454 g" en un producto sin factor → se llena solo; en Powerhouse editar unidad de pedido y factor de otro producto. Si el gerente usará Powerhouse: 🔒 Protección → 👥 Administradores con su correo.
- [ ] **DEV · catálogo**: cambiar el picking o desactivar un producto en Bodega → la página marca 🟡 "pendiente" → abrir la tienda → 🟢 y el pedido reordenado.

## Jueves 1/oct
- [ ] **Conteo físico** → saldos iniciales en SALDO ANT de ambos Kardex (borrar solo SALDO ANT y ENT/SAL; nunca las columnas SLD).
- [ ] Al día siguiente, el descuento de las 23:00 parte de los saldos nuevos (revisar 2–3 productos a mano).

## Viernes 2/oct (propuesta de paso a PROD de la 1.7.6)
- [ ] 1.7.6 subida a PROD y `verificar_prod.sh` → IDÉNTICO en los 3 libros.
- [ ] 🚀 Configurar este libro en los 3 libros de PROD (activadores, latido, huella, blindaje).
- [ ] 🔐 **Definir la contraseña de administrador en los 6 libros** (PROD y DEV) desde el menú. Hasta entonces, "Restablecer desde cero" queda bloqueado (es lo esperado).
- [ ] Publicar la página de estado de PROD (Implementar → Nueva implementación → App web · Ejecutar como: yo · Acceso: solo yo) y guardarla en el celular.

## Lunes 5/oct
- [ ] Ambos badges de Kardex en `🟢 SEMANA 41` **sin intervención** (cierre dominical u `onOpenBodegaInstalable`).
- [ ] Página de estado: "Semana Kardex" en 🟢 para Andares y Mercado.

## Una semana después · martes 6/oct
- [ ] **Cuota**: "Tiempo de ejecución hoy" en la página de estado, promedio de la semana (objetivo: muy por debajo de 90 min/día).
- [ ] **Incidentes**: revisar los WARN/ERROR de 7 días en la página; cada uno recurrente → punto nuevo en el plan.
- [ ] **Cierres**: las 7 noches en 🟢, ninguna con "manual" inesperado, duración estable.
- [ ] **Latido**: ninguna tienda más de 24 h sin latir.
- [ ] Historial de Mercado semanas 38–39: confirmar que el conteo del jueves dejó los saldos correctos (el historial mezclado queda solo como nota).

## Cuando haya un momento (sin fecha)
- [ ] **Blindaje con la cuenta de prueba**: en MAESTRO, Kardex, Entradas y las tiendas, intentar editar celdas protegidas (debe impedirlo) y capturar en las libres (debe permitirlo). Anotar cualquier celda mal protegida.
