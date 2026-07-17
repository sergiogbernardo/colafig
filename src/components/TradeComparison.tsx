import { useMemo, useState } from 'react';
import { collectibleStickers, sections, slotQuantity, type Sticker } from '../data/album';

type TradeOffer = {
  extraCopies: number;
  sticker: Sticker;
};

function buildOffers(source: Record<string, number>, target: Record<string, number>) {
  return collectibleStickers.flatMap((sticker): TradeOffer[] => {
    const extraCopies = Math.max((source[sticker.id] ?? 0) - 1, 0);
    return extraCopies > 0 && slotQuantity(sticker.slotId, target) === 0
      ? [{ extraCopies, sticker }]
      : [];
  });
}

function OfferList({ emptyText, offers }: { emptyText: string; offers: TradeOffer[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleOffers = expanded ? offers : offers.slice(0, 6);

  if (offers.length === 0) return <p className="trade-empty">{emptyText}</p>;

  return (
    <>
      <div className="trade-offer-list">
        {visibleOffers.map(({ extraCopies, sticker }) => {
          const section = sections.find((item) => item.id === sticker.section);
          return (
            <article key={sticker.id}>
              <b>{sticker.number}</b>
              <div><strong>{sticker.label}</strong><small>{sticker.variantType === 'replacement' ? `Substituta de ${sticker.replacesLabel}` : `${section?.flag} ${section?.name}`}</small></div>
              <span>{extraCopies} para troca</span>
            </article>
          );
        })}
      </div>
      {offers.length > 6 && <button className="trade-expand" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? 'Mostrar menos' : `Ver todas as ${offers.length}`}</button>}
    </>
  );
}

export function TradeComparison({ friendName, friendQuantities, ownQuantities }: {
  friendName: string;
  friendQuantities: Record<string, number>;
  ownQuantities: Record<string, number>;
}) {
  const comparison = useMemo(() => {
    const friendOffers = buildOffers(friendQuantities, ownQuantities);
    const ownOffers = buildOffers(ownQuantities, friendQuantities);
    return {
      friendExtraCopies: friendOffers.reduce((total, item) => total + item.extraCopies, 0),
      friendOffers,
      ownExtraCopies: ownOffers.reduce((total, item) => total + item.extraCopies, 0),
      ownOffers,
      possibleTrades: Math.min(friendOffers.length, ownOffers.length),
    };
  }, [friendQuantities, ownQuantities]);

  return (
    <section className="trade-comparison" aria-labelledby="trade-comparison-title">
      <header>
        <div><span className="eyebrow dark">Comparação automática</span><h2 id="trade-comparison-title">O que vocês podem trocar</h2><p>Comparamos as repetidas de cada coleção com as figurinhas que faltam na outra.</p></div>
        <div className="trade-potential"><strong>{comparison.possibleTrades}</strong><span>{comparison.possibleTrades === 1 ? 'troca possível' : 'trocas possíveis'}</span></div>
      </header>

      <div className="trade-summary">
        <article className="friend-side"><span>↓</span><div><b>{comparison.friendOffers.length}</b><strong>{friendName} tem para você</strong><small>{comparison.friendExtraCopies} {comparison.friendExtraCopies === 1 ? 'cópia disponível' : 'cópias disponíveis'}</small></div></article>
        <article className="own-side"><span>↑</span><div><b>{comparison.ownOffers.length}</b><strong>Você tem para {friendName}</strong><small>{comparison.ownExtraCopies} {comparison.ownExtraCopies === 1 ? 'cópia disponível' : 'cópias disponíveis'}</small></div></article>
      </div>

      <div className="trade-columns">
        <section><header><h3>Você pode receber</h3><span>{comparison.friendOffers.length}</span></header><OfferList emptyText={`${friendName} ainda não marcou repetidas que faltam para você.`} offers={comparison.friendOffers} /></section>
        <section><header><h3>Você pode oferecer</h3><span>{comparison.ownOffers.length}</span></header><OfferList emptyText="Você ainda não marcou repetidas que faltam para essa pessoa." offers={comparison.ownOffers} /></section>
      </div>
    </section>
  );
}
