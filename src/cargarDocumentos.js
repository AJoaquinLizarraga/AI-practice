/**
 * Carga los documentos que se van a indexar.
 *
 * Prioridad:
 *   1. Los archivos .txt / .md que dejes en  data/textos/
 *   2. Si esa carpeta está vacía, el ejemplo de  data/documentos.js
 *
 * Convención de la carpeta data/textos/:
 *
 *   data/textos/manual.md              → categoria: "general"
 *   data/textos/rrhh/vacaciones.md     → categoria: "rrhh"   (la subcarpeta manda)
 *
 * El título sale del primer encabezado markdown (# Título) si lo hay,
 * y si no, del nombre del archivo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CARPETA_TEXTOS = path.join(RAIZ, 'data', 'textos');

const EXTENSIONES = ['.txt', '.md', '.markdown'];

// Las instrucciones de la propia carpeta no son contenido a indexar.
const IGNORADOS = ['leeme.md', 'readme.md'];

/**
 * @returns {{documentos: Array, origen: 'carpeta'|'ejemplo', ruta: string}}
 */
export async function cargarDocumentos() {
  const archivos = listarArchivos(CARPETA_TEXTOS);

  if (archivos.length === 0) {
    const { documentos } = await import('../data/documentos.js');
    return { documentos, origen: 'ejemplo', ruta: 'data/documentos.js' };
  }

  const documentos = archivos.map((archivo) => {
    const contenido = fs.readFileSync(archivo, 'utf8');
    const relativo = path.relative(CARPETA_TEXTOS, archivo);
    const carpeta = path.dirname(relativo);

    return {
      // id estable a partir de la ruta: recargar sobrescribe en vez de duplicar
      id: relativo.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '-').replace(/[^\w\-áéíóúñü]/gi, '_'),
      titulo: extraerTitulo(contenido, relativo),
      categoria: carpeta === '.' ? 'general' : carpeta.split(path.sep)[0],
      texto: limpiar(contenido),
    };
  });

  return { documentos, origen: 'carpeta', ruta: 'data/textos/' };
}

/** Recorre la carpeta en profundidad y devuelve los archivos de texto. */
function listarArchivos(dir) {
  if (!fs.existsSync(dir)) return [];

  const encontrados = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name.startsWith('.')) continue;
    if (IGNORADOS.includes(entrada.name.toLowerCase())) continue;
    const ruta = path.join(dir, entrada.name);

    if (entrada.isDirectory()) {
      encontrados.push(...listarArchivos(ruta));
    } else if (EXTENSIONES.includes(path.extname(entrada.name).toLowerCase())) {
      encontrados.push(ruta);
    }
  }
  return encontrados.sort();
}

/** Primer "# encabezado" del markdown, o el nombre del archivo. */
function extraerTitulo(contenido, relativo) {
  const encabezado = contenido.match(/^#\s+(.+)$/m);
  if (encabezado) return encabezado[1].trim();

  return path
    .basename(relativo, path.extname(relativo))
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (l) => l.toUpperCase());
}

/** Normaliza saltos de línea para que el chunking por párrafos funcione bien. */
function limpiar(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
