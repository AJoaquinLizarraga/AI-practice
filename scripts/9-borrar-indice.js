/**
 * Limpieza: borra el índice entero para empezar de cero.
 *
 *   npm run borrar
 */
import { CONFIG, c, titulo, getPinecone } from '../src/config.js';
import readline from 'node:readline/promises';

const pc = getPinecone();

titulo('Borrar el índice');

const { indexes = [] } = await pc.listIndexes();
if (!indexes.find((i) => i.name === CONFIG.indexName)) {
  console.log(`${c.dim}El índice "${CONFIG.indexName}" no existe. Nada que borrar.${c.reset}\n`);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const respuesta = await rl.question(
  `${c.red}Se borrará el índice "${CONFIG.indexName}" y todos sus vectores.${c.reset}\nEscribe el nombre del índice para confirmar: `
);
rl.close();

if (respuesta.trim() !== CONFIG.indexName) {
  console.log(`\n${c.yellow}Cancelado.${c.reset}\n`);
  process.exit(0);
}

await pc.deleteIndex(CONFIG.indexName);
console.log(`\n${c.green}✓ Índice borrado.${c.reset}  Vuelve a empezar con:  ${c.yellow}npm run crear${c.reset}\n`);
