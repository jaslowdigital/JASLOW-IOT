import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, FormControlLabel, InputAdornment, Snackbar,
  Switch, TextField, Typography,
} from '@mui/material';
import { Add, Inventory2, Search, Share } from '@mui/icons-material';
import { db } from '../../config/firebase';
import MpShell from '../components/MpShell';
import { COLLECTIONS, locationName } from '../constants';
import { cartFromDoc, formatPrice } from '../cartUtils';
import { conditionLabel } from '../cartLogic';
import type { MpCart, MpCartDoc } from '../types';

interface Row {
  cart: MpCart;
  listed: boolean;
}

/** Products: every general product added one by one (not golf carts), with search and a category filter. */
export default function MpProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const savedName = (location.state as { saved?: string } | null)?.saved || '';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showHidden, setShowHidden] = useState(true);
  const [toast, setToast] = useState(savedName ? `Saved "${savedName}".` : '');

  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, COLLECTIONS.carts), where('kind', '==', 'product')))
      .then((snap) => {
        if (!alive) return;
        const out: Row[] = [];
        snap.forEach((d) => {
          const data = d.data() as MpCartDoc & { active?: boolean };
          const cart = cartFromDoc(d.id, data);
          if (cart.product) out.push({ cart, listed: data.active === true });
        });
        out.sort((a, b) => a.cart.product!.name.localeCompare(b.cart.product!.name));
        setRows(out);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set((rows || []).map((r) => r.cart.product!.category).filter(Boolean))].sort(),
    [rows],
  );

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || []).filter(({ cart, listed }) => {
      const p = cart.product!;
      if (!showHidden && !listed) return false;
      if (cat && p.category !== cat) return false;
      const hay = [p.name, p.brand, p.sku, p.category, p.description, ...p.specs.map((s) => `${s.label} ${s.value}`)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, cat, showHidden]);

  return (
    <MpShell>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Products{rows ? ` (${rows.length})` : ''}
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/mp/products/new')}>Add product</Button>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Parts, accessories and any other item you sell. Listed products also appear in inventory, on your storefront and can be posted to Facebook Marketplace.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {rows && rows.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <TextField size="small" placeholder="Search name, brand, SKU…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 240, flexGrow: 1, maxWidth: 420 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
          <FormControlLabel control={<Switch checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />} label="Show hidden / out of stock" />
        </Box>
      )}
      {categories.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
          <Chip label="All" color={!cat ? 'primary' : 'default'} onClick={() => setCat('')} />
          {categories.map((c) => <Chip key={c} label={c} color={cat === c ? 'primary' : 'default'} onClick={() => setCat(cat === c ? '' : c)} />)}
        </Box>
      )}

      {!rows && !error && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}

      {rows && rows.length === 0 && (
        <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
          <Inventory2 sx={{ fontSize: 56, mb: 1, opacity: 0.6 }} />
          <Typography variant="h6" color="text.primary">No products yet</Typography>
          <Typography sx={{ mb: 2 }}>Add your first product with its details and photos.</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/mp/products/new')}>Add product</Button>
        </Box>
      )}

      {rows && rows.length > 0 && shown.length === 0 && <Typography color="text.secondary">No products match.</Typography>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {shown.map(({ cart, listed }) => {
          const p = cart.product!;
          const stock = p.quantity === null ? '' : p.quantity === 0 ? 'Out of stock' : `${p.quantity} in stock`;
          return (
            <Card key={cart.docId} variant="outlined" sx={{ display: 'flex', flexDirection: 'column', opacity: listed ? 1 : 0.7 }}>
              <CardActionArea component={RouterLink} to={`/mp/products/${cart.docId}`} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                {cart.photos[0] ? (
                  <Box component="img" src={cart.photos[0]} alt={p.name} loading="lazy"
                    sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', bgcolor: 'grey.200' }} />
                ) : (
                  <Box sx={{ aspectRatio: '4 / 3', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
                    <Inventory2 sx={{ fontSize: 48 }} />
                  </Box>
                )}
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                    <Typography fontWeight={700} sx={{ lineHeight: 1.25 }}>{p.name}</Typography>
                    <Typography fontWeight={800} color="primary" sx={{ whiteSpace: 'nowrap' }}>{formatPrice(cart.price)}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {[p.brand, p.sku && `SKU ${p.sku}`, cart.locationId !== 'Other' ? locationName(cart.locationId) : ''].filter(Boolean).join(' · ') || ' '}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                    {p.category && <Chip size="small" label={p.category} />}
                    <Chip size="small" variant="outlined" label={conditionLabel(p.condition)} />
                    {stock && <Chip size="small" variant="outlined" color={p.quantity === 0 ? 'warning' : 'default'} label={stock} />}
                    {!listed && <Chip size="small" color="default" label="Hidden" />}
                    <Chip size="small" variant="outlined" label={`${cart.photos.length} photo${cart.photos.length === 1 ? '' : 's'}`} />
                  </Box>
                </CardContent>
              </CardActionArea>
              {listed && (
                <Box sx={{ px: 1, pb: 1 }}>
                  <Button size="small" startIcon={<Share />} component={RouterLink} to={`/mp/cart/${cart.docId}`}>Post / share</Button>
                </Box>
              )}
            </Card>
          );
        })}
      </Box>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast('')} message={toast} />
    </MpShell>
  );
}
