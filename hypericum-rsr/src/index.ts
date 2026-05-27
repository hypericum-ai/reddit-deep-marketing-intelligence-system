import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';

import { api } from './routes/api.js';
import { menu } from './routes/menu.js';
import { scheduler } from './routes/scheduler.js';
import { triggers } from './routes/triggers.js';

const app = new Hono();
const internal = new Hono();

internal.route('/triggers', triggers);
internal.route('/menu', menu);
internal.route('/scheduler', scheduler);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
