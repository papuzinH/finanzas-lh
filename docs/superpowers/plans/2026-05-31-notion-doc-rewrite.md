# Notion Doc Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el contenido de la página principal de Chanchito en Notion con la documentación actualizada en 3 bloques (Producto, Técnica, Negocio).

**Architecture:** Una sola llamada `replace_content` a la Notion MCP API. El contenido viene del spec `docs/superpowers/specs/2026-05-31-notion-doc-rewrite-design.md`. Las subpáginas hijas existentes se preservan incluyéndolas explícitamente en el `new_str`.

**Tech Stack:** Notion MCP (`notion-update-page`, `notion-fetch`), Notion enhanced Markdown.

---

### Task 1: Verificar estado actual de la página

**Files:** ninguno (solo lectura de Notion)

- [ ] **Step 1: Fetch la página actual**

  Tool: `notion-fetch` con `id = "329088646eee8173ad01e5ad8e28cf2c"`

  Esperado: ver las URLs de las subpáginas hijas al final del contenido:
  - `https://www.notion.so/333088646eee8193951be4dd0d5c38d9` (Investment Tracker v2)
  - `https://www.notion.so/351088646eee8175a33ef51781d86b62` (Diferenciación)

  Si hay más subpáginas no listadas, anotarlas — deben incluirse en el `new_str` del Task 2.

---

### Task 2: Reemplazar contenido completo de la página

**Files:** ninguno (escritura a Notion)

- [ ] **Step 1: Llamar replace_content con el nuevo contenido**

  Tool: `notion-update-page`
  - `page_id`: `329088646eee8173ad01e5ad8e28cf2c`
  - `command`: `"replace_content"`
  - `new_str`: el contenido completo abajo (copiar exactamente)

  El contenido a usar como `new_str` es el del spec `docs/superpowers/specs/2026-05-31-notion-doc-rewrite-design.md`, sección desde `## Bloque 1` hasta el final, con estas subpáginas preservadas al final:

  ```
  <page url="https://www.notion.so/333088646eee8193951be4dd0d5c38d9">📈 Investment Tracker v2 — Feature Plan & Waves</page>
  <page url="https://www.notion.so/351088646eee8175a33ef51781d86b62">🧠 Diferenciación — "Chanchito no olvida"</page>
  ```

  Nota: si el `replace_content` falla por subpáginas adicionales detectadas en Task 1, agregarlas también al `new_str`.

- [ ] **Step 2: Verificar respuesta exitosa**

  Esperado: respuesta sin error. Si hay error por subpáginas, agregar las referencias faltantes y reintentar.

---

### Task 3: Verificar resultado final

**Files:** ninguno (lectura de Notion)

- [ ] **Step 1: Fetch la página actualizada**

  Tool: `notion-fetch` con `id = "329088646eee8173ad01e5ad8e28cf2c"`

  Verificar que el contenido tiene:
  - Bloque 1: sección de Producto con tabla de pantallas y chatbot
  - Bloque 2: Tech Stack (18 tecnologías) y modelo de datos (18 tablas)
  - Bloque 3: 3 opciones de modelo de negocio, roadmap por fases, ideas futuras
  - Subpáginas hijas preservadas al final

- [ ] **Step 2: Confirmar con el usuario que el resultado es correcto**
