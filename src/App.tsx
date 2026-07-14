import { useEffect, useMemo, useState } from 'react';
import { initialQuantities, sections, stickers } from './data/album';

type Filter = 'all' | 'owned' | 'missing' | 'duplicates';

const STORAGE_KEY = 'colafig-collection-v1';

function loadCollection() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Record<string, number>) : initialQuantities;
  } catch {
    return initialQuantities;
  }
}

export default function App() {
  const [quantities, setQuantities] = useState<Record<string, number>>(loadCollection);
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quantities));
  }, [quantities]);

  const owned = stickers.filter((sticker) => (quantities[sticker.id] ?? 0) > 0).length;
  const duplicateCount = stickers.reduce(
    (total, sticker) => total + Math.max((quantities[sticker.id] ?? 0) - 1, 0),
    0,
  );
  const progress = Math.round((owned / stickers.length) * 100);

  const visibleStickers = useMemo(
    () =>
      stickers.filter((sticker) => {
        const quantity = quantities[sticker.id] ?? 0;
        const matchesSection = sticker.section === activeSection;
        const matchesFilter =
          filter === 'all' ||
          (filter === 'owned' && quantity > 0) ||
          (filter === 'missing' && quantity === 0) ||
          (filter === 'duplicates' && quantity > 1);
        return matchesSection && matchesFilter;
      }),
    [activeSection, filter, quantities],
  );

  const updateQuantity = (id: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(9, (current[id] ?? 0) + delta)),
    }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ColaFig — página inicial">
          <span className="brand-mark" aria-hidden="true">CF</span>
          <span>ColaFig</span>
        </a>
        <nav aria-label="Navegação principal">
          <a className="nav-active" href="#resumo">Resumo</a>
          <a href="#caderneta">Caderneta</a>
          <a href="#repetidas">Repetidas</a>
        </nav>
        <a className="profile-button" href="#caderneta">Minha coleção</a>
      </header>

      <main id="top">
        <section className="hero" id="resumo">
          <div className="hero-copy">
            <span className="eyebrow">Sua coleção, figurinha por figurinha</span>
            <h1>Quanto falta para<br /><em>completar?</em></h1>
            <p>Marque as que você já colou, encontre as faltantes e mantenha as repetidas prontas para troca.</p>
            <div className="hero-actions">
              <a className="primary-action" href="#caderneta">Abrir caderneta <span>→</span></a>
            </div>
          </div>
          <div className="progress-card" aria-label={`${progress}% do álbum completo`}>
            <span className="progress-label">Progresso do álbum</span>
            <strong>{progress}<small>%</small></strong>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta">
              <span><b>{owned}</b> coladas</span>
              <span><b>{stickers.length - owned}</b> faltantes</span>
              <span><b>{duplicateCount}</b> repetidas</span>
            </div>
          </div>
        </section>

        <section className="summary-strip" aria-label="Resumo da coleção">
          <article><span className="summary-icon green">✓</span><div><small>Progresso</small><strong>{owned} de {stickers.length}</strong></div></article>
          <article><span className="summary-icon orange">?</span><div><small>Ainda faltam</small><strong>{stickers.length - owned} figurinhas</strong></div></article>
          <article id="repetidas"><span className="summary-icon blue">↺</span><div><small>Para trocar</small><strong>{duplicateCount} repetidas</strong></div></article>
        </section>

        <section className="album-section" id="caderneta">
          <div className="section-heading">
            <div>
              <span className="eyebrow dark">Caderneta</span>
              <h2>Escolha uma seção</h2>
            </div>
            <div className="filters" aria-label="Filtrar figurinhas">
              {([
                ['all', 'Todas'],
                ['owned', 'Coladas'],
                ['missing', 'Faltantes'],
                ['duplicates', 'Repetidas'],
              ] as [Filter, string][]).map(([value, label]) => (
                <button
                  className={filter === value ? 'selected' : ''}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="section-picker">
            <label htmlFor="album-section">Seção do álbum</label>
            <select
              id="album-section"
              onChange={(event) => setActiveSection(event.target.value)}
              value={activeSection}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.flag} {section.short} — {section.name}
                </option>
              ))}
            </select>
            {(() => {
              const section = sections.find((item) => item.id === activeSection)!;
              const sectionStickers = stickers.filter((sticker) => sticker.section === section.id);
              const sectionOwned = sectionStickers.filter((sticker) => (quantities[sticker.id] ?? 0) > 0).length;
              return (
                <div className="selected-section" aria-live="polite">
                  <span className="flag">{section.flag}</span>
                  <span><b>{section.name}</b><small>{sectionOwned} de {sectionStickers.length} coladas</small></span>
                </div>
              );
            })()}
          </div>

          <div className="sticker-grid">
            {visibleStickers.map((sticker) => {
              const quantity = quantities[sticker.id] ?? 0;
              const section = sections.find((item) => item.id === sticker.section)!;
              return (
                <article className={`sticker-card ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                  {quantity > 1 && <span className="duplicate-badge">+{quantity - 1}</span>}
                  <div className="sticker-art" style={{ '--team-color': section.color } as React.CSSProperties}>
                    <span className="sticker-code">{sticker.number}</span>
                    <strong>{section.short}</strong>
                    <i aria-hidden="true" />
                  </div>
                  <div className="sticker-info">
                    <span>{sticker.label}</span>
                    <div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}>
                      <button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button>
                      <b>{quantity}</b>
                      <button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleStickers.length === 0 && (
              <div className="empty-state">Nenhuma figurinha desta seleção corresponde ao filtro.</div>
            )}
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">CF</span><span>ColaFig</span></a>
        <p>Feito para quem vibra a cada figurinha nova.</p>
        <small>Projeto independente — sem vínculo com fabricantes ou organizações esportivas.</small>
      </footer>
    </div>
  );
}
