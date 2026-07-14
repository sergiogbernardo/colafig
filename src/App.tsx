import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { initialQuantities, sections, stickers } from './data/album';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Filter = 'all' | 'owned' | 'missing' | 'duplicates';
type ViewMode = 'compact' | 'cards';
type AuthMode = 'login' | 'signup' | 'forgot' | 'recovery';

const STORAGE_KEY = 'colafig-collection-v1';
const LAST_PAGE_KEY = 'colafig-last-page-v1';

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

  const title = mode === 'signup' ? 'Crie sua conta' : mode === 'forgot' ? 'Recupere sua senha' : mode === 'recovery' ? 'Defina uma nova senha' : 'Entre na sua caderneta';
  const subtitle = mode === 'signup' ? 'Comece sua coleção em poucos segundos.' : mode === 'forgot' ? 'Enviaremos um link seguro para seu e-mail.' : mode === 'recovery' ? 'Escolha uma senha nova para continuar.' : 'Sua coleção fica protegida e só você pode acessá-la.';

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
            <p>Controle as figurinhas coladas, descubra o que ainda falta e deixe suas repetidas prontas para troca.</p>
            <div className="landing-trust"><span>✓ 980 figurinhas</span><span>✓ Acesso protegido</span><span>✓ Feito para celular</span></div>
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
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');

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
      setQuantities(initialQuantities);
      return;
    }
    setQuantities(loadCollection(session.user.id));
    const lastPage = window.localStorage.getItem(`${LAST_PAGE_KEY}:${session.user.id}`);
    if (lastPage && sections.some((section) => section.id === lastPage)) setActiveSection(lastPage);
    setCollectionOwner(session.user.id);
  }, [session]);

  useEffect(() => {
    if (!session || collectionOwner !== session.user.id) return;
    window.localStorage.setItem(`${STORAGE_KEY}:${session.user.id}`, JSON.stringify(quantities));
  }, [collectionOwner, quantities, session]);

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
  const visibleStickers = useMemo(() => {
    return stickers.filter((sticker) => {
        const quantity = quantities[sticker.id] ?? 0;
        const section = sections.find((item) => item.id === sticker.section)!;
        const searchableText = normalizeSearch(
          `${sticker.number} ${sticker.label} ${section.name} ${section.short}`,
        );
        const matchesSection = normalizedSearch.length > 0 || sticker.section === activeSection;
        const matchesSearch = normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
        const matchesFilter =
          filter === 'all' ||
          (filter === 'owned' && quantity > 0) ||
          (filter === 'missing' && quantity === 0) ||
          (filter === 'duplicates' && quantity > 1);
        return matchesSection && matchesSearch && matchesFilter;
      });
  }, [activeSection, filter, normalizedSearch, quantities]);

  const updateQuantity = (id: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(9, (current[id] ?? 0) + delta)),
    }));
  };

  const goToAlbumPage = (index: number) => {
    const nextSection = sections[index];
    if (!nextSection) return;
    setActiveSection(nextSection.id);
    setSearch('');
    document.querySelector('.organizer-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!authReady) {
    return <div className="auth-loading"><span className="brand-mark" aria-hidden="true">CF</span><p>Carregando sua coleção…</p></div>;
  }

  if (!session || recoveryMode) {
    return <PublicLanding initialMode={recoveryMode ? 'recovery' : 'login'} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ColaFig — página inicial">
          <span className="brand-mark" aria-hidden="true">CF</span>
          <span>ColaFig</span>
        </a>
        <nav aria-label="Navegação principal">
          <a className="nav-active" href="#caderneta">Caderneta</a>
          <a href="#caderneta" onClick={() => setFilter('duplicates')}>Repetidas</a>
        </nav>
        <div className="account-menu">
          <span title={session.user.email}>{session.user.email}</span>
          <button onClick={() => void supabase?.auth.signOut()} type="button">Sair</button>
        </div>
      </header>

      <main className="authenticated-main" id="top">
        <section className="collection-overview" aria-label="Resumo da coleção">
          <div className="overview-heading">
            <span className="eyebrow dark">Minha caderneta</span>
            <h1>Organize sua coleção</h1>
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
              <select id="album-section" onChange={(event) => setActiveSection(event.target.value)} value={activeSection}>
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
              <p className="results-count" aria-live="polite"><b>{visibleStickers.length}</b> {normalizedSearch ? 'resultados no álbum' : 'nesta página'}</p>
            </div>
          </div>

          <div className={viewMode === 'compact' ? 'sticker-list' : 'sticker-grid'}>
            {visibleStickers.map((sticker) => {
              const quantity = quantities[sticker.id] ?? 0;
              const section = sections.find((item) => item.id === sticker.section)!;
              if (viewMode === 'compact') {
                return (
                  <article className={`compact-sticker ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                    <span className="compact-code">{sticker.number}</span>
                    <div className="compact-copy">
                      <strong>{sticker.label}</strong>
                      <small>{section.flag} {section.short} · {section.name}</small>
                    </div>
                    {quantity > 1 && <span className="compact-duplicate">+{quantity - 1}</span>}
                    <div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}>
                      <button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button>
                      <b>{quantity}</b>
                      <button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button>
                    </div>
                  </article>
                );
              }
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
              <div className="empty-state">
                {normalizedSearch ? 'Nenhuma figurinha encontrada para esta busca.' : 'Nenhuma figurinha desta seleção corresponde ao filtro.'}
              </div>
            )}
          </div>

          {!normalizedSearch && (
            <nav className="album-pagination" aria-label="Navegação pelas páginas do álbum">
              <button
                disabled={activeSectionIndex === 0}
                onClick={() => goToAlbumPage(activeSectionIndex - 1)}
                type="button"
              >
                <span aria-hidden="true">←</span>
                <span><small>Página anterior</small><b>{sections[activeSectionIndex - 1]?.name ?? 'Início do álbum'}</b></span>
              </button>
              <div className="page-indicator">
                <span>{activeSectionIndex + 1}</span>
                <small>de {sections.length}</small>
              </div>
              <button
                disabled={activeSectionIndex === sections.length - 1}
                onClick={() => goToAlbumPage(activeSectionIndex + 1)}
                type="button"
              >
                <span><small>Próxima página</small><b>{sections[activeSectionIndex + 1]?.name ?? 'Fim do álbum'}</b></span>
                <span aria-hidden="true">→</span>
              </button>
            </nav>
          )}
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
