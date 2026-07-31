import { useEffect } from 'react';

export default function AlertModal({ title = 'Error', message, onClose, duration = 1400 }) {
    useEffect(() => {
        if (!message) return undefined;
        const timeout = window.setTimeout(() => onClose?.(), duration);
        return () => window.clearTimeout(timeout);
    }, [message, duration, onClose]);

    if (!message) return null;

    return (
        <div className="alert-toast" role="alert" aria-live="assertive">
            <div className="alert-toast-head">
                <span className="alert-toast-title">{title}</span>
                <button className="alert-toast-close" onClick={onClose} aria-label="Close notification" title="Close">
                    ×
                </button>
            </div>
            <div className="alert-toast-body">{message}</div>
        </div>
    );
}