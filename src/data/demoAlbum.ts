export type Sticker = {
  id: string;
  number: string;
  label: string;
  section: string;
};

export const sections = [
  { id: 'mex', name: 'México', short: 'MEX', flag: '🇲🇽', color: '#087862' },
  { id: 'can', name: 'Canadá', short: 'CAN', flag: '🇨🇦', color: '#e33832' },
  { id: 'usa', name: 'Estados Unidos', short: 'USA', flag: '🇺🇸', color: '#3157a4' },
];

export const stickers: Sticker[] = sections.flatMap((section) =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `${section.id}-${index + 1}`,
    number: `${section.short} ${String(index + 1).padStart(2, '0')}`,
    label: index === 0 ? `Escudo ${section.name}` : `Jogador ${index}`,
    section: section.id,
  })),
);

export const initialQuantities: Record<string, number> = {
  'mex-1': 1,
  'mex-2': 1,
  'mex-3': 2,
  'mex-5': 1,
  'mex-7': 1,
  'can-1': 1,
  'can-2': 3,
  'can-4': 1,
  'can-6': 1,
  'usa-1': 1,
  'usa-3': 1,
  'usa-4': 2,
  'usa-5': 1,
  'usa-8': 1,
};
