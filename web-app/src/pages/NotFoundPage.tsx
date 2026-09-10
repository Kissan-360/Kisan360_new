import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card p-8 max-w-md text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="text-gray-500 text-sm mt-2">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <Link to="/dashboard" className="btn-primary">Go to Dashboard</Link>
          <Link to="/market" className="btn-secondary">Market Prices</Link>
          <Link to="/net-realization" className="btn-secondary">Net Realization</Link>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          If you think this is a mistake, check the URL or return to the dashboard.
        </p>
      </div>
    </div>
  );
};

export default NotFoundPage;
