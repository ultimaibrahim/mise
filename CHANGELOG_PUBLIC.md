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

## Versión 1.7.6s Altair — Inventario que se Explica Solo (Octubre 2026) [EN PRUEBAS]

* 📦 **Encabezado del inventario más claro**: arriba dice de qué bodega es, en qué semana está (con sus fechas) y qué significa cada columna: ENT = entró, SAL = salió, SLD = lo que queda.
* 🧹 Fuera las filas con botones y datos que confundían.

---

## Versión 1.7.6r Altair — Ver lo que Pasa Mientras Pasa (Octubre 2026) [EN PRUEBAS]

* ⏳ **Configurar muestra su avance en vivo**: una ventana lateral va marcando cada paso con ✅ o ❌ y cuánto tardó, sin bloquear la hoja.
* ⚡ **Powerhouse más completo**: también se capturan ahí la unidad en que pide la tienda y su equivalencia en bodega.
* 👥 El dueño puede nombrar **administradores** que también puedan usar Powerhouse y editar todo el Catálogo.

---

## Versión 1.7.6q Altair — El Catálogo Calcula las Equivalencias (Octubre 2026) [EN PRUEBAS]

* ⚖️ **Escribe cómo viene el producto y Mise hace la cuenta**: con la presentación "Domo 454 g", "Caja 100 pz" o "Paquete 50 pz", se llena sola la unidad en que pide la tienda y su equivalencia en bodega. Lo que ya estaba capturado no se toca.
* 📋 El Catálogo muestra la presentación y oculta lo que no hace falta ver.

---

## Versión 1.7.6p Altair — Traspasos desde el Celular y Cada Quien en Su Unidad (Octubre 2026) [EN PRUEBAS]

* 🔄 **Traspasos desde el celular**: en 📥 Registrar entradas, arriba a la izquierda, se elige "Andares → Mercado" o "Mercado → Andares", se escribe cuánto y se envía. Queda registrado con folio en 🔄 Traspasos.
* ⚖️ **Cada quien en su unidad**: las tiendas piden como les es natural (24 domos de fresa, 2 cajas de guantes, 3 paquetes de conos) y Bodega descuenta lo real (10.9 kg, 200 piezas, 150 piezas). En el Catálogo se ve la equivalencia de cada producto.
* 🎨 Los colores de saldo en las tiendas ya comparan en la misma unidad.

---

## Versión 1.7.6o Altair — Bodega Para Todos (Octubre 2026) [EN PRUEBAS]

* 🏷️ **Pestañas que dicen qué hacen**: 📥 Registrar entradas · 📦 Inventario Andares · 📦 Inventario Mercado · 📋 Catálogo · 🔄 Traspasos · 🗄 Semanas pasadas · 🗒 Registro del sistema.
* 📋 **Catálogo fácil desde la tableta**: cada columna dice qué es (por ejemplo "Andares · bodega · mín."), y solo se puede cambiar si un producto está activo y sus mínimos y máximos. Si se escribe algo que no va (letras, negativos, un máximo menor que el mínimo), la hoja lo rechaza y explica por qué.
* ⚡ Lo demás (dar de alta, renombrar, borrar, ordenar) sigue en Mise Powerhouse.

---

## Versión 1.7.6n Altair — Traspasos en un Solo Lugar (Septiembre 2026) [EN PRUEBAS]

* 🔄 **Los traspasos entre Andares y Mercado se registran solo desde Bodega**: la opción de las tiendas se retiró porque no funcionaba bien con las cuentas de tienda ni en el celular.

---

## Versión 1.7.6m Altair — Ventanas Más Robustas (Septiembre 2026) [EN PRUEBAS]

* 🪟 **Productos con comillas o símbolos ya no descomponen las ventanas** de Powerhouse y Traspasos.
* 🧹 Se retiraron piezas internas que ya no se usaban.

---

## Versión 1.7.6l Altair — Reconciliar Sin Riesgo (Septiembre 2026) [EN PRUEBAS]

* 🛡️ **"Reconciliar la semana" ya no borra el pedido del día**: antes podía tomar lo que la tienda estaba capturando y vaciarlo. Ahora solo revisa los días anteriores con lo que ya quedó registrado.
* 📅 **Nada se descuenta en la semana equivocada**: si un Kardex no ha cambiado de semana, Bodega espera en vez de anotar en la columna de otro día.
* 🚚 "Descontar pedidos de ayer" ya no toca el pedido de hoy.

---

## Versión 1.7.6k Altair — Pedido Diario Más Limpio y Cambios de Catálogo Más Rápidos (Septiembre 2026) [EN PRUEBAS]

* 🧹 **Una columna vacía menos en el Pedido Diario**: se retira sola por la noche, con respaldo automático y sin perder lo capturado.
* ⚡ **Guardar cambios de orden o de productos activos es más ligero**: Bodega ya no reescribe el pedido de cada tienda; la tienda lo aplica sola al abrirse.

---

## Versión 1.7.6j Altair — Más Seguro y Más Ligero (Septiembre 2026) [EN PRUEBAS]

* 🔐 **Nueva contraseña de administrador**: la anterior deja de funcionar. La nueva la define solo el dueño de cada libro y se guarda cifrada.
* 🛡️ **Restablecer una tienda ahora respeta el "No"**: antes, cancelar en la confirmación final no evitaba el borrado.
* 🧹 **Menús más limpios**: las herramientas de prueba ya no aparecen en los libros de operación, y se retiraron funciones antiguas que ya no se usaban.
* 🚚 "Descontar pedidos de ayer" ahora sí descuenta los de ayer.

---

## Versión 1.7.6i Altair — Las Tiendas se Ponen al Día Solas con el Catálogo (Septiembre 2026) [EN PRUEBAS]

* 🔔 **Cambios de catálogo que siempre llegan**: si en Bodega se cambia el orden de picking o se desactiva un producto, cada tienda lo aplica sola al abrirse o a medianoche, aunque en ese momento no hubiera conexión.
* 🌐 La página de estado muestra si cada tienda ya tiene el catálogo al día.

---

## Versión 1.7.6h Altair — Página de Estado de Mise (Septiembre 2026) [EN PRUEBAS]

* 🌐 **Todo el sistema de un vistazo**: una página privada, también desde el celular, que muestra en verde, amarillo o rojo cómo están Bodega y las tiendas, cuánto tardó cada cierre nocturno, los avisos de la semana, los productos bajo mínimo y accesos directos a cada hoja.

---

## Versión 1.7.6g Altair — Bodega Sabe si las Tiendas Están al Día (Septiembre 2026) [EN PRUEBAS]

* 🩺 **Estado del sistema**: desde el menú de Bodega se ve en verde, amarillo o rojo si cada tienda está conectada, si corrió su reinicio de medianoche, si el cierre nocturno salió bien y si los Kardex están en la semana correcta.
* 💓 **Sin pasos extra**: las tiendas avisan solas que están bien cada vez que se usan o en sus procesos nocturnos.

---

## Versión 1.7.6f Altair — Descuento Nocturno Más Rápido y a Prueba de Repeticiones (Septiembre 2026) [EN PRUEBAS]

* 🛡️ **Nunca se descuenta dos veces**: si el descuento de la noche se vuelve a correr (reintento automático o botón manual), ya no resta de nuevo lo que ya había restado.
* ⚡ **Cierre nocturno más ágil**: Bodega hace muchas menos consultas al descontar, y el registro técnico ahora muestra cuánto tarda cada paso.

---

## Versión 1.7.6e Altair — Menos Cosas que Estorban (Septiembre 2026) [EN PRUEBAS]

* 🧹 **Se retira la marca de "Adición"**: una función antigua que ya no se usaba; desaparece también la columna "EsAdición" del registro de surtido.
* 🚚 **Cancelar un producto del pedido lo quita del Surtido Rápido**: si se borra la cantidad a pedir, el producto ya no aparece por surtir.
* 🏠 **La portada INICIO se retira** por ahora; la idea se retomará en la futura app móvil.
* Incluye las correcciones de la versión 1.7.5s (colores del Pedido Diario y registro de surtido).

---

## Versión 1.7.6d Altair — Bodega Más Fácil de Leer y de Usar (Septiembre 2026) [EN PRUEBAS]

* 📊 **Kardex más limpio**:  
  Ahora solo se ven el producto, la unidad, el saldo anterior y los días de la semana. El resto de la información sigue ahí, pero ya no estorba ni confunde.
* 🗂️ **Pestañas en orden**:  
  Las hojas quedan ordenadas y con color según su uso: primero lo que se captura, luego lo que se consulta y al final lo del sistema.

---

## Versión 1.7.6c Altair — Archivos Blindados y Recepción que Siempre se Registra (Septiembre 2026) [EN PRUEBAS]

* ✅ **Lo que se marca en Surtido Rápido siempre llega al Pedido Diario**:  
  Se encontró por qué, a veces, la recepción se pintaba en Surtido Rápido pero no quedaba registrada en el Pedido Diario: las cuentas de tienda no tenían permiso para escribir en esas columnas protegidas. Ahora el sistema hace esas anotaciones por su cuenta, sin importar quién marque.
* 🔐 **Hojas internas protegidas y ocultas**:  
  Las hojas técnicas (enlaces, bitácoras, respaldos) ya no se pueden modificar ni borrar por accidente, y las que no se usan en el día a día se ocultan para no confundir. En Entradas solo se pueden escribir las cantidades.
* 🔎 **Revisión de permisos en un clic**:  
  Nuevo `🔐 Auditoría de permisos` que muestra qué está protegido en cada hoja y qué se puede editar.

---

## Versión 1.7.6b Altair — Andares y Mercado, Siempre Iguales por Dentro (Septiembre 2026) [EN PRUEBAS]

* 🧬 **Un solo sistema para las dos tiendas**:  
  Andares y Mercado ahora funcionan con exactamente el mismo sistema interno. Cada mejora o corrección llega a las dos al mismo tiempo y ya no pueden comportarse distinto, como llegó a pasar con el registro de surtido.

---

## Versión 1.7.6a Altair — Entradas Más Seguras y Bodega Más Simple (Septiembre 2026) [EN PRUEBAS]

* 📥 **Cada tienda con su propia semana en Entradas**:  
  Si una tienda tuviera la semana atrasada, la hoja de Entradas ya no registra su mercancía en la semana equivocada: avisa cuál tienda hay que poner al día antes de enviar.
* 🧹 **Se retira el Registro Rápido de PC**:  
  La captura de entradas se hace desde la hoja 📥 ENTRADAS, pensada para el celular. El Registro Rápido se retiró porque podía sobrescribir movimientos ya registrados.

---

## Versión 1.7.5 Altair — Mise Trabaja Sola: Entradas desde el Celular, Semanas que Cambian Solas y Descuento Real (Septiembre 2026) [VERSIÓN OFICIAL]

Reúne 19 mejoras probadas en la operación diaria de Bodega, Andares y Mercado.

* 📥 **Entradas desde el celular**: lo que llega a Bodega se registra en una hoja pensada para el teléfono y se suma solo al Kardex del día elegido.
* 📅 **Las semanas cambian solas**: Andares y Mercado avanzan de semana sin intervención y el aviso de semana siempre está visible.
* 🎯 **Solo se descuenta lo que realmente se recibió**: Surtido Rápido muestra la cantidad final y colores por producto; si no se registró la recepción, no se descuenta nada.
* 🔗 **Las tiendas se actualizan solas por la noche**: los cambios de estructura se aplican con respaldo automático, y configurar un libro nuevo es un solo botón.
* ⚡ **Mise Powerhouse más rápido y preciso**: guardar el catálogo tarda la mitad, y mover o desactivar un producto ya nunca afecta a otro.
* ℹ️ **"Acerca de" dice la verdad**: versión real, estado de la conexión y del último cierre nocturno.

<details>
<summary>Detalle por iteración (1.7.5a – 1.7.5s)</summary>

## Versión 1.7.5s Altair — Colores del Pedido Diario y Registro de Surtido Corregidos (Septiembre 2026) [PROD]

* 🎨 **El Pedido Diario vuelve a pintarse según lo recibido**:  
  Después de la actualización de estructura, algunos estados de recepción se guardaban como un error (#NAME?) y por eso el Pedido Diario se quedaba sin colores. Ya se guardan correctamente.
* 🧾 **Registro de surtido más preciso**:  
  El historial de recepción ya no marca "sin registro" a productos que sí se recibieron; indica si llegaron completos, de menos o de más. El encabezado del registro también se restablece si se había perdido.

---

## Versión 1.7.5r Altair — Mercado Avanza de Semana: Causa Real Encontrada (Septiembre 2026) [PROD]

* 📅 **Se encontró y corrigió la causa real**:  
  El indicador de semana de Andares, al dibujarse, provocaba un error que se manifestaba justo cuando el sistema pasaba a revisar Mercado, y por eso Mercado nunca avanzaba. Ahora cada indicador se dibuja de forma segura y, si algo fallara, no afecta el cambio de semana.

---

## Versión 1.7.5q Altair — El Cambio de Semana Ya No se Puede Trabar (Septiembre 2026) [PROD]

* 📅 **Mercado se destraba por completo**:  
  La marca del historial que bloqueaba el cambio de semana había crecido con cada intento fallido; ahora se limpia completa.
* 🛟 **Red de seguridad**:  
  Si en el futuro el historial semanal tuviera cualquier problema, la semana avanza de todas formas y los movimientos de esa semana se guardan en una hoja de respaldo, sin perder información.

---

## Versión 1.7.5p Altair — Mercado Vuelve a Cambiar de Semana Solo (Septiembre 2026) [PROD]

* 📅 **Se destrabó el cambio de semana de Mercado**:  
  Un guardado de historial que se interrumpió en el pasado había dejado una marca que impedía archivar las semanas de Mercado, por eso siempre había que avanzarla a mano. El sistema ahora detecta y limpia esas marcas por sí solo y la semana avanza normalmente.

---

## Versión 1.7.5o Altair — El Aviso de Semana del Kardex Ahora Sí Aparece (Septiembre 2026) [PROD]

* 🏷️ **Indicador de semana visible**:  
  El aviso en la parte superior de cada Kardex ("🟢 SEMANA XX ACTUALIZADA" o "⏳ PENDIENTE DE AVANZAR") no se mostraba por un error antiguo. Ya aparece a la derecha del título de cada inventario.

---

## Versión 1.7.5n Altair — Andares y Mercado Cambian de Semana Juntos (Septiembre 2026) [PROD]

* 📅 **El Kardex de Mercado ya avanza de semana solo**:  
  Al abrir Bodega, el sistema pone al día los inventarios de ambas tiendas en la misma apertura, sin tener que avanzar Mercado a mano.
* 🏷️ **El aviso de semana dice la verdad**:  
  Si alguna semana todavía no se ha avanzado, el encabezado lo indica como "pendiente" en lugar de mostrarla como actualizada.

---

## Versión 1.7.5m Altair — Las Cantidades del Día se Conservan al Guardar en Powerhouse (Septiembre 2026) [PROD]

* 🛡️ **Guardar cambios en Bodega ya no arriesga el pedido de las tiendas**:  
  Se corrigió el orden interno de la actualización para que, al guardar el catálogo o el orden de picking en Bodega, las cantidades que las tiendas ya capturaron ese día se conserven siempre.

---

## Versión 1.7.5l Altair — Mise Powerhouse Mucho Más Rápido (Septiembre 2026) [PROD]

* ⚡ **Guardar cambios del catálogo ya no tarda minutos**:  
  El Powerhouse solo actualiza lo que realmente cambiaste y actualiza Andares y Mercado al mismo tiempo, en lugar de una después de la otra. Al terminar muestra cuánto tardó cada parte.
* 🖐️ **Renombrar un producto ya no lo mueve de lugar**:  
  Si cambias el nombre de un insumo y su posición en el recorrido, ambas cosas se guardan correctamente en las tiendas.

---

## Versión 1.7.5k Altair — "Acerca de" Muestra el Estado Real del Sistema (Septiembre 2026) [PROD]

* ℹ️ **Versión correcta en pantalla**:  
  `⚙️ Mise ➔ Acerca de` ahora muestra siempre la versión que realmente está instalada (antes mostraba versiones viejas).
* 🩺 **Revisión rápida del sistema**:  
  La misma ventana indica si el archivo está en producción o en pruebas, si las tareas automáticas están activas, con qué archivos está conectado, cuándo fue el último cierre nocturno y qué hay de nuevo en la versión.

---

## Versión 1.7.5j Altair — Cantidades de Recepción Siempre en su Lugar (Septiembre 2026) [PROD]

* 🧾 **La cantidad recibida del primer producto ya no se borra**:  
  Se corrigió un error antiguo por el que, cada vez que alguien abría la hoja de la tienda, se borraba la cantidad recibida del primer producto de la lista. El aviso de "conectar con Bodega" ahora aparece en la barra superior y no dentro de la tabla.
* 🎨 **Colores de recepción consistentes**:  
  Los estados de cada producto (completo, parcial, de más, no llegó) se guardan siempre igual, para que el pedido diario se pinte correctamente.
* 📥 **Hoja de Entradas más clara**:  
  La línea de resultado muestra una instrucción mientras no se ha enviado nada, en lugar de quedar en blanco.

---

## Versión 1.7.5i Altair — Conexiones Más Confiables y Entradas Más Cómodas (Septiembre 2026) [PROD]

* 🔗 **Traspasos y cierre nocturno más confiables**:  
  Las tiendas y Bodega ahora se encuentran entre sí aunque el enlace guardado tenga distintos formatos, lo que evita fallas al registrar traspasos o al descontar el inventario por la noche. Si algo falla, el sistema indica el motivo exacto.
* 👆 **Hoja de Entradas pensada para el dedo**:  
  Filas más altas, nombres de producto más grandes y columnas ajustadas al ancho del celular.

---

## Versión 1.7.5h Altair — Corrección en la Actualización de Tiendas (Septiembre 2026) [PROD]

* 🛠️ **La actualización de las tiendas vuelve a completarse**:  
  Se corrigió un detalle de diseño en los encabezados de Surtido Rápido y de la hoja de Entradas que impedía terminar la actualización. Los pedidos capturados ese día estaban respaldados y se restauraron completos.

---

## Versión 1.7.5g Altair — Configuración en un Clic y Existencias Siempre al Día (Septiembre 2026) [PROD]

* 🚀 **Un solo botón para dejar cada archivo listo**:  
  Nuevo `⚙️ Mise ➔ 🚀 Configurar este libro` en Bodega, Andares y Mercado. Con un clic se programan las tareas automáticas, se actualiza la estructura, se aplica el orden de recorrido y aparece un resumen de lo que quedó listo o de lo que hay que revisar.
* 📦 **Las existencias en tienda ya no se quedan congeladas**:  
  Se corrigió un error por el que, después de guardar el orden de picking en Bodega, las tiendas dejaban de ver los saldos actualizados. Ahora el enlace se mantiene vivo y, si se llegara a romper, el sistema lo repara solo durante la noche.
* ⚡ **Desactivar un producto se refleja al instante en las tiendas**.

---

## Versión 1.7.5f Altair — Orden de Picking y Productos Desactivados, Corregidos (Septiembre 2026) [PROD]

* 🎯 **Desactivar un producto ya apaga ESE producto**:  
  Antes, al desactivar un insumo en Bodega, en las tiendas se marcaba en gris otro producto que estaba en la misma posición. Ahora cada tienda identifica el producto por su nombre, sin importar el orden de la lista.
* 🖐️ **El orden de recorrido personalizado se respeta**:  
  El orden de picking definido en Bodega vuelve a aplicarse correctamente en Andares y Mercado, incluso después de actualizaciones o reparaciones del sistema.
* 🚦 **Semáforo de existencias en el producto correcto**:  
  Los colores de saldo bajo, en rango o excedido ahora corresponden siempre al producto de esa fila.

---

## Versión 1.7.5e Altair — Las Tiendas se Actualizan Solas por la Noche (Septiembre 2026) [PROD]

* 🌙 **Actualizaciones sin interrumpir la operación**:  
  Cuando una mejora requiere cambiar la estructura de las hojas de tienda, el sistema la aplica solo durante la noche, después del cierre del día. Nadie tiene que abrir la hoja ni presionar nada.
* 💾 **Nada se pierde**:  
  Antes de actualizar, el sistema guarda una copia completa de las hojas del día y vuelve a colocar cada cantidad capturada en su producto. Si algo fallara, lo reintenta a la noche siguiente usando la copia original.

---

## Versión 1.7.5d Altair — Solo se Descuenta lo que Realmente se Recibió (Septiembre 2026) [PROD]

* 🛡️ **Adiós a los descuentos fantasma**:  
  Si en la tienda no se registró la recepción de un producto (ni cantidad, ni ✅, ni ❌), el inventario de Bodega ya **no** lo descuenta. Antes se descontaba lo pedido como si hubiera llegado, lo que descuadraba el stock.
* 📥 **La hoja de Entradas aparece sola**:  
  Ya no hay que crearla desde el menú; el sistema la prepara y la mantiene al día con el catálogo cada noche.

---

## Versión 1.7.5c Altair — Surtido Rápido Más Claro: Cantidad Final y Colores por Fila (Septiembre 2026) [PROD]

* 🚚 **Escribe lo que llegó, sin trucos**:  
  En Surtido Rápido se escribe directo la cantidad recibida. Si llegó completo basta marcar ✅, y si no llegó, ❌. Solo cuenta una de las tres opciones por producto, así que ya no hay datos contradictorios.
* 🎯 **Nueva columna CANT. FINAL**:  
  Al final de la tabla aparece la cantidad que el sistema tomará como recibida. Es la misma que usa Bodega para descontar el inventario, así que lo que ves es lo que se descuenta.
* 🎨 **Toda la fila se pinta según lo que llegó**:  
  Verde si llegó exacto, naranja si llegó de menos, azul si llegó de más, rojo si no llegó y amarillo si todavía no se registra. El resumen de la derecha cuenta cuántos productos hay en cada caso.
* 📌 **Producto y cantidad pedida siempre a la vista**:  
  Al deslizar la tabla en el celular, el nombre del producto y lo que se pidió se quedan fijos.

---

## Versión 1.7.5b Altair — Cambio de Semana Automático en Ambas Tiendas (Septiembre 2026) [PROD]

* 📅 **El Kardex de Mercado ya cambia de semana solo**:  
  Se corrigió la causa por la que uno de los inventarios (normalmente Mercado) se quedaba en la semana anterior y había que avanzarlo a mano con la casilla. Ahora el cierre del domingo a las 23:00 avanza Andares y Mercado juntos, y si algo lo impide, el sistema lo deja registrado y lo completa en la siguiente oportunidad sin dejar la semana a medias.

---

## Versión 1.7.5a Altair — Registro de Entradas desde el Celular (Septiembre 2026) [PROD]

* 📥 **Nueva hoja de Entradas para Bodega**:  
  Cuando llega mercancía, ahora se puede registrar desde el celular en una sola lista: cada producto con su unidad y dos columnas, una para **Andares** y otra para **Mercado**. Se escribe la cantidad, se marca la casilla **Enviar ➜** y el inventario de ambas tiendas se actualiza al instante, sin buscar filas ni días en el Kardex.
* 📅 **Día automático con opción de corregir**:  
  Por default se registra en el día de hoy. Si una entrega se quedó sin capturar, se puede elegir otro día de la semana antes de enviar.
* 🛡️ **Sin errores a medias**:  
  Si alguna cantidad está mal escrita, se marca en rojo y no se envía nada hasta corregirla. Las entregas múltiples del mismo día se suman, nunca se sobrescriben.

</details>

---

## Versión 1.7.4 Altair — Conversión de Unidades Automática, Traspasos entre Tiendas y Recepción Numérica Libre (Septiembre 2026) [VERSIÓN FINAL GAS]

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
* ⚡ **Escritura Instantánea sin Lag y Doble Seguridad de Descuento**:  
  Al capturar o agregar insumos de último minuto, la aplicación ya no sufre retrasos ni congelamientos: el sistema actualiza directamente la celda en milisegundos. Asimismo, se incorporó un seguro inteligente en Bodega: si por fallas de señal en tienda la celda numérica tardó en sincronizarse pero el botón `✅ Llegó Completo` quedó marcado, el inventario descuenta automáticamente lo pedido sin descuadrar jamás las existencias.

---

## Versión 1.7.3 Altair — Fluidez Móvil Inmediata, Blindaje Nocturno y Cero Congelamientos (Septiembre 2026)

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

## Versión 1.7.2 Altair — Blindaje de Seguridad Integral, Motor Matemático de Alias & Reconstrucción Resiliente (Agosto 2026)
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

