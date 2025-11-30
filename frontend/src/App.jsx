import React, { useEffect, useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Don't set loading to true on every poll, only initial or line change could trigger it if we wanted
      // But for now, let's just keep it simple.
      try {
        // Fetch stations for selected line
        const stationsRes = await fetch(`/api/stations?line=${selectedLine}`);
        if (stationsRes.ok) {
          const stationsJson = await stationsRes.json();
          setStations(stationsJson);
        }

        // Fetch history data
        const res = await fetch(`/api/history?line=${selectedLine}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch data", e);
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true); // Show loading when line changes
    fetchData();
    const interval = setInterval(fetchData, 5000);
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
        <Stringline data={filteredData} stations={stations} />
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

        <div className="line-picker-container">
          <div className="line-picker">
            {LINES.map(line => (
              <button
                key={line}
                className={`line-btn line-${line} ${selectedLine === line ? 'active' : ''}`}
                onClick={() => setSelectedLine(line)}
              >
                {line}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
