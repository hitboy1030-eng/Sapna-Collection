// ============================================================
// admin.js — Sapna Collection Admin Panel
// Uses Supabase Auth for login. All product/settings data
// is stored in and read from Supabase. No localStorage for shared data.
// ============================================================

// ─── DOM helpers ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── State ───────────────────────────────────────────────────
let allProducts    = [];   // full list from Supabase
let filteredProducts = []; // after admin search
let editingId      = null; // id of product being edited (null = adding new)
let pendingDeleteId = null; // id waiting for confirm dialog
let selectedImageFile = null;
let selectedImagePreviewUrl = '';
let preservedImageValue = '';

const STORAGE_BUCKET = window.supabaseStorageBucket || 'product-images';

function getBackendMessage() {
  return supabaseInitError || 'Supabase is not configured yet. Update supabase-config.js first.';
}

function showConfigError(message) {
  showLogin();
  $('login-error').textContent = message;
  $('login-btn').disabled = true;
}

function renderInventoryMessage(message) {
  $('admin-product-tbody').innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">${escHtml(message)}</td>
    </tr>`;
}

function resetStats() {
  $('stat-total').textContent = '0';
  $('stat-cats').textContent = '0';
  $('stat-featured').textContent = '0';
  $('stat-lowstock').textContent = '0';
}

// ─── Boot ────────────────────────────────────────────────────
(async function boot() {
  if (!supabaseClient) {
    showConfigError(getBackendMessage());
    return;
  }

  // Check existing session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showDashboard();
    await Promise.all([loadProducts(), loadSettings()]);
  } else {
    showLogin();
  }

  // Listen for auth changes (e.g. token refresh, logout)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) showLogin();
    if (event === 'SIGNED_IN')  showDashboard();
  });
})();

// ─── Show/hide panels ────────────────────────────────────────
function showLogin() {
  $('admin-login').classList.remove('hidden');
  $('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
  $('admin-login').classList.add('hidden');
  $('admin-dashboard').classList.remove('hidden');
}

// ─── LOGIN ───────────────────────────────────────────────────
$('login-btn').addEventListener('click', async () => {
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  const errEl    = $('login-error');
  const spinner  = $('login-spinner');
  const btnText  = $('login-btn-text');

  errEl.textContent = '';

  if (!supabaseClient) {
    errEl.textContent = getBackendMessage();
    return;
  }

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    return;
  }

  // Show loading state
  spinner.classList.remove('hidden');
  btnText.textContent = 'Signing in…';
  $('login-btn').disabled = true;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  spinner.classList.add('hidden');
  btnText.textContent = 'Sign In';
  $('login-btn').disabled = false;

  if (error) {
    const message = error.message || '';
    const invalidCredentials = /invalid login credentials/i.test(message);
    errEl.textContent = invalidCredentials
      ? 'Invalid email or password. Please try again.'
      : `Sign-in failed. ${message || 'Check your Supabase connection.'}`;
    return;
  }

  // Successful login → dashboard will show via onAuthStateChange
  await Promise.all([loadProducts(), loadSettings()]);
});

// Allow Enter key to submit login
['login-email', 'login-password'].forEach(id => {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') $('login-btn').click();
  });
});

// ─── LOGOUT ──────────────────────────────────────────────────
$('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// ─── TABS ────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    $(`tab-${tabName}`).classList.add('active');
  });
});

function switchToTab(name) {
  document.querySelector(`.tab-btn[data-tab="${name}"]`).click();
}

// ─── LOAD PRODUCTS ───────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Load products error:', error);
    renderInventoryMessage(`Failed to load products. ${error.message || ''}`.trim());
    resetStats();
    return;
  }

  allProducts = data || [];
  filteredProducts = [...allProducts];
  renderInventoryTable(filteredProducts);
  updateStats();
}

// ─── STATS ───────────────────────────────────────────────────
function updateStats() {
  const cats     = new Set(allProducts.map(p => p.category)).size;
  const featured = allProducts.filter(p => p.featured).length;
  const lowStock = allProducts.filter(p => p.stock > 0 && p.stock <= 5).length;

  $('stat-total').textContent    = allProducts.length;
  $('stat-cats').textContent     = cats;
  $('stat-featured').textContent = featured;
  $('stat-lowstock').textContent = lowStock;
}

// ─── INVENTORY TABLE ─────────────────────────────────────────
function renderInventoryTable(products) {
  const tbody = $('admin-product-tbody');

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No products found.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const stockClass = p.stock === 0 ? 'stock-zero' : p.stock <= 5 ? 'stock-low' : 'stock-ok';
    const stockLabel = p.stock === 0 ? 'Out' : p.stock <= 5 ? `Low (${p.stock})` : p.stock;
    return `
      <tr>
        <td>
          <img
            class="table-img"
            src="${escHtml(p.image || '')}"
            alt="${escHtml(p.name)}"
            onerror="this.src='https://placehold.co/44x52/141210/C9A84C?text=?'"
          />
        </td>
        <td>
          <div class="table-name">${escHtml(p.name)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">₹${Number(p.price).toLocaleString('en-IN')}</div>
        </td>
        <td class="hide-mobile">${escHtml(p.category || '—')}</td>
        <td>₹${Number(p.price).toLocaleString('en-IN')}</td>
        <td class="hide-mobile"><span class="stock-badge ${stockClass}">${stockLabel}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-outline" style="padding:6px 10px;font-size:0.75rem;" onclick="startEdit('${p.id}')">
              ✏️ Edit
            </button>
            <button class="btn btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="confirmDelete('${p.id}', '${escHtml(p.name).replace(/'/g, "\\'")}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// Admin inventory search
$('admin-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  filteredProducts = q
    ? allProducts.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.color || '').toLowerCase().includes(q)
      )
    : [...allProducts];
  renderInventoryTable(filteredProducts);
});

// ─── PRODUCT FORM: ADD ───────────────────────────────────────
$('product-form').addEventListener('submit', async e => {
  e.preventDefault();
  await saveProduct();
});

$('form-reset-btn').addEventListener('click', resetProductForm);
$('cancel-edit-btn').addEventListener('click', () => {
  resetProductForm();
  switchToTab('inventory');
});

// Live image preview
$('pf-image').addEventListener('input', () => {
  preservedImageValue = '';
  clearSelectedImageSelection();
  const url = $('pf-image').value.trim();
  updateImgPreview(url);
});

$('pf-image-file').addEventListener('change', async () => {
  await handleSelectedImageFile();
});

$('pf-image-clear-btn').addEventListener('click', () => {
  clearSelectedImageSelection();
  updateImgPreview($('pf-image').value.trim());
});

async function handleSelectedImageFile() {
  const fileInput = $('pf-image-file');
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim());
    return;
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim());
    setInlineMsg($('image-upload-msg'), 'error', validationError);
    return;
  }

  try {
    revokeSelectedImagePreviewUrl();
    selectedImageFile = file;
    selectedImagePreviewUrl = URL.createObjectURL(file);
    updateImgPreview(selectedImagePreviewUrl);
    setInlineMsg(
      $('image-upload-msg'),
      'success',
      `${file.name} selected from your device. It will upload when you save the product.`
    );
  } catch (error) {
    console.error('Image read error:', error);
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim());
    setInlineMsg($('image-upload-msg'), 'error', 'Could not read that image file. Please choose a different image.');
  }
}

function validateImageFile(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    return 'Please choose a valid image file.';
  }

  return '';
}

function clearSelectedImageSelection() {
  revokeSelectedImagePreviewUrl();
  selectedImageFile = null;
  $('pf-image-file').value = '';
  clearInlineMsg($('image-upload-msg'));
}

function revokeSelectedImagePreviewUrl() {
  if (selectedImagePreviewUrl) {
    URL.revokeObjectURL(selectedImagePreviewUrl);
    selectedImagePreviewUrl = '';
  }
}

function setInlineMsg(el, type, text) {
  el.textContent = text;
  el.className = `admin-msg ${type}`;
  el.style.display = 'block';
}

function clearInlineMsg(el) {
  el.textContent = '';
  el.className = 'admin-msg';
  el.style.display = 'none';
}

function buildStorageFilePath(file) {
  const safeName = (file.name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `products/${Date.now()}-${safeName || 'image'}`;
}

function getManagedStoragePrefix() {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
}

function getManagedStoragePath(imageUrl) {
  const prefix = getManagedStoragePrefix();
  return imageUrl && imageUrl.startsWith(prefix)
    ? imageUrl.slice(prefix.length)
    : '';
}

async function uploadSelectedImage(file) {
  const objectPath = buildStorageFilePath(file);
  const { error: uploadError } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(formatImageUploadError(uploadError));
  }

  const { data } = supabaseClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(objectPath);

  return {
    imageUrl: data.publicUrl,
    objectPath,
  };
}

function formatImageUploadError(error) {
  const message = error && error.message ? error.message : String(error || 'Upload failed.');

  if (/bucket/i.test(message) && /not found/i.test(message)) {
    return `Image upload bucket "${STORAGE_BUCKET}" was not found. Create it in Supabase Storage first.`;
  }

  if (/row-level security|permission|not allowed|unauthorized|403/i.test(message)) {
    return `Image upload is blocked by Supabase Storage policies. Create the "${STORAGE_BUCKET}" bucket and add the storage policies from SETUP.md.`;
  }

  return message;
}

async function removeManagedStorageObject(imageUrl) {
  const objectPath = getManagedStoragePath(imageUrl);
  if (!objectPath) return;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .remove([objectPath]);

  if (error) {
    console.warn('Storage cleanup error:', error);
  }
}

function updateImgPreview(url) {
  const img     = $('img-preview');
  const placeholder = $('img-placeholder');
  if (url) {
    img.src = url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    };
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

// ─── SAVE PRODUCT (add or update) ────────────────────────────
async function saveProduct() {
  const msgEl   = $('product-msg');
  const spinner = $('product-submit-spinner');
  const btnText = $('product-submit-text');
  const submitBtn = $('product-submit-btn');

  msgEl.className = 'admin-msg';
  msgEl.style.display = 'none';

  // Gather fields
  const name        = $('pf-name').value.trim();
  const price       = parseFloat($('pf-price').value) || 0;
  const image       = $('pf-image').value.trim() || preservedImageValue;
  const category    = $('pf-category').value.trim();
  const color       = $('pf-color').value.trim();
  const fabric      = $('pf-fabric').value.trim();
  const sizes       = $('pf-sizes').value.trim();
  const stock       = parseInt($('pf-stock').value) || 0;
  const description = $('pf-description').value.trim();
  const featured    = $('pf-featured').checked;
  const new_arrival = $('pf-new').checked;
  const best_seller = $('pf-bestseller').checked;

  // Validate
  if (!name)     { showMsg(msgEl, 'error', 'Product name is required.'); return; }
  if (!price)    { showMsg(msgEl, 'error', 'Price must be greater than 0.'); return; }
  if (!image)    { showMsg(msgEl, 'error', 'Add an image URL or choose an image from your device.'); return; }
  if (!category) { showMsg(msgEl, 'error', 'Category is required.'); return; }

  // Build Supabase payload (snake_case to match DB)
  const payload = {
    name, price, image, category, color, fabric,
    sizes, stock, description, featured,
    new_arrival, best_seller,
  };

  // Loading state
  spinner.classList.remove('hidden');
  btnText.textContent = editingId ? 'Updating…' : 'Saving…';
  submitBtn.disabled = true;

  let error;

  if (editingId) {
    // UPDATE existing product
    const { error: updateErr } = await supabaseClient
      .from('products')
      .update(payload)
      .eq('id', editingId);
    error = updateErr;
  } else {
    // INSERT new product
    const { error: insertErr } = await supabaseClient
      .from('products')
      .insert([payload]);
    error = insertErr;
  }

  // Restore button
  spinner.classList.add('hidden');
  btnText.textContent = editingId ? 'Update Product' : 'Save Product';
  submitBtn.disabled = false;

  if (error) {
    console.error('Save error:', error);
    showMsg(msgEl, 'error', 'Failed to save product. ' + (error.message || ''));
    return;
  }

  showMsg(msgEl, 'success', editingId ? 'Product updated successfully!' : 'Product added successfully!');
  await loadProducts();

  setTimeout(() => {
    resetProductForm();
    switchToTab('inventory');
  }, 1200);
}

// ─── EDIT PRODUCT ────────────────────────────────────────────
function startEdit(id) {
  const p = allProducts.find(x => String(x.id) === String(id));
  if (!p) return;

  editingId = id;
  preservedImageValue = '';
  clearSelectedImageSelection();

  // Populate form
  $('pf-name').value        = p.name        || '';
  $('pf-price').value       = p.price       || '';
  if ((p.image || '').startsWith('data:image/')) {
    preservedImageValue = p.image;
    $('pf-image').value = '';
    setInlineMsg(
      $('image-upload-msg'),
      'success',
      'This product is already using an uploaded image from your device. You can keep it, choose a new file, or paste a new image URL.'
    );
  } else {
    $('pf-image').value = p.image || '';
  }
  $('pf-category').value    = p.category    || '';
  $('pf-color').value       = p.color       || '';
  $('pf-fabric').value      = p.fabric      || '';
  $('pf-sizes').value       = p.sizes       || '';
  $('pf-stock').value       = p.stock       ?? 0;
  $('pf-description').value = p.description || '';
  $('pf-featured').checked  = Boolean(p.featured);
  $('pf-new').checked       = Boolean(p.new_arrival);
  $('pf-bestseller').checked= Boolean(p.best_seller);

  updateImgPreview(p.image);

  $('product-form-title').textContent = 'Edit Product';
  $('product-submit-text').textContent = 'Update Product';
  $('cancel-edit-btn').style.display = 'inline-flex';

  switchToTab('add-product');
  $('tab-add-product').scrollIntoView({ behavior: 'smooth' });
}

// ─── DELETE PRODUCT ───────────────────────────────────────────
function confirmDelete(id, name) {
  pendingDeleteId = id;
  $('confirm-text').textContent = `Delete "${name}"? This cannot be undone.`;
  $('confirm-overlay').classList.add('open');
}

$('confirm-cancel').addEventListener('click', () => {
  $('confirm-overlay').classList.remove('open');
  pendingDeleteId = null;
});

$('confirm-ok').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  $('confirm-overlay').classList.remove('open');

  const { error } = await supabaseClient
    .from('products')
    .delete()
    .eq('id', pendingDeleteId);

  pendingDeleteId = null;

  if (error) {
    console.error('Delete error:', error);
    alert('Failed to delete product: ' + error.message);
    return;
  }

  await loadProducts();
});

// ─── RESET PRODUCT FORM ───────────────────────────────────────
function resetProductForm() {
  editingId = null;
  $('product-form').reset();
  clearSelectedImageSelection();
  $('product-form-title').textContent  = 'Add New Product';
  $('product-submit-text').textContent = 'Save Product';
  $('cancel-edit-btn').style.display   = 'none';
  $('pf-stock').value = '0';

  // Clear image preview
  $('img-preview').style.display = 'none';
  $('img-placeholder').style.display = 'flex';

  // Clear messages
  const msgEl = $('product-msg');
  msgEl.className = 'admin-msg';
  msgEl.style.display = 'none';
}

// ─── LOAD SETTINGS ───────────────────────────────────────────
async function loadSettings() {
  const { data, error } = await supabaseClient
    .from('store_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Settings error:', error);
    showMsg($('settings-msg'), 'error', `Failed to load settings. ${error.message || ''}`.trim());
    return;
  }
  if (!data)  return;

  $('sf-store-name').value     = data.store_name     || '';
  $('sf-whatsapp').value       = data.whatsapp       || '';
  $('sf-contact-text').value   = data.contact_text   || '';
  $('sf-welcome-title').value  = data.welcome_title  || '';
  $('sf-welcome-message').value= data.welcome_message|| '';
  $('sf-announcement').value   = data.announcement   || '';
}

// ─── SAVE SETTINGS ───────────────────────────────────────────
$('settings-form').addEventListener('submit', async e => {
  e.preventDefault();

  const msgEl   = $('settings-msg');
  const spinner = $('settings-submit-spinner');
  const btnText = $('settings-submit-text');
  const submitBtn = $('settings-submit-btn');

  msgEl.className = 'admin-msg';
  msgEl.style.display = 'none';

  const payload = {
    store_name:      $('sf-store-name').value.trim(),
    whatsapp:        $('sf-whatsapp').value.trim(),
    contact_text:    $('sf-contact-text').value.trim(),
    welcome_title:   $('sf-welcome-title').value.trim(),
    welcome_message: $('sf-welcome-message').value.trim(),
    announcement:    $('sf-announcement').value.trim(),
  };

  spinner.classList.remove('hidden');
  btnText.textContent = 'Saving…';
  submitBtn.disabled  = true;

  // Upsert (update if exists, insert if not) — using id=1 convention
  const { error } = await supabaseClient
    .from('store_settings')
    .upsert({ id: 1, ...payload }, { onConflict: 'id' });

  spinner.classList.add('hidden');
  btnText.textContent = 'Save Settings';
  submitBtn.disabled  = false;

  if (error) {
    console.error('Settings save error:', error);
    showMsg(msgEl, 'error', 'Failed to save settings. ' + (error.message || ''));
    return;
  }

  showMsg(msgEl, 'success', 'Settings saved! Changes will appear on the store after refresh.');
});

// ─── Helper: show admin message ───────────────────────────────
function showMsg(el, type, text) {
  el.textContent = text;
  el.className   = `admin-msg ${type}`;
  el.style.display = 'block';

  // Auto-clear after 4 seconds
  setTimeout(() => {
    el.style.display = 'none';
    el.className = 'admin-msg';
  }, 4000);
}

// ─── Helper: escape HTML for table output ────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str || '')));
  return d.innerHTML;
}
