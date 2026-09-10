import React from 'react';
import { Link } from 'react-router-dom';

// Landing page — the first human touchpoint. States what the product actually
// does (net realization + market linkage for SIH26132) and is honest that this
// is a prototype with simulated payments/verification.
const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-green-700 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">K</div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Kisan360</h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-700">SIH 2026 Prototype</span>
            </div>
            <nav>
              <ul className="flex space-x-4 items-center">
                <li><Link to="/login" className="text-gray-700 hover:text-emerald-600 text-sm font-medium">Demo sign-in</Link></li>
                <li><Link to="/login" className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 text-sm font-medium">Try the demo</Link></li>
              </ul>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Smart India Hackathon 2026 · PS SIH26132</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mt-4 mb-6 tracking-tight">
            Don't just find the highest mandi price.<br />
            <span className="text-emerald-700">Find where you take home the most.</span>
          </h1>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto mt-2">
            Two mandis can offer different prices. But the mandi paying the most may not leave the farmer with the most money.
          </p>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto">
            Kisan360 compares markets by <strong>net realization</strong> — the headline price minus the costs
            <em> you</em> bear as a farmer: transport, storage and loading. Then it helps you create a lot,
            find buyers with transparent trust tiers, send an offer and track the payment — in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/login" className="bg-emerald-600 text-white px-7 py-3 rounded-xl text-lg font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200">
              Try the demo — no signup
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-3">Sign in as a demo farmer, buyer or FPO. Payments and buyer verification are simulated — clearly labelled in the app.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16">
          <div className="card p-5">
            <p className="text-2xl">🧮</p>
            <h2 className="font-semibold text-gray-900 mt-2">Compare what you keep</h2>
            <p className="text-sm text-gray-500 mt-1">A higher headline price can mean a lower take-home once transport and storage are counted. We rank by net, not hype.</p>
          </div>
          <div className="card p-5">
            <p className="text-2xl">🔎</p>
            <h2 className="font-semibold text-gray-900 mt-2">Every number has a source</h2>
            <p className="text-sm text-gray-500 mt-1">Prices come from AGMARKNET (Govt. of India) with live/cached status and timestamps. The AI only explains results — it never invents figures.</p>
          </div>
          <div className="card p-5">
            <p className="text-2xl">🤝</p>
            <h2 className="font-semibold text-gray-900 mt-2">Sell with confidence</h2>
            <p className="text-sm text-gray-500 mt-1">Four-tier buyer trust badges, digital offers, payment-status tracking and FPO bulk pooling — with the simulated parts said out loud.</p>
          </div>
        </div>

        <div className="mt-10 card p-5">
          <p className="text-sm font-semibold text-gray-900">Built to sit on top of India's existing mandi ecosystem — not replace it.</p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Kisan360 is a decision layer over the data sources farmers and FPOs already have: AGMARKNET/eNAM price feeds in,
            explainable sell decisions out, connected to lots, buyers and offer workflows. It integrates with APMC/eNAM/FPO
            systems rather than asking anyone to abandon them — and every figure shows its source, timestamp and assumption.
          </p>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-10 text-center">
        <p className="text-xs text-gray-400">
          Prototype built for SIH 2026 · Commission/adat is charged to the buyer under the Maharashtra APMC Act s.31 — never deducted from the farmer's net.
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
