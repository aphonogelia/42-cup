export default function AlertModal({ title = 'Error', message, onClose }) {
    if (!message) return null;

    return (
        <div className="info-overlay" role="presentation" onClick={onClose}>
            <section
                className="info-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-title"
                aria-describedby="alert-body"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="info-card-head">
                    <p className="info-eyebrow">Alert</p>
                    <button className="icon-btn info-close" onClick={onClose} aria-label="Close dialog" title="Close">
                        ×
                    </button>
                </div>
                <h2 id="alert-title">{title}</h2>
                <div id="alert-body" className="info-copy">
                    <p>{message}</p>
                </div>
            </section>
        </div>
    );
}