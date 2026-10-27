/**
 * PASO 4 — RAG: Retrieval Augmented Generation.
 *
 * La idea completa en tres líneas:
 *   1. RETRIEVAL  → buscar en Pinecone los fragmentos relevantes
 *   2. AUGMENTED  → pegarlos dentro del prompt como "contexto"
 *   3. GENERATION → que el LLM local (Ollama) responda usando SOLO eso
 *
 * Con los documentos de ejemplo el LLM no sabe nada de Nébula Labs: es una
 * empresa inventada. Si acierta, es porque la base vectorial le pasó el
 * fragmento correcto del manual, no porque se lo supiera.
 *
 *   npm run rag -- "cuántos días de vacaciones tengo"
 */
import { CONFIG, c, titulo, getPinecone, getNamespace } from '../src/config.js';
import { verificarOllama, generar } from '../src/ollama.js';
import { buscarContexto, construirPrompt, SYSTEM_PROMPT } from '../src/rag.js';

const consulta = process.argv.slice(2).join(' ') || 'cuántos días de vacaciones tengo';

const pc = getPinecone();
const ns = getNamespace(pc);
await verificarOllama();

titulo('PASO 4 — RAG paso a paso');
console.log(`  Pregunta: ${c.bold}"${consulta}"${c.reset}\n`);

// ── 1. RETRIEVAL ───────────────────────────────────────────────────────
console.log(`${c.bold}${c.blue}1. RETRIEVAL${c.reset} ${c.dim}— Pinecone busca los fragmentos relevantes${c.reset}\n`);

const hits = await buscarContexto(ns, consulta, { topK: 4 });

if (hits.length === 0) {
  console.log(`${c.red}No se encontró nada. ¿Ejecutaste "npm run cargar"?${c.reset}`);
  process.exit(1);
}

hits.forEach((h, i) => {
  console.log(
    `   [${i + 1}] ${c.green}${h._score.toFixed(4)}${c.reset}  ${c.cyan}${h.fields.titulo}${c.reset} ${c.dim}(${h._id})${c.reset}`
  );
});
// La búsqueda usa reranking, así que ese número es la puntuación del
// reranker, no la similitud coseno. Solo ordena; no compares entre consultas.
console.log(`   ${c.dim}↑ relevancia según el reranker (escala propia, solo sirve para ordenar)${c.reset}`);

// ── 2. AUGMENTED ───────────────────────────────────────────────────────
const prompt = construirPrompt(consulta, hits);

console.log(`\n${c.bold}${c.blue}2. AUGMENTED${c.reset} ${c.dim}— así queda el prompt que recibe el modelo${c.reset}\n`);
console.log(
  prompt
    .split('\n')
    .map((l) => `   ${c.dim}│${c.reset} ${l.length > 92 ? l.slice(0, 92) + '…' : l}`)
    .join('\n')
);
console.log(`\n   ${c.dim}(${prompt.length} caracteres, ~${Math.round(prompt.length / 4)} tokens)${c.reset}`);

// ── 3. GENERATION ──────────────────────────────────────────────────────
console.log(`\n${c.bold}${c.blue}3. GENERATION${c.reset} ${c.dim}— ${CONFIG.ollamaModel} en local, sin salir de tu máquina${c.reset}\n`);
console.log(`${c.green}${'─'.repeat(70)}${c.reset}`);

await generar({ system: SYSTEM_PROMPT, prompt });

console.log(`${c.green}${'─'.repeat(70)}${c.reset}`);

console.log(`
${c.dim}Fuentes usadas:${c.reset}`);
for (const h of hits) {
  console.log(`  [${hits.indexOf(h) + 1}] ${h.fields.titulo} ${c.dim}· ${h._id}${c.reset}`);
}

console.log(`
${c.dim}Prueba ahora a preguntar algo que NO esté en tus documentos. El modelo
debería decir que no lo encuentra en lugar de inventárselo. Esa es la otra
mitad del valor de RAG: acotar al modelo a una fuente conocida.${c.reset}

${c.bold}${c.green}Siguiente paso:${c.reset}  ${c.yellow}npm run chat${c.reset}  ${c.dim}(modo conversación)${c.reset}
`);
