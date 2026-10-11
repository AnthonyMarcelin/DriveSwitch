/**
 * Erreur adaptateur — message destinée à l’UI (pas de crash silencieux).
 */
export class AdapterError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown } } [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = opts.code ?? 'ADAPTER_ERROR';
    this.cause = opts.cause;
  }
}

/**
 * @param {Response} res
 * @param {string} context
 */
export async function assertOk(res, context) {
  if (res.ok) return;
  const snippet = (await res.text().catch(() => '')).slice(0, 180);
  if (res.status === 401 || res.status === 403) {
    throw new AdapterError(
      `${context} : session refusée (${res.status}). Reconnectez-vous sur le site et rechargez l’onglet.`,
      { code: 'AUTH' },
    );
  }
  throw new AdapterError(
    `${context} : HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}`,
    { code: 'HTTP' },
  );
}
