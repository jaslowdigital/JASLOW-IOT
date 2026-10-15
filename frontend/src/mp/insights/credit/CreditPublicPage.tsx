// Insights — customer page /apply?store=&lead=: full credit application (no SSN / date of birth).
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { CheckCircle, Call } from '@mui/icons-material';
import PublicShell from '../../sales/public/PublicShell';
import CreditForm from './CreditForm';
import { creditInfo, type StoreInfo } from './creditShared';
import { COMPANY_PHONE } from '../../../config/brand';

const CreditPublicPage: React.FC = () => {
  const [params] = useSearchParams();
  const store = params.get('store') || '';
  const lead = params.get('lead') || '';
  const [info, setInfo] = useState<StoreInfo | null>(null);
  const [done, setDone] = useState<StoreInfo | null>(null);

  useEffect(() => {
    creditInfo(store).then((r) => setInfo(r.store)).catch(() => setInfo(null));
  }, [store]);

  const phone = done?.phone || info?.phone || COMPANY_PHONE;
  if (done) {
    return (
      <PublicShell title="Thank you — we got your application!" phone={phone}>
        <Alert icon={<CheckCircle />} severity="success" sx={{ mb: 2 }}>
          A JASLOW team member{done.name && done.id !== 'T0' ? ` from ${done.name}` : ''} will reach out soon with your financing options.
          When a lender reviews it, they will ask you for your Social Security number and date of birth securely.
        </Alert>
        <Button variant="contained" startIcon={<Call />} href={`tel:${phone.replace(/[^\d+]/g, '')}`}>Call us: {phone}</Button>
      </PublicShell>
    );
  }
  return (
    <PublicShell
      title="Apply for financing"
      subtitle={`Takes about 5 minutes. We'll match you with lenders${info && info.id !== 'T0' ? ` — Jaslow Digital ${info.name}` : ''}.`}
      phone={phone}
    >
      <CreditForm store={store} lead={lead} onDone={(r) => { setDone(r.store); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </PublicShell>
  );
};

export default CreditPublicPage;
