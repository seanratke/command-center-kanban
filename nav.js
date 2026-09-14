// Shared site nav — single source of truth for Command Center's top nav.
// Usage on any page:
//   1. <div id="site-nav"></div>  (put wherever the nav should render)
//   2. <script src="/nav.js"></script>
//   3. renderSiteNav('board');  // pass this page's slug

const SITE_NAV_LINKS = [
  { slug: 'board',         href: '/board',         label: 'Command Center' },
  { slug: 'opportunities', href: '/opportunities', label: 'Opportunities Feed' },
  { slug: 'inventors',     href: '/inventors',     label: 'Inventor Pool' },
  { slug: 'roster',        href: '/roster',        label: 'Inventor Roster' },
  { slug: 'needs',         href: '/needs',         label: 'Needs Attention' },
  { slug: 'projects',      href: '/',              label: 'Projects' },
];

function renderSiteNav(currentSlug){
  const el = document.getElementById('site-nav');
  if(!el) return;
  el.innerHTML = SITE_NAV_LINKS.map(link => {
    const active = link.slug === currentSlug ? ' site-nav-active' : '';
    return `<a href="${link.href}" class="site-nav-link${active}">${link.label}</a>`;
  }).join('');
}
