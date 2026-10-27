/**
 * PASO 1 — Crear el índice en Pinecone.
 *
 * Un "índice" es el equivalente a una tabla: el contenedor donde viven
 * los vectores. Lo creamos con INTEGRATED EMBEDDING, es decir, con un
 * modelo de embeddings alojado por Pinecone.
 *
 * Ventaja: le mandas texto plano y Pinecone lo convierte a vector por ti,
 * tanto al guardar como al buscar. No necesitas OpenAI ni ninguna otra API.
 * Está incluido en el plan gratuito.
 *
 *   npm run crear
 */
import { CONFIG, c, titulo, getPinecone } from '../src/config.js';

const pc = getPinecone();

titulo('PASO 1 — Crear el índice');

console.log(`  Índice:    ${c.bold}${CONFIG.indexName}${c.reset}`);
console.log(`  Modelo:    ${c.bold}${CONFIG.embedModel}${c.reset}`);
console.log(`  Campo:     ${c.bold}${CONFIG.textField}${c.reset} ${c.dim}(el campo que se convertirá en vector)${c.reset}\n`);

// ¿Ya existe? Crear dos veces el mismo índice da error, así que comprobamos.
const { indexes = [] } = await pc.listIndexes();
const existente = indexes.find((i) => i.name === CONFIG.indexName);

if (existente) {
  console.log(`${c.yellow}⚠${c.reset}  El índice ya existe. No se hace nada.\n`);
  mostrar(existente);
  console.log(`\n${c.dim}Si quieres empezar de cero:  npm run borrar${c.reset}`);
  console.log(`${c.bold}${c.green}Siguiente paso:${c.reset}  ${c.yellow}npm run cargar${c.reset}\n`);
  process.exit(0);
}

console.log(`${c.dim}Creando índice... (puede tardar ~1 minuto)${c.reset}`);

await pc.createIndexForModel({
  name: CONFIG.indexName,

  // El plan gratuito de Pinecone vive en aws / us-east-1.
  cloud: 'aws',
  region: 'us-east-1',

  embed: {
    // El modelo de embeddings que Pinecone ejecutará por nosotros.
    //   multilingual-e5-large → 1024 dimensiones, multiidioma (mejor en español)
    //   llama-text-embed-v2   → dimensiones ajustables, óptimo en inglés y textos largos
    model: CONFIG.embedModel,

    // "Cuando te mande un registro, el texto a vectorizar está en este campo".
    fieldMap: { text: CONFIG.textField },
  },

  // Espera a que el índice esté listo antes de devolver el control.
  waitUntilReady: true,
});

const descripcion = await pc.describeIndex(CONFIG.indexName);

console.log(`\n${c.green}${c.bold}✓ Índice creado${c.reset}\n`);
mostrar(descripcion);

console.log(`
${c.dim}Nota sobre la métrica: el índice usa ${c.reset}${c.dim}cosine${c.reset}${c.dim} por defecto, la misma
similitud coseno que calculamos a mano en "npm run teoria".${c.reset}

${c.bold}${c.green}Siguiente paso:${c.reset}  ${c.yellow}npm run cargar${c.reset}
`);

function mostrar(idx) {
  console.log(`  host:        ${idx.host}`);
  console.log(`  dimensiones: ${c.bold}${idx.dimension}${c.reset}`);
  console.log(`  métrica:     ${idx.metric}`);
  console.log(`  estado:      ${idx.status?.ready ? c.green + 'listo' + c.reset : idx.status?.state}`);
}
