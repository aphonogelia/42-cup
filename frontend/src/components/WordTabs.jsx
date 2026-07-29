const STAMP_LABEL = {
  solved: 'SOLVED',
  failed: 'FAILED',
};

export default function WordTabs({ words, selectedOrderIndex, onSelect }) {
  return (
    <div className="tab-strip" style={{ gridTemplateColumns: `repeat(${words.length}, minmax(0, 1fr))` }}>
      {words.map((w) => (
        <button
          key={w.word_id}
          className={`tab-stub ${w.status} ${w.order_index === selectedOrderIndex ? 'selected' : ''}`}
          onClick={() => onSelect(w.order_index)}
          aria-label={`Word ${w.order_index}, ${w.status.replace('_', ' ')}`}
        >
          <span className="num">#{w.order_index}</span>
          {w.status === 'solved' || w.status === 'failed' ? (
            <span className="stamp">{STAMP_LABEL[w.status]}</span>
          ) : (
            <span className="num">{w.length}L</span>
          )}
        </button>
      ))}
    </div>
  );
}
