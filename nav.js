// Shared site nav — single source of truth for Command Center's top nav.
// Usage on any page:
//   1. <div id="site-nav"></div>  (put wherever the nav should render)
//   2. <script src="/nav.js"></script>
//   3. renderSiteNav('board');  // pass this page's slug
//
// Update the nav ONCE here and every page picks it up automatically.

const SITE_NAV_LINKS = [
  { slug: 'projects',      href: '/',              label: 'Command Center Home' },
  { slug: 'board',         href: '/board',         label: 'Task Board' },
  { slug: 'opportunities', href: '/opportunities', label: 'Opportunities Feed' },
  { slug: 'inventors',     href: '/inventors',     label: 'Inventor Pool' },
  { slug: 'roster',        href: '/roster',        label: 'Inventor Roster' },
  { slug: 'needs',         href: '/needs',         label: 'Needs Attention' },
];

function renderSiteNav(currentSlug){
  const el = document.getElementById('site-nav');
  if(!el) return;
  el.innerHTML = SITE_NAV_LINKS.map(link => {
    const active = link.slug === currentSlug ? ' site-nav-active' : '';
    return `<a href="${link.href}" class="site-nav-link${active}">${link.label}</a>`;
  }).join('');
}
