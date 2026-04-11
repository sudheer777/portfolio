import { useState, useEffect } from 'react';
import { TransactionForm } from './components/TransactionForm';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import InterestRates from './components/InterestRates';
import EPFCalculator from './components/EPFCalculator';
import { api } from './api';

import PPFCalculator from './components/PPFCalculator';
import { AssetRebalancer } from './components/AssetRebalancer';
import CareerCalculator from './components/CareerCalculator';
import ExpenseFICalculator from './components/ExpenseFICalculator';
import { ScenarioBuilder } from './components/ScenarioBuilder';
import { ReloadPrompt } from './components/ReloadPrompt';
import { PrivacySettings } from './components/PrivacySettings';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState<'dashboard' | 'rates' | 'epf' | 'ppf' | 'rebalancer' | 'career' | 'fire' | 'scenarios' | 'privacy'>('dashboard');

  const [fontScale, setFontScale] = useState(parseInt(localStorage.getItem('appFontScale') || '100', 10));

  useEffect(() => {
    setIsAuthenticated(api.checkAuth());
    setLoading(false);
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
    localStorage.setItem('appFontScale', fontScale.toString());
  }, [fontScale]);

  const modifyFontScale = (delta: number) => {
    setFontScale(prev => Math.max(50, Math.min(200, prev + delta)));
  };

  const handleTransactionAdded = () => {
    setRefreshKey(k => k + 1);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
  };

  if (loading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-center px-4 print:hidden">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
              My Portfolio
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              Track your investments and interest growth
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="hidden sm:flex bg-white rounded shadow text-sm font-medium border border-gray-200">
              <button onClick={() => modifyFontScale(-10)} className="px-3 py-1.5 border-r hover:bg-gray-100" title="Decrease font size">A-</button>
              <button onClick={() => setFontScale(100)} className="px-3 py-1.5 border-r hover:bg-gray-100" title="Reset font size">{fontScale}%</button>
              <button onClick={() => modifyFontScale(10)} className="px-3 py-1.5 hover:bg-gray-100" title="Increase font size">A+</button>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow transition"
            >
              Add Transaction
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow transition"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex space-x-4 px-4 mb-6 border-b border-gray-200 overflow-x-auto print:hidden">
          <button
            onClick={() => setView('dashboard')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'dashboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Dashboard
          </button>

          <button
            onClick={() => setView('rebalancer')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'rebalancer'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Asset Rebalancer
          </button>
          <button
            onClick={() => setView('career')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'career'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Career Growth
          </button>
          <button
            onClick={() => setView('fire')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap flex items-center gap-1 ${view === 'fire'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            <span className="text-red-500 font-bold">FIRE</span> Simulator
          </button>
          <button
            onClick={() => setView('scenarios')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'scenarios'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            What-If Scenarios
          </button>
          <button
            onClick={() => setView('epf')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'epf'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            EPF Calculator
          </button>
          <button
            onClick={() => setView('ppf')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'ppf'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            PPF Calculator
          </button>
          <button
            onClick={() => setView('privacy')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'privacy'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            🔐 Privacy & BYODB
          </button>
          <button
            onClick={() => setView('rates')}
            className={`py-2 px-4 font-medium transition-colors duration-200 border-b-2 whitespace-nowrap ${view === 'rates'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Interest Rates
          </button>
        </div>

        <main>
          {/* Modal for Add Transaction */}
          {isModalOpen && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
              <div className="bg-white p-2 rounded-lg shadow-xl w-full max-w-2xl relative">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-xl z-10"
                >
                  ×
                </button>
                <TransactionForm onAdd={handleTransactionAdded} />
              </div>
            </div>
          )}

          {view === 'dashboard' ? (
            <Dashboard refreshKey={refreshKey} onTransactionChange={handleTransactionAdded} />
          ) : view === 'rates' ? (
            <InterestRates />
          ) : view === 'epf' ? (
            <EPFCalculator />
          ) : view === 'ppf' ? (
            <PPFCalculator />
          ) : view === 'rebalancer' ? (
            <AssetRebalancer />
          ) : view === 'career' ? (
            <CareerCalculator />
          ) : view === 'fire' ? (
            <ExpenseFICalculator />
          ) : view === 'scenarios' ? (
            <ScenarioBuilder />
          ) : (
            <PrivacySettings />
          )}
        </main>
      </div>
      <ReloadPrompt />
    </div>
  );
}

export default App;
