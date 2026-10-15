import { Navigate, useLocation } from 'react-router-dom';

/** The financing calculator moved from /mp/finance to /financing-calculator; redirect old links, keeping the query. */
export default function FinanceRedirect() {
  const loc = useLocation();
  return <Navigate to={`/financing-calculator${loc.search}`} replace />;
}
