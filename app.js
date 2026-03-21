// ============================================================
// app.js — Sapna Collection Customer Storefront
// Reads all data from Supabase. localStorage used ONLY for favorites.
// ============================================================

// ─── State ───────────────────────────────────────────────────
let allProducts   = [];   // raw data from Supabase
let filtered      = [];   // after search/filter/sort
let settings      = {};   // store_settings row
let favorites     = new Set(JSON.parse(localStorage.getItem('sc_favorites') || '[]'));
let activeCategory = '';
let currentSearch  = '';
let currentSort    = 'featured';

// ─── DOM refs ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const grid          = $('products-grid');
const searchInput   = $('search-input');
const categorySelect= $('category-select');
const sortSelect    = $('sort-select');
const chipsRow      = $('chips-row');
const productCount  = $('product-count');
const emptyState    = $('empty-state');
const loadingOverlay= $('loading-overlay');
const toast         = $('toast');

// Modal
const imgModal      = $('img-modal');
const modalImg      = $('modal-img');
const modalClose    = $('modal-close-btn');

function getBackendMessage() {
  return supabaseInitError || 'Could not connect to Supabase.';
}

function showBackendError(message) {
  const safeMessage = escHtml(message);
  $('announcement-bar').textContent = 'Store setup required';
  productCount.textContent = '0 items';
  emptyState.classList.add('hidden');
  grid.innerHTML = `
    <div style="color:var(--text-muted);padding:24px;border:1px solid rgba(201,168,76,0.18);border-radius:24px;background:rgba(20,18,16,0.72);">
      ${safeMessage}
    </div>`;
}

// ─── Boot ────────────────────────────────────────────────────
(async function boot() {
  try {
    if (!supabaseClient) {
      const message = getBackendMessage();
      showBackendError(message);
      showToast(message);
      return;
    }

    await Promise.all([loadSettings(), loadProducts()]);
  } catch (e) {
    console.error('Boot error:', e);
    const message = e && e.message ? e.message : 'Could not load store data. Please refresh.';
    showBackendError(message);
    showToast(message);
  } finally {
    // Hide loading overlay
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => loadingOverlay.style.display = 'none', 700);
  }
})();

// ─── Load store settings from Supabase ───────────────────────
async function loadSettings() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('store_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) { console.error('Settings error:', error); return; }
  if (!data)  return;

  settings = data;
  applySettings(data);
}

function applySettings(s) {
  // Announcement bar
  const bar = $('announcement-bar');
  if (s.announcement) bar.textContent = s.announcement;

  // Store name
  const storeName = s.store_name || 'Sapna Collection';
  $('store-name-header').textContent = storeName;
  $('footer-store-name').textContent  = storeName;
  document.title = storeName;

  // Hero
  if (s.welcome_title)   $('hero-title').innerHTML = formatHeroTitle(s.welcome_title);
  if (s.welcome_message) $('hero-desc').textContent = s.welcome_message;

  // WhatsApp buttons
  const wa = s.whatsapp || '';
  const contactText = s.contact_text || 'Chat with us on WhatsApp';

  $('fab-wa').onclick        = () => openWhatsApp(wa, contactText);
  $('fab-share').onclick     = shareStore;
  $('header-wa-btn').onclick = () => openWhatsApp(wa, contactText);
  $('header-share-btn').onclick = shareStore;
}

// Bold the first italic-like word in the hero title for display
function formatHeroTitle(title) {
  const parts = title.split(' ');
  if (parts.length >= 2) {
    const mid = Math.floor(parts.length / 2);
    parts[mid] = `<em>${parts[mid]}</em>`;
  }
  return parts.join(' ');
}

// ─── Load products from Supabase ─────────────────────────────
async function loadProducts() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Products error:', error);
    const message = `Failed to load products. ${error.message || 'Please refresh.'}`.trim();
    grid.innerHTML = `<p style="color:var(--text-muted);padding:32px;">${escHtml(message)}</p>`;
    productCount.textContent = '0 items';
    return;
  }

  allProducts = (data || []).map(normalizeProduct);
  buildCategoryFilters();
  applyFilters();
}

// Convert snake_case DB fields → camelCase for JS
function normalizeProduct(p) {
  return {
    id:          p.id,
    name:        p.name         || 'Unnamed Product',
    price:       Number(p.price) || 0,
    image:       p.image        || '',
    category:    p.category     || 'Uncategorized',
    color:       p.color        || '',
    fabric:      p.fabric       || '',
    sizes:       p.sizes        || '',
    stock:       Number(p.stock) || 0,
    featured:    Boolean(p.featured),
    newArrival:  Boolean(p.new_arrival),
    bestSeller:  Boolean(p.best_seller),
    description: p.description  || '',
    createdAt:   p.created_at   || '',
  };
}

// ─── Build category filters ───────────────────────────────────
function buildCategoryFilters() {
  const cats = [...new Set(allProducts.map(p => p.category))].sort();

  // Dropdown
  categorySelect.innerHTML = '<option value="">All Categories</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  // Chips
  chipsRow.innerHTML = '';
  const allChip = makeChip('All', '');
  chipsRow.appendChild(allChip);
  cats.forEach(c => chipsRow.appendChild(makeChip(c, c)));
}

function makeChip(label, value) {
  const btn = document.createElement('button');
  btn.className = 'chip' + (activeCategory === value ? ' active' : '');
  btn.textContent = label;
  btn.dataset.category = value;
  btn.addEventListener('click', () => {
    activeCategory = value;
    categorySelect.value = value;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  });
  return btn;
}

// ─── Filter + Sort ───────────────────────────────────────────
function applyFilters() {
  let list = [...allProducts];

  // Search
  const q = currentSearch.toLowerCase().trim();
  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q)        ||
      p.category.toLowerCase().includes(q)    ||
      p.color.toLowerCase().includes(q)       ||
      p.fabric.toLowerCase().includes(q)      ||
      p.description.toLowerCase().includes(q)
    );
  }

  // Category
  if (activeCategory) {
    list = list.filter(p => p.category === activeCategory);
  }

  // Sort
  switch (currentSort) {
    case 'featured':   list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)); break;
    case 'newest':     list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    case 'price-asc':  list.sort((a, b) => a.price - b.price);  break;
    case 'price-desc': list.sort((a, b) => b.price - a.price);  break;
    case 'name':       list.sort((a, b) => a.name.localeCompare(b.name)); break;
  }

  filtered = list;
  renderProducts();
}

// ─── Render product cards ─────────────────────────────────────
function renderProducts() {
  productCount.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  grid.innerHTML = filtered.map(buildCard).join('');

  // Attach events after rendering
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFav(btn.dataset.id, btn);
    });
  });

  grid.querySelectorAll('.card-img-wrap').forEach(wrap => {
    wrap.addEventListener('click', () => openModal(wrap.dataset.src));
  });
}

function buildCard(p) {
  const isFav    = favorites.has(String(p.id));
  const isLow    = p.stock > 0 && p.stock <= 5;
  const isOut    = p.stock === 0;
  const waText   = encodeURIComponent(`Hi! I'm interested in "${p.name}" priced at ₹${p.price.toLocaleString('en-IN')}. Please share more details.`);
  const waNum    = settings.whatsapp || '';

  // Sizes
  const sizesArr = p.sizes ? p.sizes.split(',').map(s => s.trim()).filter(Boolean) : [];
  const sizesHTML = sizesArr.length
    ? `<div class="sizes-row">${sizesArr.map(s => `<span class="size-tag">${s}</span>`).join('')}</div>`
    : '';

  // Badges
  let badges = '';
  if (p.featured)   badges += `<span class="badge badge-featured">Featured</span>`;
  if (p.newArrival)  badges += `<span class="badge badge-new">New</span>`;
  if (p.bestSeller)  badges += `<span class="badge badge-bestseller">Bestseller</span>`;
  if (isLow)         badges += `<span class="badge badge-low">Low Stock</span>`;
  if (isOut)         badges += `<span class="badge badge-low">Out of Stock</span>`;

  // Meta tags
  let meta = '';
  if (p.color)  meta += `<span class="meta-tag">${escHtml(p.color)}</span>`;
  if (p.fabric) meta += `<span class="meta-tag">${escHtml(p.fabric)}</span>`;

  return `
    <article class="product-card" role="listitem" aria-label="${escHtml(p.name)}">
      <div class="card-img-wrap" data-src="${escHtml(p.image)}" role="button" tabindex="0" aria-label="View ${escHtml(p.name)} image">
        <img
          src="${escHtml(p.image)}"
          alt="${escHtml(p.name)}"
          loading="lazy"
          onerror="this.src='https://placehold.co/400x530/141210/C9A84C?text=No+Image'"
        />
        ${badges ? `<div class="card-badges" aria-label="Product badges">${badges}</div>` : ''}
        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${p.id}" aria-label="${isFav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${isFav}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="card-body">
        <span class="card-category">${escHtml(p.category)}</span>
        <h3 class="card-name">${escHtml(p.name)}</h3>
        ${p.description ? `<p class="card-desc">${escHtml(p.description)}</p>` : ''}
        ${meta ? `<div class="card-meta">${meta}</div>` : ''}
        ${sizesHTML}
        <div class="card-price">₹${p.price.toLocaleString('en-IN')}</div>
        ${waNum ? `
          <a
            class="wa-btn"
            href="https://wa.me/${waNum}?text=${waText}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Enquire about ${escHtml(p.name)} on WhatsApp"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Enquire on WhatsApp
          </a>` : ''}
      </div>
    </article>`;
}

// ─── Favourites ───────────────────────────────────────────────
function toggleFav(id, btn) {
  const key = String(id);
  if (favorites.has(key)) {
    favorites.delete(key);
    btn.classList.remove('active');
    btn.innerHTML = '🤍';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Add to favourites');
    showToast('Removed from favourites');
  } else {
    favorites.add(key);
    btn.classList.add('active');
    btn.innerHTML = '❤️';
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Remove from favourites');
    showToast('Added to favourites ❤️');
  }
  localStorage.setItem('sc_favorites', JSON.stringify([...favorites]));
}

// ─── Event listeners ─────────────────────────────────────────
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value;
  applyFilters();
});

categorySelect.addEventListener('change', () => {
  activeCategory = categorySelect.value;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.category === activeCategory);
  });
  applyFilters();
});

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  applyFilters();
});

// Keyboard on image wrap
grid.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const wrap = e.target.closest('.card-img-wrap');
    if (wrap) { e.preventDefault(); openModal(wrap.dataset.src); }
  }
});

// ─── WhatsApp helper ─────────────────────────────────────────
function openWhatsApp(number, text) {
  if (!number) { showToast('WhatsApp number not configured yet.'); return; }
  const encoded = encodeURIComponent(text || 'Hello! I want to know more about your collection.');
  window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
}

// ─── Share store ─────────────────────────────────────────────
async function shareStore() {
  const shareData = {
    title: settings.store_name || 'Sapna Collection',
    text:  settings.welcome_message || 'Check out this beautiful dress collection!',
    url:   window.location.href,
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (_) { /* user cancelled */ }
  } else {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    showToast('Store link copied! 📋');
  }
}

// ─── Toast ───────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─── IMAGE VIEWER MODAL ───────────────────────────────────────
let scale = 1;
let posX  = 0;
let posY  = 0;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let lastPinchDist = null;

function openModal(src) {
  if (!src) return;
  modalImg.src = src;
  resetZoom();
  imgModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modalImg.focus();
}

function closeModal() {
  imgModal.classList.remove('open');
  document.body.style.overflow = '';
  modalImg.src = '';
}

function resetZoom() {
  scale = 1; posX = 0; posY = 0;
  applyTransform();
}

function applyTransform() {
  modalImg.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

function clampPos() {
  // Allow dragging only when zoomed in
  if (scale <= 1) { posX = 0; posY = 0; return; }
  const maxX = (modalImg.naturalWidth  * scale - window.innerWidth)  / 2;
  const maxY = (modalImg.naturalHeight * scale - window.innerHeight) / 2;
  posX = Math.max(-maxX, Math.min(maxX, posX));
  posY = Math.max(-maxY, Math.min(maxY, posY));
}

// Zoom buttons
$('zoom-in-btn').addEventListener('click', () => { scale = Math.min(scale * 1.35, 5); applyTransform(); });
$('zoom-out-btn').addEventListener('click', () => { scale = Math.max(scale / 1.35, 0.5); clampPos(); applyTransform(); });
$('zoom-reset-btn').addEventListener('click', resetZoom);

// Close
modalClose.addEventListener('click', closeModal);
imgModal.addEventListener('click', e => { if (e.target === imgModal || e.target === $('modal-img-container')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Mouse drag
modalImg.addEventListener('mousedown', e => {
  e.preventDefault();
  isDragging = true;
  dragStart = { x: e.clientX - posX, y: e.clientY - posY };
  modalImg.classList.add('dragging');
});

document.addEventListener('mousemove', e => {
  if (!isDragging) return;
  posX = e.clientX - dragStart.x;
  posY = e.clientY - dragStart.y;
  clampPos();
  applyTransform();
});

document.addEventListener('mouseup', () => {
  isDragging = false;
  modalImg.classList.remove('dragging');
});

// Mouse wheel zoom
imgModal.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.85 : 1.15;
  scale = Math.max(0.5, Math.min(5, scale * delta));
  clampPos();
  applyTransform();
}, { passive: false });

// Touch: pinch zoom + drag
modalImg.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    lastPinchDist = getPinchDist(e.touches);
  } else if (e.touches.length === 1) {
    isDragging = true;
    dragStart = {
      x: e.touches[0].clientX - posX,
      y: e.touches[0].clientY - posY,
    };
  }
}, { passive: true });

modalImg.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const dist = getPinchDist(e.touches);
    if (lastPinchDist) {
      scale = Math.max(0.5, Math.min(5, scale * (dist / lastPinchDist)));
    }
    lastPinchDist = dist;
    clampPos();
    applyTransform();
  } else if (e.touches.length === 1 && isDragging) {
    posX = e.touches[0].clientX - dragStart.x;
    posY = e.touches[0].clientY - dragStart.y;
    clampPos();
    applyTransform();
  }
}, { passive: false });

modalImg.addEventListener('touchend', () => {
  isDragging = false;
  lastPinchDist = null;
});

function getPinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Lightweight Three.js hero particles ─────────────────────
(function initHeroCanvas() {
  const canvas = $('hero-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  let particles = [];
  let raf;

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function spawn() {
    particles = [];
    const count = Math.min(40, Math.floor(canvas.width / 20));
    for (let i = 0; i < count; i++) {
      particles.push({
        x:    Math.random() * canvas.width,
        y:    Math.random() * canvas.height,
        r:    Math.random() * 1.5 + 0.5,
        vx:   (Math.random() - 0.5) * 0.25,
        vy:   -Math.random() * 0.3 - 0.1,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201, 168, 76, ${p.alpha})`;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
    });
    raf = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); spawn(); });
  resize(); spawn(); draw();

  // Pause when tab is hidden (performance)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else draw();
  });
})();

// ─── Helper: escape HTML ─────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str || '')));
  return d.innerHTML;
}
