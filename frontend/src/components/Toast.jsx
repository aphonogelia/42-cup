import { useEffect, useState } from 'react';

export default function Toast({ message, onDone, duration = 1800 }) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!message) return;
    setKey((k) => k + 1);
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);

  if (!message) return null;

  return (
    <div className="toast" key={key} role="alert">
      {message}
    </div>
  );
}