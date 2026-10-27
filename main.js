/**
 * El producto final: un chat con el manual interno de Nébula Labs.
 *
 * Cada pregunta hace el ciclo completo:
 *   pregunta → Pinecone (búsqueda vectorial) → contexto → Ollama → respuesta
 *
 * Los datos nunca salen de tu máquina salvo la consulta que va a Pinecone
 * para ser vectorizada. La generación es 100% local.
 *
 *   npm run chat
 */
import readline from 'node:readline/promises';
import { CONFIG, c, getPinecone, getNamespace } from './src/config.js';
import { cargarDocumentos } from './src/cargarDocumentos.js';
import { verificarOllama, generar } from './src/ollama.js';
import { buscarContexto, construirPrompt, SYSTEM_PROMPT } from './src/rag.js';

const pc = getPinecone();
const ns = getNamespace(pc);
await verificarOllama();

// Solo para enseñar sobre qué documentos se está preguntando.
const { documentos, origen } = await cargarDocumentos();

console.log(`
${c.bold}${c.cyan}  Pregunta a tus documentos${c.reset}
  ${c.dim}Pinecone (${CONFIG.embedModel}) + Ollama (${CONFIG.ollamaModel})${c.reset}
  ${c.dim}namespace: ${CONFIG.namespace}${origen === 'ejemplo' ? ' · usando los documentos de ejemplo' : ''}${c.reset}

  ${c.dim}Documentos indexados:${c.reset}
${documentos
  .slice(0, 12)
  .map((d) => `    · ${d.titulo} ${c.dim}[${d.categoria}]${c.reset}`)
  .join('\n')}${documentos.length > 12 ? `\n    ${c.dim}…y ${documentos.length - 12} más${c.reset}` : ''}

  ${c.dim}Escribe "salir" para terminar.${c.reset}
`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

while (true) {
  const pregunta = (await rl.question(`${c.bold}${c.yellow}❯ ${c.reset}`)).trim();

  if (!pregunta) continue;
  if (['salir', 'exit', 'quit', 'q'].includes(pregunta.toLowerCase())) break;

  // 1. RETRIEVAL
  process.stdout.write(`${c.dim}  buscando en Pinecone...${c.reset}`);
  const hits = await buscarContexto(ns, pregunta, { topK: 4 });
  process.stdout.write(`\r${' '.repeat(40)}\r`);

  if (hits.length === 0) {
    console.log(`${c.red}  No hay nada indexado. Ejecuta "npm run cargar" primero.${c.reset}\n`);
    continue;
  }

  console.log(
    `${c.dim}  ${hits.length} fragmentos · ${hits.map((h) => h.fields.titulo).join(' · ')}${c.reset}\n`
  );

  // 2 + 3. AUGMENTED + GENERATION
  await generar({
    system: SYSTEM_PROMPT,
    prompt: construirPrompt(pregunta, hits),
  });

  console.log();
}

rl.close();
console.log(`\n${c.dim}Hasta luego.${c.reset}\n`);
