// snap3d — one photo in, editable 3D scene out. Brain: Claude Fable 5.
// Zero npm deps: Node stdlib server + fetch to the Anthropic API,
// or the local `claude` CLI when no ANTHROPIC_API_KEY is set.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = process.env.PORT || 3777;
const MODEL = process.env.SNAP3D_MODEL || 'claude-fable-5';

const SCHEMA = `Return ONLY a JSON object (no markdown, no prose) shaped:
{"name": string, "parts": [{"id": string, "name": string,
  "shape": "box"|"cylinder"|"sphere"|"cone"|"torus",
  "dim": numbers,  // box:[w,h,d] cylinder:[rTop,rBottom,h] sphere:[r] cone:[r,h] torus:[r,tube]
  "pos": [x,y,z], "rot": [xDeg,yDeg,zDeg], "color": "#hex"}]}
Y is up, ground plane at y=0, keep the whole object within a 4-unit cube.
Use 8-30 parts. Infer hidden geometry (the far side, underside) from spatial reasoning.
Name parts semantically ("front-left wheel", not "cylinder2").`;

const genPrompt = `You are a 3D reconstruction engine. Analyze the photo and rebuild the pictured object as a parametric 3D scene of primitives. ${SCHEMA}`;
const remixPrompt = (scene, instruction) =>
  `You are a 3D scene editor. Current scene JSON:\n${JSON.stringify(scene)}\nApply this edit: "${instruction}". Keep untouched parts identical. ${SCHEMA}`;

function extractJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('no JSON in model reply');
  return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
}

async function viaAPI(prompt, imageB64, mediaType) {
  const content = [{ type: 'text', text: prompt }];
  if (imageB64) content.unshift({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API ${res.status}`);
  return extractJSON(data.content.map(b => b.text || '').join(''));
}

function viaCLI(prompt, imageB64, ext) {
  return new Promise((resolve, reject) => {
    let fullPrompt = prompt;
    let tmp;
    if (imageB64) {
      tmp = path.join(os.tmpdir(), `snap3d-${Date.now()}.${ext}`);
      fs.writeFileSync(tmp, Buffer.from(imageB64, 'base64'));
      fullPrompt = `Read the image at ${tmp} then: ${prompt}`;
    }
    execFile('claude', ['-p', fullPrompt, '--allowedTools', 'Read', '--output-format', 'text'],
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (tmp) fs.rmSync(tmp, { force: true });
        if (err) return reject(err);
        try { resolve(extractJSON(stdout)); } catch (e) { reject(e); }
      });
  });
}

// ponytail: offline fallback so the demo works with no key and no CLI
const DEMO_SCENE = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo-scene.json'), 'utf8'));

async function generate({ image, instruction, scene }) {
  const m = image ? image.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/s) : null;
  const prompt = scene ? remixPrompt(scene, instruction) : genPrompt;
  const b64 = m ? m[3] : null;
  if (process.env.ANTHROPIC_API_KEY) return viaAPI(prompt, b64, m?.[1]);
  try { return await viaCLI(prompt, b64, m?.[2] === 'jpeg' ? 'jpg' : m?.[2]); }
  catch (e) {
    if (scene) throw e;
    console.error('claude CLI failed, serving demo scene:', e.message);
    return { ...DEMO_SCENE, demo: true };
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const out = await generate(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  const file = path.join(PUBLIC, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return res.writeHead(404).end('nope');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`snap3d → http://localhost:${PORT} (brain: ${process.env.ANTHROPIC_API_KEY ? 'API ' + MODEL : 'claude CLI'})`));
