/**
 * PASO 3 — Buscar. Aquí se ve la diferencia entre buscar por PALABRAS
 * y buscar por SIGNIFICADO.
 *
 *   npm run buscar -- "cuántos días de vacaciones tengo"
 *   npm run buscar -- "puedo trabajar desde otro país" --categoria=rrhh
 *   npm run buscar -- "qué pasa si se cae producción" --rerank
 */
import { CONFIG, c, titulo, getPinecone, getNamespace } from '../src/config.js';
import { cargarDocumentos } from '../src/cargarDocumentos.js';

const args = process.argv.slice(2);
const consulta = args.filter((a) => !a.startsWith('--')).join(' ') || 'cuántos días de vacaciones tengo';
const categoria = args.find((a) => a.startsWith('--categoria='))?.split('=')[1];
const usarRerank = args.includes('--rerank');
const topK = Number(args.find((a) => a.startsWith('--topk='))?.split('=')[1]) || 4;

const pc = getPinecone();
const ns = getNamespace(pc);

titulo(`PASO 3 — Búsqueda semántica`);
console.log(`  Pregunta: ${c.bold}"${consulta}"${c.reset}`);
if (categoria) console.log(`  Filtro:   categoria = ${c.bold}${categoria}${c.reset}`);
if (usarRerank) console.log(`  Rerank:   ${c.bold}bge-reranker-v2-m3${c.reset}`);
console.log();

// ── A) Búsqueda por palabras clave, para comparar ──────────────────────
const { documentos } = await cargarDocumentos();
const palabras = consulta.toLowerCase().split(/\W+/).filter((p) => p.length > 3);
const coincidencias = documentos.filter((d) =>
  palabras.some((p) => d.texto.toLowerCase().includes(p))
);

console.log(`${c.bold}A) Búsqueda clásica por palabras${c.reset} ${c.dim}(lo que haría un LIKE de SQL)${c.reset}`);
console.log(`   ${c.dim}buscando literalmente: ${palabras.join(', ') || '(nada útil)'}${c.reset}`);
if (coincidencias.length === 0) {
  console.log(`   ${c.red}0 resultados${c.reset} — ninguna de esas palabras aparece tal cual en los textos\n`);
} else {
  for (const d of coincidencias) console.log(`   · ${d.titulo}`);
  console.log(`   ${c.dim}${coincidencias.length} documentos, sin ningún orden de relevancia${c.reset}\n`);
}

// ── B) Búsqueda vectorial ──────────────────────────────────────────────
// Le pasamos TEXTO. Pinecone lo convierte a vector con el mismo modelo
// que usó al guardar y busca los vectores más cercanos por coseno.
const peticion = {
  query: {
    topK: usarRerank ? topK * 3 : topK, // el reranker necesita candidatos de sobra
    inputs: { text: consulta },
    ...(categoria ? { filter: { categoria: { $eq: categoria } } } : {}),
  },
  fields: [CONFIG.textField, 'titulo', 'categoria'],
  ...(usarRerank
    ? {
        rerank: {
          model: 'bge-reranker-v2-m3',
          rankFields: [CONFIG.textField],
          topN: topK,
        },
      }
    : {}),
};

const respuesta = await ns.searchRecords(peticion);
const hits = respuesta.result?.hits ?? [];

console.log(`${c.bold}B) Búsqueda vectorial${c.reset} ${c.dim}(por significado)${c.reset}\n`);

hits.forEach((hit, i) => {
  const f = hit.fields;
  const texto = String(f[CONFIG.textField] ?? '').replace(/\s+/g, ' ');
  console.log(
    `  ${c.bold}${i + 1}.${c.reset} ${barra(hit._score)} ${c.bold}${hit._score.toFixed(4)}${c.reset}  ${c.cyan}${f.titulo}${c.reset} ${c.dim}[${f.categoria}]${c.reset}`
  );
  console.log(`     ${c.dim}${hit._id}${c.reset}`);
  console.log(`     ${texto.slice(0, 180)}${texto.length > 180 ? '…' : ''}\n`);
});

console.log(`${c.dim}Coste de esta consulta: ${respuesta.usage?.readUnits ?? '?'} read units, ${respuesta.usage?.embedTotalTokens ?? '?'} tokens de embedding.${c.reset}`);

console.log(
  usarRerank
    ? `
${c.yellow}Ojo con el score cuando usas --rerank:${c.reset}${c.dim} ya no es la similitud coseno,
sino la puntuación del reranker. Es otra escala (mucho más baja, a menudo
cerca de 0) y solo sirve para ordenar entre sí los resultados de ESTA
búsqueda. Lanza la misma consulta sin --rerank para ver el coseno real.${c.reset}`
    : `
${c.dim}El score es la similitud coseno entre el vector de tu pregunta y el
del fragmento. Nunca es 0 ni 1 exactos: es una medida continua, y por eso
puedes ordenar por relevancia — algo que una búsqueda por palabras no da.${c.reset}`
);

console.log(`

${c.dim}Prueba también:${c.reset}
  ${c.yellow}npm run buscar -- "me han robado el portátil"${c.reset}          ${c.dim}(ninguna palabra coincide)${c.reset}
  ${c.yellow}npm run buscar -- "reuniones" --categoria=procesos${c.reset}     ${c.dim}(filtro por metadata)${c.reset}
  ${c.yellow}npm run buscar -- "gastos de comida" --rerank${c.reset}          ${c.dim}(reordenado por un modelo)${c.reset}

${c.bold}${c.green}Siguiente paso:${c.reset}  ${c.yellow}npm run rag -- "cuántos días de vacaciones tengo"${c.reset}
`);

function barra(score) {
  const ancho = 18;
  const llenos = Math.max(0, Math.min(ancho, Math.round(score * ancho)));
  const color = score > 0.6 ? c.green : score > 0.35 ? c.yellow : c.dim;
  return `${color}${'█'.repeat(llenos)}${c.dim}${'·'.repeat(ancho - llenos)}${c.reset}`;
}
