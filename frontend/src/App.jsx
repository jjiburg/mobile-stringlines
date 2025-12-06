import React, { useEffect, useState } from 'react';
import Stringline from './Stringline';
import LineSelector from './LineSelector';
import './App.css';

// const LINES = ['N', 'Q', 'R', 'W']; // Moved to LineSelector
const DIRECTIONS = [
  { id: 0, label: 'Northbound' },
  { id: 1, label: 'Southbound' }
];

function App() {
  const [data, setData] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedLine, setSelectedLine] = useState('Q');
  const [selectedDirection, setSelectedDirection] = useState(0);
  const [showHeadways, setShowHeadways] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Stations (Once per line change)
  useEffect(() => {
    const fetchStations = async () => {
      setIsLoading(true);
      try {
        const stationsRes = await fetch(`/api/stations?line=${selectedLine}`);
        if (stationsRes.ok) {
          const stationsJson = await stationsRes.json();
          setStations(stationsJson);
        }
      } catch (e) {
        console.error("Failed to fetch stations", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStations();
  }, [selectedLine]);

  // 2. Poll History (Every 5 seconds)
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/history?line=${selectedLine}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch history", e);
      }
    };

    fetchHistory(); // Initial fetch
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [selectedLine]);

  // Filter data by direction
  const filteredData = data.filter(trip => trip.direction_id === selectedDirection);

  return (
    <div className="App">
      <div className="header glass">
        <div className="header-content">
          NYC Stringlines • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="chart-container">
        <div className={`loading-overlay ${isLoading ? 'visible' : ''}`}>
          <div className="spinner"></div>
        </div>
        <Stringline data={filteredData} stations={stations} showHeadways={showHeadways} />
      </div>

      <div className="controls-sheet glass">
        <div className="direction-toggle-container">
          <div className="direction-toggle">
            {DIRECTIONS.map(dir => (
              <button
                key={dir.id}
                className={`dir-btn ${selectedDirection === dir.id ? 'active' : ''}`}
                onClick={() => setSelectedDirection(dir.id)}
              >
                {dir.label}
              </button>
            ))}
          </div>
        </div>

        <div className="options-container" style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className={`option-btn ${showHeadways ? 'active' : ''}`}
            onClick={() => setShowHeadways(!showHeadways)}
            style={{
              background: showHeadways ? '#0A84FF' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Show Headways
          </button>
        </div>

        <div className="line-picker-container">
          <LineSelector selectedLine={selectedLine} onSelectLine={setSelectedLine} />
        </div>
      </div>
    </div>
  );
}

export default App;
