# Plan de Estudio y Ruta de Aprendizaje
**Suite MISE · Época Altair (v1.7.4 Final) — Atelier · La Crêpe Parisienne**
*(Basado en la evolución arquitectónica de Google Apps Script V8 y Batch 2D)*

Para aprender a construir soluciones empresariales como la Suite MISE, se requiere dominar tres pilares fundamentales: **JavaScript Moderno**, **Desarrollo en Google Apps Script (APIs de Sheets, Drive, Gmail)**, y **Arquitectura de Base de Datos y Optimización en Lote**.

A continuación, se detalla un catálogo estructurado de cursos que forman parte del catálogo de **Coursera Plus** (que tienen certificación verificada para portfolio o LinkedIn) y recursos gratuitos de alta calidad.

---

## Pilar 1: JavaScript Moderno (El motor detrás de Apps Script)
Apps Script está basado en JavaScript (motor V8). No puedes escribir Apps Script eficiente sin bases sólidas de programación en JS.

### 1. Programming with JavaScript (Por Meta)
* **Plataforma:** Coursera (Incluido en Coursera Plus).
* **Enlace:** [Meta Programming with JavaScript](https://www.coursera.org/learn/programming-with-javascript)
* **Por qué tomarlo:** Te enseñará la sintaxis moderna de JavaScript (ES6+), cómo funcionan los arreglos (arrays), los objetos de datos y la programación funcional (map, filter, reduce), clave absoluta en Apps Script para manipular matrices bidimensionales.
* **Certificación:** Certificado profesional de Meta de desarrollador front-end (compartible en LinkedIn).

### 2. JavaScript Algorithms and Data Structures (Por FreeCodeCamp)
* **Plataforma:** FreeCodeCamp (Gratuito).
* **Enlace:** [freecodecamp.org](https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures-v8/)
* **Por qué tomarlo:** Ideal para aprender a estructurar lógica de ordenamiento, agrupamiento, algoritmos de búsqueda y manipulación de datos en memoria (como las funciones de visibilidad y filtros de inactivos).
* **Certificación:** Certificado oficial gratuito verificable de FreeCodeCamp.

---

## Pilar 2: Google Apps Script y Automatización en Sheets
Apps Script extiende JavaScript con clases exclusivas de Google Workspace.

### 3. Google Workspace Scripting with Google Apps Script (Por Google Cloud)
* **Plataforma:** Coursera (Incluido en Coursera Plus).
* **Enlace:** [Google Workspace Scripting](https://www.coursera.org/learn/google-workspace-scripting-apps-script)
* **Por qué tomarlo:** El único curso oficial dictado directamente por ingenieros de Google. Cubre la creación de menús personalizados, disparadores automáticos (`onEdit`, `onOpen`), y la manipulación completa de hojas de cálculo a través de la clase `SpreadsheetApp`.
* **Certificación:** Certificado Verificado de Google Cloud.

### 4. Canal de Aprendizaje de Ben Collins (Referente de Sheets & Apps Script)
* **Plataforma:** Blog & Cursos Gratuitos.
* **Enlace:** [benlcollins.com](https://www.benlcollins.com/)
* **Por qué tomarlo:** Ben Collins es el referente global número uno en Sheets. Sus guías avanzadas explican trucos específicos de optimización, llamadas personalizadas a APIs e interconexión remota de libros (rompiendo caché de IMPORTRANGE).

---

## Pilar 3: Arquitectura y Optimización en Lote (Batch 2D y APIs)
Para evitar que tus planillas tengan lag, requieres conocer buenas prácticas de diseño de backend y transacciones.

### 5. Server-side Development with NodeJS, Express and MongoDB (Por HKUST University)
* **Plataforma:** Coursera (Incluido en Coursera Plus).
* **Enlace:** [Server-side Development with NodeJS](https://www.coursera.org/learn/server-side-nodejs-express-mongodb)
* **Por qué tomarlo:** Aunque NodeJS corre en servidores externos, comparte la lógica asíncrona de JavaScript. Este curso te enseñará la lógica transaccional de lectura y escritura en lote, así como el control de bloqueos de bases de datos (`LockService` en Apps Script) y las interconexiones seguras.
* **Certificación:** Certificado Verificado de HKUST University.

### 6. Guía de Referencia Obligatoria: Apps Script Best Practices (Google Developers)
* **Plataforma:** Documentación técnica oficial de Google.
* **Enlace:** [Google Developer Apps Script Best Practices](https://developers.google.com/apps-script/guides/support/best-practices)
* **Por qué leerlo:** Explica a fondo por qué usar `getValues` y `setValues` (Batch 2D) en lugar de llamadas individuales por celda y cómo manejar eficientemente llamadas externas.

---

## Ruta Sugerida de Aprendizaje para tu Portfolio
1. Completa el curso de **Meta JavaScript** en Coursera para entender la manipulación de variables y arrays.
2. Estudia la guía de **Apps Script de Google Cloud** en Coursera para aprender a conectar scripts a Sheets.
3. Diseña proyectos pequeños (ej: un script que lea facturas de Gmail y las registre en lote en una hoja de cálculo).
4. Sube tus códigos de Apps Script (los archivos `.gs`) a repositorios en **GitHub** estructurados de forma profesional (como lo hemos hecho aquí), demostrando tus habilidades transaccionales en batch y optimización. Comparte tus certificados verificados en tu LinkedIn.
