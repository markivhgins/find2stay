// Server-rendered pages matching the sitemap in the architecture doc.
module.exports = (app, { search, publishedFor, shape, all, need, als }) => {
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = p => '₹' + (p / 100).toLocaleString('en-IN');
const ago = d => d ? d + 'd ago' : 'today';
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const when = d => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ELEC = { metered: 'Metered', included: 'Included in rent', actuals: 'Billed on actuals', fixed: 'Fixed' };

// Floor plan drawn from the listing's own data: one room per bed-share or bedroom.
const plan = x => {
  const n = Math.min(4, parseInt(x.bhk || x.occupancy) || 1), w = 180 / n, t = (X, Y, s) => `<text x="${X}" y="${Y}" font-size="7" fill="currentColor" stroke="none" font-weight="700">${s}</text>`;
  let s = `<svg viewBox="0 0 200 146" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="10" y="10" width="180" height="120"/><line x1="10" y1="80" x2="190" y2="80"/>`;
  for (let i = 0; i < n; i++) {
    const X = 10 + i * w; if (i) s += `<line x1="${X}" y1="10" x2="${X}" y2="80"/>`;
    s += `<rect x="${X + 8}" y="24" width="${w - 16}" height="26" stroke-width="1.4"/><path d="M${X + w - 14} 80 a12 12 0 0 1 -12 -12" stroke-width="1.2"/>` + t(X + 8, 19, (x.bhk ? 'Bed ' : 'Room ') + (i + 1));
  }
  return s + `<rect x="148" y="92" width="32" height="28" stroke-width="1.4"/><circle cx="52" cy="106" r="12" stroke-width="1.4"/>${t(14, 92, 'Hall')}${t(150, 89, 'Kitchen')}<path d="M10 138h180M10 135v6M190 135v6" stroke-width="1"/>${t(86, 146, '9.0 m')}</svg>`;
};
const card = x => `<a class="card" href="/listing/${x.slug}"><div class="art">${plan(x)}<span class="seal">Checked ${ago(x.verifiedAgeDays)}</span></div>
<div class="cb"><h3>${esc(x.title)}</h3><p>${x.locality}${x.society ? ' · ' + esc(x.society) : ''}</p>
<p class="tags"><i>${x.occupancy || x.bhk}</i><i>${x.gender === 'any' ? x.furnishing : x.gender}</i>${x.meals ? `<i>${x.meals}</i>` : ''}</p>
<div class="pr"><b>${inr(x.price.rent)}</b><span>/month · ${inr(x.moveInTotal)} to move in</span></div>
<small class="${x.stale ? 'warn' : ''}">${x.stale ? 'Availability last confirmed ' + ago(x.availAgeDays) : 'Availability confirmed ' + ago(x.availAgeDays)}</small></div></a>`;

const NAV = [['/pg', 'PG'], ['/flats', 'Flats'], ['/society', 'Society'], ['/services', 'Services'], ['/list-your-property', 'List your property'], ['/how-verification-works', 'How we verify']];
const layout = (title, body, path = '') => { const m = als.getStore(); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | Find2Stay Prayagraj</title><link rel="stylesheet" href="/static/style.css"></head><body>
<header><a class="logo" href="/">Find<b>2</b>Stay</a><nav>${NAV.map(([h, t]) => `<a href="${h}"${path.startsWith(h) ? ' class="on"' : ''}>${t}</a>`).join('')}</nav>
<a class="me" href="${m ? '/portal' : '/login'}">${m ? esc(m.name) + ' · My desk' : 'Sign in'}</a>${m ? '<a class="so" href="/logout">Sign out</a>' : ''}</header>${body}
<footer><div><a class="logo" href="/">Find<b>2</b>Stay</a><p>Verified stays and everyday services in Prayagraj.</p></div>
<div><h4>Stays</h4><a href="/pg">PG for students</a><a href="/flats">Flats for professionals</a><a href="/society">Society homes</a></div>
<div><h4>Services</h4><a href="/services/food">Tiffin</a><a href="/services/water">Water jars</a><a href="/services/movers">Packers & movers</a></div>
<div><h4>Company</h4><a href="/how-verification-works">How we verify</a><a href="/list-your-property">List your property</a><a href="/help">Help & contact</a><a href="/login">Owner, partner & staff sign-in</a></div></footer>
<script src="/static/app.js"></script></body></html>`; };

const sel = (n, label, opts, cur) => `<label>${label}<select name="${n}"><option value="">Any</option>${opts.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
const form = (api, fields, btn, extra = '') => `<form data-post="${api}">${extra}${fields}
<label class="chk"><input type="checkbox" name="consent"> I agree to share my contact details with Find2Stay and the people handling this request.</label><button class="go">${btn}</button><p class="msg" role="status"></p></form>`;
const who = `<input name="name" placeholder="Your name" autocomplete="name"><input name="phone" placeholder="10-digit phone" inputmode="numeric" autocomplete="tel">`;

// ---------- Home ----------
app.get('/', async (_, res) => {
  const allL = await search(), top = [...allL].sort((a, b) => a.verifiedAgeDays - b.verifiedAgeDays).slice(0, 3);
  res.send(layout('Verified PGs, flats and services', `
<section class="hero"><div><h1>Stay sorted<br>in Prayagraj.</h1><p>PGs, flats and society homes that someone from our team has actually seen. Prices itemised before you call.</p>
<form id="hs" class="hsearch"><div class="seg">${['pg|PG', 'flats|Flats', 'society|Society'].map((o, i) => `<label><input type="radio" name="cat" value="${o.split('|')[0]}"${i ? '' : ' checked'}><span>${o.split('|')[1]}</span></label>`).join('')}</div>
<div class="sbar"><input name="q" placeholder="Locality, landmark or society, e.g. Katra"><button class="go">Search stays</button></div></form></div>
<div class="heroart">${plan({ bhk: '3 BHK' })}</div></section>
<section class="statband"><div class="wrap"><div><b>${allL.length}</b>verified stays live</div><div><b>${new Set(allL.map(x => x.locality)).size}</b>localities covered</div><div><b>${inr(Math.min(...allL.map(x => x.price.rent)))}</b>cheapest bed a month</div></div></section>
<section class="wrap"><h2>Pick how you live</h2><div class="trio">
<a class="tile y" href="/pg"><div>${plan({ occupancy: '2-share' })}</div><h3>PG for students</h3><p>Boys, girls and co-ed stays with meals, gate timing and bed-wise rent.</p></a>
<a class="tile w" href="/flats"><div>${plan({ bhk: '2 BHK' })}</div><h3>Flats for professionals</h3><p>1RK to 3BHK with deposit and maintenance shown up front.</p></a>
<a class="tile m" href="/society"><div>${plan({ bhk: '3 BHK' })}</div><h3>Society homes</h3><p>Gated and managed communities, grouped by society with shared facilities.</p></a></div></section>
<section class="wrap"><div class="row2"><h2>Recently verified</h2><a href="/pg">See all stays</a></div><div class="grid">${top.map(card).join('')}</div></section>
<section class="band"><div class="wrap"><h2>Everything after the move, too</h2><div class="trio">
<a href="/services/food"><h3>Tiffin</h3><p>Daily meals from approved kitchens near you.</p></a>
<a href="/services/water"><h3>Water jars</h3><p>Regular jar delivery from local suppliers.</p></a>
<a href="/services/movers"><h3>Packers & movers</h3><p>Request quotes for within-city moves.</p></a></div></div></section>
<section class="wrap"><h2>How a verified stay works</h2><ol class="steps"><li><b>We visit.</b> Location and photos are checked on site.</li><li><b>We date it.</b> Every card shows when it was checked and when availability was last confirmed.</li><li><b>You see the full cost.</b> Rent, deposit, maintenance and electricity before you enquire.</li><li><b>We set the visit.</b> We confirm the slot with the owner and share contact only with your consent.</li></ol></section>
<section class="band alt"><div class="wrap row2"><div><h2>Own a PG, flat or house?</h2><p>List it free. We verify it and bring you tenants who have seen the real price.</p></div><a class="go big" href="/list-your-property">List your property</a></div></section>`, '/'));
});

// ---------- Search results ----------
const CFG = { pg: ['PG for students', 'Boys, girls and co-ed stays, priced per bed.'], flats: ['Flats for professionals', 'Rooms, 1RK and BHK with itemised costs.'], society: ['Society and residential', 'Homes grouped by community.'] };
app.get('/:entry(pg|flats|society)', async (req, res) => {
  const e = req.params.entry, q = req.query, rows = await search(e, q);
  const socs = [...new Set((await publishedFor('society')).map(x => x.society).filter(Boolean))];
  const spec = e === 'pg' ? sel('gender', 'Who it is for', ['boys', 'girls', 'co-ed'], q.gender) + sel('occupancy', 'Sharing', ['single', '2-share', '3-share'], q.occupancy) + `<label class="chk"><input type="checkbox" name="meals" value="1"${q.meals ? ' checked' : ''}> Meals included</label>`
    : sel('bhk', 'Size', ['1 RK', '1 BHK', '2 BHK', '3 BHK'], q.bhk) + sel('furnishing', 'Furnishing', ['Unfurnished', 'Semi-furnished', 'Fully furnished'], q.furnishing) + (e === 'society' ? sel('society', 'Society', socs, q.society) : '');
  res.send(layout(CFG[e][0], `<section class="head"><div class="wrap"><h1>${CFG[e][0]}</h1><p>${CFG[e][1]}</p></div></section>
<div class="wrap split"><form class="filters" action="/${e}"><h3>Filters</h3><label>Locality or landmark<input name="q" value="${esc(q.q)}" placeholder="Katra, Civil Lines"></label>
<label>Max rent: <span id="mv">${q.max ? '₹' + (+q.max).toLocaleString('en-IN') : 'Any'}</span><input type="range" name="max" min="3000" max="30000" step="500" value="${q.max || 30000}" oninput="mv.textContent='₹'+(+this.value).toLocaleString('en-IN')"></label>
${spec}<label>Sort by<select name="sort"><option value="">Recently confirmed</option><option value="low"${q.sort === 'low' ? ' selected' : ''}>Rent, low to high</option><option value="high"${q.sort === 'high' ? ' selected' : ''}>Rent, high to low</option></select></label>
<button class="go">Apply</button><a href="/${e}">Clear all</a></form>
<div><p class="count"><b>${rows.length}</b> verified ${rows.length === 1 ? 'stay' : 'stays'}</p>${rows.length ? `<div class="grid two">${rows.map(card).join('')}</div>` : '<div class="empty"><h3>Nothing matches yet</h3><p>Raise the max rent or clear a filter.</p></div>'}</div></div>`, '/' + e));
});

// ---------- Listing detail ----------
app.get('/listing/:slug', async (req, res) => {
  const l = (await publishedFor()).find(x => x.slug === req.params.slug);
  if (!l) return res.status(404).send(layout('Not found', '<div class="wrap empty"><h1>This stay is no longer listed</h1><p>It may have been paused or its verification has lapsed. <a href="/pg">Browse current stays</a></p></div>'));
  const x = shape(l), p = x.price, back = x.entryPoints[0];
  res.send(layout(x.title, `<div class="wrap crumbs"><a href="/">Home</a> / <a href="/${back}">${CFG[back][0]}</a> / ${esc(x.title)}</div>
<div class="wrap detail"><div><div class="bigart">${plan(x)}<span class="seal">Checked ${ago(x.verifiedAgeDays)}</span></div>
<h1>${esc(x.title)}</h1><p class="sub">${x.locality}, Prayagraj${x.society ? ` · <a href="/society/${slug(x.society)}">${esc(x.society)}</a>` : ''}</p>
<nav class="jump"><a href="#unit">Unit</a><a href="#price">Pricing</a><a href="#amen">Amenities</a><a href="#rules">Rules</a><a href="#loc">Location</a><a href="#ver">Verification</a></nav>
<h2 id="unit">Unit options</h2><div class="kv"><div><span>Type</span>${x.accommodationType}</div><div><span>${x.bhk ? 'Size' : 'Sharing'}</span>${x.bhk || x.occupancy}</div><div><span>For</span>${x.gender === 'any' ? 'Anyone' : x.gender}</div><div><span>Furnishing</span>${x.furnishing || 'Furnished bed + cupboard'}</div></div>
<h2 id="price">Pricing</h2><table><tr><td>Rent</td><td>${inr(p.rent)} / month</td></tr><tr><td>Deposit, refundable</td><td>${inr(p.deposit)}</td></tr><tr><td>Maintenance</td><td>${p.maintenance ? inr(p.maintenance) + ' / month' : 'Included'}</td></tr><tr><td>Electricity</td><td>${ELEC[p.electricity]}</td></tr><tr class="tot"><td>Estimated move-in total</td><td>${inr(x.moveInTotal)}</td></tr></table>
<h2 id="amen">Amenities</h2><p class="tags big">${x.amenities.map(a => `<i>${a}</i>`).join('')}${x.meals ? `<i>${x.meals}</i>` : ''}</p>
<h2 id="rules">Rules</h2><p>${x.gate ? `Gate closes at ${x.gate}. ` : ''}${x.accommodationType === 'PG' ? 'Visitors only in the common area.' : 'Lease and notice terms are confirmed when your visit is scheduled.'}</p>
<h2 id="loc">Location</h2><p>${x.locality}, Prayagraj. Exact address is shared after your visit is confirmed.</p>
<h2 id="ver">Verification</h2><div class="ver"><p><b>Checked ${ago(x.verifiedAgeDays)}:</b> authentic location and real photos.</p><p>Availability confirmed ${ago(x.availAgeDays)}. Valid until ${new Date(x.verifiedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p><a href="/help">Report a mismatch</a></div></div>
<aside class="book"><b class="big">${inr(p.rent)}</b><span>/month</span><p>${inr(x.moveInTotal)} to move in</p>
${form('/api/enquiries', `<select name="kind"><option>Request a visit</option><option>Request a callback</option></select><input name="slot" type="datetime-local" aria-label="Preferred time">${who}`, 'Send request', `<input type="hidden" name="slug" value="${x.slug}">`)}</aside></div>`, '/' + back));
});

// ---------- Society ----------
app.get('/society/:s', async (req, res) => {
  const rows = (await search()).filter(x => x.society && slug(x.society) === req.params.s);
  if (!rows.length) return res.redirect('/society');
  res.send(layout(rows[0].society, `<section class="head"><div class="wrap"><h1>${esc(rows[0].society)}</h1><p>${rows[0].locality}, Prayagraj · ${[...new Set(rows.flatMap(r => r.amenities))].join(' · ')}</p></div></section><div class="wrap"><div class="grid">${rows.map(card).join('')}</div></div>`, '/society'));
});

// ---------- Services ----------
const SVC = {
  food: ['Tiffin & meals', 'Daily meals from approved kitchens. Provider sets the price: confirm with provider.', `<input name="locality" placeholder="Your locality"><select name="meals"><option>1 meal a day</option><option>2 meals a day</option><option>3 meals a day</option></select><select name="diet"><option>Vegetarian</option><option>Non-vegetarian</option></select><input name="start" type="date" aria-label="Start date">`],
  water: ['Water jars', 'Regular jar delivery. Pricing, billing and jar returns are handled by the supplier.', `<input name="locality" placeholder="Delivery address or locality"><select name="size"><option>20L jar</option><option>10L jar</option></select><select name="freq"><option>Daily</option><option>Alternate days</option><option>Weekly</option></select><input name="qty" type="number" min="1" value="1" aria-label="Quantity">`],
  movers: ['Packers & movers', 'Tell us about your move. Approved movers send you quotes; you choose.', `<input name="from" placeholder="Moving from"><input name="to" placeholder="Moving to"><input name="date" type="date" aria-label="Move date"><select name="size"><option>1 RK / room</option><option>1 BHK</option><option>2 BHK</option><option>3 BHK</option></select><select name="pack"><option>Packing needed</option><option>Moving only</option></select>`]
};
app.get('/services', (_, res) => res.send(layout('Services', `<section class="head"><div class="wrap"><h1>Services after the move</h1><p>Local providers do the work and set the price. We connect you and keep the request on record.</p></div></section><div class="wrap"><div class="trio big">${Object.entries(SVC).map(([k, v]) => `<a class="tile ${k === 'food' ? 'y' : k === 'water' ? 'm' : 'w'}" href="/services/${k}"><h3>${v[0]}</h3><p>${v[1]}</p></a>`).join('')}</div></div>`, '/services')));
app.get('/services/:k(food|water|movers)', (req, res) => { const [t, d, f] = SVC[req.params.k]; res.send(layout(t, `<section class="head"><div class="wrap"><h1>${t}</h1><p>${d}</p></div></section>
<div class="wrap split2"><div><h2>How it works</h2><ol class="steps"><li><b>Tell us what you need.</b></li><li><b>We route it</b> to an approved provider in your area.</li><li><b>The provider contacts you.</b> If nobody responds, we try another or add you to a waitlist.</li><li><b>Tell us how it went</b> so we can follow up on problems.</li></ol></div>
<div class="panel"><h2>Request a connection</h2>${form('/api/connections', who + f, 'Connect me', `<input type="hidden" name="service" value="${req.params.k}">`)}</div></div>`, '/services')); });

// ---------- Owner, trust, help ----------
app.get('/list-your-property', (_, res) => res.send(layout('List your property', `<section class="head"><div class="wrap"><h1>List your property</h1><p>Free to list. We verify before anything goes live.</p></div></section>
<div class="wrap split2"><div><h2>What happens next</h2><ol class="steps"><li><b>Submit the basics</b> using this form.</li><li><b>We confirm you manage the property.</b></li><li><b>Our team visits and checks</b> location and photos.</li><li><b>Your listing goes live</b> and you can pause it anytime.</li></ol></div>
<div class="panel">${form('/api/drafts', `<input name="title" placeholder="Property name"><input name="locality" placeholder="Locality"><select name="type"><option>PG</option><option>Flat</option></select><select name="gender"><option value="any">Anyone</option><option value="boys">Boys</option><option value="girls">Girls</option><option value="co-ed">Co-ed</option></select><select name="occupancy"><option>single</option><option>2-share</option><option>3-share</option></select><select name="bhk"><option>1 BHK</option><option>2 BHK</option><option>3 BHK</option></select><input name="rent" type="number" placeholder="Monthly rent (₹)"><input name="deposit" type="number" placeholder="Deposit (₹)">${who}`, 'Submit for review')}</div></div>`, '/list')));
app.get('/how-verification-works', (_, res) => res.send(layout('How verification works', `<section class="head"><div class="wrap"><h1>What "verified" means here</h1><p>Specific checks, a date, and a limit. Never a paid badge.</p></div></section><div class="wrap narrow"><h2>We check</h2><p>That the property is where the listing says, and that the photos are real.</p><h2>We do not promise</h2><p>Quality of the owner, neighbours or the landlord's future behaviour. Always read the rules before you move in.</p><h2>It expires</h2><p>Verification is valid for a fixed period. Lapsed listings disappear from search. Availability is confirmed separately, flagged when old, and hidden after 14 days.</p><h2>Spot a mismatch?</h2><p>Use the report link on any listing or <a href="/help">contact us</a>.</p></div>`, '/how')));
app.get('/help', (_, res) => res.send(layout('Help', `<section class="head"><div class="wrap"><h1>Help and contact</h1></div></section><div class="wrap narrow">${[
  ['Do I pay to enquire?', 'No. Browsing, callbacks and visit requests are free.'], ['Who sees my phone number?', 'Only Find2Stay and the owner or provider handling your request, and only after you consent.'],
  ['Do you collect payment for services?', 'No. Providers set prices and fulfil the service. Confirm price with the provider.'], ['A listing is wrong. What now?', 'Report it from the listing page or email support@find2stay.example. We review it and pause it if needed.']
].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}<p>Complaints: complaints@find2stay.example</p></div>`, '/help')));

// ---------- Sign-in, role desks ----------
const me = () => als.getStore();
const ROLE = { user: ['Visitor', 'y'], owner: ['Owner', 'y'], verifier: ['Verifier', 'm'], ops: ['Operations', 'b'], provider: ['Partner', 'r'] };
const FL = ['Requested', 'Confirming', 'Scheduled', 'Completed'], FC = ['Routing', 'Accepted', 'Done'];
const stat = s => `<em class="${/Cancel|Declin|Reject|paused/.test(s) ? 'bad' : ''}">${esc(s)}</em>`;
const track = (f, s) => `<span class="trk" title="${s}">${f.map((_, k) => `<i class="${f.indexOf(s) >= k ? 'on' : ''}"></i>`).join('')}</span>`;
const act = (api, body, label, cls = '') => `<button class="act ${cls}" data-api="${api}" data-body="${esc(JSON.stringify(body))}">${label}</button>`;
const stats = a => `<div class="stats">${a.map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('')}</div>`;
const desk = (title, links, body) => { const m = me(); return layout(title, `<div class="desk ${ROLE[m.role][1]}"><aside><small>${ROLE[m.role][0]} desk</small><b>${esc(m.name)}</b><nav>${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav><a class="out" href="/logout">Sign out</a></aside><div>${body}</div></div>`, '/portal'); };
const KEYS = [['user', 'Visitor', 'Aarav', 'Track your visits, callbacks and service requests.'], ['owner', 'Owner', 'Mrs. Srivastava', 'Manage listings, availability and leads.'], ['verifier', 'Verifier', 'Neha', 'Check new listings, then publish or reject.'],
  ['ops', 'Operations', 'Rohit', 'Confirm visits, follow up services, pause listings.'], ['food', 'Partner · Tiffin', 'Annapurna Tiffins', 'Accept or decline meal requests.'], ['water', 'Partner · Water', 'Sangam Aqua', 'Respond to jar delivery requests.'], ['movers', 'Partner · Movers', 'Quick Shift Movers', 'Respond to move requests.']];
app.get('/login', (req, res) => res.send(layout('Sign in', `<section class="head"><div class="wrap"><h1>Pick your key</h1><p>Demo sign-in. Each key opens a different desk, and the server checks your role on every action.</p></div></section>
<div class="wrap"><form method="post" action="/login" class="keys"><input type="hidden" name="next" value="${esc(req.query.next || '')}">${KEYS.map(([k, r, n, d], i) => `<button name="who" value="${k}" class="key k${i % 4}"><span class="hole"></span><small>${r}</small><b>${n}</b><p>${d}</p></button>`).join('')}</form></div>`, '/login')));

app.get('/activity', async (req, res) => {
  const m = req.me; if (!m) return res.redirect('/login?next=/activity');
  const mine = x => x.userId === m.id || (m.role === 'user' && x.userId === 'guest');
  const e = (await all('enquiries')).filter(mine), c = (await all('serviceConnections')).filter(mine);
  const r = [...e.map(x => [x.kind + ': ' + x.title, x.status, x.createdAt, FL]), ...c.map(x => [SVC[x.service][0] + ' connection', x.status, x.createdAt, FC])].sort((a, b) => new Date(b[2]) - new Date(a[2]));
  res.send(desk('My activity', [['/activity', 'Visits & requests'], ['/pg', 'Find a PG'], ['/services', 'Services']], `<h1>My activity</h1>${stats([[e.length, 'visits and callbacks'], [c.length, 'service requests']])}
${r.length ? r.map(x => `<div class="logrow"><span>${esc(x[0])}<small>${when(x[2])}</small></span>${track(x[3], x[1])}${stat(x[1])}</div>`).join('') : '<div class="empty"><h3>Nothing yet</h3><p>Request a visit on any <a href="/pg">stay</a> or a <a href="/services">service</a>.</p></div>'}`));
});

const listForm = () => form('/api/drafts', `<input name="title" placeholder="Property name"><input name="locality" placeholder="Locality"><select name="type"><option>PG</option><option>Flat</option></select><select name="gender"><option value="any">Anyone</option><option value="boys">Boys</option><option value="girls">Girls</option><option value="co-ed">Co-ed</option></select><select name="occupancy"><option>single</option><option>2-share</option><option>3-share</option></select><select name="bhk"><option>1 BHK</option><option>2 BHK</option><option>3 BHK</option></select><input name="rent" type="number" placeholder="Monthly rent (₹)"><input name="deposit" type="number" placeholder="Deposit (₹)">${who}`, 'Submit for review');

app.get('/owner', need('owner'), async (req, res) => {
  const m = req.me, ls = (await all('listings')).filter(l => l.ownerId === m.id).map(shape), slugs = new Set(ls.map(l => l.slug));
  const enq = (await all('enquiries')).filter(e => slugs.has(e.slug)), dr = (await all('drafts')).filter(d => d.ownerId === m.id);
  res.send(desk('Owner desk', [['#listings', 'My listings'], ['#leads', 'Leads'], ['#subs', 'Submissions'], ['#new', 'New listing']], `<h1>Welcome, ${esc(m.name)}</h1>
${stats([[ls.filter(l => l.status === 'published').length, 'live listings'], [enq.length, 'leads'], [dr.filter(d => d.status === 'In review').length, 'in review']])}
<h2 id="listings">My listings</h2>${ls.map(l => `<div class="logrow"><span>${esc(l.title)}<small>${l.locality} · ${inr(l.price.rent)} · availability confirmed ${ago(l.availAgeDays)}${l.availAgeDays > 7 ? ' (stale, will be hidden after 14 days)' : ''}</small></span>${stat(l.status)}${act('/api/owner/listing', { slug: l.slug, action: 'confirm' }, 'Confirm availability')}${act('/api/owner/listing', { slug: l.slug, action: l.status === 'paused' ? 'resume' : 'pause' }, l.status === 'paused' ? 'Resume' : 'Pause')}</div>`).join('') || '<p>No listings yet.</p>'}
<h2 id="leads">Leads</h2>${enq.map(e => `<div class="logrow"><span>${esc(e.kind)}: ${esc(e.title)}<small>${e.slot ? 'Preferred ' + esc(e.slot.replace('T', ' ')) : 'No slot given'} · contact released by operations once the visit is confirmed</small></span>${track(FL, e.status)}${stat(e.status)}</div>`).join('') || '<p>No leads yet.</p>'}
<h2 id="subs">Submissions</h2>${dr.map(d => `<div class="logrow"><span>${esc(d.title)}<small>${d.reason ? 'Reason: ' + esc(d.reason) : when(d.createdAt)}</small></span>${stat(d.status)}</div>`).join('') || '<p>Nothing submitted.</p>'}
<h2 id="new">New listing</h2><div class="panel">${listForm()}</div>`));
});

app.get('/verifier', need('verifier', 'ops'), async (req, res) => {
  const q = (await all('drafts')).filter(d => d.status === 'In review'), cs = (await all('cases')).slice(0, 6);
  res.send(desk('Verifier desk', [['#queue', 'Queue'], ['#done', 'Decisions']], `<h1>Verification queue</h1>${stats([[q.length, 'waiting'], [cs.length, 'recent decisions']])}<h2 id="queue">Waiting for a check</h2>
${q.map(d => `<div class="case" data-id="${d.id}"><h3>${esc(d.title)}</h3><p>${esc(d.locality || 'Locality missing')} · ${esc(d.type)} · ${inr(d.rent * 100)} a month · submitted ${when(d.createdAt)}</p>
<label class="chk"><input type="checkbox" value="location"> Location matches the listing</label><label class="chk"><input type="checkbox" value="photos"> Photos are real</label><label class="chk"><input type="checkbox" value="authority"> Owner has authority to list</label>
<input class="reason" placeholder="Reason (required to reject)"><div class="btns"><button class="decide go" data-d="approve">Approve and publish</button><button class="decide no" data-d="reject">Reject</button></div><p class="msg"></p></div>`).join('') || '<p>The queue is clear.</p>'}
<h2 id="done">Recent decisions</h2>${cs.map(c => `<div class="logrow"><span>${esc(c.title)}<small>${esc(c.verifier)} · ${when(c.createdAt)}${c.reason ? ' · ' + esc(c.reason) : ''}</small></span>${stat(c.decision)}</div>`).join('') || '<p>None yet.</p>'}`));
});

app.get('/admin', need('ops'), async (req, res) => {
  const [e, c, l, d] = await Promise.all(['enquiries', 'serviceConnections', 'listings', 'drafts'].map(all));
  const row = (col, x, lab, f) => `<div class="logrow"><span>${esc(lab)}<small>${esc(x.name || '')} · ${when(x.createdAt)}</small></span>${track(f, x.status)}${stat(x.status)}${f.includes(x.status) && x.status !== f[f.length - 1] ? act('/api/admin/advance', { col, id: x.id }, 'Advance') + act('/api/admin/advance', { col, id: x.id, to: 'Cancelled' }, 'Cancel', 'no') : ''}</div>`;
  res.send(desk('Operations desk', [['#visits', 'Visits & callbacks'], ['#services', 'Service connections'], ['#listings', 'Listings'], ['/verifier', 'Verifier queue']], `<h1>Operations</h1>
${stats([[e.filter(x => x.status === 'Requested').length, 'new visit requests'], [c.filter(x => x.status === 'Routing').length, 'services awaiting provider'], [l.filter(x => x.status === 'published').length, 'live listings'], [d.filter(x => x.status === 'In review').length, 'awaiting verification']])}
<h2 id="visits">Visits and callbacks</h2>${e.map(x => row('enquiries', x, x.kind + ': ' + x.title, FL)).join('') || '<p>No requests.</p>'}
<h2 id="services">Service connections</h2>${c.map(x => row('serviceConnections', x, SVC[x.service][0], FC)).join('') || '<p>No requests.</p>'}
<h2 id="listings">Listings</h2>${l.map(shape).map(x => `<div class="logrow"><span>${esc(x.title)}<small>${x.locality} · availability ${ago(x.availAgeDays)}</small></span>${stat(x.status)}${act('/api/owner/listing', { slug: x.slug, action: x.status === 'paused' ? 'resume' : 'pause' }, x.status === 'paused' ? 'Resume' : 'Pause')}</div>`).join('')}`));
});

app.get('/provider', need('provider'), async (req, res) => {
  const m = req.me, r = (await all('serviceConnections')).filter(x => x.service === m.service);
  const info = x => Object.entries(x.details || {}).filter(([k, v]) => v && !['name', 'phone', 'consent', 'service', 'details'].includes(k)).map(([k, v]) => `${k}: ${esc(v)}`).join(' · ');
  res.send(desk('Partner desk', [['#new', 'New requests'], ['#all', 'All requests']], `<h1>${esc(m.name)}</h1>${stats([[r.filter(x => x.status === 'Routing').length, 'waiting for you'], [r.filter(x => x.status === 'Accepted').length, 'active'], [r.filter(x => x.status === 'Done').length, 'done']])}
<h2 id="all">Requests routed to you</h2>${r.map(x => `<div class="logrow"><span>${esc(x.name)}<small>${info(x)}${x.status === 'Accepted' || x.status === 'Done' ? ' · call ' + esc(x.phone) : ' · contact shown after you accept'}</small></span>${stat(x.status)}${x.status === 'Routing' ? act('/api/provider/respond', { id: x.id, to: 'Accepted' }, 'Accept') + act('/api/provider/respond', { id: x.id, to: 'Declined' }, 'Decline', 'no') : x.status === 'Accepted' ? act('/api/provider/respond', { id: x.id, to: 'Done' }, 'Mark done') : ''}</div>`).join('') || '<div class="empty"><h3>No requests yet</h3><p>Requests from users appear here.</p></div>'}`));
});
};
