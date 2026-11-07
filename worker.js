const handlers = {
  announcement: require('./handlers/announcement'),
  'borrow-stock': require('./handlers/borrow-stock'),
  employee: require('./handlers/employee'),
  'gas-announcement': require('./handlers/gas-announcement'),
  gas: require('./handlers/gas'),
  'image-db': require('./handlers/image-db'),
  login: require('./handlers/login'),
  logout: require('./handlers/logout'),
  'main-sap': require('./handlers/main-sap'),
  pending: require('./handlers/pending'),
  request: require('./handlers/request'),
  stock: require('./handlers/stock')
};

const PUBLIC_ASSETS = new Set([
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/offline.html',
  '/sw.js',
  '/icon-152.png',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
]);

const applyBindings = env => {
  Object.assign(process.env, env);
  process.env.SESSION_SECRET ||= 'change-this-session-secret-before-production';
};

const createResponseAdapter = () => {
  let statusCode = 200;
  const headers = new Headers();
  let sentBody;
  let finished = false;

  return {
    getHeaders: () => headers,
    isFinished: () => finished,
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    json(value) {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      sentBody = JSON.stringify(value);
      finished = true;
      return this;
    },
    end(value = '') {
      sentBody = String(value);
      finished = true;
      return this;
    },
    toResponse() {
      return new Response(sentBody ?? '', { status: statusCode, headers });
    }
  };
};

export default {
  async fetch(request, env, ctx) {
    applyBindings(env);

    const url = new URL(request.url);
    const apiMatch = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
    if (apiMatch) {
      const handler = handlers[apiMatch[1]];
      if (!handler) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      let body;
      if (!['GET', 'HEAD'].includes(request.method)) {
        const text = await request.text();
        const contentType = request.headers.get('content-type') || '';
        try {
          body = contentType.includes('application/json') ? JSON.parse(text) : text;
        } catch {
          body = text;
        }
      }

      const req = {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
        query: Object.fromEntries(url.searchParams.entries()),
        url: url.pathname + url.search
      };
      req.headers['x-forwarded-proto'] = url.protocol.replace(':', '');

      const res = createResponseAdapter();
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`API handler failed: ${apiMatch[1]}`, error);
        if (!res.isFinished()) {
          res.status(500);
          res.json({ error: 'Internal worker error' });
        }
      }
      return res.toResponse();
    }

    if (PUBLIC_ASSETS.has(url.pathname) || url.pathname.startsWith('/js/')) {
      return env.ASSETS.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
