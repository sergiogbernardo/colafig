import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { albumCatalog, initialQuantities, sections, stickers } from './data/album';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Filter = 'all' | 'owned' | 'missing' | 'duplicates';
type ViewMode = 'compact' | 'cards';
type AuthMode = 'login' | 'signup' | 'forgot' | 'recovery';
type AppView = 'library' | 'catalog' | 'album';

const STORAGE_KEY = 'colafig-collection-v1';
const LAST_PAGE_KEY = 'colafig-last-page-v1';
const USER_ALBUMS_KEY = 'colafig-user-albums-v1';

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function loadCollection(userId: string) {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    return saved ? (JSON.parse(saved) as Record<string, number>) : initialQuantities;
  } catch {
    return initialQuantities;
  }
}

function loadUserAlbums(userId: string, hasLegacyCollection: boolean) {
  try {
    const saved = window.localStorage.getItem(`${USER_ALBUMS_KEY}:${userId}`);
    if (saved !== null) return JSON.parse(saved) as string[];
    return hasLegacyCollection ? [albumCatalog[0].slug] : [];
  } catch {
    return hasLegacyCollection ? [albumCatalog[0].slug] : [];
  }
}

function authErrorMessage(mode: AuthMode, code?: string) {
  if (code === 'weak_password') return 'Use uma senha mais forte, com pelo menos 8 caracteres.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (code === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (mode === 'login') return 'E-mail ou senha incorretos.';
  return 'Não foi possível concluir agora. Tente novamente em instantes.';
}

function PublicLanding({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (initialMode === 'recovery') setMode('recovery');
  }, [initialMode]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirmation('');
    setFeedback(null);
  };

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || pending) return;
    setPending(true);
    setFeedback(null);

    try {
      if (mode === 'forgot') {
        const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
        await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        setFeedback({ type: 'success', text: 'Se existir uma conta com esse e-mail, enviaremos as instruções de recuperação.' });
        return;
      }

      if (mode === 'recovery') {
        if (password.length < 8) {
          setFeedback({ type: 'error', text: 'A nova senha deve ter pelo menos 8 caracteres.' });
          return;
        }
        if (password !== passwordConfirmation) {
          setFeedback({ type: 'error', text: 'As senhas não coincidem.' });
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setFeedback({ type: 'success', text: 'Senha atualizada. Sua caderneta já está liberada.' });
        return;
      }

      if (password.length < 8) {
        setFeedback({ type: 'error', text: 'A senha deve ter pelo menos 8 caracteres.' });
        return;
      }

      if (mode === 'signup') {
        const emailRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
        if (error) throw error;
        if (!data.session) {
          setFeedback({ type: 'success', text: 'Conta criada. Confira seu e-mail para confirmar o cadastro.' });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
      setFeedback({ type: 'error', text: authErrorMessage(mode, code) });
    } finally {
      setPending(false);
    }
  };

  const title = mode === 'signup' ? 'Crie sua conta' : mode === 'forgot' ? 'Recupere sua senha' : mode === 'recovery' ? 'Defina uma nova senha' : 'Entre no ColaFig';
  const subtitle = mode === 'signup' ? 'Comece sua coleção em poucos segundos.' : mode === 'forgot' ? 'Enviaremos um link seguro para seu e-mail.' : mode === 'recovery' ? 'Escolha uma senha nova para continuar.' : 'Seus álbuns ficam organizados e só você pode acessar sua biblioteca.';

  return (
    <div className="app-shell public-shell">
      <header className="topbar public-topbar">
        <a className="brand" href="#top" aria-label="ColaFig — página inicial"><span className="brand-mark" aria-hidden="true">CF</span><span>ColaFig</span></a>
        <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#entrar">Acessar</a></nav>
        <a className="profile-button" href="#entrar">Entrar</a>
      </header>
      <main id="top">
        <section className="hero landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">Sua coleção, figurinha por figurinha</span>
            <h1>Cole. Organize.<br /><em>Complete.</em></h1>
            <p>Escolha seus álbuns, controle as figurinhas coladas e deixe as repetidas prontas para troca.</p>
            <div className="landing-trust"><span>✓ Catálogo em expansão</span><span>✓ Acesso protegido</span><span>✓ Feito para celular</span></div>
          </div>
          <section className="auth-card" id="entrar" aria-labelledby="auth-title">
            <span className="auth-kicker">Minha coleção</span>
            <h2 id="auth-title">{title}</h2>
            <p>{subtitle}</p>
            {!isSupabaseConfigured ? (
              <div className="auth-feedback error">O acesso está temporariamente indisponível. A configuração do serviço não foi encontrada.</div>
            ) : (
              <form onSubmit={submitAuth}>
                {mode !== 'recovery' && (
                  <label>E-mail<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required type="email" value={email} /></label>
                )}
                {mode !== 'forgot' && (
                  <label>{mode === 'recovery' ? 'Nova senha' : 'Senha'}<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" required type="password" value={password} /></label>
                )}
                {mode === 'recovery' && (
                  <label>Confirmar nova senha<input autoComplete="new-password" minLength={8} onChange={(event) => setPasswordConfirmation(event.target.value)} required type="password" value={passwordConfirmation} /></label>
                )}
                {mode === 'login' && <button className="forgot-link" onClick={() => changeMode('forgot')} type="button">Esqueci minha senha</button>}
                {feedback && <div className={`auth-feedback ${feedback.type}`} role="status">{feedback.text}</div>}
                <button className="auth-submit" disabled={pending} type="submit">{pending ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Enviar instruções' : mode === 'recovery' ? 'Salvar nova senha' : 'Entrar'}</button>
              </form>
            )}
            {mode === 'login' && <p className="auth-switch">Ainda não tem conta? <button onClick={() => changeMode('signup')} type="button">Criar conta</button></p>}
            {mode === 'signup' && <p className="auth-switch">Já tem uma conta? <button onClick={() => changeMode('login')} type="button">Entrar</button></p>}
            {mode === 'forgot' && <p className="auth-switch"><button onClick={() => changeMode('login')} type="button">← Voltar para o login</button></p>}
          </section>
        </section>
        <section className="landing-features" id="como-funciona" aria-label="Recursos do ColaFig">
          <article><span className="summary-icon green">✓</span><div><strong>Marque as coladas</strong><p>Atualize a quantidade com um toque.</p></div></article>
          <article><span className="summary-icon orange">⌕</span><div><strong>Encontre rápido</strong><p>Busque por código, jogador ou seleção.</p></div></article>
          <article><span className="summary-icon blue">↺</span><div><strong>Separe repetidas</strong><p>Saiba exatamente o que levar para troca.</p></div></article>
        </section>
      </main>
      <footer><a className="brand footer-brand" href="#top"><span className="brand-mark">CF</span><span>ColaFig</span></a><p>Feito para quem vibra a cada figurinha nova.</p><small>Projeto independente — sem vínculo com fabricantes ou organizações esportivas.</small></footer>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [collectionOwner, setCollectionOwner] = useState<string | null>(null);
  const [libraryOwner, setLibraryOwner] = useState<string | null>(null);
  const [userAlbums, setUserAlbums] = useState<string[]>([]);
  const [appView, setAppView] = useState<AppView>('library');
  const [activeAlbumSlug, setActiveAlbumSlug] = useState(albumCatalog[0].slug);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'all' | 'football'>('all');
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [loadedSectionCount, setLoadedSectionCount] = useState(3);
  const [searchResultLimit, setSearchResultLimit] = useState(60);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    }).catch(() => setAuthReady(true));

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'USER_UPDATED') setRecoveryMode(false);
      if (event === 'SIGNED_OUT') setRecoveryMode(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCollectionOwner(null);
      setLibraryOwner(null);
      setUserAlbums([]);
      setAppView('library');
      setQuantities(initialQuantities);
      return;
    }
    const hasLegacyCollection = window.localStorage.getItem(`${STORAGE_KEY}:${session.user.id}`) !== null;
    setQuantities(loadCollection(session.user.id));
    setUserAlbums(loadUserAlbums(session.user.id, hasLegacyCollection));
    const lastPage = window.localStorage.getItem(`${LAST_PAGE_KEY}:${session.user.id}`);
    if (lastPage && sections.some((section) => section.id === lastPage)) setActiveSection(lastPage);
    setCollectionOwner(session.user.id);
    setLibraryOwner(session.user.id);
  }, [session]);

  useEffect(() => {
    if (!session || collectionOwner !== session.user.id) return;
    window.localStorage.setItem(`${STORAGE_KEY}:${session.user.id}`, JSON.stringify(quantities));
  }, [collectionOwner, quantities, session]);

  useEffect(() => {
    if (!session || libraryOwner !== session.user.id) return;
    window.localStorage.setItem(`${USER_ALBUMS_KEY}:${session.user.id}`, JSON.stringify(userAlbums));
  }, [libraryOwner, session, userAlbums]);

  useEffect(() => {
    if (!session || collectionOwner !== session.user.id) return;
    window.localStorage.setItem(`${LAST_PAGE_KEY}:${session.user.id}`, activeSection);
  }, [activeSection, collectionOwner, session]);

  const owned = stickers.filter((sticker) => (quantities[sticker.id] ?? 0) > 0).length;
  const duplicateCount = stickers.reduce(
    (total, sticker) => total + Math.max((quantities[sticker.id] ?? 0) - 1, 0),
    0,
  );
  const progress = Math.round((owned / stickers.length) * 100);
  const activeSectionIndex = sections.findIndex((section) => section.id === activeSection);

  const normalizedSearch = normalizeSearch(search);
  const matchingStickers = useMemo(() => {
    return stickers.filter((sticker) => {
        const quantity = quantities[sticker.id] ?? 0;
        const section = sections.find((item) => item.id === sticker.section)!;
        const searchableText = normalizeSearch(
          `${sticker.number} ${sticker.label} ${section.name} ${section.short}`,
        );
        const matchesSearch = normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
        const matchesFilter =
          filter === 'all' ||
          (filter === 'owned' && quantity > 0) ||
          (filter === 'missing' && quantity === 0) ||
          (filter === 'duplicates' && quantity > 1);
        return matchesSearch && matchesFilter;
      });
  }, [filter, normalizedSearch, quantities]);

  const loadedSections = useMemo(
    () => normalizedSearch ? sections : sections.slice(activeSectionIndex, activeSectionIndex + loadedSectionCount),
    [activeSectionIndex, loadedSectionCount, normalizedSearch],
  );
  const availableStickers = useMemo(() => {
    if (normalizedSearch) return matchingStickers;
    const availableSectionIds = new Set(sections.slice(activeSectionIndex).map((section) => section.id));
    return matchingStickers.filter((sticker) => availableSectionIds.has(sticker.section));
  }, [activeSectionIndex, matchingStickers, normalizedSearch]);
  const visibleStickers = useMemo(() => {
    if (normalizedSearch) return availableStickers.slice(0, searchResultLimit);
    const loadedIds = new Set(loadedSections.map((section) => section.id));
    return availableStickers.filter((sticker) => loadedIds.has(sticker.section));
  }, [availableStickers, loadedSections, normalizedSearch, searchResultLimit]);
  const stickerGroups = useMemo(
    () => loadedSections
      .map((section) => ({ section, items: visibleStickers.filter((sticker) => sticker.section === section.id) }))
      .filter((group) => group.items.length > 0),
    [loadedSections, visibleStickers],
  );
  const hasMore = visibleStickers.length < availableStickers.length;

  useEffect(() => {
    setLoadedSectionCount(3);
    setSearchResultLimit(60);
  }, [activeSection, filter, normalizedSearch]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (normalizedSearch) {
        setSearchResultLimit((current) => Math.min(current + 60, matchingStickers.length));
      } else {
        setLoadedSectionCount((current) => Math.min(current + 2, sections.length - activeSectionIndex));
      }
    }, { rootMargin: '400px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeSectionIndex, hasMore, loadedSectionCount, matchingStickers.length, normalizedSearch, searchResultLimit]);

  useEffect(() => {
    if (!session || normalizedSearch) return;
    const groups = document.querySelectorAll<HTMLElement>('.sticker-section-group[data-section-id]');
    const rootMargin = window.innerWidth <= 650 ? '-80px 0px -65% 0px' : '-250px 0px -60% 0px';
    const observer = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const sectionId = (current?.target as HTMLElement | undefined)?.dataset.sectionId;
      if (sectionId) window.localStorage.setItem(`${LAST_PAGE_KEY}:${session.user.id}`, sectionId);
    }, { rootMargin, threshold: 0 });
    groups.forEach((group) => observer.observe(group));
    return () => observer.disconnect();
  }, [normalizedSearch, session, stickerGroups]);

  const updateQuantity = (id: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(9, (current[id] ?? 0) + delta)),
    }));
  };

  const jumpToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    setSearch('');
    setLoadedSectionCount(3);
    window.requestAnimationFrame(() => document.querySelector('.organizer-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const openAlbum = (slug: string) => {
    setActiveAlbumSlug(slug);
    setAppView('album');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addAlbum = (slug: string) => {
    setUserAlbums((current) => current.includes(slug) ? current : [...current, slug]);
    openAlbum(slug);
  };

  const filteredCatalog = albumCatalog.filter((album) =>
    (catalogCategory === 'all' || album.category === 'Futebol')
    && normalizeSearch(`${album.name} ${album.category} ${album.year}`).includes(normalizeSearch(catalogSearch)),
  );
  const activeAlbum = albumCatalog.find((album) => album.slug === activeAlbumSlug) ?? albumCatalog[0];

  if (!authReady) {
    return <div className="auth-loading"><span className="brand-mark" aria-hidden="true">CF</span><p>Carregando sua coleção…</p></div>;
  }

  if (!session || recoveryMode) {
    return <PublicLanding initialMode={recoveryMode ? 'recovery' : 'login'} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => setAppView('library')} aria-label="ColaFig — meus álbuns">
          <span className="brand-mark" aria-hidden="true">CF</span>
          <span>ColaFig</span>
        </a>
        <nav aria-label="Navegação principal">
          <button className={appView === 'library' ? 'nav-active' : ''} onClick={() => setAppView('library')} type="button">Meus álbuns</button>
          <button className={appView === 'catalog' ? 'nav-active' : ''} onClick={() => setAppView('catalog')} type="button">Catálogo</button>
          {userAlbums.length > 0 && <button className={appView === 'album' ? 'nav-active' : ''} onClick={() => openAlbum(activeAlbumSlug)} type="button">Caderneta</button>}
        </nav>
        <div className="account-menu">
          <span title={session.user.email}>{session.user.email}</span>
          <button onClick={() => void supabase?.auth.signOut()} type="button">Sair</button>
        </div>
      </header>

      {appView === 'library' && (
        <main className="hub-main" id="top">
          <header className="hub-heading">
            <div><span className="eyebrow dark">Sua biblioteca</span><h1>Meus álbuns</h1><p>Acompanhe todas as suas coleções em um só lugar.</p></div>
            <button className="hub-primary" onClick={() => setAppView('catalog')} type="button"><span>＋</span> Adicionar álbum</button>
          </header>
          {userAlbums.length > 0 ? (
            <div className="user-album-grid">
              {userAlbums.map((slug) => {
                const album = albumCatalog.find((item) => item.slug === slug);
                if (!album) return null;
                return (
                  <article className="user-album-card" key={album.slug}>
                    <div className="album-cover" style={{ '--album-accent': album.accent } as React.CSSProperties}><span>COLEÇÃO</span><strong>{album.year}</strong><b>{album.shortName}</b></div>
                    <div className="album-card-content">
                      <span className="album-category">{album.category} · {album.year}</span>
                      <h2>{album.name}</h2>
                      <p>{owned} de {album.stickerCount} figurinhas</p>
                      <div className="album-card-progress"><span style={{ width: `${progress}%` }} /></div>
                      <div className="album-card-meta"><span><b>{progress}%</b> completo</span><span><b>{duplicateCount}</b> repetidas</span></div>
                      <button onClick={() => openAlbum(album.slug)} type="button">Continuar coleção <span>→</span></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <section className="empty-library"><span>＋</span><h2>Sua estante está vazia</h2><p>Escolha seu primeiro álbum no catálogo do ColaFig.</p><button onClick={() => setAppView('catalog')} type="button">Explorar catálogo</button></section>
          )}
        </main>
      )}

      {appView === 'catalog' && (
        <main className="hub-main catalog-main" id="top">
          <header className="hub-heading">
            <div><span className="eyebrow dark">Descubra coleções</span><h1>Catálogo de álbuns</h1><p>Escolha um álbum e comece a organizar suas figurinhas.</p></div>
          </header>
          <div className="catalog-tools">
            <div className="search-input"><span aria-hidden="true">⌕</span><input onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Buscar por álbum, categoria ou ano" type="search" value={catalogSearch} />{catalogSearch && <button onClick={() => setCatalogSearch('')} type="button" aria-label="Limpar busca">×</button>}</div>
            <div className="catalog-categories"><button className={catalogCategory === 'all' ? 'selected' : ''} onClick={() => setCatalogCategory('all')} type="button">Todos</button><button className={catalogCategory === 'football' ? 'selected' : ''} onClick={() => setCatalogCategory('football')} type="button">Futebol</button></div>
          </div>
          <div className="catalog-grid">
            {filteredCatalog.map((album) => {
              const added = userAlbums.includes(album.slug);
              return (
                <article className="catalog-card" key={album.slug}>
                  <div className="catalog-cover album-cover" style={{ '--album-accent': album.accent } as React.CSSProperties}><span>COLAFIG</span><strong>{album.year}</strong><b>{album.shortName}</b></div>
                  <div className="catalog-card-copy"><span className="album-category">{album.category} · {album.sectionCount} seções</span><h2>{album.name}</h2><p>{album.description}</p><small>{album.stickerCount} figurinhas</small><button className={added ? 'added' : ''} onClick={() => added ? openAlbum(album.slug) : addAlbum(album.slug)} type="button">{added ? 'Abrir caderneta' : 'Adicionar à coleção'} <span>{added ? '→' : '＋'}</span></button></div>
                </article>
              );
            })}
            {filteredCatalog.length === 0 && <div className="empty-state">Nenhum álbum encontrado no catálogo.</div>}
          </div>
        </main>
      )}

      {appView === 'album' && (
      <main className="authenticated-main" id="top">
        <section className="collection-overview" aria-label="Resumo da coleção">
          <div className="overview-heading">
            <span className="eyebrow dark">Minha caderneta</span>
            <h1>{activeAlbum.shortName}</h1>
            <p>Continue na página {activeSectionIndex + 1}: <b>{sections[activeSectionIndex].name}</b></p>
          </div>
          <div className="overview-progress" aria-label={`${progress}% do álbum completo`}>
            <div><span>Progresso</span><strong>{progress}%</strong></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="overview-stats">
            <span><i className="green">✓</i><small>Coladas</small><b>{owned}</b></span>
            <span><i className="orange">?</i><small>Faltantes</small><b>{stickers.length - owned}</b></span>
            <span id="repetidas"><i className="blue">↺</i><small>Repetidas</small><b>{duplicateCount}</b></span>
          </div>
        </section>

        <section className="album-section" id="caderneta">
          <div className="album-heading">
            <div><span className="eyebrow dark">Caderneta</span><h2>Figurinhas</h2></div>
            <p>Marque, filtre e encontre qualquer figurinha do álbum.</p>
          </div>

          <div className="organizer-toolbar">
            <div className="search-field">
              <label htmlFor="sticker-search">Buscar figurinha</label>
              <div className="search-input">
                <span aria-hidden="true">⌕</span>
                <input
                  id="sticker-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Código, jogador ou seleção"
                  type="search"
                  value={search}
                />
                {search && (
                  <button onClick={() => setSearch('')} type="button" aria-label="Limpar busca">×</button>
                )}
              </div>
            </div>
            <div className="page-field">
              <label htmlFor="album-section">Página do álbum</label>
              <select id="album-section" onChange={(event) => jumpToSection(event.target.value)} value={activeSection}>
                {sections.map((section, index) => <option key={section.id} value={section.id}>{index + 1}. {section.flag} {section.short} — {section.name}</option>)}
              </select>
            </div>
            <div className="view-options">
              <span>Visualização</span>
              <div className="view-toggle" aria-label="Escolher visualização">
                <button
                  className={viewMode === 'compact' ? 'selected' : ''}
                  onClick={() => setViewMode('compact')}
                  type="button"
                >
                  ☷ <span>Compacta</span>
                </button>
                <button
                  className={viewMode === 'cards' ? 'selected' : ''}
                  onClick={() => setViewMode('cards')}
                  type="button"
                >
                  ▦ <span>Cards</span>
                </button>
              </div>
            </div>
            <div className="toolbar-lower">
              {(() => {
                const section = sections[activeSectionIndex];
                const sectionStickers = stickers.filter((sticker) => sticker.section === section.id);
                const sectionOwned = sectionStickers.filter((sticker) => (quantities[sticker.id] ?? 0) > 0).length;
                return <div className="selected-section" aria-live="polite"><span className="flag">{section.flag}</span><span><b>{section.name}</b><small>Página {activeSectionIndex + 1} de {sections.length} · {sectionOwned}/{sectionStickers.length} coladas</small></span></div>;
              })()}
              <div className="filters" aria-label="Filtrar figurinhas">
                {([['all', 'Todas'], ['owned', 'Coladas'], ['missing', 'Faltantes'], ['duplicates', 'Repetidas']] as [Filter, string][]).map(([value, label]) => (
                  <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
                ))}
              </div>
              <p className="results-count" aria-live="polite"><b>{availableStickers.length}</b> {normalizedSearch ? 'resultados no álbum' : 'a partir daqui'}</p>
            </div>
          </div>

          <div className="continuous-album">
            {stickerGroups.map(({ section, items }) => {
              const sectionIndex = sections.findIndex((item) => item.id === section.id);
              const sectionOwned = stickers.filter((sticker) => sticker.section === section.id && (quantities[sticker.id] ?? 0) > 0).length;
              return (
                <section className="sticker-section-group" data-section-id={section.id} key={section.id} aria-labelledby={`section-${section.id}`}>
                  <header className="section-divider" id={`section-${section.id}`}>
                    <span className="section-number">{sectionIndex + 1}</span>
                    <span className="section-flag">{section.flag}</span>
                    <span><b>{section.name}</b><small>{section.short} · {sectionOwned}/20 coladas</small></span>
                  </header>
                  <div className={viewMode === 'compact' ? 'sticker-list' : 'sticker-grid'}>
                    {items.map((sticker) => {
                      const quantity = quantities[sticker.id] ?? 0;
                      if (viewMode === 'compact') {
                        return (
                          <article className={`compact-sticker ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                            <span className="compact-code">{sticker.number}</span>
                            <div className="compact-copy"><strong>{sticker.label}</strong><small>{section.flag} {section.short} · {section.name}</small></div>
                            {quantity > 1 && <span className="compact-duplicate">+{quantity - 1}</span>}
                            <div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}>
                              <button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button><b>{quantity}</b><button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button>
                            </div>
                          </article>
                        );
                      }
                      return (
                        <article className={`sticker-card ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                          {quantity > 1 && <span className="duplicate-badge">+{quantity - 1}</span>}
                          <div className="sticker-art" style={{ '--team-color': section.color } as React.CSSProperties}><span className="sticker-code">{sticker.number}</span><strong>{section.short}</strong><i aria-hidden="true" /></div>
                          <div className="sticker-info"><span>{sticker.label}</span><div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}><button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button><b>{quantity}</b><button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button></div></div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {availableStickers.length === 0 && <div className="empty-state">{normalizedSearch ? 'Nenhuma figurinha encontrada para esta busca.' : 'Nenhuma figurinha corresponde ao filtro a partir desta página.'}</div>}
            {hasMore && <div className="load-more-sentinel" ref={loadMoreRef}><span aria-hidden="true" /><p>Carregando mais figurinhas…</p></div>}
            {!hasMore && availableStickers.length > 0 && <div className="album-end"><span>✓</span><p>Você chegou ao fim das figurinhas disponíveis.</p></div>}
          </div>
        </section>
      </main>
      )}

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">CF</span><span>ColaFig</span></a>
        <p>Feito para quem vibra a cada figurinha nova.</p>
        <small>Projeto independente — sem vínculo com fabricantes ou organizações esportivas.</small>
      </footer>
    </div>
  );
}
