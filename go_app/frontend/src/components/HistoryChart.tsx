
import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface HistoryPoint {
    id: number;
    date: string;
    total_amount: number;
}

interface HistoryChartProps {
    data: HistoryPoint[];
}

export const HistoryChart: React.FC<HistoryChartProps> = ({ data }) => {
    // Format data for chart
    const chartData = data.map(d => ({
        ...d,
        formattedDate: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
        value: d.total_amount
    }));

    if (chartData.length === 0) return null;

    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-100 min-h-[350px]">
            <h4 className="text-gray-800 font-bold mb-6 text-center text-lg">Portfolio Growth History</h4>
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorHistory" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis
                            dataKey="formattedDate"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6b7280', fontSize: 12 }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6b7280', fontSize: 12 }}
                            tickFormatter={(value) => {
                                if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
                                if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
                                if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
                                return `₹${value}`;
                            }}
                            domain={['dataMin', 'auto']}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            itemStyle={{ color: '#4f46e5', fontWeight: 600 }}
                            formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, "Total Value"]}
                            labelStyle={{ color: '#374151', marginBottom: '0.25rem' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#6366f1"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorHistory)"
                            activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
