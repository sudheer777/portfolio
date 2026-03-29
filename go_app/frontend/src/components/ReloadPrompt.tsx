import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export const ReloadPrompt: React.FC = () => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered:', r)
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    })

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[9999]">
            <div className="bg-white border border-indigo-200 shadow-2xl rounded-lg p-5 max-w-sm flex flex-col gap-3">
                <div className="flex justify-between items-start">
                    <h3 className="text-gray-900 font-bold text-lg">
                        {needRefresh ? 'Update Available! 🚀' : 'Ready to work offline'}
                    </h3>
                    <button
                        onClick={close}
                        className="text-gray-400 hover:text-gray-600 focus:outline-none"
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>

                <p className="text-sm text-gray-600">
                    {needRefresh
                        ? 'A new version of the Portfolio Tracker is ready. Click below to apply the update.'
                        : 'The app has been cached for offline use.'}
                </p>

                <div className="flex gap-3 justify-end mt-2">
                    {needRefresh && (
                        <button
                            onClick={() => updateServiceWorker(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-semibold shadow transition-colors"
                        >
                            Update Now
                        </button>
                    )}
                    <button
                        onClick={close}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
