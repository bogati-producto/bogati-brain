import { parseCsv } from './sales-query.mjs';

export const PRODUCT_INDEX = 'ventas/productos_por_pdv_historico.md';
export const PART_PREFIX = 'ventas/productos_pdv/parte_';
export const PRODUCT_HEADERS = ['Producto', 'Bodega', 'Suma de Ventas $', 'Suma de Unidades', 'Año Mes'];
const normalized = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function compareProducts(parts,filter) {
  if(filter.ranking || filter.products.length<2 || filter.products.length>6 || filter.products.some(p=>typeof p!=='string'||!p.trim()||p.length>200)) throw Error('Comparación inválida');
  const groups=filter.comparisonGroups;
  if(groups!==undefined&&(!Array.isArray(groups)||groups.length!==2||groups.some(g=>!Array.isArray(g)||!g.length||g.some(i=>!Number.isInteger(i)||i<0||i>=filter.products.length))||new Set(groups.flat()).size!==groups.flat().length))throw Error('Grupos inválidos');
  const prepared=readProductParts(parts),notes=[];
  // Verified spelling correction, not a fuzzy substitution of a combo or variant.
  const products=filter.products.map(p=>{if(normalized(p)==='vaso zeuz'&&prepared.rows.some(r=>r.product==='Vaso Zeus')){notes.push('Se interpretó «Vaso Zeuz» como «Vaso Zeus», nombre presente en el catálogo.');return 'Vaso Zeus';}return p;});
  if(new Set(products.map(normalized)).size!==products.length)throw Error('Productos repetidos en comparación');
  const items=products.map(product=>({requested:product,...queryProducts(parts,{product,store:filter.store,from:filter.from,to:filter.to},prepared)}));
  return {comparison:items,groups,notes,from:filter.from,to:filter.to,store:filter.store,parts:parts.length,sources:[...new Set(items.flatMap(i=>i.sources||[]))]};
}

function formatComparison(result,metadata) {
  const number=n=>n.toLocaleString('es-EC',{maximumFractionDigits:2});
  const money=c=>'$'+(c/100).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
  const items=result.comparison,complete=items.every(i=>!i.reply),units=items.reduce((s,i)=>s+(i.units||0),0);
  const percent=n=>units>0&&complete?number(n/units*100)+'%':'No calculable';
  let text=`**Comparación de productos** — ${result.store||'todos los PDV'}.\nPeriodo solicitado: ${result.from||'inicio disponible'} a ${result.to||'fin disponible'}.\n\n`;
  if(result.notes.length)text+=result.notes.join(' ')+'\n\n';
  text+='| Producto | Unidades | Ventas | Venta media por unidad | Participación en unidades |\n|---|---:|---:|---:|---:|\n';
  for(const i of items)text+=`| ${(i.product||i.requested).replaceAll('|','\\|')} | ${i.reply?'Sin registros | — | — | —':`${number(i.units)} | ${money(i.cents)} | ${i.units>0?money(i.cents/i.units):'No calculable'} | ${percent(i.units)}`} |\n`;
  if(complete){
    const maxUnits=Math.max(...items.map(i=>i.units)),maxRevenue=Math.max(...items.map(i=>i.cents));
    text+=`\nLíder por unidades: **${items.filter(i=>i.units===maxUnits).map(i=>i.product).join(' y ')}**. Líder por facturación: **${items.filter(i=>i.cents===maxRevenue).map(i=>i.product).join(' y ')}**. La participación corresponde solamente a los productos comparados.\n`;
    if(result.groups){const totals=result.groups.map(g=>({label:g.map(i=>items[i].product).join(' + '),units:g.reduce((s,i)=>s+items[i].units,0),cents:g.reduce((s,i)=>s+items[i].cents,0)}));const [a,b]=totals;
      text+=`\n**Comparación agrupada:** ${a.label}: ${number(a.units)} unidades y ${money(a.cents)}; ${b.label}: ${number(b.units)} unidades y ${money(b.cents)}. Diferencia del primer grupo respecto al segundo: ${number(a.units-b.units)} unidades${b.units>0?' ('+number((a.units-b.units)/b.units*100)+'%)':''} y ${money(a.cents-b.cents)}.\n`;
    }
  }else text+='\nComparación incompleta: no se determina un ganador ni porcentajes con productos ausentes.\n'+items.filter(i=>i.reply).map(i=>`- ${i.requested}: ${i.reply}`).join('\n');
  const stores=[...new Set(items.flatMap(i=>i.stores||[]))];
  text+=`\nPDV con registros: ${stores.join('; ')||'ninguno'}.\n\nCarga parcial: ${metadata.parts??result.parts} partes. Canal: ${metadata.channel||'no especificado'}. Los datos faltantes no equivalen a cero. Las cifras no demuestran causas comerciales ni utilidad.\n\n[Fuente: ${result.sources.join(', ')||PRODUCT_INDEX} | Responsable: Eduardo Naula (Coordinador de Producto) | Actualizado: ${metadata.updated||'2026-09-22'}]`;
  return text;
}

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

export function queryProducts(parts, filter, prepared = null) {
  if (Array.isArray(filter?.products)) return compareProducts(parts,filter);
  const ranking = filter?.ranking === true;
  if (!filter || (ranking ? filter.product !== null || !['units','revenue'].includes(filter.metric) || !Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 20 : typeof filter.product !== 'string' || !filter.product.trim()) ||
      ![filter.from, filter.to].every(date => date === null || (typeof date === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(date))) ||
      (filter.store !== null && (typeof filter.store !== 'string' || !filter.store.trim())) ||
      (filter.from && filter.to && filter.from > filter.to)) throw new Error('Filtro de productos inválido');
  const { rows, duplicates } = prepared || readProductParts(parts);
  const names = [...new Set(rows.map(row => row.product))];
  const needle = ranking ? '' : normalized(filter.product);
  const matches = ranking ? names : names.filter(name => normalized(name) === needle);
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
  if (!selected.length) return { reply: `No hay registros ${ranking ? 'de productos' : `de «${filter.product}»`} para ese lugar y periodo en las partes cargadas. Como faltan partes, no se puede concluir que las ventas sean cero.` };
  const periods = selected.map(row => row.month).sort();
  if (ranking) {
    const totals = new Map();
    for (const row of selected) {
      const total = totals.get(row.product) || {product:row.product,units:0,cents:0};
      total.units += row.units; total.cents += row.cents; totals.set(row.product,total);
    }
    const key = filter.metric === 'revenue' ? 'cents' : 'units';
    const sorted = [...totals.values()].sort((a,b)=>b[key]-a[key] || a.product.localeCompare(b.product));
    const cutoff = sorted[Math.min(filter.limit, sorted.length)-1][key];
    return {ranking:sorted.filter((r,i)=>i<filter.limit || r[key]===cutoff),metric:filter.metric,from:periods[0],to:periods.at(-1),requestedFrom:filter.from,requestedTo:filter.to,store:filter.store,sources:[...new Set(selected.map(r=>r.source))],parts:parts.length};
  }
  return { product: matches.join(', '), rows: selected.length, units: selected.reduce((sum, row) => sum + row.units, 0),
    cents: selected.reduce((sum, row) => sum + row.cents, 0), duplicates,
    from: periods[0], to: periods.at(-1), requestedFrom: filter.from, requestedTo: filter.to,
    stores: [...new Set(selected.map(row => row.store))], sources: [...new Set(selected.map(row => row.source))], parts: parts.length };
}

export function formatProducts(result, metadata = {}) {
  if (result.comparison) return formatComparison(result,metadata);
  const channel = metadata.channel || 'no especificado en el archivo';
  const scope = `Carga parcial: ${metadata.parts ?? result.parts ?? 0} parte(s) incorporada(s). Canal: ${channel}.`;
  if (result.reply) return `${result.reply}\n\n${scope}`;
  const format = number => number.toLocaleString('es-EC', { maximumFractionDigits: 2 });
  if (result.ranking) return `**Productos con más ${result.metric === 'revenue' ? 'facturación' : 'unidades vendidas'} entre los datos cargados**${result.store ? ` — ${result.store}` : ''}.\n\n` +
    result.ranking.map((r,i)=>`${i+1}. **${r.product}**: **${format(r.units)} unidades**, $${(r.cents/100).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2})} en ventas.`).join('\n') +
    `\n\nPeriodo solicitado: ${result.requestedFrom || 'inicio disponible'} a ${result.requestedTo || 'fin disponible'}. Registros disponibles: ${result.from} a ${result.to}.\n\n${scope} Este resultado puede cambiar al incorporar las partes faltantes. Se mantienen separados los nombres y combos del archivo; se incluyen empates en el corte.\n\n[Fuente: ${result.sources.join(', ')} | Responsable: Eduardo Naula (Coordinador de Producto) | Actualizado: ${metadata.updated || '2026-09-22'}]`;
  return `«${result.product}»: **${format(result.units)} unidades registradas**, con **$${(result.cents / 100).toLocaleString('es-EC', {minimumFractionDigits:2,maximumFractionDigits:2})} en ventas**.\n\n` +
    `Periodo con registros: ${result.from} a ${result.to}. ${result.requestedFrom || result.requestedTo ? `Filtro solicitado: ${result.requestedFrom || 'inicio disponible'} a ${result.requestedTo || 'fin disponible'}.` : 'Se tomó todo el periodo disponible.'}\n` +
    `PDV incluidos (${result.stores.length}): ${result.stores.slice(0, 10).join('; ')}${result.stores.length > 10 ? '; y otros del filtro solicitado' : ''}.\n\n` +
    `${scope} Se suman unidades del producto tal como aparece en la fuente; no se multiplican por los artículos de un combo ni se interpretan como órdenes de Pedidos Ya.\n\n` +
    `[Fuente: ${result.sources.join(', ')} | Responsable: Eduardo Naula (Coordinador de Producto) | Actualizado: ${metadata.updated || '2026-09-22'}]`;
}
