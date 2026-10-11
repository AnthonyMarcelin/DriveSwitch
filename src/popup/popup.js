import { Msg } from '../shared/messages.js';

const el = {
  sourceTab: document.getElementById('sourceTab'),
  targetTab: document.getElementById('targetTab'),
  btnRefreshTabs: document.getElementById('btnRefreshTabs'),
  btnStart: document.getElementById('btnStart'),
  setupStatus: document.getElementById('setupStatus'),
  reviewSection: document.getElementById('reviewSection'),
  reviewList: document.getElementById('reviewList'),
  btnAcceptHigh: document.getElementById('btnAcceptHigh'),
  btnCommit: document.getElementById('btnCommit'),
  summarySection: document.getElementById('summarySection'),
  summaryText: document.getElementById('summaryText'),
  btnReset: document.getElementById('btnReset'),
};

/** @type {chrome.tabs.Tab[]} */
let driveTabs = [];

init();

async function init() {
  el.btnRefreshTabs.addEventListener('click', refreshTabs);
  el.btnStart.addEventListener('click', startTransfer);
  el.btnAcceptHigh.addEventListener('click', acceptHighConfidence);
  el.btnCommit.addEventListener('click', commitAccepted);
  el.btnReset.addEventListener('click', reset);
  el.sourceTab.addEventListener('change', persistTabs);
  el.targetTab.addEventListener('change', persistTabs);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === Msg.STATE_CHANGED) {
      renderState(message.payload.state);
    }
  });

  await refreshTabs();
  const res = await send({ type: Msg.GET_STATE });
  if (res?.state) renderState(res.state);
}

async function refreshTabs() {
  const tabs = await chrome.tabs.query({});
  driveTabs = tabs.filter((t) => t.url && isSupportedUrl(t.url));
  fillSelect(el.sourceTab, driveTabs);
  fillSelect(el.targetTab, driveTabs);

  if (driveTabs.length < 2) {
    setStatus(
      'Ouvrez au moins 2 onglets Leclerc / Carrefour / Auchan (connectés), puis rafraîchissez.',
      false,
    );
  } else {
    setStatus(`${driveTabs.length} onglet(s) enseigne détecté(s).`, false);
  }
}

/** @param {HTMLSelectElement} select @param {chrome.tabs.Tab[]} tabs */
function fillSelect(select, tabs) {
  const prev = select.value;
  select.innerHTML = '';
  if (!tabs.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Aucun onglet supporté';
    select.appendChild(opt);
    return;
  }
  for (const tab of tabs) {
    const opt = document.createElement('option');
    opt.value = String(tab.id);
    const host = safeHost(tab.url);
    opt.textContent = `${host} — ${truncate(tab.title || 'Sans titre', 42)}`;
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === prev)) {
    select.value = prev;
  }
}

async function persistTabs() {
  const sourceTabId = Number(el.sourceTab.value) || null;
  const targetTabId = Number(el.targetTab.value) || null;
  const res = await send({
    type: Msg.SET_TABS,
    payload: { sourceTabId, targetTabId },
  });
  if (res?.state) renderState(res.state);
}

async function startTransfer() {
  await persistTabs();
  setStatus('Lecture panier + matching…', false);
  el.btnStart.disabled = true;
  try {
    const res = await send({ type: Msg.START_TRANSFER });
    if (!res?.ok) setStatus(res?.error ?? 'Échec du transfert', true);
    else if (res.state) renderState(res.state);
  } finally {
    el.btnStart.disabled = false;
  }
}

async function acceptHighConfidence() {
  const res = await send({ type: Msg.GET_STATE });
  const review = res?.state?.review ?? [];
  for (const item of review) {
    if (item.match.confidence === 'high' && item.match.best && item.decision === 'pending') {
      await send({
        type: Msg.UPDATE_REVIEW,
        payload: {
          lineId: item.match.source.id,
          decision: 'accepted',
          chosenId: item.match.best.id,
        },
      });
    }
  }
  const next = await send({ type: Msg.GET_STATE });
  if (next?.state) renderState(next.state);
}

async function commitAccepted() {
  el.btnCommit.disabled = true;
  try {
    const res = await send({ type: Msg.COMMIT_ACCEPTED });
    if (!res?.ok) setStatus(res?.error ?? 'Échec ajout panier', true);
    else if (res.state) renderState(res.state);
  } finally {
    el.btnCommit.disabled = false;
  }
}

async function reset() {
  const res = await send({ type: Msg.RESET });
  if (res?.state) renderState(res.state);
  await refreshTabs();
}

/** @param {import('../shared/types.js').TransferState} state */
function renderState(state) {
  if (state.sourceTabId != null) el.sourceTab.value = String(state.sourceTabId);
  if (state.targetTabId != null) el.targetTab.value = String(state.targetTabId);

  if (state.error) setStatus(state.error, true);
  else if (state.phase === 'review') {
    const stub = state.sourceCart?.stub ? ' (données démo)' : '';
    setStatus(
      `Panier source : ${state.sourceCart?.lines?.length ?? 0} ligne(s)${stub}. Validez les équivalents.`,
      false,
    );
  } else if (state.phase === 'done' && state.summary) {
    setStatus('Transfert terminé.', false);
  } else if (state.phase === 'idle' && state.sourceStoreId && state.targetStoreId) {
    setStatus(`Prêt : ${state.sourceStoreId} → ${state.targetStoreId}`, false);
  }

  const showReview =
    state.review?.length > 0 &&
    (state.phase === 'review' || state.phase === 'adding' || state.phase === 'done');
  el.reviewSection.hidden = !showReview;
  if (showReview) renderReview(state.review);

  const showSummary = state.phase === 'done' && state.summary;
  el.summarySection.hidden = !showSummary;
  if (showSummary && state.summary) {
    el.summaryText.textContent = `Ajoutés : ${state.summary.ok} · Échecs : ${state.summary.failed} · Ignorés : ${state.summary.skipped}.`;
  }
}

/** @param {import('../shared/types.js').ReviewItem[]} review */
function renderReview(review) {
  el.reviewList.innerHTML = '';
  for (const item of review) {
    const li = document.createElement('li');
    li.className = 'review-item';

    const conf = item.match.confidence;
    const bestLabel = item.match.best?.name ?? 'Aucun équivalent';
    const decision = item.decision !== 'pending' ? ` · ${item.decision}` : '';

    li.innerHTML = `
      <h3>${escapeHtml(item.match.source.name)}
        <span class="badge ${conf}">${conf}</span>
      </h3>
      <p class="meta">
        qty ${item.match.source.quantity}
        ${item.match.source.ean ? ` · EAN ${item.match.source.ean}` : ''}
        · match ${item.match.method} (${Math.round(item.match.score * 100)}%)
        ${decision}
      </p>
      <p class="meta">→ ${escapeHtml(bestLabel)}</p>
      <div class="actions"></div>
    `;

    const actions = li.querySelector('.actions');
    actions.append(
      btn('Accepter', 'tiny primary', () =>
        updateReview(item.match.source.id, 'accepted', item.match.best?.id),
      ),
      btn('Refuser', 'tiny secondary', () => updateReview(item.match.source.id, 'rejected')),
      btn('Ignorer', 'tiny secondary', () => updateReview(item.match.source.id, 'ignored')),
    );

    for (const alt of item.match.alternatives.slice(0, 2)) {
      actions.append(
        btn(`Alt: ${truncate(alt.name, 18)}`, 'tiny secondary', () =>
          updateReview(item.match.source.id, 'accepted', alt.id),
        ),
      );
    }

    el.reviewList.appendChild(li);
  }
}

/**
 * @param {string} lineId
 * @param {import('../shared/types.js').ReviewDecision} decision
 * @param {string} [chosenId]
 */
async function updateReview(lineId, decision, chosenId) {
  const res = await send({
    type: Msg.UPDATE_REVIEW,
    payload: { lineId, decision, chosenId },
  });
  if (res?.state) renderState(res.state);
}

/** @param {string} label @param {string} className @param {() => void} onClick */
function btn(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** @param {{ type: string, payload?: unknown }} message */
function send(message) {
  return chrome.runtime.sendMessage(message);
}

/** @param {string} url */
function isSupportedUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.endsWith('leclercdrive.fr') ||
      h.endsWith('carrefour.fr') ||
      h.endsWith('auchan.fr')
    );
  } catch {
    return false;
  }
}

/** @param {string} [url] */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'onglet';
  }
}

/** @param {string} s @param {number} n */
function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** @param {string} text @param {boolean} isError */
function setStatus(text, isError) {
  el.setupStatus.textContent = text;
  el.setupStatus.classList.toggle('error', Boolean(isError));
}
