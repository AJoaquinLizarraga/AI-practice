#!/usr/bin/env node
/**
 * Servidor MCP que expone tu índice de Pinecone como herramientas.
 *
 * Lo lanza un cliente MCP (Claude Code, Cline, …) y le da tres capacidades:
 *
 *   buscar_documentos    búsqueda semántica sobre lo que tengas indexado
 *   listar_documentos    qué hay cargado ahora mismo
 *   indexar_texto        añadir un texto nuevo al índice
 *
 * IMPORTANTE: en el transporte stdio, stdout está reservado para el protocolo.
 * Cualquier traza va a stderr con console.error, nunca console.log.
 */
import '../src/cargarEnv.js'; // debe ir antes que config.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Pinecone } from '@pinecone-database/pinecone';

import { CONFIG } from '../src/config.js';
import { cargarDocumentos } from '../src/cargarDocumentos.js';
import { partirTexto } from '../src/chunking.js';

if (!CONFIG.apiKey) {
  console.error('[mcp-pinecone] Falta PINECONE_API_KEY en el .env del proyecto');
  process.exit(1);
}

const pc = new Pinecone({ apiKey: CONFIG.apiKey });
const ns = pc.index(CONFIG.indexName).namespace(CONFIG.namespace);

const servidor = new McpServer({
  name: 'pinecone-documentos',
  version: '1.0.0',
});

// ───────────────────────────────────────────────────────────────────────
// buscar_documentos
// ───────────────────────────────────────────────────────────────────────
servidor.registerTool(
  'buscar_documentos',
  {
    title: 'Buscar en los documentos',
    description:
      'Búsqueda semántica (por significado, no por palabras exactas) sobre los documentos indexados en Pinecone. ' +
      'Úsala siempre que se pregunte por información que pueda estar en los documentos del usuario: descripciones ' +
      'de empresas, manuales, notas o cualquier contenido que se haya cargado. Devuelve los fragmentos más ' +
      'relevantes con su puntuación de similitud y su documento de origen.',
    inputSchema: {
      consulta: z
        .string()
        .describe('Qué buscar, en lenguaje natural. Funciona mejor con una pregunta o frase completa que con palabras sueltas.'),
      categoria: z
        .string()
        .optional()
        .describe('Limita la búsqueda a una categoría concreta. Usa listar_documentos para ver las disponibles.'),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Cuántos fragmentos devolver. Por defecto 5.'),
    },
  },
  async ({ consulta, categoria, topK = 5 }) => {
    const respuesta = await ns.searchRecords({
      query: {
        topK: topK * 3, // candidatos de sobra para que el reranker elija
        inputs: { text: consulta },
        ...(categoria ? { filter: { categoria: { $eq: categoria } } } : {}),
      },
      fields: [CONFIG.textField, 'titulo', 'categoria', 'fuente'],
      rerank: {
        model: 'bge-reranker-v2-m3',
        rankFields: [CONFIG.textField],
        topN: topK,
      },
    });

    const hits = respuesta.result?.hits ?? [];

    if (hits.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text:
              `Sin resultados para "${consulta}"` +
              (categoria ? ` en la categoría "${categoria}"` : '') +
              `.\n\nEl índice "${CONFIG.indexName}" / namespace "${CONFIG.namespace}" puede estar vacío. ` +
              `Comprueba con listar_documentos.`,
          },
        ],
      };
    }

    const texto = hits
      .map((h, i) => {
        const f = h.fields;
        // Ojo: al usar rerank, _score es la puntuación del reranker, no la
        // similitud coseno. Es otra escala (suele ser mucho más baja) y solo
        // sirve para ordenar entre sí los resultados de esta misma búsqueda.
        return (
          `### [${i + 1}] ${f.titulo}  (relevancia ${h._score.toFixed(4)})\n` +
          `categoría: ${f.categoria} · fragmento: ${h._id}\n\n` +
          String(f[CONFIG.textField] ?? '').trim()
        );
      })
      .join('\n\n---\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `${hits.length} fragmentos relevantes para "${consulta}":\n\n${texto}`,
        },
      ],
    };
  }
);

// ───────────────────────────────────────────────────────────────────────
// listar_documentos
// ───────────────────────────────────────────────────────────────────────
servidor.registerTool(
  'listar_documentos',
  {
    title: 'Listar los documentos indexados',
    description:
      'Muestra qué documentos y categorías hay disponibles en el índice de Pinecone, y cuántos vectores contiene. ' +
      'Útil antes de buscar, para saber sobre qué se puede preguntar y qué categorías existen para filtrar.',
    inputSchema: {},
  },
  async () => {
    const stats = await pc.index(CONFIG.indexName).describeIndexStats();
    const vectores = stats.namespaces?.[CONFIG.namespace]?.recordCount ?? 0;

    const { documentos, origen, ruta } = await cargarDocumentos();

    const porCategoria = {};
    for (const d of documentos) {
      (porCategoria[d.categoria] ??= []).push(d.titulo);
    }

    const listado = Object.entries(porCategoria)
      .map(([cat, titulos]) => `**${cat}**\n${titulos.map((t) => `  · ${t}`).join('\n')}`)
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text:
            `Índice: ${CONFIG.indexName} · namespace: ${CONFIG.namespace}\n` +
            `Modelo de embeddings: ${CONFIG.embedModel} (1024 dimensiones)\n` +
            `Vectores indexados: ${vectores}\n` +
            `Fuente de los textos: ${ruta}${origen === 'ejemplo' ? ' (documentos de ejemplo)' : ''}\n\n` +
            (vectores === 0
              ? 'El índice está VACÍO. Hay que ejecutar "npm run cargar" para subir los documentos.\n\n'
              : '') +
            `Documentos en disco (${documentos.length}):\n\n${listado}`,
        },
      ],
    };
  }
);

// ───────────────────────────────────────────────────────────────────────
// indexar_texto
// ───────────────────────────────────────────────────────────────────────
servidor.registerTool(
  'indexar_texto',
  {
    title: 'Indexar un texto nuevo',
    description:
      'Añade un texto al índice de Pinecone para poder consultarlo después. Lo trocea en fragmentos y lo vectoriza. ' +
      'Si el identificador ya existe, se sobrescribe. Nota: esto indexa solo en Pinecone, no crea el archivo en ' +
      'data/textos/, así que se perderá si se ejecuta "npm run cargar -- --limpiar".',
    inputSchema: {
      id: z
        .string()
        .regex(/^[\w-]+$/, 'Solo letras, números, guiones y guiones bajos')
        .describe('Identificador único y estable del documento, en kebab-case. Ej: "acme-corp"'),
      titulo: z.string().describe('Título legible del documento'),
      categoria: z.string().describe('Categoría para poder filtrar después. Ej: "empresas"'),
      texto: z.string().min(1).describe('El contenido completo, con los párrafos separados por línea en blanco'),
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async ({ id, titulo, categoria, texto }) => {
    const fragmentos = partirTexto(texto);

    const registros = fragmentos.map((fragmento, i) => ({
      _id: `${id}#${i}`,
      [CONFIG.textField]: fragmento,
      titulo,
      categoria,
      fuente: id,
      fragmento: i,
    }));

    await ns.upsertRecords({ records: registros });

    return {
      content: [
        {
          type: 'text',
          text:
            `Indexado "${titulo}" como ${registros.length} fragmento(s): ${registros.map((r) => r._id).join(', ')}\n\n` +
            `Pinecone lo está vectorizando con ${CONFIG.embedModel}. Tarda unos segundos en ser consultable ` +
            `(el índice es eventually consistent).`,
        },
      ],
    };
  }
);

// ───────────────────────────────────────────────────────────────────────
await servidor.connect(new StdioServerTransport());
console.error(`[mcp-pinecone] listo · índice "${CONFIG.indexName}" · namespace "${CONFIG.namespace}"`);
