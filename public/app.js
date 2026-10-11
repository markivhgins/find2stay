// Find2Stay — public/app.js
// All fetch calls go through here. Forms and dashboard buttons share the same error toast.

const post = (u, b) =>
  fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
      return j;
    });

const toast = (t, isErr) => {
  const d = document.createElement('div');
  d.className = 'toast' + (isErr ? ' toast-err' : '');
  d.textContent = t;
  document.body.append(d);
  setTimeout(() => d.remove(), 3800);
};

// ── Forms with data-post attribute ─────────────────────────────────────────
document.addEventListener('submit', async e => {
  const f = e.target;

  // Home search: just navigate.
  if (f.id === 'hs') {
    e.preventDefault();
    const d = new FormData(f);
    location.href = '/' + d.get('cat') + '?q=' + encodeURIComponent(d.get('q') || '');
    return;
  }

  if (!f.dataset.post) return;
  e.preventDefault();

  const btn = f.querySelector('button.go');
  const msg = f.querySelector('.msg');

  // Prevent duplicate submissions.
  if (btn.disabled) return;

  // Show loading state.
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Sending…';
  if (msg) { msg.className = 'msg'; msg.textContent = ''; }

  const d = Object.fromEntries(new FormData(f));
  d.consent = !!d.consent;
  d.details = { ...d };

  try {
    await post(f.dataset.post, d);
    if (msg) { msg.className = 'msg ok'; msg.textContent = 'Done! Track it at My desk.'; }
    toast('Request received ✓');
    f.reset();
  } catch (er) {
    if (msg) { msg.className = 'msg err'; msg.textContent = er.message; }
    toast(er.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// ── Dashboard action buttons (.act) and verifier decisions (.decide) ────────
document.addEventListener('click', async e => {
  const a = e.target.closest('.act');
  const d = e.target.closest('.decide');

  if (!a && !d) return;

  const btn = a || d;
  if (btn.disabled) return; // already in flight
  btn.disabled = true;

  try {
    if (a) {
      await post(a.dataset.api, JSON.parse(a.dataset.body));
      location.reload();
    }

    if (d) {
      const caseEl = d.closest('.case');
      const checks = [...caseEl.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
      const reason = caseEl.querySelector('.reason').value;
      const msgEl  = caseEl.querySelector('.msg');

      try {
        await post('/api/verifier/decide', { id: caseEl.dataset.id, decision: d.dataset.d, checks, reason });
        location.reload();
      } catch (er) {
        toast(er.message, true);
        if (msgEl) { msgEl.className = 'msg err'; msgEl.textContent = er.message; }
        btn.disabled = false; // allow retry after error
      }
    }
  } catch (er) {
    toast(er.message, true);
    btn.disabled = false;
  }
});
