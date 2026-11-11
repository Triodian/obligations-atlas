/**
 * Client for the Reasoning Fabric's firm registry (/firms/v1/{dataset}).
 *
 * The Atlas passes firm registrations and "Bring in Triodian" requests to the
 * Fabric, where a named reviewer approves firms in the review console. It
 * never stores personal details itself. It also serves the practitioner
 * directory: approved firms that asked to be listed (development plan task 5.4). The browser's access secret is hashed
 * here before it leaves for the Fabric.
 *
 * The token needs the firms.submit scope (the obligations-atlas client).
 */
const DATASET = 'ai-obligations-atlas';

/** /governance/v1 -> /firms/v1 on the same Fabric. */
export const firmsBaseFrom = (fabricURL) => String(fabricURL || '').replace(/\/+$/, '').replace(/\/governance\/v1$/, '/firms/v1');

export function fabricFirmsClient({ baseUrl, token, dataset = DATASET, fetchImpl = (...a) => fetch(...a) }) {
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${baseUrl}/${encodeURIComponent(dataset)}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let out = null;
    try { out = await res.json(); } catch { out = null; }
    return { status: res.status, body: out };
  };
  return {
    register: (body) => call('POST', '/registrations', body),
    status: (id, accessSecretSha256) => call('POST', `/registrations/${encodeURIComponent(id)}/status`, { accessSecretSha256 }),
    contact: (body) => call('POST', '/contacts', body),
    /** The registrant's choice to be listed as a practitioner, or not. */
    listing: (id, accessSecretSha256, listed) => call('POST', `/registrations/${encodeURIComponent(id)}/listing`, { accessSecretSha256, listed }),
    /** Approved firms that asked to be listed: [{ firmID, firm, roles, jurisdictions }]. No person is in it. */
    directory: async () => {
      const r = await call('GET', '/directory');
      if (r.status !== 200 || !r.body || !Array.isArray(r.body.items)) throw new Error(`Fabric firm directory returned ${r.status}`);
      return r.body.items;
    },
    keys: async () => {
      const r = await call('GET', '/keys');
      if (r.status !== 200 || !r.body || !Array.isArray(r.body.items)) throw new Error(`Fabric firm keys returned ${r.status}`);
      return r.body.items;
    },
  };
}
