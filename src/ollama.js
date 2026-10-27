/**
 * Cliente mínimo para Ollama (LLM corriendo en tu propia máquina).
 *
 * Ollama expone una API HTTP en localhost:11434. No hace falta SDK:
 * con `fetch` (nativo en Node 18+) es suficiente.
 */
import { CONFIG, c } from './config.js';

/** Comprueba que Ollama esté corriendo y que el modelo esté descargado. */
export async function verificarOllama() {
  let data;
  try {
    const res = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
    data = await res.json();
  } catch {
    console.error(`
${c.red}${c.bold}✗ No se pudo conectar con Ollama${c.reset} (${CONFIG.ollamaUrl})

  Arráncalo con:  ${c.yellow}ollama serve${c.reset}
  Instálalo en:   ${c.cyan}https://ollama.com/download${c.reset}
`);
    process.exit(1);
  }

  const modelos = (data.models || []).map((m) => m.name);
  const existe = modelos.some(
    (m) => m === CONFIG.ollamaModel || m.split(':')[0] === CONFIG.ollamaModel.split(':')[0]
  );

  if (!existe) {
    console.error(`
${c.red}${c.bold}✗ El modelo "${CONFIG.ollamaModel}" no está descargado${c.reset}

  Descárgalo con:  ${c.yellow}ollama pull ${CONFIG.ollamaModel}${c.reset}

  Modelos que ya tienes: ${modelos.join(', ') || '(ninguno)'}
  ${c.dim}Puedes cambiar el modelo con OLLAMA_MODEL en el .env${c.reset}
`);
    process.exit(1);
  }
}

/**
 * Envía un prompt a Ollama e imprime la respuesta token a token (streaming).
 * Devuelve el texto completo generado.
 */
export async function generar({ system, prompt, temperature = 0.2 }) {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollamaModel,
      stream: true,
      options: { temperature },
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama respondió ${res.status}: ${await res.text()}`);
  }

  // Ollama devuelve NDJSON: un objeto JSON por línea.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completo = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lineas = buffer.split('\n');
    buffer = lineas.pop() ?? ''; // la última puede estar incompleta

    for (const linea of lineas) {
      if (!linea.trim()) continue;
      const chunk = JSON.parse(linea);
      const texto = chunk.message?.content ?? '';
      if (texto) {
        process.stdout.write(texto);
        completo += texto;
      }
    }
  }

  process.stdout.write('\n');
  return completo;
}
