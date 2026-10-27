/**
 * PASO 2 — Trocear los documentos y subirlos.
 *
 * Aquí ocurre lo importante: mandamos TEXTO, no vectores. Pinecone pasa
 * cada fragmento por el modelo de embeddings del índice y guarda el vector
 * resultante junto a la metadata.
 *
 * Indexa los archivos .txt/.md de  data/textos/  (y si esa carpeta está
 * vacía, el ejemplo de  data/documentos.js).
 *
 *   npm run cargar
 *   npm run cargar -- --limpiar     ← borra lo anterior y reconstruye
 */
import { CONFIG, c, titulo, getPinecone, getNamespace } from '../src/config.js';
import { cargarDocumentos, CARPETA_TEXTOS } from '../src/cargarDocumentos.js';
import { documentosARegistros } from '../src/chunking.js';

const LOTE = 50; // registros por petición (el límite de la API es 96)
const limpiar = process.argv.includes('--limpiar');

const pc = getPinecone();
const ns = getNamespace(pc);

titulo('PASO 2 — Trocear y cargar los documentos');

// ── De dónde salen los textos ──────────────────────────────────────────
const { documentos, origen, ruta } = await cargarDocumentos();

if (origen === 'ejemplo') {
  console.log(`  ${c.yellow}Usando los documentos de ejemplo${c.reset} ${c.dim}(${ruta})${c.reset}`);
  console.log(`  ${c.dim}Para indexar los tuyos, deja archivos .txt o .md en:${c.reset}`);
  console.log(`  ${c.dim}${CARPETA_TEXTOS}${c.reset}\n`);
} else {
  console.log(`  ${c.green}Usando tus textos${c.reset} ${c.dim}(${ruta})${c.reset}\n`);
}

if (documentos.length === 0) {
  console.log(`${c.red}No hay ningún documento que cargar.${c.reset}\n`);
  process.exit(1);
}

// ── Limpieza opcional ──────────────────────────────────────────────────
// Necesaria si has borrado o renombrado archivos: los fragmentos viejos
// seguirían en el índice y aparecerían en las búsquedas.
if (limpiar) {
  process.stdout.write(`  ${c.dim}Vaciando el namespace "${CONFIG.namespace}"...${c.reset}`);
  try {
    await ns.deleteAll();
    console.log(` ${c.green}✓${c.reset}\n`);
    await new Promise((r) => setTimeout(r, 3000)); // dar tiempo al borrado
  } catch {
    console.log(` ${c.dim}(estaba vacío)${c.reset}\n`);
  }
}

// ── Chunking ───────────────────────────────────────────────────────────
const registros = documentosARegistros(documentos, CONFIG.textField);

console.log(`  ${c.bold}${documentos.length}${c.reset} documentos  →  ${c.bold}${registros.length}${c.reset} fragmentos\n`);

for (const doc of documentos) {
  const n = registros.filter((r) => r.fuente === doc.id).length;
  const titulo = doc.titulo.length > 42 ? doc.titulo.slice(0, 41) + '…' : doc.titulo;
  console.log(
    `    ${titulo.padEnd(42)} ${c.dim}[${doc.categoria}] ${n} fragmento${n === 1 ? '' : 's'}${c.reset}`
  );
}

// Enseñamos un fragmento entero para que se vea qué se está subiendo.
const ejemplo = registros[0];
console.log(`\n${c.dim}Así es un registro (esto es lo que viaja a Pinecone):${c.reset}\n`);
console.log(`  ${c.cyan}_id${c.reset}:       ${ejemplo._id}`);
console.log(`  ${c.cyan}categoria${c.reset}: ${ejemplo.categoria}   ${c.dim}← metadata: sirve para filtrar${c.reset}`);
console.log(`  ${c.cyan}titulo${c.reset}:    ${ejemplo.titulo}`);
console.log(
  `  ${c.cyan}${CONFIG.textField}${c.reset}:     ${c.dim}"${ejemplo[CONFIG.textField].slice(0, 120).replace(/\n/g, ' ')}..."${c.reset}`
);
console.log(`             ${c.yellow}↑ este campo es el que Pinecone convierte en 1024 números${c.reset}`);

// ── Upsert por lotes ───────────────────────────────────────────────────
console.log(`\n${c.dim}Subiendo al namespace "${CONFIG.namespace}"...${c.reset}\n`);

const inicio = Date.now();
for (let i = 0; i < registros.length; i += LOTE) {
  const lote = registros.slice(i, i + LOTE);
  await ns.upsertRecords({ records: lote });
  console.log(`  ${c.green}✓${c.reset} lote ${i / LOTE + 1}: ${lote.length} registros`);
}
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

console.log(`\n${c.green}${c.bold}✓ ${registros.length} fragmentos vectorizados y guardados${c.reset} ${c.dim}en ${segundos}s${c.reset}`);

// ── Confirmar que ya son consultables ──────────────────────────────────
// Pinecone es "eventually consistent": un registro recién escrito tarda
// unos segundos en aparecer en las búsquedas. Esperamos a que cuadre.
process.stdout.write(`\n${c.dim}Esperando a que el índice se refresque${c.reset}`);

for (let intento = 0; intento < 20; intento++) {
  await new Promise((r) => setTimeout(r, 1500));
  const stats = await pc.index(CONFIG.indexName).describeIndexStats();
  const total = stats.namespaces?.[CONFIG.namespace]?.recordCount ?? 0;

  if (total >= registros.length) {
    console.log(`\n\n  vectores en el namespace: ${c.bold}${total}${c.reset}`);
    break;
  }
  process.stdout.write('.');
}

console.log(`
${c.bold}${c.green}Siguiente paso:${c.reset}  ${c.yellow}npm run buscar -- "una pregunta sobre tus textos"${c.reset}
`);
