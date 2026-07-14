import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { FriendsPage } from './components/FriendsPage';
import { TradeComparison } from './components/TradeComparison';
import { albumCatalog, initialQuantities, sections, stickers } from './data/album';
import { loadRemoteCollection, migrateCollection, saveStickerQuantity, saveUserAlbum, type RemoteCollectionState } from './lib/collectionRepository';
import type { PublicProfile } from './lib/socialRepository';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Filter = 'all' | 'owned';
type CollectionView = 'album' | 'missing' | 'duplicates';
type ViewMode = 'compact' | 'cards';
type AuthMode = 'login' | 'signup' | 'forgot' | 'recovery';
type AppView = 'library' | 'catalog' | 'friends' | 'album';
type LegalPage = 'privacy' | 'cookies' | 'terms';

const STORAGE_KEY = 'colafig-collection-v1';
const LAST_PAGE_KEY = 'colafig-last-page-v1';
const USER_ALBUMS_KEY = 'colafig-user-albums-v1';
const COOKIE_NOTICE_KEY = 'colafig-cookie-notice-v1';
const AUTH_RETURN_MODE_KEY = 'colafig-auth-return-mode';
const SYNC_MIGRATED_KEY = 'colafig-supabase-migrated-v1';
const PENDING_QUANTITIES_KEY = 'colafig-pending-quantities-v1';
const PENDING_ALBUMS_KEY = 'colafig-pending-albums-v1';
const legalHashes: Record<LegalPage, string> = {
  privacy: '#/privacidade',
  cookies: '#/cookies',
  terms: '#/termos',
};

function legalPageFromHash(): LegalPage | null {
  const entry = Object.entries(legalHashes).find(([, hash]) => hash === window.location.hash);
  return entry ? entry[0] as LegalPage : null;
}

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

function loadPendingQuantities(userId: string) {
  try {
    const saved = window.localStorage.getItem(`${PENDING_QUANTITIES_KEY}:${userId}`);
    return saved ? JSON.parse(saved) as Record<string, number> : {};
  } catch {
    return {};
  }
}

function savePendingQuantity(userId: string, stickerId: string, quantity: number) {
  const pending = loadPendingQuantities(userId);
  pending[stickerId] = quantity;
  window.localStorage.setItem(`${PENDING_QUANTITIES_KEY}:${userId}`, JSON.stringify(pending));
}

function clearPendingQuantity(userId: string, stickerId: string, quantity: number) {
  const pending = loadPendingQuantities(userId);
  if (pending[stickerId] !== quantity) return;
  delete pending[stickerId];
  window.localStorage.setItem(`${PENDING_QUANTITIES_KEY}:${userId}`, JSON.stringify(pending));
}

function loadPendingAlbums(userId: string) {
  try {
    const saved = window.localStorage.getItem(`${PENDING_ALBUMS_KEY}:${userId}`);
    return saved ? JSON.parse(saved) as string[] : [];
  } catch {
    return [];
  }
}

function savePendingAlbum(userId: string, slug: string) {
  const pending = loadPendingAlbums(userId);
  if (!pending.includes(slug)) pending.push(slug);
  window.localStorage.setItem(`${PENDING_ALBUMS_KEY}:${userId}`, JSON.stringify(pending));
}

function clearPendingAlbum(userId: string, slug: string) {
  const pending = loadPendingAlbums(userId).filter((item) => item !== slug);
  window.localStorage.setItem(`${PENDING_ALBUMS_KEY}:${userId}`, JSON.stringify(pending));
}

function localizeRemoteCollection(remote: RemoteCollectionState, albumSlug = albumCatalog[0].slug) {
  const prefix = `${albumSlug}:`;
  const localIdsByCode = Object.fromEntries(stickers.map((sticker) => [sticker.number, sticker.id]));
  const stickerIdsByLocalId: Record<string, string> = Object.fromEntries(
    Object.entries(remote.stickerIdsByKey)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, stickerId]) => [localIdsByCode[key.slice(prefix.length)], stickerId])
      .filter(([localId]) => Boolean(localId)),
  );
  const quantities: Record<string, number> = Object.fromEntries(
    Object.entries(remote.quantitiesByKey)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, quantity]) => [localIdsByCode[key.slice(prefix.length)], quantity])
      .filter(([localId]) => Boolean(localId)),
  );
  return { quantities, stickerIdsByLocalId };
}

function authErrorMessage(mode: AuthMode, code?: string) {
  if (code === 'weak_password') return 'Use uma senha mais forte, com pelo menos 8 caracteres.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (code === 'over_email_send_rate_limit') return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (mode === 'login') return 'E-mail ou senha incorretos.';
  return 'Não foi possível concluir agora. Tente novamente em instantes.';
}

function SiteFooter({ onOpenLegal }: { onOpenLegal: (page: LegalPage) => void }) {
  return (
    <footer className="site-footer">
      <a className="brand footer-brand" href="#top"><span className="brand-mark">CF</span><span>ColaFig</span></a>
      <p>© 2026 ColaFig · Desenvolvido por <a href="https://sabion.io" rel="noreferrer" target="_blank">Sergio Bernardo</a></p>
      <nav aria-label="Links legais"><button onClick={() => onOpenLegal('privacy')} type="button">Privacidade</button><button onClick={() => onOpenLegal('cookies')} type="button">Cookies</button><button onClick={() => onOpenLegal('terms')} type="button">Termos de uso</button></nav>
    </footer>
  );
}

function CookieNotice({ onOpenCookies }: { onOpenCookies: () => void }) {
  const [visible, setVisible] = useState(() => window.localStorage.getItem(COOKIE_NOTICE_KEY) !== 'acknowledged');
  if (!visible) return null;
  const acknowledge = () => {
    window.localStorage.setItem(COOKIE_NOTICE_KEY, 'acknowledged');
    setVisible(false);
  };
  return (
    <aside className="cookie-notice" aria-label="Aviso de cookies e armazenamento local">
      <div><strong>Privacidade no ColaFig</strong><p>Usamos somente armazenamento essencial para login, segurança, preferências e funcionamento offline. Não usamos cookies de publicidade ou analytics.</p></div>
      <div className="cookie-actions"><button className="cookie-details" onClick={onOpenCookies} type="button">Ver detalhes</button><button className="cookie-accept" onClick={acknowledge} type="button">Entendi</button></div>
    </aside>
  );
}

function LegalDocument({ page, onBack, onOpenLegal }: { page: LegalPage; onBack: () => void; onOpenLegal: (page: LegalPage) => void }) {
  const titles: Record<LegalPage, string> = { privacy: 'Política de Privacidade', cookies: 'Cookies e armazenamento local', terms: 'Termos de Uso' };
  return (
    <div className="app-shell legal-shell">
      <header className="topbar"><button className="brand legal-brand" onClick={onBack} type="button"><span className="brand-mark" aria-hidden="true">CF</span><span>ColaFig</span></button><button className="legal-back" onClick={onBack} type="button">← Voltar</button></header>
      <main className="legal-main" id="top">
        <header className="legal-heading"><span className="eyebrow dark">Transparência e confiança</span><h1>{titles[page]}</h1><p>Última atualização: 14 de julho de 2026.</p></header>
        <nav className="legal-tabs" aria-label="Documentos legais"><button className={page === 'privacy' ? 'selected' : ''} onClick={() => onOpenLegal('privacy')} type="button">Privacidade</button><button className={page === 'cookies' ? 'selected' : ''} onClick={() => onOpenLegal('cookies')} type="button">Cookies</button><button className={page === 'terms' ? 'selected' : ''} onClick={() => onOpenLegal('terms')} type="button">Termos</button></nav>

        {page === 'privacy' && <article className="legal-content">
          <p className="legal-intro">Esta política explica, em linguagem direta, como o ColaFig trata dados pessoais ao oferecer contas e ferramentas para organizar coleções de figurinhas.</p>
          <section><h2>1. Quem é responsável</h2><p>O controlador dos dados é <strong>Sergio Bernardo</strong>, responsável pelo ColaFig. Para dúvidas ou para exercer direitos relacionados à LGPD, use o canal <a href="mailto:privacidade@sabion.io">privacidade@sabion.io</a>.</p></section>
          <section><h2>2. Dados tratados</h2><ul><li><strong>Conta:</strong> e-mail, identificador interno e informações técnicas de autenticação.</li><li><strong>Perfil social:</strong> nome de usuário, nome exibido, convites e conexões de amizade.</li><li><strong>Coleções:</strong> álbuns escolhidos, quantidades, repetidas, progresso e última seção visitada.</li><li><strong>Dados técnicos:</strong> endereço IP, data e hora, navegador e registros de segurança que podem ser processados pelos provedores de infraestrutura.</li><li><strong>Preferências locais:</strong> sessão, biblioteca, visualização, aviso de privacidade e cache offline.</li></ul><p>O ColaFig não solicita data de nascimento, CPF, endereço, pagamento ou dados pessoais sensíveis.</p></section>
          <section><h2>3. Para que usamos os dados</h2><ul><li>Criar e proteger a conta e permitir login e recuperação de senha.</li><li>Manter a biblioteca e o progresso das coleções.</li><li>Prevenir abuso, investigar falhas e proteger o serviço.</li><li>Cumprir obrigações legais e atender solicitações dos titulares.</li></ul><p>Os tratamentos necessários para fornecer a conta e a caderneta se apoiam na execução do serviço solicitado. Segurança e prevenção de abuso podem se apoiar no legítimo interesse, sempre com avaliação de necessidade e respeito aos direitos do titular. Consentimento será solicitado antes de qualquer futura tecnologia opcional que dele dependa.</p></section>
          <section><h2>4. Compartilhamento e visibilidade social</h2><p>Seu e-mail e suas credenciais permanecem privados. O nome de usuário e o nome exibido podem ser encontrados por outras pessoas autenticadas. Apenas amizades aceitas podem consultar seus álbuns, faltantes, coladas e repetidas, sempre em modo somente leitura. Você pode cancelar convites ou remover uma amizade a qualquer momento.</p><p>Usamos fornecedores de infraestrutura para operar o serviço: <strong>Supabase</strong>, para autenticação e banco de dados, e <strong>GitHub Pages</strong>, para hospedagem do aplicativo. Esses fornecedores podem tratar dados técnicos e operar infraestrutura fora do Brasil conforme seus contratos e políticas. Não vendemos dados pessoais e não os compartilhamos para publicidade.</p></section>
          <section><h2>5. Retenção e exclusão</h2><p>Dados da conta e das coleções são mantidos enquanto a conta estiver ativa ou pelo tempo necessário para cumprir as finalidades informadas. Registros técnicos e cópias de segurança podem permanecer por períodos adicionais definidos pelos provedores ou necessários para segurança e obrigações legais. Dados salvos apenas no dispositivo permanecem até serem apagados pelo usuário, pelo navegador ou pelo próprio aplicativo.</p></section>
          <section><h2>6. Seus direitos</h2><p>Nos termos da LGPD, você pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, portabilidade quando aplicável, oposição, revisão de decisões automatizadas e eliminação ou anonimização quando cabível. Também pode revogar consentimentos futuros. Poderemos pedir informações para confirmar sua identidade antes de atender uma solicitação.</p></section>
          <section><h2>7. Segurança</h2><p>Aplicamos controles de acesso, autenticação, comunicação protegida e políticas de banco que isolam dados entre usuários. Nenhum sistema é totalmente imune a riscos. Durante o desenvolvimento e os testes, responsáveis devem acompanhar o uso por crianças e adolescentes.</p></section>
          <section><h2>8. Atualizações e referências</h2><p>Esta política poderá ser atualizada quando o serviço, os fornecedores ou a legislação mudarem. Alterações relevantes serão comunicadas no aplicativo e a data acima será revisada.</p><p>Consulte a <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" rel="noreferrer" target="_blank">Lei Geral de Proteção de Dados Pessoais</a> e os <a href="https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes" rel="noreferrer" target="_blank">materiais oficiais da ANPD</a>.</p></section>
        </article>}

        {page === 'cookies' && <article className="legal-content">
          <p className="legal-intro">O ColaFig não usa cookies de publicidade ou ferramentas de analytics. Utilizamos tecnologias essenciais de navegador para manter o serviço funcionando.</p>
          <section><h2>1. O que é utilizado</h2><div className="storage-table"><div><b>Sessão do Supabase</b><span>Armazenamento local</span><p>Mantém o usuário autenticado com segurança e renova a sessão.</p><em>Essencial</em></div><div><b>Biblioteca e coleção</b><span>Armazenamento local</span><p>Mantém uma cópia local temporária de álbuns, quantidades e última seção para carregamento rápido e sincronização segura.</p><em>Essencial</em></div><div><b>Preferências</b><span>Armazenamento local</span><p>Lembra visualização e o reconhecimento deste aviso.</p><em>Essencial</em></div><div><b>Cache PWA</b><span>Cache Storage</span><p>Armazena arquivos do aplicativo para carregamento rápido e funcionamento offline.</p><em>Essencial</em></div></div></section>
          <section><h2>2. Tecnologias não utilizadas</h2><p>Não instalamos cookies de publicidade, perfil comportamental ou analytics. Caso isso mude, tecnologias não essenciais permanecerão desativadas por padrão e será apresentada uma escolha específica antes da ativação.</p></section>
          <section><h2>3. Como controlar</h2><p>Você pode apagar dados do site nas configurações do navegador. Isso poderá encerrar sua sessão, remover preferências, apagar o cache offline e, enquanto a sincronização com o banco não estiver concluída, eliminar dados da coleção salvos somente neste dispositivo.</p></section>
          <section><h2>4. Duração</h2><p>A sessão é renovada enquanto válida e removida ao sair ou limpar os dados do site. Preferências e dados locais permanecem até serem substituídos, apagados pelo usuário ou removidos pelo navegador.</p><p>Saiba mais no <a href="https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf" rel="noreferrer" target="_blank">Guia Orientativo sobre Cookies da ANPD</a>.</p></section>
        </article>}

        {page === 'terms' && <article className="legal-content">
          <p className="legal-intro">Ao criar uma conta ou usar o ColaFig, você concorda com estes termos. Se não concordar, não utilize o serviço.</p>
          <section><h2>1. Finalidade do serviço</h2><p>O ColaFig é uma ferramenta independente para organizar coleções físicas de figurinhas. Não vende figurinhas, não garante a conclusão de coleções e não representa fabricantes, editoras ou organizações esportivas.</p></section>
          <section><h2>2. Conta e responsabilidade</h2><p>Você deve fornecer um e-mail válido, manter sua senha protegida e comunicar qualquer suspeita de acesso indevido. Nomes de usuário e nomes exibidos não podem representar terceiros de forma enganosa ou conter conteúdo ilícito ou ofensivo. Durante o desenvolvimento e os testes, o uso por crianças e adolescentes deve ser acompanhado por um responsável.</p></section>
          <section><h2>3. Uso permitido</h2><p>Não é permitido tentar acessar contas de terceiros, contornar controles de segurança, automatizar requisições abusivas, interferir no funcionamento do serviço ou usar o ColaFig para atividade ilícita.</p></section>
          <section><h2>4. Catálogo e propriedade intelectual</h2><p>O catálogo usa códigos, nomes e informações factuais para organização. Elementos visuais do ColaFig são próprios. Marcas e nomes de terceiros pertencem aos respectivos titulares. Não devem ser enviados scans, cópias integrais de páginas ou outros materiais protegidos sem autorização.</p></section>
          <section><h2>5. Disponibilidade e alterações</h2><p>O serviço pode passar por manutenção, apresentar indisponibilidade ou ter recursos modificados. Empregaremos esforços razoáveis para preservar dados e continuidade, sem prometer operação ininterrupta.</p></section>
          <section><h2>6. Encerramento</h2><p>Contas que violem estes termos ou coloquem o serviço e outros usuários em risco poderão ser restringidas. O usuário poderá solicitar exclusão da conta e dos dados associados pelo canal de privacidade.</p></section>
          <section><h2>7. Lei aplicável e contato</h2><p>Estes termos são regidos pelas leis brasileiras. Dúvidas podem ser enviadas para <a href="mailto:privacidade@sabion.io">privacidade@sabion.io</a>.</p></section>
        </article>}
      </main>
      <SiteFooter onOpenLegal={onOpenLegal} />
    </div>
  );
}

function PublicLanding({ initialMode = 'login', onOpenLegal }: { initialMode?: AuthMode; onOpenLegal: (page: LegalPage) => void }) {
  const [mode, setMode] = useState<AuthMode>(() => {
    if (initialMode === 'recovery') return 'recovery';
    const savedMode = window.sessionStorage.getItem(AUTH_RETURN_MODE_KEY) as AuthMode | null;
    window.sessionStorage.removeItem(AUTH_RETURN_MODE_KEY);
    return savedMode ?? initialMode;
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (initialMode === 'recovery') setMode('recovery');
  }, [initialMode]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirmation('');
    setAcceptedTerms(false);
    setFeedback(null);
  };

  const openLegalFromAuth = (page: LegalPage) => {
    window.sessionStorage.setItem(AUTH_RETURN_MODE_KEY, mode);
    onOpenLegal(page);
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
                {mode === 'signup' && <label className="terms-check"><input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required type="checkbox" /><span>Confirmo que li e concordo com os <button onClick={() => openLegalFromAuth('terms')} type="button">Termos de Uso</button> e li a <button onClick={() => openLegalFromAuth('privacy')} type="button">Política de Privacidade</button>.</span></label>}
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
      <SiteFooter onOpenLegal={onOpenLegal} />
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
  const [legalPage, setLegalPage] = useState<LegalPage | null>(legalPageFromHash);
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [filter, setFilter] = useState<Filter>('all');
  const [collectionView, setCollectionView] = useState<CollectionView>('album');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [remoteStickerIds, setRemoteStickerIds] = useState<Record<string, string>>({});
  const [remoteAlbumIds, setRemoteAlbumIds] = useState<Record<string, string>>({});
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [viewedFriend, setViewedFriend] = useState<{ profile: PublicProfile; quantities: Record<string, number>; userAlbums: string[] } | null>(null);
  const [friendCollectionLoading, setFriendCollectionLoading] = useState(false);

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
    const syncLegalRoute = () => setLegalPage(legalPageFromHash());
    window.addEventListener('hashchange', syncLegalRoute);
    return () => window.removeEventListener('hashchange', syncLegalRoute);
  }, []);

  useEffect(() => {
    if (!session) {
      setCollectionOwner(null);
      setLibraryOwner(null);
      setUserAlbums([]);
      setAppView('library');
      setQuantities(initialQuantities);
      setRemoteStickerIds({});
      setRemoteAlbumIds({});
      setSyncStatus('idle');
      setViewedFriend(null);
      return;
    }
    const userId = session.user.id;
    const hasLegacyCollection = window.localStorage.getItem(`${STORAGE_KEY}:${userId}`) !== null;
    const localQuantities = loadCollection(userId);
    const localAlbums = loadUserAlbums(userId, hasLegacyCollection);
    setQuantities(localQuantities);
    setUserAlbums(localAlbums);
    const lastPage = window.localStorage.getItem(`${LAST_PAGE_KEY}:${userId}`);
    if (lastPage && sections.some((section) => section.id === lastPage)) {
      setActiveSection(lastPage);
    }
    setCollectionOwner(userId);
    setLibraryOwner(userId);

    let cancelled = false;
    const hydrateFromSupabase = async () => {
      setSyncStatus('syncing');
      try {
        const remote = await loadRemoteCollection(userId);
        const { quantities: remoteQuantities, stickerIdsByLocalId } = localizeRemoteCollection(remote);
        const pendingQuantities = loadPendingQuantities(userId);
        const wasMigrated = window.localStorage.getItem(`${SYNC_MIGRATED_KEY}:${userId}`) === 'true';
        const mergedQuantities = {
          ...remoteQuantities,
          ...(!wasMigrated ? localQuantities : {}),
          ...pendingQuantities,
        };
        const pendingAlbums = loadPendingAlbums(userId);
        const mergedAlbums = [...new Set([...remote.userAlbums, ...localAlbums, ...pendingAlbums])];
        const albumsToSave = mergedAlbums
          .map((slug) => remote.albumIdsBySlug[slug])
          .filter(Boolean)
          .map((albumId) => ({ albumId }));
        const quantitiesToSave = (!wasMigrated ? Object.entries(mergedQuantities) : Object.entries(pendingQuantities))
          .map(([localId, quantity]) => ({ quantity, stickerId: stickerIdsByLocalId[localId] }))
          .filter((item) => Boolean(item.stickerId));

        await migrateCollection(userId, albumsToSave, quantitiesToSave);
        window.localStorage.setItem(`${SYNC_MIGRATED_KEY}:${userId}`, 'true');
        Object.entries(pendingQuantities).forEach(([localId, quantity]) => clearPendingQuantity(userId, localId, quantity));
        pendingAlbums.forEach((slug) => clearPendingAlbum(userId, slug));
        if (cancelled) return;
        setRemoteStickerIds(stickerIdsByLocalId);
        setRemoteAlbumIds(remote.albumIdsBySlug);
        setQuantities(mergedQuantities);
        setUserAlbums(mergedAlbums);
        setSyncStatus('saved');
      } catch (error) {
        console.error('Não foi possível sincronizar a coleção com o Supabase.', error);
        if (!cancelled) setSyncStatus('error');
      }
    };
    void hydrateFromSupabase();
    return () => { cancelled = true; };
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

  const activeQuantities = viewedFriend?.quantities ?? quantities;
  const owned = stickers.filter((sticker) => (activeQuantities[sticker.id] ?? 0) > 0).length;
  const duplicateCount = stickers.reduce(
    (total, sticker) => total + Math.max((activeQuantities[sticker.id] ?? 0) - 1, 0),
    0,
  );
  const progress = Math.round((owned / stickers.length) * 100);
  const activeSectionIndex = sections.findIndex((section) => section.id === activeSection);

  const normalizedSearch = normalizeSearch(search);
  const matchingStickers = useMemo(() => {
    return stickers.filter((sticker) => {
        const quantity = activeQuantities[sticker.id] ?? 0;
        const section = sections.find((item) => item.id === sticker.section)!;
        const searchableText = normalizeSearch(
          `${sticker.number} ${sticker.label} ${section.name} ${section.short}`,
        );
        const matchesSearch = normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
        const matchesCollectionView =
          collectionView === 'album' ||
          (collectionView === 'missing' && quantity === 0) ||
          (collectionView === 'duplicates' && quantity > 1);
        const matchesFilter = filter === 'all' || quantity > 0;
        return matchesSearch && matchesCollectionView && matchesFilter;
      });
  }, [activeQuantities, collectionView, filter, normalizedSearch]);

  const displayedSections = useMemo(
    () => normalizedSearch || collectionView !== 'album' ? sections : [sections[activeSectionIndex]],
    [activeSectionIndex, collectionView, normalizedSearch],
  );
  const visibleStickers = useMemo(
    () => normalizedSearch || collectionView !== 'album'
      ? matchingStickers
      : matchingStickers.filter((sticker) => sticker.section === activeSection),
    [activeSection, collectionView, matchingStickers, normalizedSearch],
  );
  const stickerGroups = useMemo(
    () => displayedSections
      .map((section) => ({ section, items: visibleStickers.filter((sticker) => sticker.section === section.id) }))
      .filter((group) => group.items.length > 0),
    [displayedSections, visibleStickers],
  );

  const updateQuantity = (id: string, delta: number) => {
    if (viewedFriend) return;
    const quantity = Math.max(0, Math.min(9, (quantities[id] ?? 0) + delta));
    setQuantities((current) => ({ ...current, [id]: quantity }));
    if (!session) return;
    savePendingQuantity(session.user.id, id, quantity);
    const remoteStickerId = remoteStickerIds[id];
    if (!remoteStickerId) {
      setSyncStatus('error');
      return;
    }
    setSyncStatus('syncing');
    void saveStickerQuantity(session.user.id, remoteStickerId, quantity)
      .then(() => {
        clearPendingQuantity(session.user.id, id, quantity);
        setSyncStatus('saved');
      })
      .catch((error) => {
        console.error('Não foi possível salvar a figurinha.', error);
        setSyncStatus('error');
      });
  };

  const jumpToSection = (sectionId: string) => {
    setCollectionView('album');
    setActiveSection(sectionId);
    setSearch('');
    window.requestAnimationFrame(() => document.querySelector('.organizer-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const openCollectionView = (nextView: CollectionView) => {
    setCollectionView(nextView);
    setFilter('all');
    setSearch('');
    window.requestAnimationFrame(() => document.querySelector('.album-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const goToAlbumPage = (index: number) => {
    const nextSection = sections[index];
    if (!nextSection) return;
    jumpToSection(nextSection.id);
  };

  const openAlbum = (slug: string) => {
    setViewedFriend(null);
    setActiveAlbumSlug(slug);
    setAppView('album');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openFriendCollection = async (profile: PublicProfile) => {
    setFriendCollectionLoading(true);
    try {
      const remote = await loadRemoteCollection(profile.id);
      const { quantities: friendQuantities } = localizeRemoteCollection(remote);
      setViewedFriend({ profile, quantities: friendQuantities, userAlbums: remote.userAlbums });
      setActiveAlbumSlug(remote.userAlbums[0] ?? albumCatalog[0].slug);
      setActiveSection(sections[0].id);
      setSearch('');
      setFilter('all');
      setAppView('album');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Não foi possível abrir a coleção do amigo.', error);
      throw error;
    } finally {
      setFriendCollectionLoading(false);
    }
  };

  const navigateTo = (view: Exclude<AppView, 'album'>) => {
    setViewedFriend(null);
    setAppView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addAlbum = (slug: string) => {
    setUserAlbums((current) => current.includes(slug) ? current : [...current, slug]);
    if (session) {
      savePendingAlbum(session.user.id, slug);
      const remoteAlbumId = remoteAlbumIds[slug];
      if (remoteAlbumId) {
        setSyncStatus('syncing');
        void saveUserAlbum(session.user.id, remoteAlbumId)
          .then(() => {
            clearPendingAlbum(session.user.id, slug);
            setSyncStatus('saved');
          })
          .catch((error) => {
            console.error('Não foi possível salvar o álbum.', error);
            setSyncStatus('error');
          });
      }
    }
    openAlbum(slug);
  };

  const filteredCatalog = albumCatalog.filter((album) =>
    (catalogCategory === 'all' || album.category === 'Futebol')
    && normalizeSearch(`${album.name} ${album.category} ${album.year}`).includes(normalizeSearch(catalogSearch)),
  );
  const activeAlbum = albumCatalog.find((album) => album.slug === activeAlbumSlug) ?? albumCatalog[0];
  const friendHasActiveAlbum = !viewedFriend || viewedFriend.userAlbums.includes(activeAlbum.slug);

  const openLegalPage = (page: LegalPage) => {
    window.location.hash = legalHashes[page];
    setLegalPage(page);
  };

  const closeLegalPage = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setLegalPage(null);
  };

  if (!authReady) {
    return <div className="auth-loading"><span className="brand-mark" aria-hidden="true">CF</span><p>Carregando sua coleção…</p></div>;
  }

  if (legalPage) {
    return <LegalDocument page={legalPage} onBack={closeLegalPage} onOpenLegal={openLegalPage} />;
  }

  if (!session || recoveryMode) {
    return <><PublicLanding initialMode={recoveryMode ? 'recovery' : 'login'} onOpenLegal={openLegalPage} /><CookieNotice onOpenCookies={() => openLegalPage('cookies')} /></>;
  }

  return (
    <>
    <div className="app-shell authenticated-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => navigateTo('library')} aria-label="ColaFig — meus álbuns">
          <span className="brand-mark" aria-hidden="true">CF</span>
          <span>ColaFig</span>
        </a>
        <nav className="app-nav" aria-label="Navegação principal">
          <button className={appView === 'library' ? 'nav-active' : ''} onClick={() => navigateTo('library')} type="button">Meus álbuns</button>
          <button className={appView === 'catalog' ? 'nav-active' : ''} onClick={() => navigateTo('catalog')} type="button">Catálogo</button>
          <button className={appView === 'friends' ? 'nav-active' : ''} onClick={() => navigateTo('friends')} type="button">Amigos</button>
        </nav>
        <div className="account-menu">
          <i className={`sync-status ${syncStatus}`} title={syncStatus === 'error' ? 'Alterações guardadas neste dispositivo; tentaremos sincronizar novamente.' : syncStatus === 'syncing' ? 'Sincronizando coleção' : 'Coleção sincronizada'}>{syncStatus === 'error' ? 'Local' : syncStatus === 'syncing' ? 'Salvando…' : 'Salvo'}</i>
          <span title={session.user.email}>{session.user.email}</span>
          <button onClick={() => void supabase?.auth.signOut()} type="button">Sair</button>
        </div>
      </header>

      {friendCollectionLoading && <div className="social-opening" role="status"><span className="brand-mark">CF</span><b>Abrindo a coleção…</b></div>}

      {appView === 'library' && (
        <main className="hub-main" id="top">
          <header className="hub-heading">
            <div><span className="eyebrow dark">Sua biblioteca</span><h1>Meus álbuns</h1><p>Acompanhe todas as suas coleções em um só lugar.</p></div>
            <button className="hub-primary" onClick={() => navigateTo('catalog')} type="button"><span>＋</span> Adicionar álbum</button>
          </header>
          {userAlbums.length > 0 ? (
            <div className="user-album-grid">
              {userAlbums.map((slug) => {
                const album = albumCatalog.find((item) => item.slug === slug);
                if (!album) return null;
                return (
                  <article className="user-album-card" key={album.slug}>
                    <div className="album-cover" style={{ '--album-accent': album.accent } as React.CSSProperties}><span>COLAFIG</span><div className="album-cover-emblem" aria-hidden="true">CF</div><b>{album.category}</b></div>
                    <div className="album-card-content">
                      <span className="album-category">{album.category}</span>
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
            <section className="empty-library"><span>＋</span><h2>Sua estante está vazia</h2><p>Escolha seu primeiro álbum no catálogo do ColaFig.</p><button onClick={() => navigateTo('catalog')} type="button">Explorar catálogo</button></section>
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
                  <div className="catalog-cover album-cover" style={{ '--album-accent': album.accent } as React.CSSProperties}><span>COLAFIG</span><div className="album-cover-emblem" aria-hidden="true">CF</div><b>{album.category}</b></div>
                  <div className="catalog-card-copy"><span className="album-category">{album.category} · {album.sectionCount} seções</span><h2>{album.name}</h2><p>{album.description}</p><small>{album.stickerCount} figurinhas</small><button className={added ? 'added' : ''} onClick={() => added ? openAlbum(album.slug) : addAlbum(album.slug)} type="button">{added ? 'Abrir caderneta' : 'Adicionar à coleção'} <span>{added ? '→' : '＋'}</span></button></div>
                </article>
              );
            })}
            {filteredCatalog.length === 0 && <div className="empty-state">Nenhum álbum encontrado no catálogo.</div>}
          </div>
        </main>
      )}

      {appView === 'friends' && <FriendsPage onOpenCollection={openFriendCollection} userId={session.user.id} />}

      {appView === 'album' && (
      <main className="authenticated-main" id="top">
        <section className="collection-overview" aria-label="Resumo da coleção">
          <div className="overview-heading">
            <span className="eyebrow dark">{viewedFriend ? `Coleção de @${viewedFriend.profile.username}` : 'Minha caderneta'}</span>
            <h1>{activeAlbum.shortName}</h1>
            <p>{viewedFriend ? <>Visualização somente leitura · <b>{viewedFriend.profile.displayName || `@${viewedFriend.profile.username}`}</b></> : <>Você está em <b>{sections[activeSectionIndex].name}</b> · página {activeSectionIndex + 1} de {sections.length}</>}</p>
          </div>
          <div className="overview-progress" aria-label={`${progress}% do álbum completo`}>
            <div><span>Progresso</span><strong>{progress}%</strong></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="overview-stats">
            <span><i className="green">✓</i><small>Coladas</small><b>{owned}</b></span>
            <button className={collectionView === 'missing' ? 'selected' : ''} onClick={() => openCollectionView('missing')} type="button"><i className="orange">?</i><small>Faltantes</small><b>{stickers.length - owned}</b></button>
            <button className={collectionView === 'duplicates' ? 'selected' : ''} id="repetidas" onClick={() => openCollectionView('duplicates')} type="button"><i className="blue">↺</i><small>Repetidas</small><b>{duplicateCount}</b></button>
          </div>
        </section>

        {viewedFriend && <aside className={`friend-view-banner ${friendHasActiveAlbum ? '' : 'empty'}`}><span>◎</span><div><b>{friendHasActiveAlbum ? `Você está vendo o álbum de ${viewedFriend.profile.displayName || `@${viewedFriend.profile.username}`}` : `${viewedFriend.profile.displayName || `@${viewedFriend.profile.username}`} ainda não adicionou este álbum`}</b><p>{friendHasActiveAlbum ? 'Use os filtros para encontrar faltantes e repetidas. Nenhuma alteração pode ser feita aqui.' : 'Quando essa pessoa iniciar a coleção, o progresso aparecerá automaticamente.'}</p></div><button onClick={() => navigateTo('friends')} type="button">← Voltar aos amigos</button></aside>}

        {viewedFriend && friendHasActiveAlbum && <TradeComparison friendName={viewedFriend.profile.displayName || `@${viewedFriend.profile.username}`} friendQuantities={viewedFriend.quantities} ownQuantities={quantities} />}

        <section className="album-section" id="caderneta">
          <nav className="collection-view-nav" aria-label="Visões da coleção">
            <button className={collectionView === 'album' ? 'selected' : ''} onClick={() => openCollectionView('album')} type="button"><span className="collection-view-icon">▤</span><span><b>Caderneta</b><small>Navegar página por página</small></span></button>
            <button className={collectionView === 'missing' ? 'selected missing' : 'missing'} onClick={() => openCollectionView('missing')} type="button"><span className="collection-view-icon">?</span><span><b>Faltantes</b><small>{stickers.length - owned} para completar</small></span></button>
            <button className={collectionView === 'duplicates' ? 'selected duplicates' : 'duplicates'} onClick={() => openCollectionView('duplicates')} type="button"><span className="collection-view-icon">↺</span><span><b>Repetidas</b><small>{duplicateCount} disponíveis para troca</small></span></button>
          </nav>
          <div className="album-heading">
            <div><span className="eyebrow dark">{collectionView === 'album' ? 'Caderneta' : 'Lista da coleção'}</span><h2>{collectionView === 'missing' ? 'Faltantes' : collectionView === 'duplicates' ? 'Repetidas' : 'Figurinhas'}</h2></div>
            <p>{collectionView === 'missing' ? 'Todas as figurinhas que ainda faltam, reunidas por seleção.' : collectionView === 'duplicates' ? 'Todas as cópias extras prontas para troca, sem procurar página por página.' : viewedFriend ? 'Consulte as figurinhas desta coleção.' : 'Marque e encontre qualquer figurinha do álbum.'}</p>
          </div>

          <div className={`organizer-toolbar ${collectionView !== 'album' ? 'global-view' : ''}`}>
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
            {collectionView === 'album' && <div className="page-field">
              <label htmlFor="album-section">Ir para seção</label>
              <select id="album-section" onChange={(event) => jumpToSection(event.target.value)} value={activeSection}>
                {sections.map((section, index) => <option key={section.id} value={section.id}>{index + 1}. {section.flag} {section.short} — {section.name}</option>)}
              </select>
            </div>}
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
              {collectionView === 'album' ? <div className="filters" aria-label="Filtrar figurinhas">
                {([['all', 'Todas'], ['owned', 'Coladas']] as [Filter, string][]).map(([value, label]) => (
                  <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)} type="button">{label}</button>
                ))}
              </div> : <div className={`global-view-summary ${collectionView}`}><span>{collectionView === 'missing' ? '?' : '↺'}</span><b>{collectionView === 'missing' ? `${visibleStickers.length} figurinhas faltando` : `${duplicateCount} cópias extras em ${visibleStickers.length} figurinhas`}</b></div>}
              <p className="results-count" aria-live="polite">
                {normalizedSearch ? <><b>{visibleStickers.length}</b> resultados</> : collectionView === 'album' ? <><b>{visibleStickers.length}</b> nesta página</> : <><b>{stickerGroups.length}</b> seleções</>}
              </p>
            </div>
          </div>

          <div className="continuous-album">
            {stickerGroups.map(({ section, items }) => {
              const sectionIndex = sections.findIndex((item) => item.id === section.id);
              const sectionOwned = stickers.filter((sticker) => sticker.section === section.id && (activeQuantities[sticker.id] ?? 0) > 0).length;
              const sectionTotal = stickers.filter((sticker) => sticker.section === section.id).length;
              const sectionDuplicates = stickers.reduce((total, sticker) => sticker.section === section.id ? total + Math.max((activeQuantities[sticker.id] ?? 0) - 1, 0) : total, 0);
              const sectionSummary = collectionView === 'missing'
                ? `${sectionTotal - sectionOwned} faltantes`
                : collectionView === 'duplicates'
                  ? `${sectionDuplicates} cópias extras`
                  : `${sectionOwned}/${sectionTotal} coladas`;
              return (
                <section className="sticker-section-group" data-section-id={section.id} key={section.id} aria-labelledby={`section-${section.id}`}>
                  <header className="section-divider" id={`section-${section.id}`}>
                    <span className="section-number">{sectionIndex + 1}</span>
                    <span className="section-flag">{section.flag}</span>
                    <span><b>{section.name}</b><small>{section.short} · {sectionSummary}</small></span>
                  </header>
                  <div className={viewMode === 'compact' ? 'sticker-list' : 'sticker-grid'}>
                    {items.map((sticker) => {
                      const quantity = activeQuantities[sticker.id] ?? 0;
                      if (viewMode === 'compact') {
                        return (
                          <article className={`compact-sticker ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                            <span className="compact-code">{sticker.number}</span>
                            <div className="compact-copy"><strong>{sticker.label}</strong><small>{section.flag} {section.short} · {section.name}</small></div>
                            {quantity > 1 && <span className="compact-duplicate">{collectionView === 'duplicates' ? `${quantity} cópias · ${quantity - 1} para troca` : `+${quantity - 1}`}</span>}
                            {viewedFriend ? <span className={`friend-quantity ${quantity > 0 ? 'has' : ''}`}>{quantity === 0 ? 'Falta' : quantity === 1 ? 'Colada' : `${quantity} cópias`}</span> : <div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}><button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button><b>{quantity}</b><button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button></div>}
                          </article>
                        );
                      }
                      return (
                        <article className={`sticker-card ${quantity > 0 ? 'owned' : 'missing'}`} key={sticker.id}>
                          {quantity > 1 && <span className="duplicate-badge">+{quantity - 1}</span>}
                          <div className="sticker-art" style={{ '--team-color': section.color } as React.CSSProperties}><span className="sticker-code">{sticker.number}</span><strong>{section.short}</strong><i aria-hidden="true" /></div>
                          <div className="sticker-info"><span>{sticker.label}</span>{viewedFriend ? <span className={`friend-quantity ${quantity > 0 ? 'has' : ''}`}>{quantity === 0 ? 'Falta' : quantity === 1 ? 'Colada' : `${quantity} cópias`}</span> : <div className="quantity-control" aria-label={`Quantidade de ${sticker.number}`}><button onClick={() => updateQuantity(sticker.id, -1)} disabled={quantity === 0} type="button" aria-label="Remover uma">−</button><b>{quantity}</b><button onClick={() => updateQuantity(sticker.id, 1)} type="button" aria-label="Adicionar uma">+</button></div>}</div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {visibleStickers.length === 0 && <div className="empty-state">{normalizedSearch ? 'Nenhuma figurinha encontrada para esta busca.' : collectionView === 'missing' ? 'Parabéns: não há figurinhas faltando nesta coleção.' : collectionView === 'duplicates' ? 'Você ainda não marcou nenhuma figurinha repetida.' : 'Nenhuma figurinha desta página corresponde ao filtro.'}</div>}
          </div>

          {collectionView === 'album' && !normalizedSearch && (
            <nav className="album-pagination" aria-label="Navegação pelas páginas do álbum">
              <button disabled={activeSectionIndex === 0} onClick={() => goToAlbumPage(activeSectionIndex - 1)} type="button"><span aria-hidden="true">←</span><span><small>Página anterior</small><b>{sections[activeSectionIndex - 1]?.name ?? 'Início do álbum'}</b></span></button>
              <div className="page-indicator"><span>{activeSectionIndex + 1}</span><small>de {sections.length}</small></div>
              <button disabled={activeSectionIndex === sections.length - 1} onClick={() => goToAlbumPage(activeSectionIndex + 1)} type="button"><span><small>Próxima página</small><b>{sections[activeSectionIndex + 1]?.name ?? 'Fim do álbum'}</b></span><span aria-hidden="true">→</span></button>
            </nav>
          )}
        </section>
      </main>
      )}

      <SiteFooter onOpenLegal={openLegalPage} />
    </div>
    <CookieNotice onOpenCookies={() => openLegalPage('cookies')} />
    </>
  );
}
