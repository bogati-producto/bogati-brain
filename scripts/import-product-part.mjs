import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readProductParts, PART_PREFIX } from '../src/lib/product-sales.mjs';

const [source, partNumber] = process.argv.slice(2);
if (!source || !/^\d{1,3}$/.test(partNumber || '') || Number(partNumber) < 1) throw new Error('Uso: node scripts/import-product-part.mjs archivo.csv numero-parte');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(root, 'ventas/productos_pdv');
const name = `parte_${partNumber.padStart(3, '0')}.csv`;
const content = fs.readFileSync(source);
const hash = createHash('sha256').update(content).digest('hex');
const existing = fs.existsSync(folder) ? fs.readdirSync(folder).filter(file => /^parte_\d{3}\.csv$/.test(file)).sort().map(file => ({ id: `ventas/productos_pdv/${file}`, content: fs.readFileSync(path.join(folder, file), 'utf8') })) : [];
const target = path.join(folder, name);
if (fs.existsSync(target) && !fs.readFileSync(target).equals(content)) throw new Error('Esa parte ya existe con contenido distinto; no se sobrescribió');
const sameFile = existing.find(part => createHash('sha256').update(part.content).digest('hex') === hash);
if (sameFile && sameFile.id !== `${PART_PREFIX}${partNumber.padStart(3, '0')}.csv`) throw new Error(`Archivo ya incorporado como ${sameFile.id}`);
const parts = [...existing.filter(part => part.id !== `ventas/productos_pdv/${name}`), { id: `ventas/productos_pdv/${name}`, content: content.toString('utf8') }].sort((a,b)=>a.id.localeCompare(b.id));
const { rows, duplicates } = readProductParts(parts);
const products = [...new Set(rows.map(row => row.product))].sort();
const months = rows.map(row => row.month).sort();
const manifestFile = path.join(folder, 'manifest.json');
const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
const manifest = { status: 'partial', channel: previous.channel || 'no especificado', updated: '2026-09-22', responsible: 'Eduardo Naula (Coordinador de Producto)',
  parts: parts.map(part => ({ file: part.id, sha256: createHash('sha256').update(part.content).digest('hex'), rows: readProductParts([part]).rows.length })),
  records: rows.length, duplicatesIgnored: duplicates, products: products.length, stores: new Set(rows.map(row => row.store)).size, from: months[0], to: months.at(-1) };
const escape = value => value.replaceAll('|', '\\|');
const md = `# Productos por PDV y mes — histórico parcial\n\n` +
  `Responsable: ${manifest.responsible}\nÁrea: Producto\nActualizado: ${manifest.updated}\nCanal: ${manifest.channel}\nEstado: CARGA PARCIAL (${parts.length} parte(s)); faltan las siguientes entregas.\n\n` +
  `## Alcance y reglas de consulta\n\nEsta fuente relaciona producto, bodega/PDV, ventas en dólares, unidades y año-mes. No es la tabla de órdenes de Pedidos Ya. El canal no se debe deducir del nombre de una promoción.\n\nCada respuesta debe mencionar que la carga es parcial y señalar el canal. Si un producto o periodo no aparece, indicar que no está en las partes cargadas; nunca asumir cero ventas. Mantener nombres de combos y variantes separados. No multiplicar las unidades por números que aparezcan en el nombre del producto.\n\nPara ciudades, sumar las bodegas coincidentes; para nombres exactos de PDV, usar ese PDV. Filtrar las filas de los CSV y sumar mediante código, sin enviar el archivo entero al modelo. Clave de registro: Producto + Bodega + Año Mes. Duplicados idénticos se cuentan una sola vez; valores distintos para la misma clave bloquean la incorporación.\n\n` +
  `## Cobertura de las partes recibidas\n\nRegistros únicos: ${rows.length}\nProductos/variantes: ${products.length}\nBodegas distintas: ${manifest.stores}\nMes mínimo: ${manifest.from}\nMes máximo: ${manifest.to}\nUnidades registradas en estas partes: ${rows.reduce((s,r)=>s+r.units,0)}\nVentas registradas, redondeadas por fila a centavos: $${(rows.reduce((s,r)=>s+r.cents,0)/100).toFixed(2)}\nDuplicados idénticos omitidos: ${duplicates}\n\nEstos conteos describen lo recibido; no prueban que la exportación de Power BI esté completa.\n\n` +
  `## Archivos incorporados\n\n| Parte | Registros | SHA-256 |\n| --- | ---: | --- |\n${manifest.parts.map(part=>`| ${part.file} | ${part.rows} | ${part.sha256} |`).join('\n')}\n\n` +
  `## Productos presentes\n\n| Producto exacto |\n| --- |\n${products.map(product=>`| ${escape(product)} |`).join('\n')}\n\n[Fuente: ventas/productos_por_pdv_historico.md | Responsable: ${manifest.responsible} | Actualizado: ${manifest.updated}]\n`;
// All validation completes before writes. Original CSV bytes are preserved.
fs.mkdirSync(folder, {recursive:true});
if (!fs.existsSync(target)) fs.writeFileSync(target, content);
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'ventas/productos_por_pdv_historico.md'), md);
console.log(JSON.stringify(manifest));
