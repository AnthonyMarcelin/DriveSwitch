import { Msg } from '../shared/messages.js';
import { detectStore } from '../adapters/registry.js';
import { matchCart } from '../matching/match.js';

/** @returns {import('../shared/types.js').TransferState} */
function emptyState() {
  return {
    sourceTabId: null,
    targetTabId: null,
    sourceStoreId: null,
    targetStoreId: null,
    sourceCart: null,
    review: [],
    phase: 'idle',
    error: null,
    summary: null,
  };
}

/** @type {import('../shared/types.js').TransferState} */
let state = emptyState();

chrome.runtime.onInstalled.addListener(() => {
  console.info('[DriveSwitch] installé');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handlePopupMessage(message, sender)
    .then(sendResponse)
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  return true;
});

/** @param {{ type: string, payload?: any }} message */
async function handlePopupMessage(message) {
  switch (message.type) {
    case Msg.GET_STATE:
      return { ok: true, state };

    case Msg.RESET:
      state = emptyState();
      await broadcastState();
      return { ok: true, state };

    case Msg.SET_TABS: {
      const { sourceTabId, targetTabId } = message.payload ?? {};
      state.sourceTabId = sourceTabId ?? null;
      state.targetTabId = targetTabId ?? null;
      state.error = null;

      if (state.sourceTabId != null) {
        const src = await detectTab(state.sourceTabId);
        state.sourceStoreId = src.storeId;
        if (!src.supported) {
          state.error = `Onglet source non supporté (${src.hostname}).`;
        }
      }
      if (state.targetTabId != null) {
        const tgt = await detectTab(state.targetTabId);
        state.targetStoreId = tgt.storeId;
        if (!tgt.supported) {
          state.error = `Onglet cible non supporté (${tgt.hostname}).`;
        }
      }
      if (
        state.sourceTabId != null &&
        state.targetTabId != null &&
        state.sourceTabId === state.targetTabId
      ) {
        state.error = 'Source et cible doivent être deux onglets distincts.';
      }

      state.phase = 'idle';
      await broadcastState();
      return { ok: true, state };
    }

    case Msg.START_TRANSFER:
      return startTransfer();

    case Msg.UPDATE_REVIEW: {
      const { lineId, decision, chosenId } = message.payload ?? {};
      const item = state.review.find((r) => r.match.source.id === lineId);
      if (!item) return { ok: false, error: 'Ligne introuvable' };

      item.decision = decision;
      if (decision === 'accepted') {
        if (chosenId) {
          const alt =
            item.match.alternatives.find((a) => a.id === chosenId) ??
            (item.match.best?.id === chosenId ? item.match.best : null);
          item.chosen = alt ?? item.match.best;
        } else {
          item.chosen = item.match.best;
        }
        if (!item.chosen) {
          item.decision = 'pending';
          return { ok: false, error: 'Aucun équivalent à accepter' };
        }
      } else {
        item.chosen = null;
      }

      state.phase = 'review';
      await broadcastState();
      return { ok: true, state };
    }

    case Msg.COMMIT_ACCEPTED:
      return commitAccepted();

    default:
      return { ok: false, error: `Message inconnu: ${message.type}` };
  }
}

async function startTransfer() {
  if (state.sourceTabId == null || state.targetTabId == null) {
    return { ok: false, error: 'Sélectionnez les onglets source et cible.' };
  }
  if (state.error) {
    return { ok: false, error: state.error };
  }

  try {
    state.phase = 'reading';
    state.summary = null;
    await broadcastState();

    const cartRes = await sendToTab(state.sourceTabId, { type: Msg.READ_CART });
    if (!cartRes?.ok || !cartRes.cart) {
      throw new Error(cartRes?.error ?? 'Lecture panier source échouée');
    }
    state.sourceCart = cartRes.cart;

    state.phase = 'matching';
    await broadcastState();

    const matches = await matchCart(state.sourceCart.lines, async (line) => {
      const res = await sendToTab(state.targetTabId, {
        type: Msg.SEARCH_PRODUCT,
        payload: {
          name: line.name,
          brand: line.brand,
          ean: line.ean,
          ref: line.ref,
        },
      });
      if (!res?.ok) return [];
      return res.products ?? [];
    });

    state.review = matches.map((match) => ({
      match,
      decision: 'pending',
      chosen: null,
    }));
    state.phase = 'review';
    await broadcastState();
    return { ok: true, state };
  } catch (err) {
    state.phase = 'error';
    state.error = err instanceof Error ? err.message : String(err);
    await broadcastState();
    return { ok: false, error: state.error, state };
  }
}

async function commitAccepted() {
  if (state.targetTabId == null) {
    return { ok: false, error: 'Onglet cible manquant' };
  }

  const accepted = state.review.filter((r) => r.decision === 'accepted' && r.chosen);
  const skipped = state.review.filter((r) => r.decision !== 'accepted').length;

  state.phase = 'adding';
  await broadcastState();

  let ok = 0;
  let failed = 0;

  for (const item of accepted) {
    const res = await sendToTab(state.targetTabId, {
      type: Msg.ADD_TO_CART,
      payload: {
        product: item.chosen,
        quantity: item.match.source.quantity,
      },
    });
    if (res?.ok) ok += 1;
    else failed += 1;
  }

  state.summary = { ok, failed, skipped };
  state.phase = 'done';
  await broadcastState();
  return { ok: true, state };
}

/** @param {number} tabId */
async function detectTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const hostname = tab.url ? new URL(tab.url).hostname : '';
  const info = detectStore(hostname);
  try {
    await ensureContent(tabId);
    await sendToTab(tabId, { type: Msg.PING });
  } catch {
    /* detect host suffit */
  }
  return { ...info, hostname, url: tab.url ?? '' };
}

/** @param {number} tabId @param {{ type: string, payload?: unknown }} message */
async function sendToTab(tabId, message) {
  await ensureContent(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

/** @param {number} tabId */
async function ensureContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: Msg.PING });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  }
}

async function broadcastState() {
  try {
    await chrome.runtime.sendMessage({ type: Msg.STATE_CHANGED, payload: { state } });
  } catch {
    /* popup fermée */
  }
}
