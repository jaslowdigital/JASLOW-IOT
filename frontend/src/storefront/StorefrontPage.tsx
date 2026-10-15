import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, InputAdornment, Link, MenuItem, Paper, TextField, Typography,
} from '@mui/material';
import { AccessTime, Call, Place, Search } from '@mui/icons-material';
import StorefrontHeader from './StorefrontHeader';
import { useSessionState } from '../ui/useSessionState';
import { fetchStorefront, hoursLines, money, photoRank, storefrontCartPath, telHref, type PublicCart, type PublicDealership, type StorefrontResponse } from './api';

type Sort = 'featured' | 'price-asc' | 'price-desc';

/** Filter chips: within a group any selected chip matches (New or Used); across groups all must match. */
type FilterKey = 'new' | 'used' | 'electric' | 'gas' | 'lifted' | 'allTerrain' | 'utility' | 'carts' | 'products';
const FILTERS: Array<{ key: FilterKey; label: string; group: string; test: (c: PublicCart) => boolean }> = [
  { key: 'new', label: 'Brand new', group: 'cond', test: (c) => !c.isUsed },
  { key: 'used', label: 'Used', group: 'cond', test: (c) => c.isUsed },
  { key: 'carts', label: 'Golf carts', group: 'kind', test: (c) => !c.isProduct },
  { key: 'products', label: 'Parts & products', group: 'kind', test: (c) => !!c.isProduct },
  { key: 'electric', label: 'Electric', group: 'power', test: (c) => !c.isProduct && c.isElectric },
  { key: 'gas', label: 'Gas', group: 'power', test: (c) => !c.isProduct && !c.isElectric },
  { key: 'lifted', label: 'Lifted', group: 'lifted', test: (c) => c.lifted },
  { key: 'allTerrain', label: 'All terrain', group: 'allTerrain', test: (c) => !!c.allTerrain },
  { key: 'utility', label: 'Utility', group: 'utility', test: (c) => !!c.utility },
];

/** Storefronts only show carts with at least this many pictures (same rule as the server). */
const MIN_PHOTOS = 2;

// Picture URLs that failed to load (or are tiny placeholders) this visit: those carts are hidden.
const BROKEN_KEY = 'sf.brokenPhotos';
function loadBroken(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(BROKEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

/** Cart search text: every fact on the card plus its features (engine, battery, wheels, colors…). */
const searchText = (c: PublicCart) => [
  c.year, c.title, c.make, c.model, c.color, c.location, c.battery, ...c.features,
  c.passengers ? `${c.passengers} passenger ${c.passengers} seater ${c.passengers} seats` : '',
  c.isUsed ? 'used pre-owned' : 'new brand new', c.isProduct ? `product part accessory ${c.category || ''}` : c.isElectric ? 'electric' : 'gas gasoline',
  c.lifted ? 'lifted lift kit' : '', c.streetLegal ? 'street legal lsv' : '', c.utility ? 'utility' : '', c.allTerrain ? 'all terrain off road' : '',
].join(' ').toLowerCase().replace(/"/g, ' inch ');

function matchesFilters(c: PublicCart, on: Set<FilterKey>): boolean {
  const groups = new Map<string, boolean>();
  for (const f of FILTERS) {
    if (!on.has(f.key)) continue;
    groups.set(f.group, (groups.get(f.group) || false) || f.test(c));
  }
  return [...groups.values()].every(Boolean);
}

/** Public storefront grid at /s/:slug (no sign-in). */
const StorefrontPage: React.FC = () => {
  const { slug = 'jaslow' } = useParams();
  const [data, setData] = useState<StorefrontResponse | null>(null);
  const [error, setError] = useState('');
  // Search, chips and sort are kept for this tab, so opening a cart and coming Back keeps them.
  const [q, setQ] = useSessionState(`sf.${slug}.q`, '');
  const [filterList, setFilterList] = useSessionState<FilterKey[]>(`sf.${slug}.filters`, []);
  const filters = useMemo(() => new Set(filterList), [filterList]);
  const setFilters = (n: Set<FilterKey>) => setFilterList([...n]);
  const [sort, setSort] = useSessionState<Sort>(`sf.${slug}.sort`, 'featured');
  const [broken, setBroken] = useState<Set<string>>(loadBroken);
  const markBroken = useCallback((url: string) => setBroken((b) => {
    if (b.has(url)) return b;
    const n = new Set(b).add(url);
    try {
      sessionStorage.setItem(BROKEN_KEY, JSON.stringify([...n]));
    } catch {
      // storage unavailable — keep in memory only
    }
    return n;
  }), []);
  // Location lives in the URL (?loc=T1) so a link can open one store's carts.
  const [params, setParams] = useSearchParams();
  const loc = params.get('loc') || 'all';
  const setLoc = (v: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (v === 'all') n.delete('loc');
    else n.set('loc', v);
    return n;
  }, { replace: true });
  const toggle = (k: FilterKey) => {
    const n = new Set(filters);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setFilters(n);
  };

  useEffect(() => {
    let live = true;
    fetchStorefront(slug)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError('');
        document.title = `${d.storefront.title} — Golf carts for sale`;
      })
      .catch((e) => live && setError(e.message === 'not_found' ? 'This storefront doesn\'t exist or isn\'t published.' : 'Could not load carts. Please try again.'));
    return () => {
      live = false;
    };
  }, [slug]);

  const stores = useMemo(() => (data?.dealerships || []).filter((d) => d.id !== 'T0' && d.cityState), [data]);
  const store = stores.find((d) => d.id === loc) || null;
  // Only carts with 2+ pictures whose first two load (no broken or placeholder photos).
  const atLoc = useMemo(() => (data?.carts || []).filter((c) => (!store || c.locationId === store.id) &&
    c.photos.length >= MIN_PHOTOS && !c.photos.slice(0, MIN_PHOTOS).some((u) => broken.has(u))), [data, store, broken]);

  const carts = useMemo(() => {
    const words = q.toLowerCase().replace(/"/g, ' inch ').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    const list = atLoc.filter((c) => {
      if (!matchesFilters(c, filters)) return false;
      const hay = searchText(c);
      return words.every((w) => hay.includes(w));
    });
    // Carts with their own photos always come first; the chosen sort applies within each group.
    const by = sort === 'price-asc' ? (a: PublicCart, b: PublicCart) => (a.price || Infinity) - (b.price || Infinity)
      : sort === 'price-desc' ? (a: PublicCart, b: PublicCart) => b.price - a.price
        : () => 0;
    return [...list].sort((a, b) => photoRank(a) - photoRank(b) || by(a, b));
  }, [atLoc, q, filters, sort]);

  // Only offer chips that match at least one cart here.
  const chips = useMemo(() => {
    // "Golf carts" / "Parts & products" only when the store has both.
    const mixed = atLoc.some((c) => c.isProduct) && atLoc.some((c) => !c.isProduct);
    return FILTERS.filter((f) => atLoc.some(f.test) && (f.group !== 'kind' || mixed));
  }, [atLoc]);

  const sf = data?.storefront || null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <StorefrontHeader storefront={sf} slug={slug} />
      <Box component="main" sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 2 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        {!data && !error && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>}
        {data && (
          <>
            <VisitUs stores={stores} store={store} hours={hoursLines(data.hours)} onPick={setLoc} />
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
              {stores.length > 1 && (
                <TextField select size="small" value={store ? store.id : 'all'} onChange={(e) => setLoc(e.target.value)}
                  sx={{ bgcolor: '#fff', minWidth: 190 }} aria-label="Location">
                  <MenuItem value="all">All locations</MenuItem>
                  {stores.map((d) => <MenuItem key={d.id} value={d.id}>{d.cityState}</MenuItem>)}
                </TextField>
              )}
              <TextField
                size="small"
                placeholder="Search make, model, color, lithium, lifted, wheels…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ flex: '1 1 220px', bgcolor: '#fff' }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
              />
              <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as Sort)} sx={{ bgcolor: '#fff', minWidth: 170 }}>
                <MenuItem value="featured">Featured</MenuItem>
                <MenuItem value="price-asc">Price: low to high</MenuItem>
                <MenuItem value="price-desc">Price: high to low</MenuItem>
              </TextField>
            </Box>
            {chips.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                {chips.map((f) => (
                  <Chip key={f.key} label={f.label} clickable onClick={() => toggle(f.key)}
                    color={filters.has(f.key) ? 'primary' : 'default'} variant={filters.has(f.key) ? 'filled' : 'outlined'}
                    sx={{ bgcolor: filters.has(f.key) ? undefined : '#fff' }} />
                ))}
                {filters.size > 0 && <Button size="small" onClick={() => setFilters(new Set())}>Clear</Button>}
              </Box>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {carts.length} cart{carts.length === 1 ? '' : 's'} available{store ? ` in ${store.cityState}` : ''}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
              {carts.map((c) => <PublicCartCard key={c.id} cart={c} slug={slug} onBroken={markBroken} />)}
            </Box>
            {carts.length === 0 && <Alert severity="info">No carts match — try a different search or call us.</Alert>}
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 4, textAlign: 'center' }}>
              Prices and availability change quickly — call or text to confirm. © Jaslow Digital
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

/** Address, phone and hours: one store, or every store (tap one to see just its carts). */
const VisitUs: React.FC<{ stores: PublicDealership[]; store: PublicDealership | null; hours: string[]; onPick: (id: string) => void }> = ({ stores, store, hours, onPick }) => {
  const [all, setAll] = useState(false);
  const one = store || (stores.length === 1 ? stores[0] : null);
  if (!one && !stores.length) return null;
  const hoursRow = hours.length > 0 && (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <AccessTime fontSize="small" color="action" sx={{ mt: 0.25 }} />
      <Typography variant="body2">{hours.join(' · ')}</Typography>
    </Box>
  );
  if (one) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: { xs: 1, sm: 3 }, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <Place fontSize="small" color="primary" sx={{ mt: 0.25 }} />
          <Box>
            <Typography variant="body2" fontWeight={700}>Jaslow Digital {one.cityState}</Typography>
            <Link variant="body2" href={one.maps} target="_blank" rel="noopener" underline="hover" color="text.secondary">{one.address}</Link>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Call fontSize="small" color="action" />
          <Link variant="body2" href={telHref(one.phone)} underline="hover">{one.phone}</Link>
        </Box>
        {hoursRow}
      </Paper>
    );
  }
  const shown = all ? stores : stores.slice(0, 3);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="body2" fontWeight={700}>{stores.length} locations</Typography>
        {hoursRow}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' }, gap: 1 }}>
        {shown.map((d) => (
          <Box key={d.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Place fontSize="small" color="primary" sx={{ mt: 0.25 }} />
            <Box sx={{ minWidth: 0 }}>
              <Link component="button" variant="body2" fontWeight={700} underline="hover" onClick={() => onPick(d.id)} sx={{ textAlign: 'left' }}>
                {d.cityState}
              </Link>
              <Typography variant="body2" color="text.secondary">
                <Link href={d.maps} target="_blank" rel="noopener" underline="hover" color="inherit">{d.address}</Link>
                {' · '}<Link href={telHref(d.phone)} underline="hover" color="inherit">{d.phone}</Link>
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {stores.length > 3 && (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ mt: 0.5 }}>{all ? 'Show fewer' : `Show all ${stores.length} locations`}</Button>
      )}
    </Paper>
  );
};

/** Smaller than this is a placeholder / error image, not a photo of a cart. */
const MIN_PHOTO_PX = 120;

const PublicCartCard: React.FC<{ cart: PublicCart; slug: string; onBroken: (url: string) => void }> = ({ cart, slug, onBroken }) => {
  // Once the card's picture loads, check the second one too; either failing hides the cart.
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth < MIN_PHOTO_PX || img.naturalHeight < MIN_PHOTO_PX) {
      onBroken(cart.photos[0]);
      return;
    }
    const second = cart.photos[1];
    if (!second) return;
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth < MIN_PHOTO_PX || probe.naturalHeight < MIN_PHOTO_PX) onBroken(second);
    };
    probe.onerror = () => onBroken(second);
    probe.src = second;
  };
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardActionArea component={RouterLink} to={storefrontCartPath(slug, cart)} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <Box component="img" src={cart.photos[0]} alt={cart.title} loading="lazy" onLoad={onLoad} onError={() => onBroken(cart.photos[0])}
          sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', bgcolor: 'grey.200' }} />
        <CardContent sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Typography fontWeight={700} sx={{ lineHeight: 1.25 }}>{cart.year} {cart.title}</Typography>
            <Typography fontWeight={900} color="primary" sx={{ whiteSpace: 'nowrap' }}>{money(cart.price)}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">{cart.location}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
            <Chip size="small" label={cart.isUsed ? 'Used' : 'New'} color={cart.isUsed ? 'default' : 'secondary'} />
            {cart.isProduct
              ? cart.category && <Chip size="small" label={cart.category} variant="outlined" />
              : <Chip size="small" label={cart.isElectric ? 'Electric' : 'Gas'} variant="outlined" />}
            {cart.passengers > 0 && <Chip size="small" label={`${cart.passengers} seats`} variant="outlined" />}
            {cart.lifted && <Chip size="small" label="Lifted" variant="outlined" />}
            {cart.streetLegal && <Chip size="small" label="Street legal" variant="outlined" />}
            {cart.allTerrain && <Chip size="small" label="All terrain" variant="outlined" />}
            {cart.utility && <Chip size="small" label="Utility" variant="outlined" />}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default StorefrontPage;
