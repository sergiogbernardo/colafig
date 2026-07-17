import { playerNames } from './playerNames';
import { replacementDefinitions } from './replacementDefinitions';

export type Sticker = {
  id: string;
  number: string;
  label: string;
  section: string;
  slotId: string;
  variantType: 'original' | 'replacement';
  replacesLabel?: string;
};

export type AlbumSection = {
  id: string;
  name: string;
  short: string;
  flag: string;
  color: string;
};

export type CatalogAlbum = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  year: number;
  category: string;
  stickerCount: number;
  sectionCount: number;
  accent: string;
  status: 'published' | 'coming-soon';
};

export const albumCatalog: CatalogAlbum[] = [
  {
    slug: 'copa-2026',
    name: 'Copa do Mundo 2026',
    shortName: 'Copa 2026',
    description: 'Seleções, especiais e grandes nomes do torneio mundial de 2026.',
    year: 2026,
    category: 'Futebol',
    stickerCount: 980,
    sectionCount: 49,
    accent: '#920a43',
    status: 'published',
  },
];

const palette = ['#087862', '#3157a4', '#b91c4b', '#d65f18', '#6d3fb3', '#16758c'];

function colorFor(code: string) {
  const value = [...code].reduce((total, character) => total + character.charCodeAt(0), 0);
  return palette[value % palette.length];
}

const teams = [
  ['ALG', 'Argélia', '🇩🇿'], ['ARG', 'Argentina', '🇦🇷'], ['AUS', 'Austrália', '🇦🇺'],
  ['AUT', 'Áustria', '🇦🇹'], ['BEL', 'Bélgica', '🇧🇪'], ['BIH', 'Bósnia e Herzegovina', '🇧🇦'],
  ['BRA', 'Brasil', '🇧🇷'], ['CAN', 'Canadá', '🇨🇦'], ['CIV', 'Costa do Marfim', '🇨🇮'],
  ['COD', 'República Democrática do Congo', '🇨🇩'], ['COL', 'Colômbia', '🇨🇴'], ['CPV', 'Cabo Verde', '🇨🇻'],
  ['CRO', 'Croácia', '🇭🇷'], ['CUW', 'Curaçao', '🇨🇼'], ['CZE', 'Tchéquia', '🇨🇿'],
  ['ECU', 'Equador', '🇪🇨'], ['EGY', 'Egito', '🇪🇬'], ['ENG', 'Inglaterra', '🏴'],
  ['ESP', 'Espanha', '🇪🇸'], ['FRA', 'França', '🇫🇷'], ['GER', 'Alemanha', '🇩🇪'],
  ['GHA', 'Gana', '🇬🇭'], ['HAI', 'Haiti', '🇭🇹'], ['IRN', 'Irã', '🇮🇷'],
  ['IRQ', 'Iraque', '🇮🇶'], ['JOR', 'Jordânia', '🇯🇴'], ['JPN', 'Japão', '🇯🇵'],
  ['KOR', 'Coreia do Sul', '🇰🇷'], ['KSA', 'Arábia Saudita', '🇸🇦'], ['MAR', 'Marrocos', '🇲🇦'],
  ['MEX', 'México', '🇲🇽'], ['NED', 'Países Baixos', '🇳🇱'], ['NOR', 'Noruega', '🇳🇴'],
  ['NZL', 'Nova Zelândia', '🇳🇿'], ['PAN', 'Panamá', '🇵🇦'], ['PAR', 'Paraguai', '🇵🇾'],
  ['POR', 'Portugal', '🇵🇹'], ['QAT', 'Catar', '🇶🇦'], ['RSA', 'África do Sul', '🇿🇦'],
  ['SCO', 'Escócia', '🏴'], ['SEN', 'Senegal', '🇸🇳'], ['SUI', 'Suíça', '🇨🇭'],
  ['SWE', 'Suécia', '🇸🇪'], ['TUN', 'Tunísia', '🇹🇳'], ['TUR', 'Turquia', '🇹🇷'],
  ['URU', 'Uruguai', '🇺🇾'], ['USA', 'Estados Unidos', '🇺🇸'], ['UZB', 'Uzbequistão', '🇺🇿'],
] as const;

export const sections: AlbumSection[] = [
  { id: 'fwc', name: 'Especiais da Copa', short: 'FWC', flag: '✦', color: '#920a43' },
  ...teams.map(([code, name, flag]) => ({
    id: code.toLowerCase(),
    name,
    short: code,
    flag,
    color: colorFor(code),
  })),
];

const specialNames = [
  'Logo da coleção',
  'Emblema oficial — parte 1',
  'Emblema oficial — parte 2',
  'Mascotes oficiais',
  'Slogan oficial',
  'Bola oficial',
  'País-sede: Canadá',
  'País-sede: México',
  'País-sede: Estados Unidos',
  'Itália 1934',
  'Uruguai 1950',
  'Alemanha Ocidental 1954',
  'Brasil 1962',
  'Alemanha Ocidental 1974',
  'Argentina 1986',
  'Brasil 1994',
  'Brasil 2002',
  'Itália 2006',
  'Alemanha 2014',
  'Argentina 2022',
];

const specialStickers: Sticker[] = specialNames.map((label, index) => ({
  id: index === 0 ? '00' : `fwc-${index}`,
  number: index === 0 ? '00' : `FWC ${index}`,
  label,
  section: 'fwc',
  slotId: index === 0 ? '00' : `fwc-${index}`,
  variantType: 'original',
}));

const teamStickers: Sticker[] = sections.slice(1).flatMap((section) =>
  Array.from({ length: 20 }, (_, index) => {
    const position = index + 1;
    const label = position === 1
      ? `Escudo ${section.name}`
      : position === 13
        ? `Foto da seleção — ${section.name}`
        : playerNames[`${section.short}${position}`] ?? `Jogador ${position}`;

    const id = `${section.id}-${position}`;
    return {
      id,
      number: `${section.short} ${position}`,
      label,
      section: section.id,
      slotId: id,
      variantType: 'original' as const,
    };
  }),
);

export const stickers: Sticker[] = [...specialStickers, ...teamStickers];

const originalByLabel = new Map(stickers.map((sticker) => [sticker.label, sticker]));

export const replacementStickers: Sticker[] = replacementDefinitions.map(({ incoming, outgoing }) => {
  const original = originalByLabel.get(outgoing);
  if (!original) throw new Error(`Figurinha original não encontrada para a substituta: ${incoming} → ${outgoing}.`);
  return {
    id: `replacement-${original.id}`,
    number: `${original.number} S`,
    label: incoming,
    section: original.section,
    slotId: original.id,
    variantType: 'replacement',
    replacesLabel: outgoing,
  };
});

export const collectibleStickers: Sticker[] = [...stickers, ...replacementStickers];

export const replacementsBySlot = replacementStickers.reduce<Record<string, Sticker[]>>((groups, sticker) => {
  groups[sticker.slotId] = [...(groups[sticker.slotId] ?? []), sticker];
  return groups;
}, {});

export const collectiblesBySlot = collectibleStickers.reduce<Record<string, Sticker[]>>((groups, sticker) => {
  groups[sticker.slotId] = [...(groups[sticker.slotId] ?? []), sticker];
  return groups;
}, {});

export function collectiblesForSlot(slotId: string) {
  return collectiblesBySlot[slotId] ?? [];
}

export function slotQuantity(slotId: string, quantities: Record<string, number>) {
  return collectiblesForSlot(slotId).reduce((total, sticker) => total + (quantities[sticker.id] ?? 0), 0);
}

if (sections.length !== 49 || stickers.length !== 980 || replacementStickers.length !== 118) {
  throw new Error('O catálogo principal do ColaFig deve ter 49 seções, 980 espaços e 118 substitutas.');
}

export const initialQuantities: Record<string, number> = {};
