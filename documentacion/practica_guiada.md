# 🎓 Práctica guiada de Mise (DEV)
**Para qué**: comprobar dos cosas a la vez — que entiendes cómo fluye la información y que el sistema hace lo que debe.
Cada ejercicio dice **qué hacer**, **dónde mirar** y **qué debe pasar**. Si lo que ves coincide, ✅. Si no, anota el número del ejercicio y lo que viste.

> Hazlo en los libros **[DEV]** (nunca en los de operación). Antes: 🚀 Configurar en los 3 libros DEV.
> Producto de ejemplo: **fresa** con presentación `DOM 454 g`, unidad de bodega `kg` (unidad de pedido `dom`, factor `0.454`). Usa cualquier producto equivalente si lo prefieres.

---

## 1 · Del pedido al inventario (el flujo principal)
1. **Andares DEV → 📋 Pedido Diario**: en la fresa, CANT. A PEDIR = **24**.
2. Marca la casilla grande **🚚 Surtido Rápido** (fila 2).
3. **🚚 Surtido** (pestaña amarilla): en la columna congelada ves `Fresa…` y debajo **"pidió 24"**. Marca **✅**.
4. **Bodega DEV → ⚙️ Mise → ▸ Más opciones → 🚚 Descuentos → Descontar pedidos de hoy**.

**Debe pasar**
- En el Surtido, FINAL de la fresa = **24** (aunque RECIBIDA quedó vacía: ✅ = llegó lo pedido).
- En **📦 Inventario Andares**, columna **SAL de hoy** (la resaltada) de la fresa: **+10.896** (24 × 0.454 kg).
- El Pedido Diario de Andares queda vacío y el Surtido se borra (el cierre "vacía" la tienda).
- En **🗒 LOG_SURTIDO** de Andares: una fila de hoy con la fresa, 24 pedidos, 24 recibidos, `COMPLETO`.
- 🌐 Página de estado → "Cierres nocturnos": aparece un cierre **manual** con su barra por fases.

**Qué estás aprendiendo**: la tienda pide en su unidad (domos); Bodega descuenta en la suya (kg); lo que manda es la CANT. FINAL.

## 2 · Lo que llegó de menos y lo que no llegó
1. Andares DEV: pide **3** de un producto A y **2** de un producto B. Abre el Surtido.
2. Producto A: escribe **1** en RECIBIDA. Producto B: marca **❌**.
3. Bodega DEV: Descontar pedidos de hoy.

**Debe pasar**: A se pinta de naranja (de menos), FINAL = 1, y Bodega descuenta **1** (× su factor). B se pinta de rojo, FINAL = 0, y **no se descuenta nada**. En LOG_SURTIDO: A = `PARCIAL`, B = `INEXISTENTE`.

## 3 · Sin registro no se descuenta
1. Andares DEV: pide **5** de un producto C. **No** abras el Surtido.
2. Bodega DEV: Descontar pedidos de hoy.

**Debe pasar**: **nada** se descuenta de C (nadie confirmó que llegó). En LOG_SURTIDO: `SIN_REGISTRO`.

## 4 · Repetir no descuenta dos veces
1. Justo después del ejercicio 1, vuelve a correr **Descontar pedidos de hoy**.

**Debe pasar**: el SAL de la fresa **no cambia** (sigue +10.896). El mensaje dice "0 insumos descontados / N omitidos".

## 5 · Entradas y traspasos (Bodega, desde el celular)
1. **📥 Registrar entradas**, modo `📥 Entrada`: fresa, ANDARES = **5**. Marca **Enviar**.
2. Cambia el modo (arriba a la izquierda) a `🔄 Andares → Mercado`. La UNIDAD de la fresa cambia a **dom**. Escribe **2** en CANTIDAD y marca Enviar.

**Debe pasar**
- Paso 1: 📦 Inventario Andares, **ENT de hoy** de la fresa +5 (kg). La fila 3 dice ✅.
- Paso 2: Andares **SAL de hoy** +0.908 y Mercado **ENT de hoy** +0.908 (2 domos × 0.454). En **🔄 Traspasos**, una fila con folio `TRP-…`, 2 · dom · factor 0.454 · 0.908.
- Si escribes letras o usas la columna gris en traspaso: la hoja lo rechaza y **no envía nada**.

## 6 · El Catálogo se cuida solo
1. **📋 Catálogo**: en un producto sin factor, escribe la presentación `CAJ 100 PZA` (su unidad de bodega debe ser `pza`).
2. En otro producto, escribe `abc` en un MÍN, y luego un MÁX menor que su MÍN.
3. Pon ACTIVO = NO en un producto de prueba.

**Debe pasar**: (1) se llenan solos "caj" y "100". (2) la hoja rechaza ambos con un mensaje. (3) el producto desaparece de los dos Inventarios; en 🌐 la página de estado, la tienda marca 🟡 "cambios pendientes"; al abrir la tienda, desaparece de su pedido y pasa a 🟢.

## 7 · Con la cuenta de prueba (permisos)
1. Con la cuenta de prueba abre Bodega DEV y la tienda DEV.

**Debe pasar**: en el Catálogo solo puede tocar ACTIVO y los MÍN/MÁX; en la tienda, solo CANT. A PEDIR y el Surtido; todo lo demás muestra un aviso de protección.

---

### Si todo coincide
Entendiste el flujo completo (pedir → recibir → descontar → inventario), y el sistema está funcionando. Al terminar, puedes devolver los Inventarios DEV a como estaban (los movimientos de práctica se quedan en DEV; no afectan la operación).
