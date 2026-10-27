/**
 * Chunking: partir documentos largos en fragmentos.
 *
 * ¿Por qué? Un embedding es UN vector para TODO el texto que le pases.
 * Si metes un documento de 10 páginas en un solo vector, ese vector es
 * el "promedio" de 10 temas distintos y no se parece bien a ninguna
 * pregunta concreta. Fragmentos de 1-3 párrafos → un vector por idea.
 *
 * El `solape` (overlap) repite el final de un chunk al principio del
 * siguiente para que una frase partida a la mitad no pierda su contexto.
 */

const TAMANO_OBJETIVO = 700; // caracteres aprox. por fragmento
const SOLAPE = 120; // caracteres repetidos entre fragmentos contiguos

/**
 * Divide un texto respetando límites de párrafo siempre que se pueda.
 * @returns {string[]} fragmentos
 */
export function partirTexto(texto, tamano = TAMANO_OBJETIVO, solape = SOLAPE) {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const fragmentos = [];
  let actual = '';

  for (const parrafo of parrafos) {
    // Si el párrafo solo ya excede el objetivo, va como fragmento propio.
    if (parrafo.length > tamano) {
      if (actual) {
        fragmentos.push(actual);
        actual = '';
      }
      fragmentos.push(...partirPorLongitud(parrafo, tamano, solape));
      continue;
    }

    if ((actual + '\n\n' + parrafo).trim().length > tamano) {
      fragmentos.push(actual);
      // Arrancamos el siguiente fragmento con la cola del anterior (solape).
      actual = (actual.slice(-solape) + '\n\n' + parrafo).trim();
    } else {
      actual = actual ? `${actual}\n\n${parrafo}` : parrafo;
    }
  }

  if (actual.trim()) fragmentos.push(actual.trim());
  return fragmentos;
}

/** Corte duro por longitud, usado solo para párrafos gigantes. */
function partirPorLongitud(texto, tamano, solape) {
  const trozos = [];
  let inicio = 0;
  while (inicio < texto.length) {
    trozos.push(texto.slice(inicio, inicio + tamano).trim());
    inicio += tamano - solape;
  }
  return trozos;
}

/**
 * Convierte los documentos de `data/documentos.js` en registros listos
 * para Pinecone: un registro por fragmento, con su metadata heredada.
 *
 * @param {Array} documentos
 * @param {string} campoTexto  nombre del campo que Pinecone vectorizará
 */
export function documentosARegistros(documentos, campoTexto = 'texto') {
  const registros = [];

  for (const doc of documentos) {
    const fragmentos = partirTexto(doc.texto);

    fragmentos.forEach((fragmento, i) => {
      registros.push({
        _id: `${doc.id}#${i}`,
        [campoTexto]: fragmento,
        // Todo lo demás se guarda como metadata: sirve para filtrar y para citar.
        titulo: doc.titulo,
        categoria: doc.categoria,
        fuente: doc.id,
        fragmento: i,
      });
    });
  }

  return registros;
}
