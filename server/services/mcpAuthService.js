import mcpAuth from '../db/mcpAuth.js';

export async function getConfig() {
  const docs = await mcpAuth.find({});
  return docs[0] || null;
}

export async function updateConfig(data) {
  if (data.mode === 'mirror') {
    if (!data.wellKnownUrl) throw new Error('Well-known URL is required in mirror mode');
    try {
      new URL(data.wellKnownUrl);
    } catch {
      throw new Error('Well-known URL is not a valid URL');
    }
  }

  const now = new Date().toISOString();
  const existing = await mcpAuth.find({});
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;

  if (existing.length > 0) {
    delete updateData.createdAt;
    await mcpAuth.update({ _id: existing[0]._id }, { $set: updateData });
    return mcpAuth.findOne({ _id: existing[0]._id });
  } else {
    updateData.createdAt = now;
    return mcpAuth.insert(updateData);
  }
}

export async function getWellKnownMetadata() {
  const config = await getConfig();
  if (!config) return null;

  // Mirror mode — serve the upstream provider's discovery document verbatim.
  // Clients get complete metadata (jwks_uri, userinfo_endpoint, ...) that the
  // custom field set can't express; strict OIDC clients require jwks_uri.
  if (config.mode === 'mirror') {
    if (!config.wellKnownUrl) return null;
    const res = await fetch(config.wellKnownUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Mirrored well-known URL answered ${res.status}`);
    return res.json();
  }

  if (!config.issuer) return null;

  const metadata = {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
  };

  if (config.scopes) {
    metadata.scopes_supported = config.scopes.split(',').map(s => s.trim());
  }

  return metadata;
}
