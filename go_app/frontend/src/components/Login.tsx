import React, { useState } from 'react';
import { api } from '../api';

interface LoginProps {
    onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [tursoUrl, setTursoUrl] = useState('');
    const [tursoToken, setTursoToken] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            if (isRegistering) {
                await api.register(name, email, password, tursoUrl || undefined, tursoToken || undefined);
                // Auto login after register or ask user to login?
                // Let's auto login for better UX
                await api.login(email, password);
            } else {
                await api.login(email, password);
            }
            onLoginSuccess();
        } catch (err: any) {
            setError(err.message || (isRegistering ? 'Registration failed' : 'Login failed'));
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {isRegistering ? 'Create new account' : 'Sign in to your account'}
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        {isRegistering && (
                            <div>
                                <label htmlFor="name" className="sr-only">Name</label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                        )}
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email address</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 ${!isRegistering ? 'rounded-t-md' : ''} focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {isRegistering && (
                        <div className="mt-4 space-y-3">
                            <div className="rounded-md bg-blue-50 p-3">
                                <p className="text-xs text-blue-700">
                                    <strong>🔐 Privacy Mode (optional):</strong> Provide your own
                                    <a href="https://turso.tech" target="_blank" rel="noreferrer" className="underline mx-1">Turso</a>
                                    database credentials to store your financial data privately.
                                    Your data will be encrypted with your password — even the admin cannot read it.
                                    Leave blank to use the shared database.
                                </p>
                            </div>
                            <input
                                id="turso-url"
                                type="text"
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Turso DB URL (libsql://...) — optional"
                                value={tursoUrl}
                                onChange={(e) => setTursoUrl(e.target.value)}
                            />
                            <input
                                id="turso-token"
                                type="password"
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Turso Auth Token — optional"
                                value={tursoToken}
                                onChange={(e) => setTursoToken(e.target.value)}
                            />
                        </div>
                    )}

                    {error && (
                        <div className="text-red-500 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            {isRegistering ? 'Sign up' : 'Sign in'}
                        </button>
                    </div>

                    <div className="text-center">
                        <button
                            type="button"
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                            onClick={() => {
                                setIsRegistering(!isRegistering);
                                setError('');
                            }}
                        >
                            {isRegistering ? 'Already have an account? Sign in' : 'Don\'t have an account? Sign up'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
