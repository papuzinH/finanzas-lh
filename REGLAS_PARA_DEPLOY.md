### 🔄 El Ciclo de Vida de una Feature

#### 1\. Capa de Datos (Supabase) 🗄️

*Regla de Oro: Nunca toques la estructura de PROD directamente.*

1.  **En Entorno DEV:**
      * Vas a tu proyecto `smart-finance-dev` en Supabase.
      * Abres el SQL Editor y escribes tu cambio (ej: `ALTER TABLE transactions ADD COLUMN ahorro_meta text;`).
      * Pruebas que funcione y que no rompa nada.
2.  **Promoción a PROD:**
      * Una vez validado, copias ese mismo script SQL.
      * Vas al proyecto `smart-finance-prod`.
      * Lo ejecutas en el SQL Editor.
      * *Tip de Pro:* Guarda estos scripts en una carpeta `sql/migrations` en tu repo de GitHub para tener historial.

#### 2\. Capa Lógica (n8n) 🧠

*Regla de Oro: No edites el flujo activo que recibe mensajes reales.*

1.  **Duplicar para Desarrollar:**
      * En n8n, duplica tu workflow principal.
      * Renómbralo: `[DEV] Feature Ahorros`.
      * **Cambio de Credenciales:** En este flujo duplicado, cambia las credenciales de Postgres para que apunten a **Supabase DEV**.
      * Cambia el nodo Telegram para usar un **Bot de Pruebas** (créate uno rápido en BotFather tipo `Chanchito_Test_Bot`), así no llenas de basura tu chat real.
2.  **Iterar:**
      * Modifica los nodos, cambia el prompt de Gemini, rompe todo.
3.  **Promoción:**
      * Una vez que funciona, tienes dos opciones:
          * *Opción A (Copiar nodos):* Copias los nodos nuevos y los pegas en el flujo de Producción (con cuidado de reconectar las credenciales de PROD).
          * *Opción B (Switch):* Si el cambio es gigante, configuras el flujo DEV con las credenciales de PROD y apagas el viejo.

#### 3\. Capa Visual (Next.js + GitHub) 💻

*Regla de Oro: Main siempre es sagrado (Production Ready).*

1.  **Rama (Branch) Local:**
      * En tu terminal: `git checkout -b feature/ahorros`.
      * Asegúrate de que tu `.env.local` apunte a **Supabase DEV**.
      * *Vibe Coding:* Dale duro con Cursor/Windsurf.
2.  **Pull Request (PR):**
      * Cuando termines, haz:
        ```bash
        git add .
        git commit -m "feat: agrego modulo de ahorros"
        git push origin feature/ahorros
        ```
      * Ve a GitHub y abre un **Pull Request**.
3.  **Preview (La Magia de Vercel):**
      * Vercel detectará el PR y te dará una URL única (ej: `chanchito-git-feature-ahorros.vercel.app`).
      * **Entra desde tu celular.** Esa URL está conectada a tu base de DEV (si configuraste las variables de entorno de "Preview" en Vercel como te dije).
      * Pruébalo como si fueras un usuario real.
4.  **Merge & Deploy:**
      * Si te gusta, dale al botón **"Merge"** en GitHub.
      * Vercel detectará el cambio en `main` y actualizará automáticamente la URL oficial (`chanchito.vercel.app`) conectada a la base de datos de PROD.

-----

### 📝 Resumen del Checklist antes de un Deploy

Antes de darle "Merge" a una feature nueva, pregúntate:

1.  [ ] **DB:** ¿Ya corrí el script SQL de la nueva tabla en la base de Producción? (Si no, el frontend va a fallar al buscar datos que no existen).
2.  [ ] **N8N:** ¿Ya actualicé el flujo productivo de n8n para que llene esos datos nuevos?
3.  [ ] **Frontend:** ¿Probé la URL de Preview en el celular y se ve bien?
