/**
 * Guard: el React Compiler no debe congelar valores derivados del store.
 *
 * `reactCompiler: true` (next.config.ts) memoiza cada bloque de cómputo con las
 * referencias de las que depende. Los getters de Zustand son referencias ESTABLES
 * (se crean una sola vez en `create`) y leen el estado por `get()`, o sea por fuera
 * de React. Un componente que hace:
 *
 *     const { getMonthlyTrend } = useFinanceStore();
 *     const data = getMonthlyTrend();          // dep = [getMonthlyTrend] → nunca cambia
 *
 * queda con `data` CONGELADO desde su primer render: ni un refetch ni un cambio de
 * moneda lo actualizan. Fue la causa del toggle ARS/USD que cambiaba la sigla y no
 * los números (2026-08-21).
 *
 * El patrón correcto es tomar el objeto del store, que sí cambia de referencia en
 * cada `set`:
 *
 *     const store = useFinanceStore();
 *     const data = store.getMonthlyTrend();    // dep = [store] → cambia con cada set
 *
 * Este test compila cada componente con el mismo plugin que usa Next y falla si
 * encuentra un valor derivado de un getter sin ninguna dependencia reactiva.
 */
import { describe, it, expect } from 'vitest';
import { transformSync } from '@babel/core';
import { parse } from '@babel/parser';
import traverseModule, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

// @babel/traverse es CJS: bajo ESM el default queda envuelto en el namespace.
const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

/** Campos de estado de `useFinanceStore` (todo lo demás son getters/acciones estables). */
const STATE_FIELDS = new Set([
  'transactions', 'installmentPlans', 'paymentMethods', 'recurringPlans', 'investments',
  'investmentAssets', 'investmentTransactions', 'categories', 'marketPrices', 'savings',
  'internalTransfers', 'incomeRhythm', 'incomeCountsNextMonth', 'savingsGoals', 'savingsGoalContributions',
  'categoryBudgets', 'dolarBlue', 'displayCurrency', 'inflationSeries', 'exchangeRates',
  'user', 'authEmail', 'authAvatarUrl', 'isLoading', 'error', 'isInitialized',
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') walk(full, acc);
    } else if (/\.tsx?$/.test(full)) acc.push(full);
  }
  return acc;
}

interface FrozenValue {
  file: string;
  getters: string[];
  deps: string[];
}

/** Cómo entra el store al componente: getters sueltos, campos de estado, u objeto entero. */
function collectStoreBindings(src: string) {
  const stable = new Set<string>();
  const reactive = new Set<string>();
  const storeObjects = new Set<string>();

  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (!t.isCallExpression(init) || !t.isIdentifier(init.callee, { name: 'useFinanceStore' })) return;

      if (t.isObjectPattern(p.node.id)) {
        for (const prop of p.node.id.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
          (STATE_FIELDS.has(prop.key.name) ? reactive : stable).add(prop.key.name);
        }
      } else if (t.isIdentifier(p.node.id)) {
        // `useFinanceStore(s => s.getFoo)` devuelve una referencia estable;
        // `useFinanceStore()` devuelve el objeto entero, que cambia con cada set.
        (init.arguments.length > 0 ? stable : storeObjects).add(p.node.id.name);
      }
    },
  });

  return { stable, reactive, storeObjects };
}

/** Deps de un bloque memo del compiler: `if ($[0] !== dep || $[1] !== otra) { … }`. */
function memoBlockDeps(test: t.Expression): string[] | null {
  const deps: string[] = [];
  let isMemoBlock = false;

  const collect = (node: t.Expression | t.PrivateName): void => {
    if (t.isLogicalExpression(node)) {
      collect(node.left);
      collect(node.right);
      return;
    }
    if (!t.isBinaryExpression(node) || node.operator !== '!==') return;
    if (!t.isMemberExpression(node.left) || !t.isIdentifier(node.left.object, { name: '$' })) return;
    isMemoBlock = true;
    const right = node.right;
    if (t.isIdentifier(right)) deps.push(right.name);
    else if (t.isMemberExpression(right) && t.isIdentifier(right.object)) deps.push(right.object.name);
    else deps.push('<expr>');
  };
  collect(test);

  return isMemoBlock && deps.length > 0 ? deps : null;
}

function findFrozenValues(file: string): FrozenValue[] {
  const src = readFileSync(file, 'utf8');
  const { stable, reactive, storeObjects } = collectStoreBindings(src);
  if (stable.size === 0) return [];

  const compiled = transformSync(src, {
    filename: file,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [['babel-plugin-react-compiler', {}]],
  })?.code;
  if (!compiled) return [];

  const ast = parse(compiled, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const frozen: FrozenValue[] = [];

  traverse(ast, {
    IfStatement(p: NodePath<t.IfStatement>) {
      const deps = memoBlockDeps(p.node.test);
      if (!deps) return;

      // Sólo cuentan las llamadas cuyo RESULTADO se memoiza en este bloque: una
      // llamada dentro de un callback anidado se ejecuta después, con estado fresco.
      const getters = new Set<string>();
      const blockFn = p.getFunctionParent()?.node;
      p.get('consequent').traverse({
        CallExpression(call: NodePath<t.CallExpression>) {
          if (call.getFunctionParent()?.node !== blockFn) return;
          if (t.isIdentifier(call.node.callee) && stable.has(call.node.callee.name)) {
            getters.add(call.node.callee.name);
          }
        },
      });
      if (getters.size === 0) return;

      const hasReactiveDep = deps.some((d) => reactive.has(d) || storeObjects.has(d));
      if (!hasReactiveDep) frozen.push({ file, getters: [...getters], deps });
    },
  });

  return frozen;
}

describe('frescura del store bajo React Compiler', () => {
  const files = walk('src').filter((f) => readFileSync(f, 'utf8').includes('useFinanceStore'));

  it('encuentra componentes que usan el store', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('ningún valor derivado de un getter queda congelado', () => {
    const frozen = files.flatMap(findFrozenValues);
    const report = frozen
      .map((f) => `  ${f.file.split(path.sep).join('/')} → ${f.getters.join(', ')}  [deps: ${f.deps.join(', ')}]`)
      .join('\n');
    expect(
      frozen,
      `Valores congelados por el React Compiler. Usar \`const store = useFinanceStore()\` y llamar \`store.getX()\`:\n${report}\n`,
    ).toEqual([]);
    // Compila ~60 archivos con Babel: no entra en el timeout por defecto de 5s.
  }, 60_000);
});
