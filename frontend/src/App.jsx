import React, { useEffect, useMemo, useState } from 'react';
import Stringline from './Stringline';
import './App.css';

const LINES = ['N', 'Q', 'R', 'W'];
const DIRECTIONS = [
  { id: 0, label: 'Northbound' },
  { id: 1, label: 'Southbound' }
];

function App() {
  const [data, setData] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedLine, setSelectedLine] = useState('Q');
  const [selectedDirection, setSelectedDirection] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stationsRes = await fetch(`/api/stations?line=${selectedLine}`);
        if (stationsRes.ok) {
          const stationsJson = await stationsRes.json();
          setStations(stationsJson);
        }

        const res = await fetch(`/api/history?line=${selectedLine}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch data", e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedLine]);

  const filteredData = useMemo(
    () => data.filter(trip => trip.direction_id === selectedDirection),
    [data, selectedDirection]
  );

  const lastUpdated = useMemo(() => {
    let latest = 0;
    data.forEach(trip => {
      trip.positions?.forEach(p => {
        if (p.timestamp > latest) latest = p.timestamp;
      });
    });
    return latest;
  }, [data]);

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'No recent data';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">NQRW</div>
          <div>
            <div className="brand-title">Stringline</div>
            <div className="brand-sub">Live NYC subway flow</div>
          </div>
        </div>
        <div className="live-pill">
          <span className="pulse-dot" />
          Live
        </div>
      </header>

      <section className="control-card">
        <div className="control-row">
          <span className="label">Line</span>
          <div className="chip-row">
            {LINES.map(line => (
              <button
                key={line}
                className={`chip chip-line ${selectedLine === line ? 'active' : ''}`}
                onClick={() => setSelectedLine(line)}
              >
                <span className="chip-letter">{line}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <span className="label">Direction</span>
          <div className="segmented">
            {DIRECTIONS.map(dir => (
              <button
                key={dir.id}
                className={`segment ${selectedDirection === dir.id ? 'active' : ''}`}
                onClick={() => setSelectedDirection(dir.id)}
              >
                {dir.label}
              </button>
            ))}
          </div>
        </div>

        <div className="status-row">
          <div className="stat">
            <span className="stat-label">Trips shown</span>
            <span className="stat-value">{filteredData.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Stations</span>
            <span className="stat-value">{stations.length || '—'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Updated</span>
            <span className="stat-value">{lastUpdatedLabel}</span>
          </div>
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">Last 60 minutes</div>
            <div className="chart-sub">Tap & hold to scrub</div>
          </div>
          <div className="legend">
            <div className="legend-item">
              <span className="legend-swatch north" />
              Northbound
            </div>
            <div className="legend-item">
              <span className="legend-swatch south" />
              Southbound
            </div>
          </div>
        </div>
        <div className="chart-body">
          <Stringline data={filteredData} stations={stations} />
          {filteredData.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">No live trips</div>
              <div className="empty-sub">Waiting for the next feed update…</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
