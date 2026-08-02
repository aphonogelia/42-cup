// pages/AuthCallback.jsx (adjust path to your router setup)
import { useEffect } from 'react';
import { TOKEN_KEY } from '../api.js';

export default function AuthCallback() {

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1)); // Remove the '#' from the hash  
        const token = params.get('token');

        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        }
        window.location.replace('/');
    }, []);

    return <div className="app-shell status-line">Signing you in...</div>;
}