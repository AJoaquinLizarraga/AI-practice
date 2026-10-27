/**
 * La lógica de RAG, compartida por `scripts/4-rag.js` y `main.js`.
 */
import { CONFIG } from './config.js';

export const SYSTEM_PROMPT = `Eres un asistente que responde preguntas sobre una base de documentos.

Reglas estrictas:
- Responde ÚNICAMENTE con la información del CONTEXTO que se te proporciona.
- Si el contexto no contiene la respuesta, di exactamente: "No encuentro esa información en los documentos." No inventes ni completes con conocimiento general.
- Cita las fuentes que uses con su número entre corchetes, así: [1], [2].
- Sé breve y concreto. Si hay cifras, plazos o importes, dilos tal cual aparecen.
- Responde siempre en español.`;

/**
 * RETRIEVAL: busca en Pinecone los fragmentos más relevantes.
 *
 * `rerank` reordena los candidatos con un segundo modelo que compara
 * pregunta y fragmento de forma más fina que el coseno. Cuesta un poco más
 * de latencia y mejora bastante la precisión del top-3.
 */
export async function buscarContexto(ns, consulta, { topK = 4, categoria = null, rerank = true } = {}) {
  const respuesta = await ns.searchRecords({
    query: {
      topK: rerank ? topK * 3 : topK,
      inputs: { text: consulta },
      ...(categoria ? { filter: { categoria: { $eq: categoria } } } : {}),
    },
    fields: [CONFIG.textField, 'titulo', 'categoria', 'fuente'],
    ...(rerank
      ? { rerank: { model: 'bge-reranker-v2-m3', rankFields: [CONFIG.textField], topN: topK } }
      : {}),
  });

  return respuesta.result?.hits ?? [];
}

/**
 * AUGMENTED: mete los fragmentos recuperados dentro del prompt.
 *
 * El formato importa: numerar las fuentes permite al modelo citarlas, y
 * separar claramente CONTEXTO de PREGUNTA reduce que el modelo confunda
 * los datos recuperados con instrucciones.
 */
export function construirPrompt(consulta, hits) {
  const contexto = hits
    .map((h, i) => {
      const texto = String(h.fields[CONFIG.textField] ?? '').trim();
      return `[${i + 1}] Documento: "${h.fields.titulo}" (categoría: ${h.fields.categoria})\n${texto}`;
    })
    .join('\n\n---\n\n');

  return `CONTEXTO extraído de los documentos indexados:

${contexto}

---

PREGUNTA: ${consulta}`;
}
