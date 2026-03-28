
import React, { useState } from 'react';

interface GrowthPotentialCalculatorProps {
    yearlyGrowthLive: number;
    yearlyGrowthSaved: number | null;
}

export const GrowthPotentialCalculator: React.FC<GrowthPotentialCalculatorProps> = ({ yearlyGrowthLive, yearlyGrowthSaved }) => {
    const [useLiveTotal, setUseLiveTotal] = useState(true);

    const baseYearlyGrowth = (useLiveTotal || yearlyGrowthSaved === null) ? yearlyGrowthLive : yearlyGrowthSaved;

    return (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-6 rounded-lg shadow border border-orange-100">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="text-center md:text-left">
                    <h4 className="text-orange-800 font-semibold text-lg">Growth Potential Calculator</h4>
                    <p className="text-orange-600 text-sm">Estimated returns based on <span className="font-bold">{useLiveTotal ? "Live" : "Last Saved"}</span> portfolio value</p>
                </div>

                <div className="flex items-center gap-2 bg-white/50 p-1 rounded-lg">
                    <button
                        onClick={() => setUseLiveTotal(false)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!useLiveTotal
                            ? "bg-white text-orange-600 shadow-sm border border-orange-200"
                            : "text-orange-400 hover:text-orange-700"
                            }`}
                    >
                        Last Saved
                    </button>
                    <button
                        onClick={() => setUseLiveTotal(true)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${useLiveTotal
                            ? "bg-white text-orange-600 shadow-sm border border-orange-200"
                            : "text-orange-400 hover:text-orange-700"
                            }`}
                    >
                        Live Total
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Daily */}
                <div className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm flex flex-col items-center justify-center">
                    <label className="text-xs text-orange-500 font-medium uppercase tracking-wide mb-1">Daily Growth</label>
                    <div className="text-xl font-bold text-orange-700">
                        ₹{Math.round(baseYearlyGrowth / 365).toLocaleString('en-IN')}
                    </div>
                </div>

                {/* Monthly */}
                <div className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm flex flex-col items-center justify-center">
                    <label className="text-xs text-orange-500 font-medium uppercase tracking-wide mb-1">Monthly Growth</label>
                    <div className="text-xl font-bold text-orange-700">
                        ₹{Math.round(baseYearlyGrowth / 12).toLocaleString('en-IN')}
                    </div>
                </div>

                {/* Yearly */}
                <div className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm flex flex-col items-center justify-center">
                    <label className="text-xs text-orange-500 font-medium uppercase tracking-wide mb-1">Yearly Growth</label>
                    <div className="text-xl font-bold text-orange-700">
                        ₹{Math.round(baseYearlyGrowth).toLocaleString('en-IN')}
                    </div>
                </div>
            </div>
        </div>
    );
};
