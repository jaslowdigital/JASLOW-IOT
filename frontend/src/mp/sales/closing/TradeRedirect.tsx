import { Navigate, useLocation } from 'react-router-dom';

/** The customer trade-in page moved from /trade to /trade-in; redirect old links, keeping the query. */
export default function TradeRedirect() {
  const loc = useLocation();
  return <Navigate to={`/trade-in${loc.search}`} replace />;
}
