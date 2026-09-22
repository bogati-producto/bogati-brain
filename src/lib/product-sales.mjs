import { parseCsv } from './sales-query.mjs';

export const PRODUCT_INDEX = 'ventas/productos_por_pdv_historico.md';
export const PART_PREFIX = 'ventas/productos_pdv/parte_';
export const PRODUCT_HEADERS = ['Producto', 'Bodega', 'Suma de Ventas $', 'Suma de Unidades', 'Año Mes'];
const normalized = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function readProductParts(parts) {
  const unique = new Map();
  let duplicates = 0;
  for (const part of parts) {
    const [header, ...lines] = parseCsv(part.content);
    if (!header || JSON.stringify(header) !== JSON.stringify(PRODUCT_HEADERS)) throw new Error(`Columnas inesperadas: ${part.id}`);
    for (const [index, fields] of lines.entries()) {
      const [product, store, revenue, quantity, month] = fields;
      if (fields.length !== 5 || !product?.trim() || !store?.trim() || !revenue?.trim() || !quantity?.trim() ||
          !Number.isFinite(Number(revenue)) || !Number.isSafeInteger(Number(quantity)) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new Error(`Registro inválido: ${part.id}, fila ${index + 2}`);
      }
      const row = { product: product.trim(), store: store.trim(), month, units: Number(quantity), cents: Math.round(Number(revenue) * 100), source: part.id };
      if (!Number.isSafeInteger(row.cents)) throw new Error('Importe fuera de rango');
      const key = JSON.stringify([row.product, row.store, row.month]);
      const previous = unique.get(key);
      if (previous) {
        if (previous.units !== row.units || previous.cents !== row.cents) throw new Error(`Partes en conflicto para ${row.product}, ${row.store}, ${row.month}`);
        duplicates++;
      } else unique.set(key, row);
    }
  }
  return { rows: [...unique.values()], duplicates };
}

export function queryProducts(parts, filter) {
  if (!filter || typeof filter.product !== 'string' || !filter.product.trim() ||
      ![filter.from, filter.to].every(date => date === null || (typeof date === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(date))) ||
      (filter.store !== null && (typeof filter.store !== 'string' || !filter.store.trim())) ||
      (filter.from && filter.to && filter.from > filter.to)) throw new Error('Filtro de productos inválido');
  const { rows, duplicates } = readProductParts(parts);
  const names = [...new Set(rows.map(row => row.product))];
  const needle = normalized(filter.product);
  const matches = names.filter(name => normalized(name) === needle);
  if (!matches.length) {
    const alternatives = names.filter(name => needle.split(' ').every(word => normalized(name).includes(word))).slice(0, 8);
    return { reply: `No encuentro el producto exacto «${filter.product}» en las partes cargadas. La carga es parcial; esto no significa que se hayan vendido cero unidades.${alternatives.length ? ` Hay estas variantes o combos: ${alternatives.join('; ')}. Indica el nombre exacto que deseas consultar.` : ''}` };
  }
  let selected = rows.filter(row => matches.includes(row.product));
  let stores = [];
  if (filter.store) {
    const storeNames = [...new Set(rows.map(row => row.store))];
    const place = normalized(filter.store);
    const exact = storeNames.filter(name => normalized(name) === place);
    stores = exact.length ? exact : storeNames.filter(name => place.split(' ').every(word => ` ${normalized(name)} `.includes(` ${word} `)));
    if (!stores.length) return { reply: `No encuentro «${filter.store}» entre los PDV de las partes cargadas. La carga sigue siendo parcial.` };
    selected = selected.filter(row => stores.includes(row.store));
  }
  selected = selected.filter(row => (!filter.from || row.month >= filter.from) && (!filter.to || row.month <= filter.to));
  if (!selected.length) return { reply: `No hay registros de «${filter.product}» para ese lugar y periodo en las partes cargadas. Como faltan partes, no se puede concluir que las ventas sean cero.` };
  const periods = selected.map(row => row.month).sort();
  return { product: matches.join(', '), rows: selected.length, units: selected.reduce((sum, row) => sum + row.units, 0),
    cents: selected.reduce((sum, row) => sum + row.cents, 0), duplicates,
    from: periods[0], to: periods.at(-1), requestedFrom: filter.from, requestedTo: filter.to,
    stores: [...new Set(selected.map(row => row.store))], sources: [...new Set(selected.map(row => row.source))], parts: parts.length };
}

export function formatProducts(result, metadata = {}) {
  const channel = metadata.channel || 'no especificado en el archivo';
  const scope = `Carga parcial: ${metadata.parts ?? result.parts ?? 0} parte(s) incorporada(s). Canal: ${channel}.`;
  if (result.reply) return `${result.reply}\n\n${scope}`;
  const format = number => number.toLocaleString('es-EC', { maximumFractionDigits: 2 });
  return `«${result.product}»: **${format(result.units)} unidades registradas**, con **$${(result.cents / 100).toLocaleString('es-EC', {minimumFractionDigits:2,maximumFractionDigits:2})} en ventas**.\n\n` +
    `Periodo con registros: ${result.from} a ${result.to}. ${result.requestedFrom || result.requestedTo ? `Filtro solicitado: ${result.requestedFrom || 'inicio disponible'} a ${result.requestedTo || 'fin disponible'}.` : 'Se tomó todo el periodo disponible.'}\n` +
    `PDV incluidos (${result.stores.length}): ${result.stores.slice(0, 10).join('; ')}${result.stores.length > 10 ? '; y otros del filtro solicitado' : ''}.\n\n` +
    `${scope} Se suman unidades del producto tal como aparece en la fuente; no se multiplican por los artículos de un combo ni se interpretan como órdenes de Pedidos Ya.\n\n` +
    `[Fuente: ${result.sources.join(', ')} | Responsable: Eduardo Naula (Coordinador de Producto) | Actualizado: ${metadata.updated || '2026-09-22'}]`;
}
