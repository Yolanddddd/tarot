const callbackErrors = new Set(['access_denied', 'invalid_request', 'server_error', 'temporarily_unavailable']);
const invalidLinkCodes = new Set(['flow_state_not_found', 'bad_code_verifier', 'validation_failed']);

// Capture only a boolean before the SDK removes the callback parameters, never the credentials.
export function isAuthCallback(location: Pick<Location, 'hash' | 'search'> = window.location): boolean {
  return Boolean(readAuthCallbackError(location)) ||
    new URLSearchParams(location.hash.slice(1)).has('access_token') ||
    new URLSearchParams(location.search.slice(1)).has('code');
}

// Read before the Auth SDK processes the URL. Leave token/code parameters intact.
export function readAuthCallbackError(location: Pick<Location, 'hash' | 'search'> = window.location): string | null {
  for (const value of [location.hash, location.search]) {
    const params = new URLSearchParams(value.slice(1));
    const code = params.get('error_code');
    if (code === 'otp_expired' || code === 'flow_state_expired') {
      return '邮箱登录链接已失效或过期，请重新发送登录链接，并打开最新收到的邮件。';
    }
    if (callbackErrors.has(params.get('error') ?? '') || invalidLinkCodes.has(code ?? '')) {
      return '邮箱登录验证未完成，请重新发送登录链接后再试。若仍失败，请联系网站管理员。';
    }
  }
  return null;
}
