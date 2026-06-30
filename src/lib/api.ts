// Custom robust API fetch wrapper that bypasses any browser iframe sandbox restrictions
// by avoiding dangerous window.fetch patching and using clean ESM shadowing instead.

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // 1. Detect subfolder for Hostinger compatibility
  const path = window.location.pathname;
  const segments = path.split('/');
  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last.includes('.') || last === '') {
      segments.pop();
    }
  }
  const subFolder = segments.join('/');

  let finalInput = input;
  if (subFolder && subFolder !== '/' && typeof finalInput === 'string') {
    if (finalInput.startsWith('/api/')) {
      finalInput = subFolder + finalInput;
    } else if (finalInput.startsWith('/installer.php')) {
      finalInput = subFolder + finalInput;
    }
  }

  // 2. Inject X-Auth-Token header
  const token = localStorage.getItem('contosmart_auth_token');
  const secureInit: RequestInit = init || {};
  if (token) {
    const headers = new Headers(secureInit.headers || {});
    if (!headers.has('X-Auth-Token')) {
      headers.set('X-Auth-Token', token);
    }
    secureInit.headers = headers;
  }

  // 3. Perform original fetch
  const response = await fetch(finalInput, secureInit);

  // 4. Handle auto-logout on 401 Unauthorized
  if (response.status === 401) {
    const urlStr = typeof finalInput === 'string' ? finalInput : (finalInput as any).url || '';
    if (!urlStr.includes('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('auth-unauthorized'));
    }
  }

  return response;
};
