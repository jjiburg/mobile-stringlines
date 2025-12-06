import React, { useState } from 'react';
import './LineSelector.css';

const SUBDIVISIONS = [
    {
        id: 'IRT',
        label: 'IRT',
        color: '#0039A6', // Blue (A/C/E style but used for grouping here? No, IRT is usually associated with numbers. Let's use a neutral or brand color)
        // Actually, let's use the historic colors or just a neutral gray with the label.
        // IRT = Numbers
        lines: ['1', '2', '3', '4', '5', '6', '7', 'GS']
    },
    {
        id: 'IND',
        label: 'IND',
        color: '#FF6319', // Orange (B/D/F/M style)
        // IND = Letters (A-G)
        lines: ['A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'H'] // H is Rockaway Shuttle
    },
    {
        id: 'BMT',
        label: 'BMT',
        color: '#FCCC0A', // Yellow (N/Q/R/W)
        // BMT = Letters (J-Z)
        lines: ['N', 'Q', 'R', 'W', 'J', 'Z', 'L', 'FS'] // FS is Franklin Shuttle
    }
];

const LINE_COLORS = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'S': '#808183', 'GS': '#808183', 'FS': '#808183', 'H': '#808183'
};

const LineSelector = ({ selectedLine, onSelectLine }) => {
    const [openStack, setOpenStack] = useState(null);

    const handleSubdivisionClick = (subId) => {
        if (openStack === subId) {
            setOpenStack(null);
        } else {
            setOpenStack(subId);
        }
    };

    const handleLineClick = (line) => {
        onSelectLine(line);
        setOpenStack(null);
    };

    return (
        <div className="line-selector-container">
            {SUBDIVISIONS.map(sub => (
                <div key={sub.id} className="subdivision-group">
                    {/* The Stack (Lines) */}
                    <div className={`line-stack ${openStack === sub.id ? 'open' : ''}`}>
                        {sub.lines.map(line => (
                            <button
                                key={line}
                                className={`line-circle ${selectedLine === line ? 'active' : ''}`}
                                style={{ '--line-color': LINE_COLORS[line] || '#808183' }}
                                onClick={() => handleLineClick(line)}
                            >
                                {line === 'GS' || line === 'FS' || line === 'H' ? 'S' : line}
                            </button>
                        ))}
                    </div>

                    {/* The Trigger (Subdivision Icon) */}
                    <button
                        className={`subdivision-btn ${openStack === sub.id ? 'active' : ''}`}
                        onClick={() => handleSubdivisionClick(sub.id)}
                    >
                        {sub.label}
                    </button>
                </div>
            ))}
        </div>
    );
};

export default LineSelector;
