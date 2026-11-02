import { useEffect, useState } from 'react';
import { fetchStats } from './Api.js';
import SolvingGrids from './SolvingGrids.jsx';
import Scrolly from './Scrolly.jsx';
import { WordsPlayedChart, FirstWordsChart } from './Charts.jsx';
import { heroLine, intro, wordsPlayedSteps, firstWordsSteps } from './copy.js';

export default function App() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchStats().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="status">Stats are unavailable right now.</p>;
  if (!data) return <p className="status">Loading…</p>;

  const o = data.overview;
  if (!o || !o.daily?.length) return <p className="status">Stats are not ready yet.</p>;

  const fw = data.first_words;
  const wpSteps = wordsPlayedSteps(o);
  const fwSteps = fw?.top?.length ? firstWordsSteps(fw) : null;

  return (
    <main>
      <header className="hero">
        <h1>How we play Wordel</h1>
        <p>{heroLine(o)}</p>
        <SolvingGrids games={data.sample_games} />
      </header>

      <div className="intro"><p>{intro}</p></div>

      <Scrolly steps={wpSteps}>
        {(active) => (
          <WordsPlayedChart
            daily={o.daily}
            visible={Math.ceil((o.daily.length * (active + 1)) / wpSteps.length)}
          />
        )}
      </Scrolly>

      {fwSteps && (
        <Scrolly steps={fwSteps}>
          {(active) => <FirstWordsChart top={fw.top} focus={active === 1 ? [1, 2] : null} />}
        </Scrolly>
      )}

      <section className="methods">
        <h2>Methods &amp; notes</h2>
        <p>Only finished days are counted, up to {o.throughDate}. A word counts as played once it has a guess; a word left unfinished at midnight counts as failed. Days flagged for suspicious play are removed.</p>
        <p>Solve rates, times and first words use players with a 42 account only. Guests are only counted in words played. Guests are deleted after 90 days of inactivity, so their daily totals are saved separately.</p>
        <p>An opener appears only if at least 3 different players used it. The games at the top are real, from past days, without names.</p>
        <p>Rebuilt every night. Last update: {new Date(data.updatedAt).toLocaleString('en-GB')}.</p>
      </section>
    </main>
  );
}