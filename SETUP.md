# Sapna Collection — Complete Setup Guide

---

## 1. Folder / File Structure

```
sapna-collection/
├── index.html          ← Customer storefront (public)
├── admin.html          ← Admin login + dashboard (protected via Supabase Auth)
├── styles.css          ← All styles (shared between index + admin)
├── supabase-config.js  ← Supabase URL + anon key (edit this file first!)
├── app.js              ← Customer-side logic
├── admin.js            ← Admin-side logic
└── SETUP.md            ← This file
```

---

## 2. Supabase Project Setup

### Step 1 — Create a free Supabase project
1. Go to https://supabase.com and sign up / log in
2. Click **New Project**
3. Choose your organization, set a project name (e.g. `sapna-collection`), pick a strong database password, and choose a region
4. Wait for the project to be provisioned (about 1–2 minutes)

### Step 2 — Get your API credentials
1. In the Supabase dashboard, go to **Settings → API**
2. Copy the **Project URL** (looks like `https://xxxx.supabase.co`)
3. Copy the **anon / public** key (starts with `eyJ...`)
4. Open `supabase-config.js` in your code editor and replace:
   ```js
   const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
   ```

### Step 3 — Create the product image storage bucket
If you want to upload product images directly from your computer in the admin panel, create the storage bucket and policies below.

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Authenticated users can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

create policy "Authenticated users can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "Authenticated users can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');
```

---

## 3. SQL — Create Tables & Policies

Go to **Supabase Dashboard → SQL Editor** and run the following SQL **in one block**:

```sql
-- ============================================================
-- 1. PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL DEFAULT '',
  price        numeric NOT NULL DEFAULT 0,
  image        text DEFAULT '',
  category     text DEFAULT '',
  color        text DEFAULT '',
  fabric       text DEFAULT '',
  sizes        text DEFAULT '',
  stock        integer DEFAULT 0,
  featured     boolean DEFAULT false,
  new_arrival  boolean DEFAULT false,
  best_seller  boolean DEFAULT false,
  description  text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- 2. STORE SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_settings (
  id              integer PRIMARY KEY DEFAULT 1,
  store_name      text DEFAULT 'Sapna Collection',
  welcome_title   text DEFAULT 'Elegance Redefined',
  welcome_message text DEFAULT 'Discover handpicked designs for the modern Indian woman.',
  announcement    text DEFAULT 'Free shipping on orders above ₹999!',
  whatsapp        text DEFAULT '',
  contact_text    text DEFAULT 'Chat with us on WhatsApp'
);

-- Insert default settings row (id=1)
INSERT INTO public.store_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES — PRODUCTS
-- ============================================================

-- Anyone (public) can read all products
CREATE POLICY "Public can read products"
  ON public.products FOR SELECT
  USING (true);

-- Only authenticated users (admin) can insert
CREATE POLICY "Admin can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users (admin) can update
CREATE POLICY "Admin can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated users (admin) can delete
CREATE POLICY "Admin can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 5. RLS POLICIES — STORE SETTINGS
-- ============================================================

-- Anyone can read store settings
CREATE POLICY "Public can read settings"
  ON public.store_settings FOR SELECT
  USING (true);

-- Only authenticated admin can update settings
CREATE POLICY "Admin can update settings"
  ON public.store_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated admin can insert settings
CREATE POLICY "Admin can insert settings"
  ON public.store_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

Click **Run**. You should see success messages for each statement.

---

## 4. Create Admin User in Supabase

1. In the Supabase dashboard, go to **Authentication → Users**
2. Click **Add User → Create new user**
3. Enter your admin email (e.g. `admin@sapnacollection.com`) and a strong password
4. Click **Create User**
5. This is the email + password you will use to log in at `admin.html`

> ⚠️ Never add the password in your JavaScript code. Login is handled securely by Supabase Auth.

---

## 5. Add Sample Products (Optional)

To start with some products visible on the store, run this in the SQL Editor:

```sql
INSERT INTO public.products (name, price, image, category, color, fabric, sizes, stock, featured, new_arrival, best_seller, description)
VALUES
  ('Anarkali Silk Kurta',    2499, 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800',
   'Anarkali', 'Rose Gold', 'Silk', 'S, M, L, XL', 12, true, true, false,
   'A graceful Anarkali kurta in luxurious silk with intricate embroidery. Perfect for festive occasions.'),

  ('Georgette Lehenga Set',  5999, 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800',
   'Lehenga', 'Teal Green', 'Georgette', 'S, M, L', 5, true, false, true,
   'Elegant 3-piece lehenga set with heavy dupatta. Ideal for weddings and receptions.'),

  ('Cotton Printed Kurti',    899, 'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=800',
   'Kurti', 'Mustard', 'Cotton', 'XS, S, M, L, XL, XXL', 30, false, true, false,
   'Lightweight daily-wear kurti in pure cotton with traditional block print.'),

  ('Banarasi Silk Saree',    3299, 'https://images.unsplash.com/photo-1610189352649-c0cf2e14d7d5?w=800',
   'Saree', 'Royal Blue', 'Banarasi Silk', 'Free Size', 8, true, false, true,
   'Authentic Banarasi weave with gold zari border. A timeless piece for every occasion.'),

  ('Floral Maxi Dress',      1599, 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800',
   'Casual Wear', 'Multi-colour', 'Rayon', 'S, M, L, XL', 20, false, true, false,
   'Breezy floral maxi dress for casual outings and beach holidays.');
```

---

## 6. Deployment — GitHub Pages

### Step 1 — Create a GitHub repository
1. Go to https://github.com and log in
2. Click **New repository**
3. Name it `sapna-collection` (or anything you like)
4. Set it to **Public**
5. Click **Create repository**

### Step 2 — Upload files
Option A — GitHub web interface:
1. Click **uploading an existing file** on the repository page
2. Drag and drop all 6 files: `index.html`, `admin.html`, `styles.css`, `supabase-config.js`, `app.js`, `admin.js`
3. Click **Commit changes**

Option B — Git command line:
```bash
git init
git add .
git commit -m "Initial commit: Sapna Collection"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sapna-collection.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. In your repository, go to **Settings → Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select branch: `main`, folder: `/ (root)`
4. Click **Save**
5. Wait 1–2 minutes. Your site will be live at:
   `https://YOUR_USERNAME.github.io/sapna-collection/`

> **Important**: The admin panel is at `https://YOUR_USERNAME.github.io/sapna-collection/admin.html`

---

## 7. Testing Steps

### Test 1 — Public storefront
1. Open your GitHub Pages URL
2. ✅ Site loads without errors
3. ✅ Store name shows in header and footer
4. ✅ Announcement bar shows the announcement text
5. ✅ Hero title and description display correctly
6. ✅ Products load from Supabase (not from localStorage)
7. ✅ Search filters products correctly
8. ✅ Category chips and dropdown filter correctly
9. ✅ Sort options work
10. ✅ Empty state appears when no results found
11. ✅ Heart button saves favourite (persists after page refresh)
12. ✅ Clicking a product image opens the modal viewer
13. ✅ Zoom in/out/reset and drag work in the modal
14. ✅ Pinch zoom works on a mobile device
15. ✅ WhatsApp button on each card opens correct chat
16. ✅ Floating WhatsApp button works
17. ✅ Share button shares/copies the store URL

### Test 2 — Admin login
1. Open `/admin.html`
2. Enter wrong credentials → ✅ Error message appears
3. Enter correct admin email/password → ✅ Dashboard loads
4. Refresh the page → ✅ Session persists, stays logged in
5. Click Logout → ✅ Returns to login screen

### Test 3 — Add a product
1. Log in to admin
2. Click **➕ Add Product** tab
3. Fill in all required fields (name, price, image URL, category)
4. Paste a real image URL to test the preview
5. Check **Featured** and **New Arrival**
6. Click **Save Product**
7. ✅ Success message appears
8. ✅ Redirects to Inventory tab
9. ✅ Product appears in the inventory table
10. Open the customer storefront in another tab → Refresh → ✅ New product is visible

### Test 4 — Edit a product
1. In the Inventory tab, click **✏️ Edit** next to any product
2. ✅ Form pre-fills with existing product data
3. ✅ Image preview shows the current image
4. Change the price or name
5. Click **Update Product**
6. ✅ Success message appears
7. ✅ Updated data shows in the inventory table
8. Refresh the customer store → ✅ Update is visible

### Test 5 — Delete a product
1. Click 🗑️ next to any product
2. ✅ Confirmation dialog appears
3. Click **Cancel** → ✅ Product is not deleted
4. Click 🗑️ again → Click **Yes, Delete**
5. ✅ Product is removed from the table
6. Refresh customer store → ✅ Product is gone

### Test 6 — Update store settings
1. Go to the **⚙️ Settings** tab
2. Change the store name, announcement, and WhatsApp number
3. Click **Save Settings**
4. ✅ Success message appears
5. Open the customer storefront in another tab/device → Refresh
6. ✅ New store name, announcement, and WhatsApp number are live

### Test 7 — Another device
1. On a different phone or computer (or incognito window), open the store URL
2. ✅ Products and settings are loaded fresh from Supabase (no stale local data)
3. Any products added/edited/deleted by admin are immediately visible after refresh
4. ✅ Favourites are device-specific (they don't carry over — this is expected)

---

## 8. Troubleshooting

### ❌ "Failed to load store data" on customer page
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `supabase-config.js` are correct
- Check the browser Console (F12) for the exact error
- Verify the `products` and `store_settings` tables exist in Supabase

### ❌ Admin login shows "Invalid email or password"
- Make sure you created the user in **Supabase → Authentication → Users**
- Email and password are case-sensitive
- Try resetting the user password in the Supabase dashboard

### ❌ Admin can add products but they don't appear on the storefront
- Check that the RLS policy "Public can read products" was created
- In Supabase → Table Editor → products → click the lock icon → verify policies exist

### ❌ "Failed to save settings"
- Ensure the `store_settings` table has a row with `id = 1` (the default insert runs this automatically)
- Check that the authenticated user has the **Admin can update settings** RLS policy

### ❌ Images don't load
- Use publicly accessible image URLs (not private Google Drive links)
- For best results, use URLs from Unsplash, Cloudinary, or Imgbb
- Test the URL directly in your browser before adding to the product

### ❌ WhatsApp button doesn't open
- In admin Settings, enter the WhatsApp number with country code and **no spaces or dashes**
- Example: `919876543210` (91 is India's country code)

### ❌ Site looks unstyled after deploying to GitHub Pages
- Make sure all 6 files are in the **root** of the repository (not inside a subfolder)
- Check that `styles.css` is spelled exactly as referenced in the HTML

### ❌ Changes made by admin don't show on another device
- Supabase serves fresh data on every page load — make sure the customer page is **refreshed**
- Verify you're not using a cached version (try hard refresh: Ctrl+Shift+R)

---

## 9. Customisation Tips

| What to change | Where |
|---|---|
| Store name | Admin Settings tab |
| Hero text | Admin Settings tab |
| Announcement | Admin Settings tab |
| WhatsApp number | Admin Settings tab |
| Colour scheme | `styles.css` → `:root` CSS variables |
| Font | `styles.css` → `@import` line + `--font-display`/`--font-body` |
| Logo (image instead of text) | Edit `index.html` → `.logo-name` element |
| Favicon | Replace `data:image/svg+xml,...` in `<link rel="icon">` |

---

*Built for Sapna Collection — a real, production-ready mini fashion showroom.*
