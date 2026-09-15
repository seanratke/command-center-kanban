// Shared bottom tab bar -- single source of truth for Command Center's navigation.
// Replaces the old top pill-nav (nav.js). Works on every page, including ones
// that don't define the --paper/--card/--sage theme tokens (falls back to
// opportunities.html's own indigo/gray palette via var(--token, fallback)).
//
// Usage on any page:
//   1. <script src="/tabbar.js"></script>  (near the bottom, after supabase-js if used)
//   2. renderTabbar('home' | 'board' | 'opportunities' | 'inventors' | 'roster' | 'needs');
//
// "More" (the rightmost, three-dot tab) opens a small sheet listing the pages
// that don't fit in the five main slots: Inventor Pool, Inventor Roster, and
// Needs Attention.

(function () {
  const MORE_LINKS = [
    { slug: 'inventors', href: '/inventors', label: 'Inventor Pool' },
    { slug: 'roster',    href: '/roster',    label: 'Inventor Roster' },
    { slug: 'needs',     href: '/needs',     label: 'Needs Attention' },
  ];
  // Pages reachable only through the More sheet light up the More tab itself,
  // since none of the five main slots represents them directly.
  const MORE_SLUGS = new Set(['inventors', 'roster', 'needs']);

  const CSS = `
    #tabbar-root .tabbar { position:fixed; bottom:0; left:0; right:0; background:var(--card, #FFFFFF); border-top:1px solid var(--border, #e5e7eb); display:flex; justify-content:space-around; align-items:center; padding:8px 0 max(8px, env(safe-area-inset-bottom)); z-index:50; }
    #tabbar-root .tab { background:none; border:none; color:var(--ink-muted, #6b7280); display:flex; flex-direction:column; align-items:center; font-family:inherit; cursor:pointer; padding:4px; text-decoration:none; }
    #tabbar-root .tab svg { width:20px; height:20px; }
    #tabbar-root .tab.active { color:var(--sage, #4f46e5); }
    #tabbar-root .tab-plus { width:38px; height:38px; border-radius:50%; background:var(--sage, #4f46e5); display:flex; align-items:center; justify-content:center; margin-top:-16px; border:3px solid var(--paper, #FFFFFF); }
    #tabbar-root .tab-plus svg { width:18px; height:18px; }

    #tabbar-root .sheet-overlay { position:fixed; inset:0; background:rgba(37,36,31,0.4); display:none; align-items:flex-end; z-index:100; }
    #tabbar-root .sheet-overlay.open { display:flex; }
    #tabbar-root .sheet { background:var(--card, #FFFFFF); width:100%; border-radius:20px 20px 0 0; padding:20px; max-width:520px; margin:0 auto; box-sizing:border-box; }
    #tabbar-root .sheet h3 { font-family:inherit; font-size:16px; margin:0 0 10px; color:var(--ink, #111827); }
    #tabbar-root .sheet textarea { width:100%; min-height:90px; border:1px solid var(--border, #e5e7eb); border-radius:10px; padding:10px; font-family:inherit; font-size:14px; resize:none; box-sizing:border-box; color:var(--ink, #111827); background:var(--paper, #FFFFFF); }
    #tabbar-root .sheet-actions { display:flex; gap:8px; margin-top:10px; }
    #tabbar-root .sheet-btn { flex:1; padding:10px; border-radius:999px; border:none; font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; }
    #tabbar-root .sheet-btn-primary { background:var(--sage, #4f46e5); color:#FFF; }
    #tabbar-root .sheet-btn-secondary { background:var(--sage-dim, #eef2ff); color:var(--sage, #4f46e5); }
    #tabbar-root .sheet-status { font-size:12px; color:var(--sage, #4f46e5); margin-top:8px; min-height:16px; }

    #tabbar-root .more-link { display:block; padding:13px 4px; border-bottom:1px solid var(--border, #e5e7eb); color:var(--ink, #111827); text-decoration:none; font-size:15px; font-weight:600; }
    #tabbar-root .more-link:last-of-type { border-bottom:none; }
    #tabbar-root .more-link.current { color:var(--sage, #4f46e5); }
  `;

  function iconHome() {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M3 11l9-8 9 8M5 10v10h14V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function iconBoard() {
    return '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="5" height="16" rx="1.3" stroke="currentColor" stroke-width="1.8"/><rect x="10" y="4" width="5" height="10" rx="1.3" stroke="currentColor" stroke-width="1.8"/><rect x="17" y="4" width="5" height="13" rx="1.3" stroke="currentColor" stroke-width="1.8"/></svg>';
  }
  function iconOpportunities() {
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  function iconMore() {
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>';
  }
  function iconPlus() {
    return '<div class="tab-plus"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#FFF" stroke-width="2.3" stroke-linecap="round"/></svg></div>';
  }

  function escapeAttr(str) { return (str || '').replace(/"/g, '&quot;'); }

  let sb = null;
  let sbLoadPromise = null;
  function loadSupabaseLib() {
    if (window.supabase) return Promise.resolve();
    if (sbLoadPromise) return sbLoadPromise;
    sbLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return sbLoadPromise;
  }
  async function getSupabaseClient() {
    if (sb) return sb;
    if (window.sbClient) { sb = window.sbClient; return sb; }
    await loadSupabaseLib();
    sb = window.supabase.createClient(
      'https://yxfwduvwhruedjyrtfhx.supabase.co',
      'sb_publishable_aPBSSNTuFRAk0FXsiLq-wQ_J_QMcqCy'
    );
    return sb;
  }

  window.openCapture = function () {
    document.getElementById('tb-capture-overlay').classList.add('open');
    document.getElementById('tb-capture-text').focus();
  };
  window.closeCapture = function () {
    document.getElementById('tb-capture-overlay').classList.remove('open');
    document.getElementById('tb-capture-text').value = '';
    document.getElementById('tb-capture-status').textContent = '';
  };
  window.saveCapture = async function () {
    const text = document.getElementById('tb-capture-text').value.trim();
    const status = document.getElementById('tb-capture-status');
    if (!text) { status.textContent = 'Type something first.'; return; }
    status.textContent = 'Saving…';
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('items').insert({ title: text, stage: 'inbox' });
      if (error) throw error;
      status.textContent = 'Saved to Inbox.';
      setTimeout(window.closeCapture, 900);
    } catch (err) {
      status.textContent = "Couldn't save — try again (" + (err.message || err) + ")";
    }
  };

  window.openMore = function () {
    document.getElementById('tb-more-overlay').classList.add('open');
  };
  window.closeMore = function () {
    document.getElementById('tb-more-overlay').classList.remove('open');
  };
  window.closeMoreOnBackdrop = function (event) {
    if (event.target.id === 'tb-more-overlay') window.closeMore();
  };

  window.renderTabbar = function (activeSlug) {
    if (!document.getElementById('tabbar-root-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'tabbar-root-style';
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }
    if (document.getElementById('tabbar-root')) return; // already rendered, e.g. re-run guard

    document.body.style.paddingBottom = 'max(' + (parseInt(getComputedStyle(document.body).paddingBottom) || 0) + 'px, 80px)';

    const homeActive = activeSlug === 'home' ? ' active' : '';
    const boardActive = activeSlug === 'board' ? ' active' : '';
    const oppsActive = activeSlug === 'opportunities' ? ' active' : '';
    const moreActive = MORE_SLUGS.has(activeSlug) ? ' active' : '';

    const homeTab = activeSlug === 'home'
      ? `<button class="tab${homeActive}" onclick="window.scrollTo({top:0,behavior:'smooth'})">${iconHome()}</button>`
      : `<a class="tab${homeActive}" href="/">${iconHome()}</a>`;

    const boardTab = `<a class="tab${boardActive}" href="/board">${iconBoard()}</a>`;
    const oppsTab = `<a class="tab${oppsActive}" href="/opportunities">${iconOpportunities()}</a>`;
    const plusTab = `<button class="tab" onclick="window.openCapture()" aria-label="Quick capture">${iconPlus()}</button>`;
    const moreTab = `<button class="tab${moreActive}" onclick="window.openMore()" aria-label="More">${iconMore()}</button>`;

    const moreLinksHtml = MORE_LINKS.map((l) => {
      const current = l.slug === activeSlug ? ' current' : '';
      return `<a class="more-link${current}" href="${l.href}">${l.label}</a>`;
    }).join('');

    const root = document.createElement('div');
    root.id = 'tabbar-root';
    root.innerHTML = `
      <div class="tabbar">
        ${homeTab}
        ${boardTab}
        ${plusTab}
        ${oppsTab}
        ${moreTab}
      </div>

      <div class="sheet-overlay" id="tb-capture-overlay">
        <div class="sheet">
          <h3>Quick capture</h3>
          <textarea id="tb-capture-text" placeholder="Type anything — it saves straight to your Inbox."></textarea>
          <div class="sheet-actions">
            <button class="sheet-btn sheet-btn-secondary" onclick="window.closeCapture()">Cancel</button>
            <button class="sheet-btn sheet-btn-primary" onclick="window.saveCapture()">Save</button>
          </div>
          <div class="sheet-status" id="tb-capture-status"></div>
        </div>
      </div>

      <div class="sheet-overlay" id="tb-more-overlay" onclick="window.closeMoreOnBackdrop(event)">
        <div class="sheet">
          <h3>More</h3>
          ${moreLinksHtml}
          <div class="sheet-actions" style="margin-top:16px;">
            <button class="sheet-btn sheet-btn-secondary" onclick="window.closeMore()">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  };
})();
