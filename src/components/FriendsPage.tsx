import { useEffect, useMemo, useState } from 'react';
import {
  acceptFriendRequest,
  loadSocialState,
  removeFriendship,
  saveProfile,
  searchProfiles,
  sendFriendRequest,
  type PublicProfile,
  type SocialState,
} from '../lib/socialRepository';

const emptySocialState: SocialState = { friends: [], incoming: [], outgoing: [], profile: null };

function profileName(profile: PublicProfile) {
  return profile.displayName || `@${profile.username}`;
}

function ProfileBadge({ profile }: { profile: PublicProfile }) {
  const initials = profileName(profile).replace('@', '').slice(0, 2).toUpperCase();
  return <span className="friend-avatar" aria-hidden="true">{initials}</span>;
}

export function FriendsPage({ onOpenCollection, userId }: { onOpenCollection: (profile: PublicProfile) => Promise<void>; userId: string }) {
  const [state, setState] = useState<SocialState>(emptySocialState);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const refresh = async () => {
    const next = await loadSocialState(userId);
    setState(next);
    if (next.profile) {
      setUsername(next.profile.username);
      setDisplayName(next.profile.displayName ?? '');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadSocialState(userId)
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (next.profile) {
          setUsername(next.profile.username);
          setDisplayName(next.profile.displayName ?? '');
        }
      })
      .catch(() => !cancelled && setFeedback({ kind: 'error', text: 'Não foi possível carregar sua rede agora.' }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId]);

  const relatedIds = useMemo(() => new Set([
    ...state.friends.map((item) => item.profile.id),
    ...state.incoming.map((item) => item.profile.id),
    ...state.outgoing.map((item) => item.profile.id),
  ]), [state]);

  const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = username.toLowerCase().trim().replace(/^@/, '');
    if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalized)) {
      setFeedback({ kind: 'error', text: 'Use de 3 a 30 caracteres: letras minúsculas, números, _ ou -.' });
      return;
    }
    setBusyId('profile');
    setFeedback(null);
    try {
      await saveProfile(userId, normalized, displayName);
      await refresh();
      setFeedback({ kind: 'success', text: 'Perfil atualizado.' });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      setFeedback({ kind: 'error', text: code === '23505' ? 'Esse nome de usuário já está em uso.' : 'Não foi possível salvar o perfil.' });
    } finally {
      setBusyId(null);
    }
  };

  const submitSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setBusyId('search');
    try {
      setResults(await searchProfiles(userId, search));
    } catch {
      setFeedback({ kind: 'error', text: 'Não foi possível buscar pessoas agora.' });
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (id: string, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      await action();
      await refresh();
      setFeedback({ kind: 'success', text: success });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      setFeedback({ kind: 'error', text: code === '23505' ? 'Já existe um convite ou amizade com essa pessoa.' : 'Não foi possível concluir essa ação.' });
    } finally {
      setBusyId(null);
    }
  };

  const openCollection = async (profile: PublicProfile) => {
    setBusyId(`open:${profile.id}`);
    setFeedback(null);
    try {
      await onOpenCollection(profile);
    } catch {
      setFeedback({ kind: 'error', text: 'Não foi possível abrir essa coleção agora.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="hub-main friends-main" id="top">
      <header className="hub-heading">
        <div><span className="eyebrow dark">Sua rede</span><h1>Amigos</h1><p>Compare coleções e descubra quais figurinhas podem ser trocadas.</p></div>
      </header>

      {feedback && <div className={`social-feedback ${feedback.kind}`} role="status">{feedback.text}</div>}

      <section className="profile-setup">
        <div><span className="eyebrow dark">Seu perfil público</span><h2>{state.profile ? `@${state.profile.username}` : 'Escolha seu nome de usuário'}</h2><p>Amigos encontram você pelo nome de usuário. Seu e-mail continua privado.</p></div>
        <form onSubmit={submitProfile}>
          <label><span>Nome de usuário</span><div className="username-input"><i>@</i><input maxLength={30} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="sergio" required value={username} /></div></label>
          <label><span>Nome exibido</span><input maxLength={60} onChange={(event) => setDisplayName(event.target.value)} placeholder="Sergio Bernardo" value={displayName} /></label>
          <button disabled={busyId === 'profile'} type="submit">{busyId === 'profile' ? 'Salvando…' : 'Salvar perfil'}</button>
        </form>
      </section>

      {state.profile && <>
        <section className="friend-search-panel">
          <div><h2>Encontrar amigos</h2><p>Digite pelo menos três caracteres do nome de usuário.</p></div>
          <form onSubmit={submitSearch}><div className="search-input"><span aria-hidden="true">⌕</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar @usuario" type="search" value={search} /><button disabled={busyId === 'search' || search.trim().length < 3} type="submit">Buscar</button></div></form>
          {results.length > 0 && <div className="people-results">{results.map((profile) => {
            const related = relatedIds.has(profile.id);
            return <article key={profile.id}><ProfileBadge profile={profile} /><div><b>{profileName(profile)}</b><span>@{profile.username}</span></div><button disabled={related || busyId === profile.id} onClick={() => void runAction(profile.id, () => sendFriendRequest(userId, profile.id), 'Convite enviado.')} type="button">{related ? 'Já conectado' : 'Adicionar'}</button></article>;
          })}</div>}
          {results.length === 0 && search && busyId !== 'search' && <p className="search-hint">Nenhum resultado nesta busca.</p>}
        </section>

        {state.incoming.length > 0 && <section className="social-section"><header><h2>Convites recebidos</h2><span>{state.incoming.length}</span></header><div className="social-list">{state.incoming.map(({ friendshipId, profile }) => <article key={friendshipId}><ProfileBadge profile={profile} /><div><b>{profileName(profile)}</b><span>@{profile.username}</span></div><div className="friend-actions"><button className="secondary" disabled={busyId === friendshipId} onClick={() => void runAction(friendshipId, () => removeFriendship(friendshipId), 'Convite recusado.')} type="button">Recusar</button><button disabled={busyId === friendshipId} onClick={() => void runAction(friendshipId, () => acceptFriendRequest(friendshipId), 'Agora vocês são amigos.')} type="button">Aceitar</button></div></article>)}</div></section>}

        <section className="social-section"><header><h2>Meus amigos</h2><span>{state.friends.length}</span></header>{state.friends.length > 0 ? <div className="friend-grid">{state.friends.map(({ friendshipId, profile }) => <article key={friendshipId}><ProfileBadge profile={profile} /><div><b>{profileName(profile)}</b><span>@{profile.username}</span></div><button disabled={busyId === `open:${profile.id}`} onClick={() => void openCollection(profile)} type="button">{busyId === `open:${profile.id}` ? 'Abrindo…' : 'Ver coleção'} <span>→</span></button><button className="remove-friend" disabled={busyId === friendshipId} onClick={() => void runAction(friendshipId, () => removeFriendship(friendshipId), 'Amizade removida.')} type="button">Remover</button></article>)}</div> : <div className="empty-social"><span>◎</span><h3>Sua rede está começando</h3><p>Busque uma pessoa acima e envie o primeiro convite.</p></div>}</section>

        {state.outgoing.length > 0 && <section className="social-section compact"><header><h2>Convites enviados</h2><span>{state.outgoing.length}</span></header><div className="social-list">{state.outgoing.map(({ friendshipId, profile }) => <article key={friendshipId}><ProfileBadge profile={profile} /><div><b>{profileName(profile)}</b><span>@{profile.username}</span></div><div className="friend-actions"><small>Aguardando</small><button className="secondary" disabled={busyId === friendshipId} onClick={() => void runAction(friendshipId, () => removeFriendship(friendshipId), 'Convite cancelado.')} type="button">Cancelar</button></div></article>)}</div></section>}
      </>}

      {loading && <div className="social-loading">Carregando sua rede…</div>}
    </main>
  );
}
