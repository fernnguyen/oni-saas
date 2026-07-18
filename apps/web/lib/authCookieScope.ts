function normalizeRootDomain(rootDomain: string) {
  const withoutProtocol = rootDomain.replace(/^https?:\/\//, '');
  return withoutProtocol.split('/')[0] ?? withoutProtocol;
}

function stripPort(host: string | null | undefined) {
  if (!host) return '';
  return host.split(':')[0] ?? '';
}

export function isMainAuthHost(host: string | null | undefined, rootDomain: string) {
  const normalizedRoot = stripPort(normalizeRootDomain(rootDomain));
  const normalizedHost = stripPort(host);

  if (!normalizedRoot || !normalizedHost) return false;
  return normalizedHost === normalizedRoot || normalizedHost === `www.${normalizedRoot}`;
}

export function getGlobalAuthCookieDomain(rootDomain: string) {
  const normalizedRoot = stripPort(normalizeRootDomain(rootDomain));
  if (!normalizedRoot || normalizedRoot.includes('localhost')) return undefined;
  return `.${normalizedRoot}`;
}

export function getAuthCookieDomainForHost(host: string | null | undefined, rootDomain: string) {
  if (!isMainAuthHost(host, rootDomain)) return undefined;
  return getGlobalAuthCookieDomain(rootDomain);
}

export function getSupabaseAuthCookieBaseName(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname;
  return `sb-${hostname.split('.')[0]}-auth-token`;
}

export function getScopedAuthCookieName(
  host: string | null | undefined,
  rootDomain: string,
  supabaseUrl: string,
) {
  const baseName = getSupabaseAuthCookieBaseName(supabaseUrl);
  return isMainAuthHost(host, rootDomain) ? `${baseName}-root` : `${baseName}-workspace`;
}
