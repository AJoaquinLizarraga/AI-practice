/**
 * Configuración central del proyecto.
 * Lee las variables de entorno desde .env y expone el cliente de Pinecone.
 */
import { Pinecone } from '@pinecone-database/pinecone';

export const CONFIG = {
  apiKey: process.env.PINECONE_API_KEY,
  indexName: process.env.PINECONE_INDEX || 'demo-rag',
  namespace: process.env.PINECONE_NAMESPACE || 'manual-empresa',
  embedModel: process.env.PINECONE_EMBED_MODEL || 'multilingual-e5-large',

  // El campo del registro cuyo texto Pinecone convertirá en vector.
  // Debe coincidir con el `fieldMap` usado al crear el índice.
  textField: 'texto',

  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:12b',
};

/** Colores ANSI para que la salida en terminal se lea bien. Sin dependencias. */
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/** Título de sección, para separar visualmente los pasos del demo. */
export function titulo(texto) {
  console.log(`\n${c.bold}${c.cyan}${'─'.repeat(70)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${texto}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${'─'.repeat(70)}${c.reset}\n`);
}

/**
 * Devuelve un cliente de Pinecone ya autenticado.
 * Falla con un mensaje claro si falta la API key, en vez de un error críptico.
 */
export function getPinecone() {
  if (!CONFIG.apiKey || CONFIG.apiKey.startsWith('pcsk_xxx')) {
    console.error(`
${c.red}${c.bold}✗ Falta PINECONE_API_KEY${c.reset}

  1. Crea una cuenta gratis en ${c.cyan}https://app.pinecone.io${c.reset}
  2. Ve a "API Keys" y copia tu clave
  3. En este proyecto:  ${c.yellow}cp .env.example .env${c.reset}
  4. Pega la clave en el archivo ${c.yellow}.env${c.reset}

  ${c.dim}Mientras tanto puedes ver la teoría sin API key:  npm run teoria${c.reset}
`);
    process.exit(1);
  }
  return new Pinecone({ apiKey: CONFIG.apiKey });
}

/** Atajo: el índice + namespace que usa todo el demo. */
export function getNamespace(pc) {
  return pc.index(CONFIG.indexName).namespace(CONFIG.namespace);
}
