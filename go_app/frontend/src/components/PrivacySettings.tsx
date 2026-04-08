import React, { useState } from 'react';
import { api } from '../api';

export const PrivacySettings: React.FC = () => {
    // Migration state
    const [password, setPassword] = useState('');
    const [tursoUrl, setTursoUrl] = useState('');
    const [tursoToken, setTursoToken] = useState('');
    const [deleteOldData, setDeleteOldData] = useState(false);
    const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

    // Change Password state
    const [cpCurrent, setCpCurrent] = useState('');
    const [cpNew, setCpNew] = useState('');
    const [cpStatus, setCpStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

    const handleMigrate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password || !tursoUrl || !tursoToken) {
            setStatus({ type: 'error', message: 'All fields are required.' });
            return;
        }

        setStatus({ type: 'loading', message: 'Migrating data... Do not close this tab.' });

        try {
            await api.migrateDB(password, tursoUrl, tursoToken, deleteOldData);

            // On success, save the new credentials in localStorage just like login does
            localStorage.setItem("turso_url", tursoUrl);
            localStorage.setItem("turso_token", tursoToken);

            setStatus({ type: 'success', message: 'Database successfully migrated! Your transactions are now secure in your private instance.' });

            // Clear the form
            setPassword('');
        } catch (err: any) {
            setStatus({ type: 'error', message: err.message || 'Failed to migrate database' });
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cpCurrent || !cpNew) {
            setCpStatus({ type: 'error', message: 'All fields are required.' });
            return;
        }
        if (cpCurrent === cpNew) {
            setCpStatus({ type: 'error', message: 'New password must be different.' });
            return;
        }

        setCpStatus({ type: 'loading', message: 'Changing password...' });
        try {
            await api.changePassword(cpCurrent, cpNew);
            setCpStatus({ type: 'success', message: 'Password changed successfully.' });
            setCpCurrent('');
            setCpNew('');
        } catch (err: any) {
            setCpStatus({ type: 'error', message: err.message || 'Failed to change password' });
        }
    };

    return (
        <div className="space-y-8 mb-8 mt-8">
            {/* BYODB Migration Panel */}
            <div className="bg-white shadow rounded-lg p-6 border border-indigo-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <span className="bg-indigo-100 p-2 rounded-lg mr-3 text-xl">🔐</span>
                    Data Privacy & BYODB Migration
                </h2>

                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                    <div className="flex">
                        <div className="ml-3">
                            <p className="text-sm text-blue-700 mb-2">
                                <strong>Bring Your Own Database (BYODB)</strong> allows you to store all your financial records in your own Turso database instance rather than the shared server. This guarantees absolute privacy — your data is stored securely and even the server administrator cannot access it.
                            </p>
                            <details className="text-sm text-blue-800 bg-blue-100/50 rounded p-2 mt-2 cursor-pointer border border-blue-200">
                                <summary className="font-medium hover:text-blue-900 list-none flex items-center">
                                    <span className="mr-1">👉</span> Don't have a Turso database yet? Here is how to create one for free:
                                </summary>
                                <div className="mt-2 text-[13px] space-y-1.5 cursor-text ml-5 pb-1">
                                    <p>1. Log in to the <a href="https://app.turso.tech" target="_blank" rel="noreferrer" className="font-bold underline text-indigo-600">Turso Dashboard</a> in your web browser.</p>
                                    <p>2. Click <span className="font-semibold bg-white px-1 py-0.5 rounded border border-blue-200">Create Database</span>, give it a name, and create.</p>
                                    <p>3. Select the new database from the list to view its dashboard.</p>
                                    <p>4. <strong>URL:</strong> Locate the Connection URL and copy it (must begin with <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-blue-900">libsql://</code>).</p>
                                    <p>5. <strong>Token:</strong> Click the <span className="font-semibold bg-white px-1 py-0.5 rounded border border-blue-200">Generate Token</span> button on the page and copy the secret.</p>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleMigrate} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Current Login Password</label>
                        <p className="text-xs text-gray-500 mb-1">We need this to securely encrypt your database credentials.</p>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Turso Database URL</label>
                        <input
                            type="text"
                            required
                            placeholder="libsql://your-db-name.turso.io"
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={tursoUrl}
                            onChange={(e) => setTursoUrl(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Turso Auth Token</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={tursoToken}
                            onChange={(e) => setTursoToken(e.target.value)}
                        />
                    </div>

                    <div className="flex items-start mt-4 bg-gray-50 p-3 rounded-md border border-gray-200">
                        <div className="flex items-center h-5">
                            <input
                                id="delete-data"
                                type="checkbox"
                                checked={deleteOldData}
                                onChange={(e) => setDeleteOldData(e.target.checked)}
                                className="focus:ring-red-500 h-4 w-4 text-red-600 border-gray-300 rounded"
                            />
                        </div>
                        <div className="ml-3 text-sm">
                            <label htmlFor="delete-data" className="font-medium text-red-700">Hard-delete old data from shared server</label>
                            <p className="text-gray-500">If checked, all your existing records will be permanently deleted from the admin server after a successful migration.</p>
                        </div>
                    </div>

                    {status.type !== 'idle' && (
                        <div className={`p-4 rounded-md ${status.type === 'loading' ? 'bg-yellow-50 text-yellow-700' :
                            status.type === 'error' ? 'bg-red-50 text-red-700' :
                                'bg-green-50 text-green-700'
                            }`}>
                            {status.message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={status.type === 'loading'}
                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${status.type === 'loading' ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                            }`}
                    >
                        {status.type === 'loading' ? 'Migrating...' : 'Start Secure Migration'}
                    </button>
                </form>
            </div>

            {/* Change Password Panel */}
            <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <span className="bg-gray-100 p-2 rounded-lg mr-3 text-xl">🔑</span>
                    Change Password
                </h2>

                <div className="bg-gray-50 border-l-4 border-gray-400 p-4 mb-6">
                    <p className="text-sm text-gray-700">
                        If you have BYODB enabled, your Turso credentials will automatically be securely re-encrypted with your new password.
                    </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Current Password</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={cpCurrent}
                            onChange={(e) => setCpCurrent(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">New Password</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                            value={cpNew}
                            onChange={(e) => setCpNew(e.target.value)}
                        />
                    </div>

                    {cpStatus.type !== 'idle' && (
                        <div className={`p-4 rounded-md ${cpStatus.type === 'loading' ? 'bg-yellow-50 text-yellow-700' :
                            cpStatus.type === 'error' ? 'bg-red-50 text-red-700' :
                                'bg-green-50 text-green-700'
                            }`}>
                            {cpStatus.message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={cpStatus.type === 'loading'}
                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${cpStatus.type === 'loading' ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-800 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900'
                            }`}
                    >
                        {cpStatus.type === 'loading' ? 'Changing...' : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
};
