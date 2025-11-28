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

  useEffect(() => {
    const fetchData = async () => {
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
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedLine]);

  // Filter data by direction
  const filteredData = data.filter(trip => trip.direction_id === selectedDirection);

  return (
    <div className="App">
      <div className="header">
        <div className="controls">
          <div className="line-picker">
            {LINES.map(line => (
              <button
                key={line}
                className={`line-btn ${selectedLine === line ? 'active' : ''} line-${line}`}
                onClick={() => setSelectedLine(line)}
              >
                {line}
              </button>
            ))}
          </div>
          <div className="direction-picker">
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
      </div>
      <div className="chart-container">
        <Stringline data={filteredData} stations={stations} />
      </div>
    </div>
  );
}

export default App;
