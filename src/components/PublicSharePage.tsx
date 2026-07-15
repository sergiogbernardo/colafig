import { useEffect, useMemo, useState } from 'react';
import { copyText, formatCollectionList } from '../lib/collectionList';
import { loadPublicCollectionShare, type PublicCollectionShare } from '../lib/shareRepository';

export function PublicSharePage({ token }: { token: string }) {
  const [share, setShare] = useState<PublicCollectionShare | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    void loadPublicCollectionShare(token)
      .then((value) => {
        if (cancelled) return;
        setShare(value);
        setStatus(value ? 'ready' : 'unavailable');
      })
      .catch(() => !cancelled && setStatus('unavailable'));
    return () => { cancelled = true; };
  }, [token]);

  const groups = useMemo(() => {
    const grouped = new Map<string, PublicCollectionShare['items']>();
    share?.items.forEach((item) => grouped.set(item.sectionName, [...(grouped.get(item.sectionName) ?? []), item]));
    return [...grouped.entries()];
  }, [share]);

  const copyList = async () => {
    if (!share) return;
    await copyText(formatCollectionList({ albumName: share.albumName, items: share.items, ownerName: share.ownerName, view: share.viewType }));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="public-share-shell">
      <header className="public-share-topbar"><a className="brand" href="/colafig/"><span className="brand-mark">CF</span><span>ColaFig</span></a><span>Lista compartilhada</span></header>
      {status === 'loading' && <main className="public-share-state"><span className="brand-mark">CF</span><h1>Abrindo a lista…</h1></main>}
      {status === 'unavailable' && <main className="public-share-state"><span className="brand-mark">CF</span><h1>Lista indisponível</h1><p>Este link pode ter sido desativado ou não existe mais.</p><a href="/colafig/">Conhecer o ColaFig</a></main>}
      {status === 'ready' && share && <main className="public-share-main">
        <header className={`public-share-heading ${share.viewType}`}><div><span className="eyebrow">Coleção de {share.ownerName}</span><h1>{share.viewType === 'missing' ? 'Figurinhas faltantes' : 'Figurinhas repetidas'}</h1><p>{share.albumName}</p></div><div><strong>{share.items.length}</strong><span>{share.items.length === 1 ? 'figurinha' : 'figurinhas'}</span></div></header>
        <div className="public-share-actions"><p>{share.viewType === 'missing' ? 'Estas são as figurinhas que ainda faltam nesta coleção.' : 'Estas são as figurinhas disponíveis para troca nesta coleção.'}</p><button onClick={() => void copyList()} type="button">{copied ? '✓ Lista copiada' : 'Copiar lista'}</button></div>
        <div className="public-share-groups">{groups.map(([sectionName, items]) => <section key={sectionName}><header><h2>{sectionName}</h2><span>{items.length}</span></header><div>{items.map((item) => <article key={item.code}><b>{item.code}</b><span>{item.label}</span>{share.viewType === 'duplicates' && <small>{item.quantity - 1} para troca</small>}</article>)}</div></section>)}</div>
        {share.items.length === 0 && <div className="public-share-empty">Não há figurinhas nesta lista agora.</div>}
      </main>}
      <footer className="public-share-footer"><span>Organizado com ColaFig</span><a href="/colafig/">Criar minha coleção →</a></footer>
    </div>
  );
}
