import express from 'express';
import type { Server } from 'node:http';

const posts: Array<{ id: number; text: string }> = [];
const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

export async function startMockSocial(port = 4178): Promise<Server> {
  posts.length = 0;
  const app = express();
  app.use(express.raw({ type: () => true, limit: '20mb' }));
  app.use((request, response) => {
    const session = request.headers.cookie?.includes('mock_session=ok');
    if (request.method === 'POST' && request.path === '/login') {
      response.setHeader('set-cookie', 'mock_session=ok; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax');
      response.redirect(302, '/');
      return;
    }
    if (request.method === 'POST' && request.path === '/compose' && session) {
      const body = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : '';
      const match = body.match(/name="text"\r?\n\r?\n([\s\S]*?)\r?\n--/);
      const text = request.headers['content-type']?.includes('multipart')
        ? (match?.[1] ?? '')
        : (new URLSearchParams(body).get('text') ?? '');
      posts.unshift({ id: posts.length + 1, text });
      response.send(page('<div data-handpost="success">Published</div>'));
      return;
    }
    if (request.method === 'POST') {
      response.status(401).send('unauthorized');
      return;
    }
    if (!session) {
      response.send(
        page(
          '<form method="post" action="/login" data-handpost="login"><label>User<input name="user"></label><button type="submit">Log in</button></form>',
        ),
      );
      return;
    }
    if (request.path === '/compose') {
      response.send(
        page(
          '<nav data-handpost="logged-in" aria-label="Profile"></nav><main data-handpost="composer"><form method="post" action="/compose" enctype="multipart/form-data"><textarea name="text" data-handpost="text"></textarea><input name="media" type="file"><button type="submit" data-handpost="submit">Post</button></form></main>',
        ),
      );
      return;
    }
    if (request.path === '/profile') {
      response.send(
        page(
          `<nav data-handpost="logged-in" aria-label="Profile"></nav>${posts.map((post) => `<article data-handpost="post"><p>${escape(post.text)}</p><a href="/posts/${post.id}">permalink</a></article>`).join('')}`,
        ),
      );
      return;
    }
    response.send(
      page('<nav data-handpost="logged-in" aria-label="Profile"></nav><a href="/compose">Compose</a>'),
    );
  });
  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

export async function stopMockSocial(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
