
import React from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import type { Amount } from '../types';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

interface HeaderProps {
    data: Record<string, Amount>;
}

export const PortfolioCharts: React.FC<HeaderProps> = ({ data }) => {
    // Transform data for Pie Chart (Asset Allocation by Final Amount)
    const pieData = Object.entries(data).map(([type, amount]) => ({
        name: type,
        value: amount.final_amount
    })).filter(d => d.value > 0);

    // Transform data for Bar Chart (Principal vs Interest)
    const barData = Object.entries(data).map(([type, amount]) => ({
        name: type,
        Principal: amount.principal,
        Interest: amount.interest,
    }));

    if (pieData.length === 0) return null;

    // Calculate total for percentages
    const totalValue = pieData.reduce((sum, d) => sum + d.value, 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
            {/* Pie Chart */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-100 min-h-[300px] flex flex-col">
                <h4 className="text-gray-700 font-semibold mb-2 text-center">Asset Allocation</h4>
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
                                return isNaN(val) ? value : `₹${val.toLocaleString('en-IN')} (${percent}%)`;
                            }} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-white p-4 rounded-lg shadow border border-gray-100 min-h-[300px] flex flex-col">
                <h4 className="text-gray-700 font-semibold mb-2 text-center">Principal vs. Interest</h4>
                <div className="flex-grow">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                            data={barData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(value) => `₹${value / 1000}k`} />
                            <Tooltip formatter={(value: any) => {
                                const val = Number(value);
                                return isNaN(val) ? value : `₹${val.toLocaleString('en-IN')}`;
                            }} />
                            <Legend />
                            <Bar dataKey="Principal" stackId="a" fill="#8884d8" />
                            <Bar dataKey="Interest" stackId="a" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
