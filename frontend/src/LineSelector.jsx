import React, { useState } from 'react';
import './LineSelector.css';

const LINE_GROUPS = {
    IRT: ["1", "2", "3", "4", "5", "6", "7"],
    IND: ["A", "C", "E", "B", "D", "F", "M", "G"],
    BMT: ["N", "Q", "R", "W", "J", "Z", "L"]
};

// Colors for lines
const LINE_COLORS = {
    "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
    "4": "#00933C", "5": "#00933C", "6": "#00933C",
    "7": "#B933AD",
    "A": "#0039A6", "C": "#0039A6", "E": "#0039A6",
    "B": "#FF6319", "D": "#FF6319", "F": "#FF6319", "M": "#FF6319",
    "G": "#6CBE45",
    "N": "#FCCC0A", "Q": "#FCCC0A", "R": "#FCCC0A", "W": "#FCCC0A",
    "J": "#996633", "Z": "#996633",
    "L": "#A7A9AC",
    "S": "#808183"
};

const LineSelector = ({ selectedLine, onSelectLine }) => {
    // Find which group the selected line belongs to
    const getGroup = (line) => {
        for (const [group, lines] of Object.entries(LINE_GROUPS)) {
            if (lines.includes(line)) return group;
        }
        return 'BMT'; // Default
    };

    const [activeGroup, setActiveGroup] = useState(getGroup(selectedLine));

    return (
        <div className="line-selector-container">
            {/* Group Tabs */}
            <div className="group-tabs">
                {Object.keys(LINE_GROUPS).map(group => (
                    <button
                        key={group}
                        className={`group-tab ${activeGroup === group ? 'active' : ''}`}
                        onClick={() => setActiveGroup(group)}
                    >
                        {group}
                    </button>
                ))}
            </div>

            {/* Line Buttons for Active Group */}
            <div className="line-grid-scroll">
                <div className="line-grid">
                    {LINE_GROUPS[activeGroup].map(line => (
                        <button
                            key={line}
                            className={`line-btn ${selectedLine === line ? 'active' : ''}`}
                            style={{
                                '--line-color': LINE_COLORS[line] || '#808183',
                                borderColor: selectedLine === line ? (LINE_COLORS[line] || '#fff') : 'transparent'
                            }}
                            onClick={() => onSelectLine(line)}
                        >
                            <span className="line-bullet" style={{ backgroundColor: LINE_COLORS[line] || '#808183' }}>
                                {line}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LineSelector;
