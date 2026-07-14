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
    label: index === 0 ? `Escudo ${section.name}` : `Figurinha ${index + 1}`,
    section: section.id,
  })),
);

export const initialQuantities: Record<string, number> = {};
