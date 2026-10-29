#!/usr/bin/env node
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { args, digest, fetchText, install, safeUrl } from './install.mjs';

export function apiOrigin(value) {
  const url = safeUrl(value);
  if (url.pathname !== '/') throw new Error('API origin must not include a path.');
  return url.origin;
}
export async function readPrivate(file) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid()) || stat.size > 65536) throw new Error('Credential must be a private regular file (0600).');
    return JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
}
const credentialPath = (home, origin) => path.join(home, '.agentrun-skills', 'credentials', `${digest(origin)}.json`);
export async function credential({ origin, home, env }) {
  const token = env.AGENTRUN_API_KEY || env.AGENTRUN_ACCESS_TOKEN;
  if (token) {
    if (!env.AGENTRUN_API_ORIGIN || apiOrigin(env.AGENTRUN_API_ORIGIN) !== origin) throw new Error('Credential origin mismatch: explicitly configure AGENTRUN_API_ORIGIN.');
    return { token, method: env.AGENTRUN_API_KEY ? 'api_key' : 'oauth' };
  }
  try {
    const saved = await readPrivate(credentialPath(home, origin));
    if (saved.origin !== origin || typeof saved.access_token !== 'string') throw new Error('Invalid cached credential.');
    if (!Number.isFinite(saved.expires_at) || saved.expires_at <= Date.now()) return null;
    return { token: saved.access_token, method: 'oauth' };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function discovery(origin, fetcher) {
  const metadata = JSON.parse(await fetchText(`${origin}/.well-known/oauth-protected-resource/api/v2`, fetcher));
  if (metadata.resource !== `${origin}/api/v2`) throw new Error('Protected resource does not match API origin.');
  return metadata;
}
export async function status({ origin, home = os.homedir(), env = process.env, fetcher = fetch }) {
  origin = apiOrigin(origin);
  const auth = await credential({ origin, home, env });
  if (!auth) {
    const metadata = await discovery(origin, fetcher);
    return { ready: false, status: 'setup_required', api_origin: origin, mcp_url: `${origin}/api/v2/mcp`, authorization_servers: metadata.authorization_servers || [], note: 'Reuse authenticated MCP, configure an API key, or provision a supported OAuth identity. MCP must be verified in the coding-agent host.' };
  }
  const response = await fetcher(`${origin}/api/v2/quota`, { headers: { Authorization: `Bearer ${auth.token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) return { ready: false, status: response.status === 401 ? 'authentication_required' : response.status === 403 ? 'permission_required' : response.status === 402 ? 'funding_required' : 'unavailable', http_status: response.status, api_origin: origin };
  const quota = await response.json();
  // Return an allowlist, not arbitrary upstream content that might include credentials.
  return { ready: true, status: 'authenticated', method: auth.method, api_origin: origin, quota: Object.fromEntries(['credits_remaining', 'credits_used_this_period', 'credit_quota', 'bonus_credits', 'tier', 'current_period_start', 'current_period_end'].filter(key => ['string', 'number', 'boolean'].includes(typeof quota[key])).map(key => [key, quota[key]])), note: 'Read access verified. Confirm account scope and required operation permissions before submitting work.' };
}
export async function login({ origin, secretFile, home = os.homedir(), env = process.env, fetcher = fetch }) {
  origin = apiOrigin(origin);
  const resource = await discovery(origin, fetcher);
  if (!Array.isArray(resource.authorization_servers) || resource.authorization_servers.length !== 1) throw new Error('Headless setup requires one advertised OAuth issuer; use MCP or console API-key setup instead.');
  const issuer = safeUrl(resource.authorization_servers[0]);
  const issuerMetadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname === '/' ? '' : issuer.pathname.replace(/\/$/, '')}`;
  const issuerMetadata = JSON.parse(await fetchText(issuerMetadataUrl, fetcher));
  if (issuerMetadata.issuer !== issuer.href.replace(/\/$/, '') && issuerMetadata.issuer !== issuer.href) throw new Error('OAuth issuer mismatch.');
  if (!issuerMetadata.grant_types_supported?.includes('client_credentials')) throw new Error('Issuer does not advertise client_credentials; use its supported login flow.');
  const tokenUrl = safeUrl(issuerMetadata.token_endpoint).href;
  const methods = issuerMetadata.token_endpoint_auth_methods_supported || ['client_secret_basic'];
  const clientId = env.AGENTRUN_CLIENT_ID;
  if (!clientId) throw new Error('AGENTRUN_CLIENT_ID must identify an already provisioned service identity.');
  const { client_secret: secret } = await readPrivate(secretFile);
  if (typeof secret !== 'string' || !secret) throw new Error('Missing client secret.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', resource: `${origin}/api/v2` });
  if (env.AGENTRUN_OAUTH_SCOPES) body.set('scope', env.AGENTRUN_OAUTH_SCOPES);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (methods.includes('client_secret_basic')) headers.Authorization = `Basic ${Buffer.from(`${new URLSearchParams({v:clientId}).toString().slice(2)}:${new URLSearchParams({v:secret}).toString().slice(2)}`).toString('base64')}`;
  else if (methods.includes('client_secret_post')) { body.set('client_id', clientId); body.set('client_secret', secret); }
  else throw new Error('Issuer requires an unsupported client authentication method.');
  const result = JSON.parse(await fetchText(tokenUrl, fetcher, { method: 'POST', headers, body: body.toString() }));
  if (typeof result.access_token !== 'string' || result.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new Error('Issuer did not return an expiring bearer token.');
  const file = credentialPath(home, origin);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  if (await fs.realpath(path.dirname(file)) !== path.dirname(file)) throw new Error('Credential directory cannot be a symbolic link.');
  await fs.chmod(path.dirname(file), 0o700);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify({ origin, access_token: result.access_token, expires_at: Date.now() + Number(result.expires_in) * 1000 }), { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
  return status({ origin, home, env: {}, fetcher });
}
export async function main(argv, { home = os.homedir(), env = process.env, fetcher = fetch } = {}) {
  const [command, ...rest] = argv;
  const options = args(rest);
  if (command === 'update') return install({ source: options.source, home, fetcher });
  if (!['ensure', 'status', 'login'].includes(command)) throw new Error('Usage: agentrun-skills update --source URL | ensure --source URL --api-origin URL | status --api-origin URL | login --api-origin URL --client-secret-file FILE');
  const origin = apiOrigin(options['api-origin'] || env.AGENTRUN_API_ORIGIN);
  if (command === 'login') return login({ origin, secretFile: options['client-secret-file'], home, env, fetcher });
  let update;
  if (command === 'ensure') {
    if (!options.source) throw new Error('ensure requires --source for the selected console environment.');
    // Do not turn an integrity failure into successful readiness.
    update = await install({ source: options.source, home, fetcher });
  }
  return { ...await status({ origin, home, env, fetcher }), ...(update ? { update } : {}) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await main(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.ready === false) process.exitCode = 2;
  } catch (error) {
    // Avoid serializing network errors, which can contain request headers or bodies.
    const safe = /^(Use an HTTPS|API origin|Expected --|Usage:|Credential |Protected resource|Headless setup|OAuth issuer|Issuer |AGENTRUN_|Missing client|Invalid cached|ensure requires|Bundle |Invalid manifest|Invalid bundle|Unsafe |Package missing|Version mismatch|Installed release|Existing current|Refusing non-directory|HTTP \d{3})/.test(error.message);
    console.error(JSON.stringify({ ready: false, status: 'setup_error', error: safe ? error.message : 'Setup request failed; check connection, private credential file and environment configuration.' }));
    process.exitCode = 1;
  }
}
