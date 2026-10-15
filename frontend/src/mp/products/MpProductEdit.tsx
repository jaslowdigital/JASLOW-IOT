import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, FormControlLabel, IconButton, InputAdornment, MenuItem, Paper,
  Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add, AddPhotoAlternate, ArrowBack, ChevronLeft, ChevronRight, Close, Delete, PhotoCamera, Refresh, Save, Star, StarBorder,
} from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { useMp } from '../MpDataContext';
import { COLLECTIONS, DEALERSHIPS } from '../constants';
import { PRODUCT_CONDITIONS } from '../cartLogic';
import { writeAudit } from '../audit';
import { compressImage, uploadMedia } from '../create/media';
import { parsePayload } from '../create/listingModel';
import type { ProductCondition } from '../types';
import {
  EMPTY_PRODUCT, MAX_PRODUCT_PHOTOS, PRODUCT_CATEGORIES, STOREFRONT_MIN_PHOTOS, formFromProductPayload, productDocFields,
  validateProduct, type ProductForm,
} from './productModel';

type Json = Record<string, unknown>;

interface PhotoItem {
  key: string;
  blob?: Blob;
  url?: string;
  preview: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

let keySeq = 0;
const newKey = () => `p${Date.now()}_${keySeq++}`;
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);

/** Products → Add product / Edit product: fields + photos, saved to mp_carts as a manual product. */
export default function MpProductEdit() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const editId = routeId && routeId !== 'new' ? routeId : '';
  const { profile, refreshCart } = useMp();
  const uid = profile?.uid;
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';

  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [editRaw, setEditRaw] = useState<Json | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'missing'>(editId ? 'loading' : 'ready');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<PhotoItem[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => p.blob && URL.revokeObjectURL(p.preview)), []);

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ---- Edit: load the product ------------------------------------------------
  useEffect(() => {
    if (!editId || !profile) return;
    let alive = true;
    getDoc(doc(db, COLLECTIONS.carts, editId))
      .then((snap) => {
        if (!alive) return;
        if (!snap.exists()) return setState('missing');
        const d = snap.data();
        const raw = parsePayload(d.payload);
        if (raw._mpKind !== 'product') return setState('missing');
        if (d.source !== 'manual' || !(d.createdBy === profile.uid || isManager)) return setState('denied');
        setEditRaw(raw);
        setForm(formFromProductPayload(raw));
        const urls = (Array.isArray(raw.imageUrls) ? raw.imageUrls : []).map(String).filter(Boolean);
        setPhotos(urls.map((url) => ({ key: newKey(), url, preview: url, status: 'ready' })));
        setState('ready');
      })
      .catch((e) => alive && (setError(e instanceof Error ? e.message : String(e)), setState('missing')));
    return () => {
      alive = false;
    };
  }, [editId, profile, isManager]);

  // ---- Photos ------------------------------------------------------------------
  const upload = useCallback(async (key: string, file: Blob, name: string) => {
    if (!uid) return;
    try {
      const small = await compressImage(file);
      const preview = URL.createObjectURL(small);
      setPhotos((ps) => ps.map((p) => {
        if (p.key !== key) return p;
        if (p.blob) URL.revokeObjectURL(p.preview);
        return { ...p, blob: small, preview };
      }));
      const url = await uploadMedia(uid, small, name);
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, url, status: 'ready', error: undefined } : p)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'error', error: msg } : p)));
    }
  }, [uid]);

  const addFiles = (files: FileList | File[] | null) => {
    const list = Array.from(files || []).filter(isImage);
    if (!list.length) return;
    const room = MAX_PRODUCT_PHOTOS - photosRef.current.length;
    if (list.length > room) setError(`Up to ${MAX_PRODUCT_PHOTOS} photos per product.`);
    const items = list.slice(0, Math.max(0, room)).map((f) => ({
      file: f,
      item: { key: newKey(), blob: f, preview: URL.createObjectURL(f), status: 'uploading' as const },
    }));
    setPhotos((ps) => [...ps, ...items.map((i) => i.item)]);
    for (const { file, item } of items) void upload(item.key, file, file.name || 'photo.jpg');
  };

  const removePhoto = (key: string) => setPhotos((ps) => {
    const p = ps.find((x) => x.key === key);
    if (p?.blob) URL.revokeObjectURL(p.preview);
    return ps.filter((x) => x.key !== key);
  });
  const makeCover = (key: string) => setPhotos((ps) => [...ps.filter((p) => p.key === key), ...ps.filter((p) => p.key !== key)]);
  const move = (i: number, dir: -1 | 1) => setPhotos((ps) => {
    const j = i + dir;
    if (j < 0 || j >= ps.length) return ps;
    const next = ps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const retry = (p: PhotoItem) => {
    if (!p.blob) return;
    setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, status: 'uploading', error: undefined } : x)));
    void upload(p.key, p.blob, 'photo.jpg');
  };

  const readyUrls = photos.filter((p) => p.status === 'ready' && p.url).map((p) => p.url as string);
  const uploading = photos.some((p) => p.status === 'uploading');
  const failed = photos.filter((p) => p.status === 'error').length;

  // ---- Specs (custom fields) -----------------------------------------------------
  const setSpec = (i: number, k: 'label' | 'value', v: string) =>
    setForm((f) => ({ ...f, specs: f.specs.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const addSpec = () => setForm((f) => ({ ...f, specs: [...f.specs, { label: '', value: '' }] }));
  const removeSpec = (i: number) => setForm((f) => ({ ...f, specs: f.specs.filter((_, j) => j !== i) }));

  // ---- Save / delete -------------------------------------------------------------
  const save = async () => {
    if (!uid || !profile) return;
    setError('');
    const problems = validateProduct(form);
    if (problems.length) return setError(problems.join(' '));
    if (uploading) return setError('Wait for the photos to finish uploading.');
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, COLLECTIONS.carts, editId), productDocFields(form, editId, readyUrls, editRaw || {}));
        await writeAudit(profile, 'product.edit', editId, form.name.trim());
        await refreshCart(editId);
      } else {
        const ref = doc(collection(db, COLLECTIONS.carts));
        await setDoc(ref, {
          ...productDocFields(form, ref.id, readyUrls),
          source: 'manual', createdBy: uid, createdAt: Date.now(), dmsId: '', postedBy: {}, postedAccounts: {},
        });
        await writeAudit(profile, 'product.create', ref.id, form.name.trim());
        await refreshCart(ref.id);
      }
      navigate('/mp/products', { state: { saved: form.name.trim() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editId || !profile || !window.confirm(`Delete "${form.name || 'this product'}"? This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.carts, editId));
      await writeAudit(profile, 'product.delete', editId, form.name.trim());
      await refreshCart(editId);
      navigate('/mp/products');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // ---- Render --------------------------------------------------------------------
  if (state !== 'ready') {
    return (
      <MpShell>
        {state === 'loading' && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}
        {state === 'missing' && <Alert severity="error">This product wasn't found.{error ? ` ${error}` : ''}</Alert>}
        {state === 'denied' && <Alert severity="warning">Only the person who added this product or a manager can edit it.</Alert>}
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/mp/products')} sx={{ mt: 2 }}>Back to products</Button>
      </MpShell>
    );
  }

  const section = (title: string, hint: string | null, children: React.ReactNode) => (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
      <Typography variant="h6" component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{hint}</Typography>}
      {!hint && <Box sx={{ mb: 1.5 }} />}
      {children}
    </Paper>
  );
  const grid2 = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } } as const;

  return (
    <MpShell>
      <Box sx={{ maxWidth: 860, mx: 'auto', pb: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton onClick={() => navigate('/mp/products')} aria-label="Back to products"><ArrowBack /></IconButton>
          <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>{editId ? 'Edit product' : 'Add product'}</Typography>
        </Box>

        {/* Photos */}
        {section('Photos', `The first photo is the cover. Add at least ${STOREFRONT_MIN_PHOTOS} to show the product on your storefront.`, (
          <>
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              sx={{
                border: 2, borderStyle: 'dashed', borderColor: dragOver ? 'primary.main' : 'divider', borderRadius: 2,
                bgcolor: dragOver ? 'action.hover' : 'transparent', p: 2, textAlign: 'center', mb: photos.length ? 2 : 0,
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Drag photos here, or</Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<AddPhotoAlternate />} onClick={() => pickRef.current?.click()}>Choose photos</Button>
                <Button variant="outlined" startIcon={<PhotoCamera />} onClick={() => cameraRef.current?.click()}>Take a photo</Button>
              </Box>
              <input ref={pickRef} hidden type="file" accept="image/*" multiple
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </Box>
            {photos.length > 0 && (
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {photos.map((p, i) => (
                  <Box key={p.key} sx={{ position: 'relative', borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: i === 0 ? 'primary.main' : 'divider' }}>
                    <Box component="img" src={p.preview} alt={`Photo ${i + 1}`}
                      sx={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', opacity: p.status === 'ready' ? 1 : 0.5 }} />
                    {p.status === 'uploading' && (
                      <CircularProgress size={28} sx={{ position: 'absolute', top: 'calc(50% - 14px)', left: 'calc(50% - 14px)' }} />
                    )}
                    {p.status === 'error' && (
                      <Tooltip title={p.error || 'Upload failed'}>
                        <Button size="small" variant="contained" color="error" startIcon={<Refresh />} onClick={() => retry(p)}
                          sx={{ position: 'absolute', top: '40%', left: '50%', transform: 'translateX(-50%)' }}>Retry</Button>
                      </Tooltip>
                    )}
                    {i === 0 && (
                      <Typography variant="caption" sx={{ position: 'absolute', top: 6, left: 6, px: 0.75, borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}>
                        Cover
                      </Typography>
                    )}
                    <IconButton size="small" aria-label="Remove photo" onClick={() => removePhoto(p.key)}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
                      <Close fontSize="small" />
                    </IconButton>
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', bgcolor: 'rgba(0,0,0,0.5)' }}>
                      <IconButton size="small" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)} sx={{ color: '#fff' }}><ChevronLeft fontSize="small" /></IconButton>
                      <Tooltip title={i === 0 ? 'Cover photo' : 'Make cover'}>
                        <span>
                          <IconButton size="small" aria-label="Make cover" disabled={i === 0} onClick={() => makeCover(p.key)} sx={{ color: '#fff' }}>
                            {i === 0 ? <Star fontSize="small" sx={{ color: '#ffd54f' }} /> : <StarBorder fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton size="small" aria-label="Move right" disabled={i === photos.length - 1} onClick={() => move(i, 1)} sx={{ color: '#fff' }}><ChevronRight fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            {failed > 0 && <Alert severity="warning" sx={{ mt: 1.5 }}>{failed} photo{failed > 1 ? 's' : ''} didn't upload. Tap Retry or remove {failed > 1 ? 'them' : 'it'}.</Alert>}
          </>
        ))}

        {/* Details */}
        {section('Details', null, (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField label="Product name" required value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. 48V Lithium Battery Charger" inputProps={{ maxLength: 120 }} />
            <Box sx={grid2}>
              <Autocomplete freeSolo options={PRODUCT_CATEGORIES} value={form.category}
                onInputChange={(_, v) => set('category', v)}
                renderInput={(params) => <TextField {...params} label="Category" placeholder="Pick or type one" />} />
              <TextField label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </Box>
            <Box sx={grid2}>
              <TextField label="SKU / part number" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              <TextField select label="Condition" value={form.condition} onChange={(e) => set('condition', e.target.value as ProductCondition)}>
                {PRODUCT_CONDITIONS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={grid2}>
              <TextField label="Color" value={form.color} onChange={(e) => set('color', e.target.value)} />
              <TextField select label="Store / location" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
                <MenuItem value=""><em>All / not set</em></MenuItem>
                {DEALERSHIPS.map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState || d.name}</MenuItem>)}
              </TextField>
            </Box>
          </Box>
        ))}

        {/* Price & stock */}
        {section('Price & stock', 'Cost is for your team only and never shown to customers.', (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField label="Price" required value={form.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal"
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
              <TextField label="Cost (internal)" value={form.cost} onChange={(e) => set('cost', e.target.value)} inputMode="decimal"
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
              <TextField label="Quantity in stock" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} inputMode="numeric"
                helperText="Leave empty to not track. 0 = out of stock." />
            </Box>
            <FormControlLabel control={<Switch checked={form.active} onChange={(e) => set('active', e.target.checked)} />}
              label={form.active ? 'Listed — shows in inventory, storefront and posting' : 'Hidden — kept here but not listed'} />
          </Box>
        ))}

        {/* Description */}
        {section('Description', 'Used on your storefront and as the Facebook Marketplace description.', (
          <TextField multiline minRows={4} fullWidth value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder="What it is, what it fits, what's included…" inputProps={{ maxLength: 5000 }} />
        ))}

        {/* Specs */}
        {section('Specifications', 'Add any extra fields you need — size, voltage, fits model, warranty…', (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {form.specs.map((s, i) => (
              <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr auto', sm: '1fr 2fr auto' }, alignItems: 'center' }}>
                <TextField size="small" label="Field" placeholder="e.g. Voltage" value={s.label} onChange={(e) => setSpec(i, 'label', e.target.value)} />
                <TextField size="small" label="Value" placeholder="e.g. 48V" value={s.value} onChange={(e) => setSpec(i, 'value', e.target.value)} />
                <IconButton aria-label="Remove field" onClick={() => removeSpec(i)}><Delete fontSize="small" /></IconButton>
              </Box>
            ))}
            <Box><Button startIcon={<Add />} onClick={addSpec}>Add field</Button></Box>
          </Box>
        ))}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper elevation={6} sx={{
          position: 'sticky', bottom: { xs: 72, md: 16 }, p: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', zIndex: 2,
        }}>
          {editId && <Button color="error" startIcon={<Delete />} onClick={remove} disabled={saving}>Delete</Button>}
          <Box sx={{ flexGrow: 1 }} />
          {uploading && <Typography variant="body2" color="text.secondary">Uploading photos…</Typography>}
          <Button onClick={() => navigate('/mp/products')} disabled={saving}>Cancel</Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save />} onClick={save} disabled={saving || uploading}>
            {editId ? 'Save changes' : 'Save product'}
          </Button>
        </Paper>
      </Box>
    </MpShell>
  );
}
