import { useEffect, useMemo, useState } from 'react';
import { collectibleStickers, sections, slotQuantity, stickers } from '../data/album';
import { copyText, formatCollectionList, type CollectionListView } from '../lib/collectionList';
import { createCollectionShare, revokeCollectionShare } from '../lib/shareRepository';

function publicShareUrl(token: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.hash = `/lista/${token}`;
  return url.toString();
}

export function CollectionListActions({ albumName, albumSlug, canShare, ownerName, quantities, view }: {
  albumName: string;
  albumSlug: string;
  canShare: boolean;
  ownerName?: string;
  quantities: Record<string, number>;
  view: CollectionListView;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    setFeedback(null);
    setShareUrl(null);
  }, [albumSlug, view]);

  const items = useMemo(() => (view === 'missing' ? stickers : collectibleStickers).flatMap((sticker) => {
    const quantity = quantities[sticker.id] ?? 0;
    const matches = view === 'missing' ? slotQuantity(sticker.slotId, quantities) === 0 : quantity > 1;
    if (!matches) return [];
    return [{
      code: sticker.number,
      label: sticker.label,
      quantity,
      sectionName: sections.find((section) => section.id === sticker.section)?.name ?? sticker.section,
    }];
  }), [quantities, view]);

  const listText = () => formatCollectionList({ albumName, items, ownerName, view });

  const copyList = async () => {
    try {
      await copyText(listText());
      setFeedback('Lista copiada.');
    } catch {
      setFeedback('Não foi possível copiar neste navegador.');
    }
  };

  const shareList = async () => {
    setPending(true);
    setFeedback(null);
    try {
      const token = await createCollectionShare(albumSlug, view);
      const url = publicShareUrl(token);
      setShareUrl(url);
      if ('share' in navigator) {
        try {
          await navigator.share({ title: `ColaFig — ${view === 'missing' ? 'Faltantes' : 'Repetidas'}`, text: `${albumName} · ${items.length} figurinhas`, url });
          setFeedback('Link compartilhado.');
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      await copyText(url);
      setFeedback('Link público copiado.');
    } catch {
      setFeedback('Não foi possível criar o link agora.');
    } finally {
      setPending(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await copyText(shareUrl);
      setFeedback('Link público copiado.');
    } catch {
      setFeedback('Não foi possível copiar o link.');
    }
  };

  const disableLink = async () => {
    setPending(true);
    try {
      await revokeCollectionShare(albumSlug, view);
      setShareUrl(null);
      setFeedback('Link público desativado.');
    } catch {
      setFeedback('Não foi possível desativar o link.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="collection-list-actions">
      <div className="list-action-buttons">
        <button onClick={() => void copyList()} type="button"><span aria-hidden="true">⧉</span> Copiar lista</button>
        {canShare && <button className="primary" disabled={pending} onClick={() => void shareList()} type="button"><span aria-hidden="true">↗</span> {pending ? 'Preparando…' : 'Compartilhar'}</button>}
      </div>
      {feedback && <small className="list-action-feedback" role="status">{feedback}</small>}
      {shareUrl && <div className="share-link-panel"><p>Qualquer pessoa com este link poderá ver esta lista, mesmo sem conta.</p><label>Link público<input onFocus={(event) => event.currentTarget.select()} readOnly value={shareUrl} /></label><button onClick={() => void copyLink()} type="button">Copiar</button><button className="danger" disabled={pending} onClick={() => void disableLink()} type="button">Desativar</button></div>}
    </div>
  );
}
