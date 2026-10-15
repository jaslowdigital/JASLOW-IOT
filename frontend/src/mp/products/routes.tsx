import { lazy, type ReactNode } from 'react';
import { SignedInSuspense } from '../../ui/PageSuspense';

const MpProducts = lazy(() => import('./MpProducts'));
const MpProductEdit = lazy(() => import('./MpProductEdit'));

const wrap = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Products section (general products added one by one). Wrapped in the auth guard by mp/routes.tsx. */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/products', element: wrap(<MpProducts />) },
  { path: '/mp/products/:id', element: wrap(<MpProductEdit />) },
];
