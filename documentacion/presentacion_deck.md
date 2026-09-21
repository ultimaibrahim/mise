# Presentación de Producto — Suite MISE v1.7.4 Altair
<!-- slide -->
<!--
theme: gaia
_class: lead
paginate: true
backgroundColor: #2a3f32
color: #F5EFE6
-->

# MISE v1.7.4 Altair
### Control de Inventarios, Picking y Pedidos Inteligentes
**Suite ATELIER — La Crêpe Parisienne**

*Versión Final de Producción GAS*
*El sistema unificado de control de existencias, conversión de unidades, picking por arrastre y traspasos entre sucursales.*

*Diseñado para: Surtidores, Encargados de Tienda y Coordinador Regional (Oliver)*

---

<!-- slide -->
<!--
_class: normal
backgroundColor: #F5EFE6
color: #1A1A1A
-->

## 1. Evolución de la Operación Diaria (Antes vs Después)

* **Inexistencia de Controles Previos (Antes):**
  * **Desorden de información:** El control de pedidos se gestionaba en hojas de papel sueltas o mediante mensajes de chat desestructurados que se traspapelaban continuamente.
  * **Falta de visibilidad de existencias:** Las tiendas solicitaban insumos descontinuados debido a la falta de comunicación sobre el stock real disponible en la bodega.
  * **Bloqueos en el sistema:** El procesamiento individual de datos de inventario provocaba que las hojas de cálculo compartidas se congelaran por tiempos prolongados.

* **Operación con MISE v1.0 (Ahora):**
  * **Integración Directa:** Las solicitudes de insumos ingresadas en las tiendas se reflejan inmediatamente en la pantalla de la bodega en tiempo real.
  * **Catálogo Unificado:** Si un producto se marca como inactivo en la bodega, desaparece de la vista operativa de las tiendas para evitar pedidos incorrectos.
  * **Procesamiento Eficiente:** El sistema registra y actualiza los movimientos de forma instantánea en menos de un segundo, eliminando esperas y bloqueos.

---

<!-- slide -->
<!--
_class: normal
backgroundColor: #F5EFE6
color: #1A1A1A
-->

## 2. Encargados de Tienda: Gestión de Pedidos en Sucursales

* **1. Registro de cantidades:** El encargado ingresa los insumos requeridos. Automáticamente, las celdas se colorean de amarillo indicando un estado pendiente.
* **2. Ordenamiento de recorrido físico:** Con un solo botón, el pedido se organiza automáticamente siguiendo la disposición física de los pasillos de almacenamiento en bodega para optimizar tiempos.
* **3. Identificación de requerimientos tardíos:** Si se realiza un pedido de última hora después del ordenamiento, el sistema lo etiqueta como una adición prioritaria en color naranja para el surtidor.

---

<!-- slide -->
<!--
_class: normal
backgroundColor: #F5EFE6
color: #1A1A1A
-->

## 3. Surtidores/Bodegueros: Abastecimiento y Control de Inventario

* **1. Registro de Movimientos Semanales:** Control dinámico de entradas y salidas de insumos en bodega, permitiendo el cálculo automatizado de existencias sin necesidad de conteos manuales diarios.
* **2. Control Masivo de Estado de Productos:** Desactivación de insumos descontinuados o agotados mediante casillas de selección. Los productos desactivados se ocultan inmediatamente de las vistas de pedido de las tiendas.
* **3. Edición Masiva de Catálogo:** Modificación simultánea de nombres, presentaciones y niveles de stock mínimo/máximo en una pantalla de edición temporal de procesamiento ultrarrápido.

---

<!-- slide -->
<!--
_class: normal
backgroundColor: #F5EFE6
color: #1A1A1A
-->

## 4. Coordinador (Oliver): Coordinación Regional y Auditoría

* **1. Semáforo Consolidado de Caducidades:** Visualización centralizada de fechas de vencimiento en todas las bodegas, priorizando mediante alertas de color aquellos insumos con vencimiento más cercano.
* **2. Respaldos Históricos Semanales:** El sistema genera copias de seguridad automáticas de los inventarios semanales concluidos, facilitando auditorías históricas y análisis de consumos.
* **3. Control de Acceso Simultáneo:** Mecanismo de seguridad de bloqueos que impide la sobreescritura de datos o conflictos de edición cuando múltiples usuarios operan las hojas al mismo tiempo.

---

<!-- slide -->
<!--
_class: normal
backgroundColor: #2a3f32
color: #F5EFE6
-->

## 5. Mecanismos Operativos Explicados

* **Operación en un Solo Paso:**
  * *Lógica Tradicional:* Realizar consultas individuales consecutivas a la hoja de cálculo por cada producto (equivalente a ir a buscar 100 artículos a una bodega de uno en uno, lo que saturaba el sistema y trababa la pantalla).
  * *Lógica MISE v1.0:* Consolidar toda la lista en memoria, procesar los cambios en una sola operación y escribir los resultados de golpe, reduciendo los tiempos de carga a menos de un segundo.

* **Sincronización de Stock:**
  * *Lógica Tradicional:* Depender de los tiempos de sincronización variables de las hojas compartidas, lo que generaba desfases de inventario de hasta 30 minutos.
  * *Lógica MISE v1.0:* El botón de Sincronización establece una llamada forzada al servidor para descargar al instante el stock real de la bodega y actualizar las pantallas del personal.

---

<!-- slide -->
<!--
_class: lead
backgroundColor: #2a3f32
color: #F5EFE6
-->

## ¡Comencemos la Nueva Era Operativa!

*El sistema v1.0 está activo y listo para usarse en las computadoras y celulares de las tiendas y de la bodega.*

**Suite ATELIER — La Crêpe Parisienne**
*Eficiencia · Control · Velocidad*
