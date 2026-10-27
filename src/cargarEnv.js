/**
 * Carga el .env en process.env.
 *
 * Los scripts de npm usan `node --env-file-if-exists=.env`, pero el servidor
 * MCP lo lanza Claude Code, que no pasa esa bandera ni garantiza el directorio
 * de trabajo. Así que lo resolvemos nosotros, relativo a este archivo.
 *
 * Importa este módulo ANTES que config.js: el orden de los `import` determina
 * el orden de evaluación, y config.js lee process.env al cargarse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_ENV = path.join(RAIZ, '.env');

if (fs.existsSync(RUTA_ENV)) {
  for (const linea of fs.readFileSync(RUTA_ENV, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const separador = limpia.indexOf('=');
    if (separador === -1) continue;

    const clave = limpia.slice(0, separador).trim();
    let valor = limpia.slice(separador + 1).trim();

    // Quitar comillas envolventes si las hay
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    // Las variables ya presentes en el entorno tienen prioridad
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}
