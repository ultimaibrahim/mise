# 🌟 Changelog Público y Operativo — MISE Platform
**La Crêpe Parisienne · Grupo MYT**  
**Arquitecto de Producto**: Ibrahim García (`ultimaibrahim`)

Este documento contiene el historial de actualizaciones y mejoras de la plataforma **MISE**, redactado en **lenguaje ejecutivo y de beneficio operativo**, libre de tecnicismos.

---

## Versión 2.0.0-alpha Atlas — El Salto a MISE 2.0: Pedidos en 3 Toques, Despacho Consolidado y Recepción Ciega (Septiembre 2026) [PREVIEW OPERATIVO]

* 📱 **Pedidos en 3 Toques desde el Teléfono Móvil**:  
  Nueva interfaz ultrarrápida diseñada específicamente para los encargados de tienda en Andares y Mercado. Ahora pueden seleccionar insumos mediante tarjetas táctiles de alta definición, filtrar por categorías (Abarrotes, Lácteos, Perecederos) y ajustar cantidades con botones más y menos en segundos, sin pelearse con cuadrículas pequeñas ni teclados incómodos.
* 📦 **Floating Dock (Totalizador en Tiempo Real)**:  
  Barra flotante inferior que resume al instante cuántos insumos se están pidiendo y permite enviar el pedido diario a Bodega Central con un solo toque.
* 🚚 **Recepción a Ciegas (*Blind Receiving* - Cero Fraude y Cero Errores)**:  
  Al llegar la camioneta de reparto a la sucursal, el personal cuenta físicamente los insumos recibidos sin ver la cantidad que se había pedido. Con dos botones claros (`✅ Llegó Completo` o `❌ Inexistente`), se garantiza que nadie firme de recibido por inercia o sin verificar el producto físico.
* 🏭 **Matriz de Despacho Consolidado para Bodega Central**:  
  El equipo de almacén ya no tiene que alternar entre dos pantallas diferentes para preparar pedidos. La nueva matriz consolida los pedidos de Andares y Mercado en una sola tabla de recolección: muestra lo que requiere cada tienda y calcula el lote total combinado para que el bodeguero baje el producto de los anaqueles en un único recorrido.
* 🔒 **Libro Mayor Inmutable (Cero Pérdida de Información)**:  
  Cada movimiento, entrega y salida queda registrado con un folio digital único e inalterable, garantizando que los datos históricos jamás se sobreescriban ni se borren por error humano.
* 🔄 **Conexión Transparente con Hojas de Cálculo (Sheets Mirror)**:  
  La nueva aplicación web convive pacíficamente con los archivos de Google Sheets actuales, actualizando la información de ida y vuelta en milisegundos para que la transición operativa sea completamente fluida y sin fricción.

---

## Versión 1.10.0 Altair — Conversión de Unidades Automática, Traspasos entre Tiendas y Recepción Numérica Libre (Septiembre 2026) [ACTUAL EN PRODUCCIÓN GAS]

* 🍓 **Fin a los Cálculos Mentales (Conversión Automática de Domos y Cajas)**:  
  Se implementó el sistema de equivalencias automáticas entre tiendas y almacén. En sucursal, el encargado pide en su unidad física habitual (*12 domos de fresa*, *2 cajas de guantes*). Bodega Central descuenta automáticamente los kilos y piezas exactas en el Kardex (`12 domos = 5.448 kg`, `2 cajas = 200 piezas`), eliminando para siempre las discrepancias de inventario y los errores de cálculo mental en el mostrador.
* 🔄 **Módulo Rápido de Traspasos Inter-Tiendas (Andares ⇄ Mercado)**:  
  Nuevo menú táctil en las hojas de tienda:  
  👉 **`⚙️ Mise ➔ 🔄 Registrar Traspaso entre Tiendas`**.  
  Permite a los encargados registrar préstamos o traspasos urgentes de producto entre sucursales en 3 toques desde su celular. El sistema actualiza en tiempo real la salida en la tienda que entrega, la entrada en la tienda que recibe y genera un folio único en la bitácora central de Bodega para que supervisión tenga visibilidad total.
* 🚚 **Surtido Rápido con Captura Numérica Libre y Cero Fórmulas**:  
  Se eliminaron las fórmulas incrustadas en la columna de cantidad recibida. Ahora el personal de reparto y los encargados pueden escribir libremente cualquier cantidad parcial o custom sin que el sistema bloquee la edición ni sobreescriba fórmulas rotas. Los botones `✅ Llegó Completo` y `❌ Inexistente` ahora funcionan como interruptores táctiles instantáneos.
* 🛡️ **Claridad de Unidades en Celular y Blindaje contra Clics Accidentales**:  
  La columna de **UNIDAD** (Domo, Caja, Pieza, Kg) ahora permanece siempre visible en la vista móvil de tiendas junto al producto, eliminando confusiones al capturar el pedido. Asimismo, todos los botones de reseteo, simulación y mantenimiento crítico se aislaron dentro de un submenú restringido de seguridad, protegiendo la operación contra clics accidentales desde computadoras de mostrador.

---

## Versión 1.9.0 Altair — Fluidez Móvil Inmediata, Blindaje Nocturno y Cero Congelamientos (Septiembre 2026)

* ⚡ **Eliminación Total del Congelamiento en Celulares (Andares y Mercado)**:  
  Se reestructuró por completo el motor de colores e indicadores visuales de la hoja `📋 PEDIDO DIARIO`. Se eliminaron cientos de cálculos ocultos que sobrecargaban la aplicación de Google Sheets en iPhone y Android. Ahora, al tocar una celda o escribir una cantidad, la pantalla responde al instante y sin retrasos.
* ⏰ **Corte Nocturno Seguro a las 23:00 hrs**:  
  Los procesos automáticos de fin de día se movieron de la madrugada (00:00 / 01:00 AM) a las **23:00 hrs del mismo día**. Esto asegura que las salidas y pedidos de las tiendas queden formalmente descontados antes de la medianoche, impidiendo que los pedidos del día se borren misteriosamente al cambiar la fecha.
* 🛠️ **Botón de Reconciliación Inmediata de Salidas en Bodega General**:  
  Se incorporó una nueva herramienta en el menú de Bodega:  
  👉 **`⚙️ Mise ➔ 🧪 Automatizaciones Autónomas ➔ ⚡ Reconciliar directamente salidas del Lunes 07 de Septiembre`**.  
  Permite al responsable de bodega recuperar con un solo clic los 49 insumos de Andares y 2 de Mercado del lunes 07 de septiembre, asegurando que la Semana 37 quede perfectamente cuadrada y cuadrada con el inventario físico.
* 📊 **Cálculo Instantáneo de Faltantes y Diferencias**:  
  La columna de Diferencia ahora compara directamente lo recibido contra lo pedido sin demoras ni errores `#REF!`, permitiendo a gerencia identificar faltantes en cuanto llega el camión.
* 🛡️ **Blindaje de Plantillas de Recuperación**:  
  Se eliminaron errores al generar reportes semanales con celdas combinadas, asegurando reportes limpios y listos para revisión directiva.

---

## Versión 1.8.0 Altair - Blindaje de Seguridad Integral, Motor Matemático de Alias & Reconstrucción Resiliente (Agosto 2026)
* 🔒 **Blindaje de Seguridad Integral y Bloqueo Anti-Manipulación**:
  * **Bodega General**: Las hojas `MAESTRO`, `KARDEX_BA` y `KARDEX_BM` quedan 100% blindadas contra modificaciones accidentales, alteraciones de nombres o borrado de fórmulas de inventario (`SLD`). Los encargados pueden interactuar fluidamente con los checkboxes y capturar en Entrada (`ENT`) y Salida (`SAL`).
  * **Tiendas Andares & Mercado (`PDA` / `PDM`)**:
    * En `📋 PEDIDO DIARIO`, la cuadrícula completa está bloqueada a prueba de fallos táctiles: **únicamente quedan editables la casilla táctil `F2` (Surtido Rápido) y la columna `CANT. A PEDIR` (Col F)**.
    * En `🚚 SURTIDO RÁPIDO`, las descripciones y cantidades pedidas están blindadas: **únicamente se permite capturar en `CANT. RECIBIDA` (Col E) y marcar las casillas `✅ COMPLETO` / `❌ INEXISTENTE` (Cols F y G)**.
* 🧠 **Motor Inteligente de Reconciliación & Diccionario de Aprendizaje (`MiseMatchingEngine`)**:
  * Reconocimiento automático de variaciones de insumos con empaques, abreviaciones y gramajes (`Jam. Pavo Lala .450`, `Pepperoni 1 kg`, `Fresa .454`), fusionándolos de forma transparente con el producto oficial en el catálogo sin requerir listas fijas ni diccionarios manuales.
  * Los casos ambiguos o insumos desconocidos se desvían de manera segura a la hoja `⚠️ REVISIÓN_HUÉRFANOS` sin alterar saldos ni inventarios.
* 🖥️ **Reconciliador Asistido Visual (Modal HTML)**:
  * Nueva ventana interactiva (`⚙️ Mise > 📊 Mantenimiento y Blindaje > 🧠 Reconciliador Inteligente de Huérfanos`) para que el administrador revise insumos dudosos con su porcentaje de similitud y los vincule al producto oficial en un solo clic, guardándolos en el diccionario permanente de por vida.
* 🏗️ **Reconstructores Resilientes con Respaldo en Memoria RAM**:
  * Funciones de auto-recuperación (`🏗️ Reconstruir KARDEX Andares/Mercado` y `🏗️ Reconstruir MAESTRO`) que respaldan todos los movimientos y saldos en la memoria interna, eliminan columnas corruptas o duplicadas y redibujan la cuadrícula limpia restaurando todos los datos intactos.
* 🌙 **Idempotencia y Sincronización Nocturna Segura (SmartSync)**:
  * Descuento nocturno autónomo protegido contra dobles cobros mediante registro transaccional único y corrección del desfase de medianoche (a la 01:00 AM procesa de forma exacta las entregas del día anterior).

---

## Versión 1.7.3 Altair - Guardado Multi-Hilo Concurrente (Agosto 2026)
* ⚡ **Procesamiento Multi-Hilo en Paralelo**: El Powerhouse ahora distribuye el guardado entre múltiples procesos independientes de forma simultánea (guardado de catálogo, sincronización de inventarios y actualización de tiendas en paralelo), reduciendo drásticamente el tiempo de espera a solo unos segundos.
* 🛡️ **Protección y Estabilidad Mejoradas**: Bloqueos de datos ultra-cortos para evitar pantallas congeladas o colisiones cuando varios administradores usan el sistema.

---

## Versión 1.7.2a Altair - Interfaz Despejada y Escala de Zoom Optimizada (Agosto 2026)
* 🔍 **Selector de Tamaño y Zoom Visible**: La lupa y el selector de zoom ahora son completamente visibles en la barra superior con el tamaño **115% (Normal)** activado por defecto para una lectura mucho más cómoda y clara, ofreciendo opciones hasta 145% para pantallas de alta resolución.
* 🧹 **Cabecera Limpia y Espaciosa**: Se retiró el título duplicado de la ventana web para darle todo el espacio a las pestañas y controles de trabajo, evitando saturación visual.

---

## Versión 1.7.2 Altair - Guardado Ultrarrápido de Catálogo y Experiencia Visual Mejorada (Agosto 2026)
* ⚡ **Guardado Instantáneo del Catálogo**: El proceso de guardado y aplicación de cambios en el Powerhouse se optimizó drásticamente, pasando de más de 1 minuto a solo **2 segundos**, actualizando inventarios y tiendas en un abrir y cerrar de ojos.
* 🧹 **Limpieza Automática de Altas**: Al dar de alta insumos y guardar, la tabla se vacía automáticamente para que tengas un espacio limpio y no re-agregues productos por error.
* 📁 **Agrupación Inteligente por Categoría**: Los nuevos insumos se ordenan y ubican automáticamente dentro de su familia correspondiente en el catálogo de bodega (ej. lácteos con lácteos, abarrotes con abarrotes) sin alterar su ruta de picking en las tiendas.
* 🎨 **Detalles Visuales Cristalinos**:
  * Cajas numéricas más legibles y limpias sin flechas que tapen los dígitos.
  * Pestañas de navegación con iconos y textos perfectamente alineados de forma horizontal.
  * Separación clara de avisos para una interfaz más cómoda y espaciosa.

---

## Versión 1.7.1 Altair - Sincronización Integral de Catálogo y Stock de Quiosco (Agosto 2026)
* ⚡ **Reflejo Inmediato de Nuevos Productos en Tiendas**: Al dar de alta un producto nuevo desde el Powerhouse, la lista de pedidos en las tiendas (Andares y Mercado) se expande automáticamente en tiempo real sin requerir acciones manuales ni reiniciar la hoja.
* 🎯 **Control de Mínimos y Máximos de Quiosco**: Ahora es posible definir y modificar los límites de stock de quiosco tanto en el Alta en Lote como en la Edición Rápida del Powerhouse.
* 🎨 **Mejoras Visuales y de Navegación**:
  * Botones de vista (Lista / Categorías) con sombreado claro para identificar la pestaña seleccionada de un vistazo.
  * Botones de salto simplificados a **Inicio** y **Fondo** en español neutro y sin emojis.
  * Animación de guardado limpia y libre de cursores de texto.
* ⏰ **Programación Nocturna en 1-Clic**: Botón en herramientas experimentales para activar el reseteo automático de medianoche (00:00 AM) y el descuento de inventario (01:00 AM) sin necesidad de configurar activadores técnicos a mano.

---

## Versión 1.7.0 Altair - Suite Unificada Powerhouse de Catálogo y Picking (Agosto 2026)
* ⚡ **Centro de Mando Powerhouse**: Nueva ventana integral para administrar todos los insumos de bodega en un solo lugar.
  * 🖐️ **Secuencia de Picking**: Reordena rutas de surtido por arrastre o número directo.
  * ➕ **Alta en Lote Sin Hojas Temporales**: Agrega insumos nuevos al catálogo directamente desde una tabla dinámica sin crear pestañas extras que ensucien el archivo.
  * 📝 **Edición Rápida en Caliente**: Modifica nombres, unidades y límites de stock (mínimos y máximos por tienda) de forma inmediata.
  * 🧹 **Detector de Duplicados**: Identifica productos repetidos al instante para mantener un catálogo limpio y confiable.
* 🧪 **Herramientas Experimentales**: Reorganización de menús para separar las funciones operativas de las herramientas de prueba.

---

## Versión 1.6.4 Altair - Descuento Ultrarrápido de Hoy y Auto-Acomodo de Picking Remoto (Agosto 2026)
* 🚚 **Descuento de Inventario Instantáneo**: El proceso de surtido y descuento de mercancía ahora procesa exclusivamente el día en curso en menos de 1 segundo, asegurando que entregas múltiples del mismo producto se sumen de forma íntegra y evitando alterar días pasados.
* 🖐️ **Reacomodo de Picking 100% Automático en Tiendas**: Al modificar y guardar el orden de picking desde la ventana de bodega, la lista de pedidos en las tiendas (Andares y Mercado) se reordena físicamente al instante, manteniendo sus colores y formatos intactos sin necesidad de que el personal de tienda ejecute ninguna acción manual.

---

## Versión 1.6.2 Altair - Auto-Avance Semanal Silencioso y Modal PC (Agosto 2026)
* ⚡ **Registro Rápido desde PC**: Ventana modal (`Ctrl + Shift + F` o desde el menú `⚡ Registro rápido`) con buscador autocomplete instantáneo para capturar Entradas (+) y Salidas (-) sin hacer scroll por 130+ filas.
* 📅 **Auto-Avance de Semana**: El sistema detecta automáticamente los lunes y avanza la semana operativa transprimiendo los saldos y archivando los consumos sin ventanas emergentes.
* 🟢 **Badge de Estado**: Indicador visual en tiempo real en la cabecera del inventario (`🟢 SEMANA XX ACTUALIZADA`).

---

## Versión 1.5.0 Altair - Quiosco de Picking & Categorías Dinámicas (Agosto 2026)
* 🛡️ **Restauración de Sistema**: Se restauró la versión 1.5.0 estable original del código de Bodega para asegurar la operabilidad 100% libre de errores.

---

## Versión 1.6.3c Altair Hotfix - Corrección en Diagnóstico de Inventario (Agosto 2026)
* 🛠️ **Diagnóstico Definitivo Sin Interrupciones**: Corrección en la reordenación del inventario para procesar la lista sin colisionar con las columnas de caducidad eliminadas.

---

## Versión 1.6.3b Altair Hotfix - Permisividad Global de Categorías (Agosto 2026)
* 🛠️ **Diagnóstico y Carga Masiva Sin Interrupciones**: Homologación en el sistema para permitir cualquier nombre de categoría personalizada en diagnósticos, ediciones masivas y alta de productos.

---

## Versión 1.6.3a Altair Hotfix - Estabilidad en Diagnóstico de Inventario (Agosto 2026)
* 🩺 **Diagnóstico Sin Errores**: Corrección en la herramienta de autorreparación para validar correctamente categorías personalizadas sin mostrar pantallas de interrupción.

---

## Versión 1.6.3 Altair - Eliminación Definitiva de Columnas Obsoletas (Agosto 2026)
* 🧹 **Diseño de Inventario Más Limpio y Compacto**: Eliminación física permanente de las columnas de Caducidad y Lote en las hojas de inventario de Bodega (`KARDEX`), permitiendo que el semáforo visual de stock quede pegado inmediatamente al nombre y unidad del producto sin huecos horizontales.

---

## Versión 1.6.2b Altair Hotfix - Restauración de Cuadrícula en Bodega (Agosto 2026)
* 📐 **Restauración Visual de Cuadrícula**: Se forzó la des-ocultación automática de las columnas F y G en las hojas de inventario al abrir la hoja (`onOpen`), eliminando el corte extraño de bordes en el KARDEX.

---

## Versión 1.6.2a Altair Hotfix - Corrección Visual de Badge e Inserción Automática (Agosto 2026)
* 🟢 **Corrección del Badge de Estado**: Ajuste visual en la Fila 2 para desplegar de forma inmediata el estado de la semana activa (`SEMANA ACTUALIZADA`) sin depender del botón de mantenimiento manual.
* ⚡ **Ejecución al Abrir**: El estado de la semana se verifica e inyecta automáticamente al abrir el archivo (`onOpen`).

---

## Versión 1.6.1 Altair - Rendimiento y Optimización Mobile-First (Agosto 2026)
* 🚀 **Captura de Pedidos Más Rápida**: Se eliminaron procesos secundarios al tipear, logrando una experiencia más fluida en dispositivos móviles.
* 🔄 **Reconexión Automática Transparente**: El sistema detecta y repara automáticamente cualquier interrupción de enlace entre Tienda y Bodega en segundo plano, sin mostrar mensajes ni interrumpir tu trabajo.
* 🛡️ **Protección en Surtido Rápido**: Se añadió un mecanismo de respaldo para garantizar que tus datos se guarden de forma segura y el sistema se recupere automáticamente ante cualquier caída de señal.

---

## Versión 1.6.0 Altair - Quiosco de Picking y Sincronización Remota (Agosto 2026)
* 📋 **Organizador Visual de Recorrido (Quiosco)**: Nueva herramienta interactiva en Bodega para ordenar visualmente el recorrido físico de surtido mediante arrastrar y soltar, vistas por categorías y niveles de zoom ajustables.
* 🏷️ **Gestión de Categorías Globales**: Capacidad para crear, renombrar y reorganizar categorías de productos desde Bodega con actualización inmediata para todas las tiendas.
* 📦 **Control de Stock de Quiosco**: Vinculación de límites mínimos y máximos de inventario para reflejar automáticamente los parámetros operativos en los libros de las sucursales.
* ⚡ **Sincronización Remota Automática**: Al guardar el orden en Bodega, las hojas móviles de las tiendas reordenan automáticamente sus listas en tiempo real.

---

## Versión 1.4.0 Altair - Secuencia de Recorrido Dinámica (Agosto 2026)
* 📍 **Recorrido Personalizado por Tienda**: Integración de la secuencia de picking para organizar los productos respetando el trayecto físico de cada establecimiento.

---

## Versión 1.3.8 Altair - Motor Autorreparador y Navegación (Agosto 2026)
* 🛠️ **Diagnóstico y Reparación Un clic**: Herramienta de auto-diagnóstico en Bodega que detecta y corrige automáticamente errores en celdas o fórmulas sin afectar los datos capturados.
* 🗂️ **Menú de Administración Reorganizado**: Nueva distribución del menú principal agrupada por tipo de operación para facilitar la navegación.

---

## Versión 1.3.0 - Versión 1.3.7 Altair - Optimización de Velocidad y Datos (Agosto 2026)
* ⚡ **Velocidad y Respuesta**: Procesamiento optimizado de pedidos masivos en bloque para evitar demoras al abrir y guardar archivos de tienda.
* 🔒 **Seguridad y Respaldo de Información**: Protección de celdas con fórmulas clave y respaldo automático de cantidades ante reconstrucciones de hoja.

