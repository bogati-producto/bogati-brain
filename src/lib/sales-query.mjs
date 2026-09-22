const clean = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const SALES_SOURCE = 'ventas/raw_ventas_pdv.csv';
export const SALES_INDEX = 'ventas/ventas_por_pdv_historico.md';

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (ch === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

export function querySales(content, filter) {
  if (!filter || typeof filter.store !== 'string' || !clean(filter.store)) return { clarification: '¿De qué local necesitas las ventas?' };
  const validMonth = value => value === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (!validMonth(filter.from) || !validMonth(filter.to) || (filter.from && filter.to && filter.from > filter.to)) throw new Error('Periodo inválido');
  const [header, ...data] = parseCsv(content);
  const columns = ['RUC', 'Bodega', 'Año Mes', 'Ventas', 'Transacciones'].map(name => header.indexOf(name));
  if (columns.some(i => i < 0)) throw new Error('Faltan columnas de ventas');
  const rows = data.map(row => {
    const [ruc, store, month, amount, transactions] = columns.map(i => row[i]);
    const value = amount?.replace(/^\$\s*/, '');
    if (!/^\d+(\.\d{1,2})?$/.test(value) || !/^\d+$/.test(transactions) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Registro de ventas inválido');
    return { ruc, store, month, cents: Math.round(Number(value) * 100), transactions: Number(transactions) };
  });
  const phrase = clean(filter.store);
  const stores = [...new Map(rows.map(r => [`${r.ruc}|${r.store}`, r])).values()];
  const exact = stores.filter(r => clean(r.store) === phrase || r.ruc === filter.store);
  const matches = exact.length ? exact : stores.filter(r => phrase.split(' ').every(word => ` ${clean(r.store)} `.includes(` ${word} `)));
  if (!matches.length) return { clarification: `No encontré un local que coincida con «${filter.store}» en el archivo de ventas. Indica su nombre completo o RUC.` };
  const aggregate = !exact.length && matches.length > 1 && matches.length <= 5 && phrase.split(' ').length <= 3;
  if (matches.length > 1 && !aggregate) return { clarification: `Hay varios locales que coinciden. ¿Cuál necesitas? ${matches.slice(0, 12).map(r => `${r.store} (RUC ${r.ruc})`).join('; ')}${matches.length > 12 ? '; indica un nombre más específico.' : '.'}` };
  const selectedStores = aggregate ? matches : [matches[0]];
  const selected = rows.filter(r => selectedStores.some(store => r.ruc === store.ruc && r.store === store.store) && (!filter.from || r.month >= filter.from) && (!filter.to || r.month <= filter.to)).sort((a,b) => a.month.localeCompare(b.month));
  if (!selected.length) return { clarification: `No hay registros de ${selectedStores.map(store => store.store).join(', ')} para el periodo solicitado. Eso no significa que sus ventas hayan sido cero.` };
  const months = new Set(); const annual = new Map(); const monthly = new Map();
  let cents = 0, transactions = 0;
  for (const row of selected) {
    const key = `${row.ruc}|${row.month}`;
    if (months.has(key)) throw new Error('Hay registros duplicados del mismo local y mes; revisar antes de sumar');
    months.add(key); cents += row.cents; transactions += row.transactions;
    const year = row.month.slice(0,4); annual.set(year, (annual.get(year) || 0) + row.cents);
    monthly.set(row.month, (monthly.get(row.month) || 0) + row.cents);
  }
  return { store: aggregate ? `PDV Latacunga (${selectedStores.length} locales)` : selectedStores[0].store, ruc: aggregate ? null : selectedStores[0].ruc, cents, transactions, first: selected[0].month,
    last: selected.at(-1).month, count: selected.length, annual: [...annual], rows: [...monthly], stores: selectedStores.map(s => `${s.store} (RUC ${s.ruc})`),
    requestedFrom: filter.from, requestedTo: filter.to, groupBy: filter.groupBy };
}

export function formatSales(result, route) {
  if (result.clarification) return result.clarification;
  const usd = cents => `$${(cents / 100).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let reply = `${result.store} registró **${usd(result.cents)} en ventas**, sumando ${result.count} registros mensuales de ${result.first} a ${result.last}. Son ingresos por ventas, no utilidad.\n\n`;
  if (!result.requestedFrom && !result.requestedTo) reply += 'Como no indicaste un periodo, tomé todo el histórico disponible.\n\n';
  else reply += `Periodo solicitado: ${result.requestedFrom || 'inicio del histórico'} a ${result.requestedTo || 'último registro'}. El total incluye únicamente los meses registrados.\n\n`;
  const detail = result.groupBy === 'month' ? result.rows.map(([month, value]) => [month, value]) : result.annual;
  reply += detail.map(([period, cents]) => `${period}: ${usd(cents)}`).join('\n');
  reply += `\n\nTransacciones: ${result.transactions.toLocaleString('es-EC')}.`;
  reply += `\n\n[Fuente: ${SALES_SOURCE} | Responsable: ${route.owner} | Actualizado: ${route.updated}]`;
  return reply;
}
