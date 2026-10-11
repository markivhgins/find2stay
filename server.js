// Find2Stay — server.js
// Load .env file first (no-op if missing, so hosting env vars still win)
require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(__dirname + '/public'));

// ── Seed data ──────────────────────────────────────────────────────────────
const day = n => new Date(Date.now() - n * 864e5);
const L = (slug, title, type, entry, loc, ll, society, rent, dep, maint, elec, extra, v, a) => ({
  slug, title, accommodationType: type, entryPoints: entry, locality: loc,
  location: { type: 'Point', coordinates: ll }, society,
  price: { rent: rent * 100, deposit: dep * 100, maintenance: maint * 100, electricity: elec },
  ...extra, status: 'published',
  verifiedOn: day(v), verifiedUntil: new Date(Date.now() + (90 - v) * 864e5), availConfirmedOn: day(a)
});

const SEED = [
  L('sangam-boys-pg-katra',  'Triveni Boys PG',              'PG',    ['pg'],              'Katra',       [81.83, 25.45], null,                  5500,  5500,  0,    'metered', { gender: 'boys',   occupancy: '2-share', meals: 'Breakfast + dinner', gate: '10:30 pm', amenities: ['Wi-Fi', 'Laundry', 'Attached bath'] }, 6,  1),
  L('lukerganj-girls-pg',    'Meera Girls Residency',         'PG',    ['pg'],              'Lukerganj',   [81.84, 25.44], null,                  7200,  7200,  0,    'included', { gender: 'girls',  occupancy: 'single',  meals: 'All meals',         gate: '9:30 pm',  amenities: ['AC', 'Wi-Fi', 'CCTV'] },                     12, 2),
  L('allahpur-coed-pg',      'Allahpur Study House',          'PG',    ['pg'],              'Allahpur',    [81.86, 25.46], null,                  4200,  4200,  300,  'actuals',  { gender: 'co-ed', occupancy: '3-share', meals: 'No meals',           gate: '11 pm',    amenities: ['Wi-Fi', 'Reading hall'] },                   20, 4),
  L('civil-lines-2bhk',      'Civil Lines 2BHK, 3rd floor',  'flat',  ['flats','society'], 'Civil Lines', [81.84, 25.45], 'Gangotri Apartments', 16500, 33000, 1500, 'metered',  { gender: 'any',   bhk: '2 BHK',         furnishing: 'Semi-furnished',   amenities: ['Lift', 'Parking', 'Power backup'] },           3,  1),
  L('jhunsi-1bhk',           'Jhunsi 1BHK near river',       'flat',  ['flats'],           'Jhunsi',      [81.9,  25.43], null,                  8000,  16000, 0,    'actuals',  { gender: 'any',   bhk: '1 BHK',         furnishing: 'Unfurnished',      amenities: ['Parking', 'Water 24x7'] },                     30, 6),
  L('george-town-studio',    'George Town Studio',            'flat',  ['flats'],           'George Town', [81.85, 25.46], null,                  9500,  19000, 500,  'metered',  { gender: 'any',   bhk: '1 RK',          furnishing: 'Fully furnished',  amenities: ['AC', 'Wi-Fi', 'Geyser'] },                     8,  2),
  L('naini-society-3bhk',    'Yamuna Vihar 3BHK',            'flat',  ['society','flats'], 'Naini',       [81.87, 25.39], 'Yamuna Vihar Society', 21000, 42000, 2200, 'metered',  { gender: 'any',   bhk: '3 BHK',         furnishing: 'Semi-furnished',   amenities: ['Gym', 'Garden', '24/7 security', 'Lift'] },    5,  3),
  L('mumfordganj-villa',     'Mumfordganj Villa Floor',       'house', ['society'],         'Mumfordganj', [81.83, 25.46], 'Palm Court Enclave',  28000, 56000, 0,    'actuals',  { gender: 'any',   bhk: '3 BHK',         furnishing: 'Fully furnished',  amenities: ['Parking', 'Garden', 'Pets ok'] },              15, 18)
];
SEED.forEach((l, i) => (l.ownerId = i < 5 ? 'o1' : 'o2'));

// ── Storage layer ──────────────────────────────────────────────────────────
let db = null;
let dbMode = 'memory'; // 'mongodb' | 'memory'
const mem = { listings: [...SEED], enquiries: [], serviceConnections: [], drafts: [], cases: [] };

async function init() {
  const uri = process.env.MONGODB_URI;
  const requireMongo = (process.env.REQUIRE_MONGODB || '').toLowerCase() === 'true';

  if (!uri) {
    if (requireMongo) {
      console.error('FATAL: REQUIRE_MONGODB=true but MONGODB_URI is not set. Refusing to start.');
      process.exit(1);
    }
    console.log('No MONGODB_URI set — running in-memory (demo mode). Data resets on restart.');
    return;
  }

  // Sanitise the URI for logging: strip the password so we never print credentials.
  const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//<user>:****@');
  console.log(`Connecting to MongoDB: ${safeUri}`);

  let client;
  try {
    client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    const msg = `MongoDB connection failed: ${err.message}`;
    if (requireMongo) {
      console.error('FATAL:', msg);
      process.exit(1);
    }
    console.warn(msg);
    console.warn('Falling back to in-memory store. Set REQUIRE_MONGODB=true to prevent silent fallback.');
    return;
  }

  try {
    db = client.db(process.env.DB_NAME || 'find2stay');
    dbMode = 'mongodb';

    const l = db.collection('listings');
    // createIndex is idempotent — safe to call every startup.
    await l.createIndex({ location: '2dsphere' });
    await l.createIndex({ slug: 1 }, { unique: true });
    await l.createIndex({ status: 1, entryPoints: 1, 'price.rent': 1 });

    // Seed only when the collection is genuinely empty (never overwrites live data).
    const count = await l.countDocuments();
    if (count === 0) {
      await l.insertMany(SEED);
      console.log(`Seeded ${SEED.length} listings into MongoDB.`);
    } else {
      console.log(`Found ${count} existing listings — skipping seed.`);
    }

    console.log('Connected to MongoDB Atlas successfully.');
  } catch (err) {
    const msg = `MongoDB initialisation error: ${err.message}`;
    if (requireMongo) {
      console.error('FATAL:', msg);
      process.exit(1);
    }
    console.warn(msg);
    console.warn('Falling back to in-memory store.');
    db = null;
    dbMode = 'memory';
  }
}

// ── Query helpers ──────────────────────────────────────────────────────────
const publishedFor = async entry => {
  const q = { status: 'published', verifiedUntil: { $gt: new Date() }, ...(entry && { entryPoints: entry }) };
  if (db) return db.collection('listings').find(q).toArray();
  return mem.listings.filter(x => x.status === 'published' && x.verifiedUntil > new Date() && (!entry || x.entryPoints.includes(entry)));
};

const insert = async (name, doc) => {
  doc.id = crypto.randomUUID().slice(0, 8);
  if (db) await db.collection(name).insertOne({ ...doc });
  else mem[name].push(doc);
  return doc;
};

const all = async name => db
  ? db.collection(name).find().sort({ createdAt: -1 }).toArray()
  : [...mem[name]].reverse();

const patch = async (col, key, val, set) => db
  ? db.collection(col).updateOne({ [key]: val }, { $set: set })
  : Object.assign(mem[col].find(d => d[key] === val) || {}, set);

// Money stays in paise; "from price" and move-in total are computed, never stored.
const shape = x => {
  const p = x.price, d = Math.floor((Date.now() - new Date(x.availConfirmedOn)) / 864e5);
  return { ...x, _id: undefined, moveInTotal: p.rent + p.deposit + p.maintenance,
    availAgeDays: d, stale: d > 7, verifiedAgeDays: Math.floor((Date.now() - new Date(x.verifiedOn)) / 864e5) };
};

// ── Sessions ───────────────────────────────────────────────────────────────
const als = new AsyncLocalStorage();

const sessionSecret = () => {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || s === 'change-me-before-going-live')) {
    console.error('FATAL: SESSION_SECRET must be set to a strong random value in production.');
    process.exit(1);
  }
  return s || 'find2stay-demo-secret';
};

const mac = b => crypto.createHmac('sha256', sessionSecret()).update(b).digest('base64url');
const sign = v => { const b = Buffer.from(JSON.stringify(v)).toString('base64url'); return b + '.' + mac(b); };
const unsign = s => { try { const [b, m] = (s || '').split('.'); return m && m === mac(b) ? JSON.parse(Buffer.from(b, 'base64url')) : null; } catch { return null; } };

const DEMO = {
  user:    { id: 'u1', name: 'Aarav',              role: 'user' },
  owner:   { id: 'o1', name: 'Mrs. Srivastava',    role: 'owner' },
  verifier:{ id: 'v1', name: 'Neha',               role: 'verifier' },
  ops:     { id: 's1', name: 'Rohit',              role: 'ops' },
  food:    { id: 'pf', name: 'Annapurna Tiffins',  role: 'provider', service: 'food' },
  water:   { id: 'pw', name: 'Sangam Aqua',        role: 'provider', service: 'water' },
  movers:  { id: 'pm', name: 'Quick Shift Movers', role: 'provider', service: 'movers' }
};
const HOME = { user: '/activity', owner: '/owner', verifier: '/verifier', ops: '/admin', provider: '/provider' };

app.use((req, res, next) => {
  const c = /(?:^|; )f2s=([^;]+)/.exec(req.headers.cookie || '');
  req.me = c && unsign(c[1]);
  als.run(req.me, next);
});

const need = (...roles) => (req, res, next) => req.me && roles.includes(req.me.role) ? next()
  : req.path.startsWith('/api') ? res.status(401).json({ error: 'Your role cannot do this.' }) : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));

// Secure cookie flags in production (HTTPS required on Hostinger).
const cookieFlags = () => {
  const base = 'HttpOnly; Path=/; SameSite=Lax';
  return process.env.NODE_ENV === 'production' ? base + '; Secure' : base;
};

app.post('/login', (req, res) => {
  const k = DEMO[req.body.who];
  if (!k) return res.redirect('/login');
  res.setHeader('Set-Cookie', `f2s=${sign(k)}; ${cookieFlags()}`);
  const n = req.body.next;
  res.redirect(n && /^\/[^/]/.test(n) ? n : HOME[k.role]);
});
app.get('/logout', (_, res) => { res.setHeader('Set-Cookie', 'f2s=; Path=/; Max-Age=0'); res.redirect('/'); });
app.get('/portal', (req, res) => res.redirect(req.me ? HOME[req.me.role] : '/login'));

// ── Search ─────────────────────────────────────────────────────────────────
const search = async (entry, q = {}) => {
  let r = (await publishedFor(entry)).map(shape).filter(x => x.availAgeDays <= 14);
  const t = (q.q || '').toLowerCase();
  if (t) r = r.filter(x => (x.locality + x.title + (x.society || '')).toLowerCase().includes(t));
  if (q.max) r = r.filter(x => x.price.rent <= q.max * 100);
  for (const k of ['gender', 'occupancy', 'bhk', 'furnishing', 'society']) if (q[k]) r = r.filter(x => x[k] === q[k]);
  if (q.meals) r = r.filter(x => x.meals && x.meals !== 'No meals');
  const by = { low: (a, b) => a.price.rent - b.price.rent, high: (a, b) => b.price.rent - a.price.rent };
  return r.sort(by[q.sort] || ((a, b) => a.availAgeDays - b.availAgeDays));
};

// ── API routes ──────────────────────────────────────────────────────────────
const bad = (res, m) => res.status(400).json({ error: m });
const okUser = b => b.consent ? (!b.name || !/^\d{10}$/.test(b.phone || '') ? 'Enter your name and a 10-digit phone number.' : null) : 'Consent is required before we share your contact.';

// Health: reports actual db mode; never fakes a MongoDB connection.
app.get('/api/health', (_, r) => r.json({ status: 'ok', db: dbMode, mode: dbMode === 'mongodb' ? 'atlas' : 'in-memory' }));

app.get('/api/listings', async (req, res) => res.json(await search(req.query.entry, req.query)));

app.post('/api/enquiries', async (req, res) => {
  const b = req.body, e = okUser(b); if (e) return bad(res, e);
  const l = (await publishedFor()).find(x => x.slug === b.slug); if (!l) return bad(res, 'Listing unavailable.');
  res.json(await insert('enquiries', {
    slug: b.slug, title: l.title, ownerId: l.ownerId, userId: req.me?.id || 'guest',
    name: b.name, phone: b.phone, kind: b.kind, slot: b.slot,
    priceSnapshot: l.price, status: 'Requested', consentAt: new Date(), createdAt: new Date()
  }));
});

app.post('/api/connections', async (req, res) => {
  const b = req.body, e = okUser(b); if (e) return bad(res, e);
  if (!['food', 'water', 'movers'].includes(b.service)) return bad(res, 'Unknown service.');
  res.json(await insert('serviceConnections', {
    service: b.service, userId: req.me?.id || 'guest',
    name: b.name, phone: b.phone, details: b.details,
    status: 'Routing', consentAt: new Date(), createdAt: new Date()
  }));
});

app.post('/api/drafts', async (req, res) => {
  const b = req.body, e = okUser(b); if (e) return bad(res, e);
  if (!b.title || !(+b.rent > 0)) return bad(res, 'Add a property name and monthly rent.');
  res.json(await insert('drafts', { ...b, details: undefined, ownerId: req.me?.role === 'owner' ? req.me.id : 'guest', status: 'In review', createdAt: new Date() }));
});

// Owner (own listings) or ops (any listing): pause, resume, confirm availability.
app.post('/api/owner/listing', need('owner', 'ops'), async (req, res) => {
  const { slug, action } = req.body;
  const l = (await all('listings')).find(x => x.slug === slug && (req.me.role === 'ops' || x.ownerId === req.me.id));
  if (!l) return bad(res, 'Not your listing.');
  const set = { pause: { status: 'paused' }, resume: { status: 'published' }, confirm: { availConfirmedOn: new Date() } }[action];
  if (!set) return bad(res, 'Unknown action.');
  await patch('listings', 'slug', slug, set);
  res.json({ ok: 1 });
});

// Verifier: approve needs all three checks; reject needs a reason.
app.post('/api/verifier/decide', need('verifier', 'ops'), async (req, res) => {
  const { id, decision, checks = [], reason } = req.body;
  const d = (await all('drafts')).find(x => x.id === id && x.status === 'In review');
  if (!d) return bad(res, 'That draft is no longer in review.');
  if (decision === 'approve' && checks.length < 3) return bad(res, 'Tick all three checks before approving.');
  if (decision === 'reject' && !reason) return bad(res, 'Add a reason so the owner can fix it.');
  const next = decision === 'approve' ? 'Published' : 'Rejected';
  await patch('drafts', 'id', id, { status: next, reason: reason || null });
  await insert('cases', { draftId: id, title: d.title, verifier: req.me.name, decision: next, checks, reason, createdAt: new Date() });
  if (next === 'Published') {
    const pg = d.type === 'PG', n = +d.rent;
    await insert('listings', {
      ...L(
        d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + id,
        d.title, pg ? 'PG' : 'flat',
        [pg ? 'pg' : 'flats'],
        d.locality || 'Civil Lines', [81.84, 25.45], null,
        n, (+d.deposit || n * (pg ? 1 : 2)), 0, 'metered',
        { gender: d.gender || 'any', ...(pg ? { occupancy: d.occupancy || 'single', meals: 'No meals', gate: '10 pm' } : { bhk: d.bhk || '1 BHK', furnishing: 'Unfurnished' }), amenities: ['Wi-Fi'] },
        0, 0
      ),
      ownerId: d.ownerId
    });
  }
  res.json({ ok: 1 });
});

const FLOW = {
  enquiries:          ['Requested', 'Confirming', 'Scheduled', 'Completed'],
  serviceConnections: ['Routing', 'Accepted', 'Done']
};
app.post('/api/admin/advance', need('ops'), async (req, res) => {
  const { col, id, to } = req.body, f = FLOW[col];
  if (!f) return bad(res, 'Bad queue.');
  const d = (await all(col)).find(x => x.id === id);
  if (!d) return bad(res, 'Not found.');
  const next = to === 'Cancelled' ? 'Cancelled' : f[f.indexOf(d.status) + 1];
  if (!next) return res.json({ ok: 1 });
  await patch(col, 'id', id, { status: next });
  res.json({ ok: 1 });
});

app.post('/api/provider/respond', need('provider'), async (req, res) => {
  const { id, to } = req.body;
  const d = (await all('serviceConnections')).find(x => x.id === id && x.service === req.me.service);
  if (!d) return bad(res, 'Not your request.');
  if (!['Accepted', 'Declined', 'Done'].includes(to)) return bad(res, 'Bad response.');
  await patch('serviceConnections', 'id', id, { status: to });
  res.json({ ok: 1 });
});

// ── Mount pages, then start server ─────────────────────────────────────────
require('./pages')(app, { search, publishedFor, shape, all, need, als });

// init() checks SESSION_SECRET and REQUIRE_MONGODB, then starts the server
// only after the DB is ready (or in-memory fallback is confirmed).
init().then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Find2Stay running → http://localhost:${port}  (db: ${dbMode})`));
}).catch(err => {
  // Unhandled init errors (should not reach here — init() handles its own exits).
  console.error('Startup failed:', err.message);
  process.exit(1);
});
