import React from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { AssetRebalancer } from './AssetRebalancer';
import type { Amount } from '../types';
import type { Milestone } from './HistoryAnalysis';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7f50', '#00C49F', '#FFBB28'];

interface Props {
    data: Record<string, Amount>;
    defaultMonthlyAddition?: number;
    showRebalancer?: boolean;
    pastMilestones?: Milestone[];
    pastUSDMilestones?: Milestone[];
}

export const AssetAllocationCharts: React.FC<Props> = ({ data, defaultMonthlyAddition = 0, showRebalancer = true, pastMilestones = [], pastUSDMilestones = [] }) => {
    // Transform data for Pie Chart
    const pieData = Object.entries(data).map(([type, amount]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
        value: amount.final_amount,
        ...amount
    })).filter(d => d.value > 0);

    const totalValue = pieData.reduce((sum, d) => sum + d.value, 0);

    const format = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
            {pieData.length > 0 && (
                <>
                    {/* Pie Chart */}
                    <div className="bg-white p-4 rounded-lg shadow border border-gray-100 min-h-[300px] flex flex-col">
                        <h4 className="text-gray-700 font-semibold mb-2 text-center">Asset Allocation Type</h4>
                        <div className="flex-grow">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => {
                                        const val = Number(value);
                                        const percent = ((val / totalValue) * 100).toFixed(1);
                                        return isNaN(val) ? value : `${format(val)} (${percent}%)`;
                                    }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="bg-white p-4 rounded-lg shadow border border-gray-100 min-h-[300px] flex flex-col overflow-hidden">
                        <h4 className="text-gray-700 font-semibold mb-2 text-center">Asset Type Summary</h4>
                        <div className="flex-grow overflow-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Invested</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">%</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {pieData.sort((a, b) => b.value - a.value).map((row) => (
                                        <tr key={row.name} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{row.name}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right text-gray-500">{format(row.principal)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900 font-semibold">{format(row.final_amount)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-right text-gray-500">{((row.value / totalValue) * 100).toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50 font-bold">
                                    <tr>
                                        <td className="px-3 py-2 text-left text-gray-700">Total</td>
                                        <td className="px-3 py-2 text-right text-gray-700">{format(pieData.reduce((s, d) => s + d.principal, 0))}</td>
                                        <td className="px-3 py-2 text-right text-gray-900">{format(totalValue)}</td>
                                        <td className="px-3 py-2 text-right text-gray-700">100%</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Asset Rebalancer */}
            {showRebalancer && (
                <div className="lg:col-span-2">
                    <AssetRebalancer
                        data={data}
                        defaultMonthlyAddition={defaultMonthlyAddition}
                        pastMilestones={pastMilestones}
                        pastUSDMilestones={pastUSDMilestones}
                    />
                </div>
            )}
        </div>
    );
};
