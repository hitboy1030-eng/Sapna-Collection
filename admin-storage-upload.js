const adminStorageBucket = window.supabaseStorageBucket || 'product-images';
let storageSelectedImageFile = null;
let storageSelectedImagePreviewUrl = '';

const originalResetProductForm = resetProductForm;

function revokeStorageSelectedPreviewUrl() {
  if (storageSelectedImagePreviewUrl) {
    URL.revokeObjectURL(storageSelectedImagePreviewUrl);
    storageSelectedImagePreviewUrl = '';
  }
}

function getManagedStoragePrefix() {
  return `${SUPABASE_URL}/storage/v1/object/public/${adminStorageBucket}/`;
}

function getManagedStoragePath(imageUrl) {
  const prefix = getManagedStoragePrefix();
  return imageUrl && imageUrl.startsWith(prefix)
    ? imageUrl.slice(prefix.length)
    : '';
}

function buildStorageFilePath(file) {
  const safeName = (file.name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `products/${Date.now()}-${safeName || 'image'}`;
}

function formatImageUploadError(error) {
  const message = error && error.message ? error.message : String(error || 'Upload failed.');

  if (/bucket/i.test(message) && /not found/i.test(message)) {
    return `Image upload bucket "${adminStorageBucket}" was not found. Create it in Supabase Storage first.`;
  }

  if (/row-level security|permission|not allowed|unauthorized|403/i.test(message)) {
    return `Image upload is blocked by Supabase Storage policies. Create the "${adminStorageBucket}" bucket and add the storage policies from SETUP.md.`;
  }

  return message;
}

function isStorageConfigurationIssue(message) {
  return /bucket/i.test(message) && /not found/i.test(message)
    || /row-level security|permission|not allowed|unauthorized|403/i.test(message);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be prepared.'));
    img.src = src;
  });
}

async function convertFileToEmbeddedImage(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);

  if (/image\/(gif|svg\+xml)/i.test(file.type || '')) {
    return sourceDataUrl;
  }

  try {
    const img = await loadImageElement(sourceDataUrl);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return sourceDataUrl;

    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch (_) {
    return sourceDataUrl;
  }
}

async function uploadSelectedImageToStorage(file) {
  const objectPath = buildStorageFilePath(file);
  const { error: uploadError } = await supabaseClient.storage
    .from(adminStorageBucket)
    .upload(objectPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(formatImageUploadError(uploadError));
  }

  const { data } = supabaseClient.storage
    .from(adminStorageBucket)
    .getPublicUrl(objectPath);

  return {
    imageUrl: data.publicUrl,
    objectPath,
  };
}

async function removeManagedStorageObject(imageUrl) {
  const objectPath = getManagedStoragePath(imageUrl);
  if (!objectPath) return;

  const { error } = await supabaseClient.storage
    .from(adminStorageBucket)
    .remove([objectPath]);

  if (error) {
    console.warn('Storage cleanup error:', error);
  }
}

clearSelectedImageSelection = function clearSelectedImageSelectionOverride() {
  revokeStorageSelectedPreviewUrl();
  storageSelectedImageFile = null;
  $('pf-image-file').value = '';
  clearInlineMsg($('image-upload-msg'));
};

validateImageFile = function validateImageFileOverride(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    return 'Please choose a valid image file.';
  }

  return '';
};

handleSelectedImageFile = async function handleSelectedImageFileOverride() {
  const fileInput = $('pf-image-file');
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim() || preservedImageValue);
    return;
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim() || preservedImageValue);
    setInlineMsg($('image-upload-msg'), 'error', validationError);
    return;
  }

  try {
    revokeStorageSelectedPreviewUrl();
    storageSelectedImageFile = file;
    storageSelectedImagePreviewUrl = URL.createObjectURL(file);
    updateImgPreview(storageSelectedImagePreviewUrl);
    setInlineMsg(
      $('image-upload-msg'),
      'success',
      `${file.name} selected from your device. It will upload when you save the product.`
    );
  } catch (error) {
    console.error('Image preview error:', error);
    clearSelectedImageSelection();
    updateImgPreview($('pf-image').value.trim() || preservedImageValue);
    setInlineMsg($('image-upload-msg'), 'error', 'Could not prepare that image file. Please choose a different image.');
  }
};

resetProductForm = function resetProductFormOverride() {
  preservedImageValue = '';
  originalResetProductForm();
};

saveProduct = async function saveProductOverride() {
  const msgEl = $('product-msg');
  const spinner = $('product-submit-spinner');
  const btnText = $('product-submit-text');
  const submitBtn = $('product-submit-btn');

  msgEl.className = 'admin-msg';
  msgEl.style.display = 'none';

  const name = $('pf-name').value.trim();
  const price = parseFloat($('pf-price').value) || 0;
  const imageInput = $('pf-image').value.trim();
  const category = $('pf-category').value.trim();
  const color = $('pf-color').value.trim();
  const fabric = $('pf-fabric').value.trim();
  const sizes = $('pf-sizes').value.trim();
  const stock = parseInt($('pf-stock').value) || 0;
  const description = $('pf-description').value.trim();
  const featured = $('pf-featured').checked;
  const new_arrival = $('pf-new').checked;
  const best_seller = $('pf-bestseller').checked;
  const currentProduct = editingId ? allProducts.find(x => String(x.id) === String(editingId)) : null;
  const previousImage = currentProduct ? currentProduct.image || '' : '';
  let image = imageInput || preservedImageValue;

  if (!name) { showMsg(msgEl, 'error', 'Product name is required.'); return; }
  if (!price) { showMsg(msgEl, 'error', 'Price must be greater than 0.'); return; }
  if (!image && !storageSelectedImageFile) { showMsg(msgEl, 'error', 'Add an image URL or choose an image from your device.'); return; }
  if (!category) { showMsg(msgEl, 'error', 'Category is required.'); return; }

  spinner.classList.remove('hidden');
  btnText.textContent = editingId ? 'Updating...' : 'Saving...';
  submitBtn.disabled = true;

  let error;
  let uploadedImagePath = '';

  if (storageSelectedImageFile) {
    btnText.textContent = 'Uploading image...';

    try {
      const uploadResult = await uploadSelectedImageToStorage(storageSelectedImageFile);
      image = uploadResult.imageUrl;
      uploadedImagePath = uploadResult.objectPath;
    } catch (uploadError) {
      const uploadMessage = uploadError && uploadError.message ? uploadError.message : String(uploadError);

      if (isStorageConfigurationIssue(uploadMessage)) {
        try {
          image = await convertFileToEmbeddedImage(storageSelectedImageFile);
          setInlineMsg(
            $('image-upload-msg'),
            'success',
            'Supabase Storage is not configured, so this image will be saved directly with the product instead.'
          );
        } catch (fallbackError) {
          spinner.classList.add('hidden');
          btnText.textContent = editingId ? 'Update Product' : 'Save Product';
          submitBtn.disabled = false;
          showMsg(msgEl, 'error', `Failed to prepare image. ${fallbackError.message || fallbackError}`);
          return;
        }
      } else {
        spinner.classList.add('hidden');
        btnText.textContent = editingId ? 'Update Product' : 'Save Product';
        submitBtn.disabled = false;
        showMsg(msgEl, 'error', `Failed to upload image. ${uploadMessage}`);
        return;
      }
    }
  }

  const payload = {
    name, price, image, category, color, fabric,
    sizes, stock, description, featured,
    new_arrival, best_seller,
  };

  btnText.textContent = editingId ? 'Updating...' : 'Saving...';

  if (editingId) {
    const { error: updateErr } = await supabaseClient
      .from('products')
      .update(payload)
      .eq('id', editingId);
    error = updateErr;
  } else {
    const { error: insertErr } = await supabaseClient
      .from('products')
      .insert([payload]);
    error = insertErr;
  }

  spinner.classList.add('hidden');
  btnText.textContent = editingId ? 'Update Product' : 'Save Product';
  submitBtn.disabled = false;

  if (error) {
    console.error('Save error:', error);
    if (uploadedImagePath) {
      await removeManagedStorageObject(`${getManagedStoragePrefix()}${uploadedImagePath}`);
    }
    showMsg(msgEl, 'error', 'Failed to save product. ' + (error.message || ''));
    return;
  }

  if (previousImage && previousImage !== image) {
    await removeManagedStorageObject(previousImage);
  }

  preservedImageValue = '';
  showMsg(msgEl, 'success', editingId ? 'Product updated successfully!' : 'Product added successfully!');
  await loadProducts();

  setTimeout(() => {
    resetProductForm();
    switchToTab('inventory');
  }, 1200);
};

startEdit = function startEditOverride(id) {
  const product = allProducts.find(x => String(x.id) === String(id));
  if (!product) return;

  editingId = id;
  preservedImageValue = '';
  clearSelectedImageSelection();

  $('pf-name').value = product.name || '';
  $('pf-price').value = product.price || '';
  if ((product.image || '').startsWith('data:image/')) {
    preservedImageValue = product.image;
    $('pf-image').value = '';
    setInlineMsg(
      $('image-upload-msg'),
      'success',
      'This product is using a legacy embedded image. You can keep it, choose a new file, or paste a new image URL.'
    );
  } else {
    $('pf-image').value = product.image || '';
  }
  $('pf-category').value = product.category || '';
  $('pf-color').value = product.color || '';
  $('pf-fabric').value = product.fabric || '';
  $('pf-sizes').value = product.sizes || '';
  $('pf-stock').value = product.stock ?? 0;
  $('pf-description').value = product.description || '';
  $('pf-featured').checked = Boolean(product.featured);
  $('pf-new').checked = Boolean(product.new_arrival);
  $('pf-bestseller').checked = Boolean(product.best_seller);

  updateImgPreview(product.image);

  $('product-form-title').textContent = 'Edit Product';
  $('product-submit-text').textContent = 'Update Product';
  $('cancel-edit-btn').style.display = 'inline-flex';

  switchToTab('add-product');
  $('tab-add-product').scrollIntoView({ behavior: 'smooth' });
};

$('pf-image').addEventListener('input', () => {
  preservedImageValue = '';
});

$('form-reset-btn').addEventListener('click', () => {
  preservedImageValue = '';
});

$('pf-image').addEventListener('input', e => {
  e.stopImmediatePropagation();
  preservedImageValue = '';
  clearSelectedImageSelection();
  updateImgPreview($('pf-image').value.trim());
}, true);

$('pf-image-file').addEventListener('change', async e => {
  e.stopImmediatePropagation();
  await handleSelectedImageFile();
}, true);

$('pf-image-clear-btn').addEventListener('click', e => {
  e.preventDefault();
  e.stopImmediatePropagation();
  clearSelectedImageSelection();
  updateImgPreview($('pf-image').value.trim() || preservedImageValue);
}, true);

$('product-form').addEventListener('submit', async e => {
  e.preventDefault();
  e.stopImmediatePropagation();
  await saveProduct();
}, true);
