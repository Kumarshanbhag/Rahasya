import { isHidden } from './entry';
import type { Entry } from './vault-store';

export type SortOrder = 'name-asc' | 'name-desc' | 'newest' | 'oldest';

export const SORT_LABELS: Record<SortOrder, string> = {
  'name-asc': 'Name A to Z',
  'name-desc': 'Name Z to A',
  newest: 'Newest first',
  oldest: 'Oldest first',
};

const byName = (a: Entry, b: Entry) => a.data.name.localeCompare(b.data.name, undefined, { sensitivity: 'base' });
const compare: Record<SortOrder, (a: Entry, b: Entry) => number> = {
  'name-asc': byName,
  'name-desc': (a, b) => byName(b, a),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
};

/** What searching can see: the name, field labels and visible values. Hidden values never match. */
function searchable(entry: Entry) {
  const visible = entry.data.fields.flatMap((f) => (isHidden(f.kind) ? [f.label] : [f.label, f.value]));
  return [entry.data.name, ...visible].join('\n').toLowerCase();
}

/** The entries the home list shows: not in Trash, matching the search, in the chosen order. */
export function visibleEntries(entries: Record<string, Entry>, { search, sort }: { search: string; sort: SortOrder }) {
  const query = search.trim().toLowerCase();
  return Object.values(entries)
    .filter((e) => !e.deletedAt && (!query || searchable(e).includes(query)))
    .sort(compare[sort]);
}
