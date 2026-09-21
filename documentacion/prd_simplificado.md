# PRD Simplificado / Ejecutivo
**Suite MISE v1.7.4 Altair (Versión Final Apps Script) — Atelier · La Crêpe Parisienne**

---

## 1. Resumen de Negocio
La suite **MISE v1.7.4 Altair** digitaliza por completo el control de inventario de insumos en bodega, automatiza la generación de pedidos diarios en unidades de mostrador para las sucursales de La Crêpe Parisienne (Andares y Mercado) y permite la transferencia directa de insumos entre tiendas mediante traspasos P2P. MISE optimiza el proceso reduciendo las diferencias entre lo pedido y lo entregado, garantizando que el personal de mostrador capture en unidades intuitivas (Domo, Caja, Paq) mientras Bodega deduce automáticamente la masa neta en kilogramos en el Kardex.

---

## 2. Historias de Usuario
* **Como Supervisor de Tienda:** Quiero capturar mi pedido diario en unidades físicas de mostrador (ej. 12 domos de fresa) sin tener que calcular mentalmente conversiones a kilogramos.
* **Como Supervisor de Tienda:** Quiero poder registrar préstamos o traspasos urgentes de producto hacia la otra sucursal en 3 toques desde mi celular con folio digital inmutable.
* **Como Bodeguero (Surtidor):** Quiero registrar la recepción física en `🚚 SURTIDO RÁPIDO` escribiendo libremente cantidades parciales o tocando `✅ Llegó Completo` / `❌ Inexistente` con respuesta visual instantánea sin congelamientos en la app móvil.
* **Como Administrador de Bodega:** Quiero organizar la ruta de picking por arrastre visual en el Powerhouse y que el nuevo orden se propague automáticamente a las tiendas en menos de 3 segundos sin desfasar inventarios.
* **Como Dirección / Supervisión:** Quiero que el inventario se descuente de forma segura y autónoma a las 23:00 hrs aplicando factores de conversión precisos a 4 decimales (`0.####`).

---

## 3. Diagrama de Flujo de Datos

```
[Administrador de Bodega]
   │ (Edita catálogo, unidades y orden de picking en Powerhouse)
   ▼
[Bodega: Hoja MAESTRO] ───► [Vistas Móviles BA/BM] 
                                  │
                                  ├─► (IMPORTRANGE automático)
                                  ▼
                            [Hojas _SYNC en Pedidos]
                                  │
                                  ├─► (Sincronización en Tiendas)
                                  ▼
                            [📋 PEDIDO DIARIO (Visible)]
                                  │
                                  ├─► [🚚 SURTIDO RÁPIDO] (Captura Numérica Libre)
                                  ▼
                            [🔄 TRASPASOS P2P (Andares ⇄ Mercado)]
```
