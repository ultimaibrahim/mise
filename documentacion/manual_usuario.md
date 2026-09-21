# Manual de Usuario Operativo — Suite MISE v1.7.4 Altair
**Suite Atelier · La Crêpe Parisienne · Grupo MYT**

---

## 1. Manual para el Supervisor (Hojas de Pedidos: Pedidos Andares / Pedidos Mercado)

### Paso 1: Conectar / Inicializar el libro (Solo la primera vez)
1. Abre tu hoja de **Pedidos Andares** o **Pedidos Mercado** correspondiente a tu tienda.
2. En el menú superior de tu Google Sheets, busca la pestaña **⚙️ Mise**.
3. Haz clic en **🚀 Setup completo**. (Esto creará la estructura limpia del pedido diario, inyectando formatos condicionales y fórmulas base).
4. Si sale la advertencia `⚠️ CONECTAR BDG` en la celda J4, ve al menú **⚙️ Mise** → **🔗 Configurar conexión con [Nombre de Sucursal]** y pega el enlace completo de la hoja de cálculo de Bodega.

### Paso 2: Generar y Levantar el Pedido Diario en Unidades de Mostrador
1. Asegúrate de que las cantidades de la columna **CANT. A PEDIR (Columna F)** estén vacías al iniciar el día (se autolimpian automáticamente por la noche).
2. **Lectura de Unidad Física (Domo, Caja, Pieza, Kg):** La columna D (`UNIDAD TIENDA`) permanece visible de forma permanente junto al nombre del producto. Captura en tus unidades físicas habituales (ej. 12 domos, 2 cajas) sin necesidad de hacer conversiones manuales a kilogramos en el mostrador. Admite hasta **4 decimales** (ej. `1.125`).
3. **Filtrado por Categorías (Mobile-First):** La columna B ("CATEGORÍA") cuenta con filtro nativo para aislar familias completas (refrigerados, lácteos, abarrotes) en la pantalla del celular.

### Paso 3: Surtido Rápido con Captura Numérica Libre
1. Para comenzar la recepción móvil de mercancía cuando llega la camioneta de reparto, marca la **casilla de verificación en la celda E2** (al lado del emoji **🚚** en **D2**). Esto abrirá la pestaña `"🚚 SURTIDO RÁPIDO"`.
2. **Características del Surtido Rápido:**
   - **Producto Inmovilizado:** La columna C (`PRODUCTO`) se mantiene fija al desplazarte hacia la derecha.
   - **Captura Numérica Pura (Columna E):** Puedes capturar cualquier cantidad custom o parcial libremente sin romper fórmulas.
   - **Interruptores Táctiles Directos:** Presiona `✅ COMPLETO` (Col F) para registrar la recepción total en 1 toque, o `❌ INEXISTENTE` (Col G) si el producto no llegó de bodega.
   - **Coloreado Dinámico Instantáneo:** Las filas cambian de color de forma inmediata en $O(1)$ sin congelar la app móvil (Verde para completos, Rojo para inexistentes, Naranja para entregas parciales).

### Paso 4: Traspasos Inter-Tiendas en Móvil (Andares ⇄ Mercado)
1. Para prestar o recibir insumos urgentes de la otra sucursal, abre el menú:  
   👉 **`⚙️ Mise ➔ 🔄 Registrar Traspaso entre Tiendas`**.
2. Completa el diálogo táctil seleccionando el producto, la cantidad y la tienda destino.
3. El sistema descuenta la salida en tu inventario, acredita la entrada en la otra tienda y genera un folio inmutable `TRP-YYYYMMDD-HHmmss` en la bitácora central de Bodega.

---

## 2. Manual para el Administrador de Bodega y Picker (Bodega: BDG)

### Paso 1: Gestión de Catálogo y Picking con el Powerhouse
1. Abre tu hoja de **Bodegas**.
2. Ve al menú **`⚙️ Mise ➔ 🛠️ Gestión de Productos ➔ ⚡ Mise Powerhouse`**.
3. En el diálogo interactivo puedes:
   - **🖐️ Orden Picking:** Arrastrar productos para definir la ruta óptima de surtido por anaqueles.
   - **➕ Alta en Lote:** Registrar nuevos insumos sin crear pestañas temporales.
   - **📝 Edición Rápida:** Ajustar nombres, unidades de tienda (`DOMO`, `CAJA`), factores de conversión y mínimos/máximos.
4. Al hacer clic en **Guardar**, el backend propaga atómicamente los cambios a las hojas de tienda en menos de 3 segundos mediante micro-workers paralelos.

### Paso 2: Cargar Inventarios con Soporte de 4 Decimales en KARDEX
1. En las pestañas de **KARDEX**, registra entradas y salidas con precisión de hasta 4 decimales (`0.####`).
2. A las **23:00 hrs**, el activador nocturno autónomo toma las recepciones confirmadas por las tiendas, aplica el factor de conversión (`Domo ➔ Kg`) y descuenta las salidas reales automáticamente.

---

## 3. Resumen de Versiones Época Altair
* **v1.7.4 Altair (Final GAS)**: Conversión de unidades automática (`Domo ➔ Kg`), Traspasos inter-tiendas Mobile-First, surtido numérico libre y cuarentena de menús de riesgo.
* **v1.7.3 Altair**: Optimización Sheets Turbo Sub-Second, erradicación de 858 VLOOKUPs volátiles y corte nocturno seguro a las 23:00 hrs.
* **v1.7.2 Altair**: Blindaje anti-manipulación `setDomainEdit(false)`, motor matemático de alias N-Grams y reconstructores de base de datos en RAM.
* **v1.7.1 Altair**: Arquitectura concurrente multi-worker (`Promise.all`), Batch I/O (<2.5s) y zoom Crystal persistente.
* **v1.7.0 Altair**: Creación del Powerhouse de Bodega (`PickingDialog.html`).
