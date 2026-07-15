export type CollectionListView = 'duplicates' | 'missing';

export type CollectionListItem = {
  code: string;
  label: string;
  quantity: number;
  sectionName: string;
};

export function formatCollectionList({ albumName, items, ownerName, view }: {
  albumName: string;
  items: CollectionListItem[];
  ownerName?: string;
  view: CollectionListView;
}) {
  const title = view === 'missing' ? 'Figurinhas faltantes' : 'Figurinhas repetidas';
  const grouped = new Map<string, CollectionListItem[]>();
  items.forEach((item) => grouped.set(item.sectionName, [...(grouped.get(item.sectionName) ?? []), item]));
  const lines = [
    `ColaFig — ${title}`,
    albumName,
    ownerName ? `Coleção de ${ownerName}` : '',
    `${items.length} ${items.length === 1 ? 'figurinha' : 'figurinhas'}`,
    '',
  ].filter((line, index) => line || index >= 4);

  grouped.forEach((sectionItems, sectionName) => {
    lines.push(sectionName);
    sectionItems.forEach((item) => {
      const suffix = view === 'duplicates' ? ` — ${Math.max(item.quantity - 1, 0)} para troca` : '';
      lines.push(`${item.code} — ${item.label}${suffix}`);
    });
    lines.push('');
  });

  lines.push('Organizado com ColaFig · https://sabion.io/colafig/');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable.');
}
