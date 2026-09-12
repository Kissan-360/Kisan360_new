import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

const NotFoundPage = () => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="card p-8 max-w-md text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-stone-900">{t('notFound.title')}</h1>
        <p className="text-stone-500 text-sm mt-2">
          {t('notFound.body')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <Link to="/dashboard" className="btn-primary">{t('notFound.goDashboard')}</Link>
          <Link to="/market" className="btn-secondary">{t('notFound.market')}</Link>
          <Link to="/net-realization" className="btn-secondary">{t('notFound.netRealization')}</Link>
        </div>
        <p className="text-xs text-stone-400 mt-4">
          {t('notFound.hint')}
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;
