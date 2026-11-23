import { describeValue, isRecord, requireOnlyKeys } from '@puni/shared-checkout';
import type { ModelPrices, RateCard, RateCardEntry } from './contract';
import { RateCardMalformed } from './failures';

type Refuse = (problem: string) => never;

const priceKeys = ['input', 'cacheWrite', 'cacheWriteExtended', 'cacheRead', 'output'] as const;
const entryKeys = ['provider', 'model', 'prices', 'source', 'accessedAt'];
const cardKeys = ['schemaVersion', 'currency', 'unit', 'entries', 'notes'];

function readText(value: unknown, where: string, refuse: Refuse): string {
  if (typeof value === 'string' && value !== '') return value;
  return refuse(`${where} is ${describeValue(value)}; expected a non-empty string`);
}

function readPrice(value: unknown, where: string, refuse: Refuse): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return refuse(`${where} is ${describeValue(value)}; expected a price of at least 0`);
}

function readPrices(value: unknown, where: string, refuse: Refuse): ModelPrices {
  if (!isRecord(value)) return refuse(`${where} is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, priceKeys, where, refuse);
  const extended = value['cacheWriteExtended'];
  return {
    input: readPrice(value['input'], `${where}.input`, refuse),
    cacheWrite: readPrice(value['cacheWrite'], `${where}.cacheWrite`, refuse),
    ...(extended === undefined
      ? {}
      : { cacheWriteExtended: readPrice(extended, `${where}.cacheWriteExtended`, refuse) }),
    cacheRead: readPrice(value['cacheRead'], `${where}.cacheRead`, refuse),
    output: readPrice(value['output'], `${where}.output`, refuse),
  };
}

function readEntry(value: unknown, where: string, refuse: Refuse): RateCardEntry {
  if (!isRecord(value)) return refuse(`${where} is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, entryKeys, where, refuse);
  const accessedAt = readText(value['accessedAt'], `${where}.accessedAt`, refuse);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(accessedAt)) {
    refuse(`${where}.accessedAt is ${JSON.stringify(accessedAt)}; expected YYYY-MM-DD`);
  }
  return {
    provider: readText(value['provider'], `${where}.provider`, refuse),
    model: readText(value['model'], `${where}.model`, refuse),
    prices: readPrices(value['prices'], `${where}.prices`, refuse),
    source: readText(value['source'], `${where}.source`, refuse),
    accessedAt,
  };
}

/**
 * The rate card a parsed JSON `value` read from `source` holds: `schemaVersion` 1, a
 * three-letter `currency`, `unit` `perMillionTokens`, at least one entry, each model once, and
 * optional `notes`.
 *
 * @throws RateCardMalformed naming the first problem.
 */
export function readRateCard(value: unknown, source: string): RateCard {
  const refuse: Refuse = (problem) => {
    throw new RateCardMalformed({ details: { source, problem } });
  };
  if (!isRecord(value)) return refuse(`is ${describeValue(value)}; expected an object`);
  requireOnlyKeys(value, cardKeys, '', refuse);
  if (value['schemaVersion'] !== 1) {
    refuse(`schemaVersion is ${describeValue(value['schemaVersion'])}; expected 1`);
  }
  if (value['unit'] !== 'perMillionTokens') {
    refuse(`unit is ${describeValue(value['unit'])}; expected "perMillionTokens"`);
  }
  const currency = value['currency'];
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency)) {
    return refuse(`currency is ${describeValue(currency)}; expected three capital letters`);
  }
  const notes = value['notes'];
  if (
    notes !== undefined &&
    !(Array.isArray(notes) && notes.every((note) => typeof note === 'string'))
  ) {
    refuse(`notes is ${describeValue(notes)}; expected a list of strings`);
  }
  const listed = value['entries'];
  if (!Array.isArray(listed) || listed.length === 0) {
    return refuse(`entries is ${describeValue(listed)}; expected at least one entry`);
  }
  const entries = listed.map((entry, index) =>
    readEntry(entry, `entries[${String(index)}]`, refuse),
  );
  const models = new Set<string>();
  for (const { model } of entries) {
    if (models.has(model)) refuse(`lists the model ${model} twice`);
    models.add(model);
  }
  return { currency, entries };
}
