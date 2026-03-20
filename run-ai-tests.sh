#!/bin/bash

cd /sessions/great-tender-gauss/mnt/finanzas-lh

echo "================================"
echo "Ejecutando tests del pipeline de IA"
echo "================================"
echo ""

echo "▶ Test 1: intentParser.test.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx src/lib/ai/__tests__/intentParser.test.ts
PARSER_EXIT=$?

echo ""
echo ""

echo "▶ Test 2: chatPrompt.test.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx src/lib/ai/__tests__/chatPrompt.test.ts
PROMPT_EXIT=$?

echo ""
echo ""
echo "================================"
echo "Resumen de ejecución"
echo "================================"

if [ $PARSER_EXIT -eq 0 ] && [ $PROMPT_EXIT -eq 0 ]; then
  echo "✅ Todos los tests pasaron"
  exit 0
else
  echo "❌ Algunos tests fallaron"
  exit 1
fi
