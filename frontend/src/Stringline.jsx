import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

const Stringline = ({ data, stations, showHeadways }) => {
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [scrubberX, setScrubberX] = useState(null);

    // Resize Observer
    useEffect(() => {
        if (!containerRef.current || !containerRef.current.parentElement) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current.parentElement);
        return () => resizeObserver.disconnect();
    }, []);

    const PADDING_TOP = 120; // Clear the header + extra breathing room
    const PADDING_BOTTOM = 350; // Clear the controls sheet + extra breathing room
    const MIN_STATION_HEIGHT = 45;

    // Calculate total content height
    const totalHeight = useMemo(() => {
        if (!stations || stations.length === 0) return dimensions.height;
        const requiredHeight = (stations.length - 1) * MIN_STATION_HEIGHT + PADDING_TOP + PADDING_BOTTOM;
        return Math.max(dimensions.height, requiredHeight);
    }, [dimensions.height, stations]);

    // Scales
    const { xScale, yScale, distanceToY } = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return { xScale: null, yScale: null, distanceToY: null };

        // Update time window based on latest data or current time
        // We use the latest timestamp in data or current time if data is empty
        const now = Date.now() / 1000;
        const thirtyMinutesAgo = now - 1800;

        const xScale = d3.scaleLinear()
            .domain([thirtyMinutesAgo, now])
            .range([0, dimensions.width]);

        // Uniform Y-Scale for Stations
        // We map station index to height, using the total scrollable height
        const effectiveHeight = totalHeight - PADDING_TOP - PADDING_BOTTOM;

        const yScale = (stationIndex) => {
            if (!stations || stations.length === 0) return 0;
            return PADDING_TOP + (stationIndex / (stations.length - 1)) * effectiveHeight;
        };

        // Map physical distance to uniform Y
        let distanceToY = d3.scaleLinear();
        if (stations && stations.length > 1) {
            const domain = stations.map(s => s.dist);
            const range = stations.map((_, i) => yScale(i));
            distanceToY.domain(domain).range(range);
        } else {
            distanceToY.domain([0, 200]).range([0, totalHeight]);
        }

        return { xScale, yScale, distanceToY };
    }, [dimensions, stations, data, totalHeight]); // Added totalHeight dependency

    // Time Ticks (Every 10 mins)
    const timeTicks = useMemo(() => {
        if (!xScale) return [];
        const [start, end] = xScale.domain();
        const ticks = [];

        // Round up to nearest 10 mins (600s)
        let current = Math.ceil(start / 600) * 600;
        while (current <= end) {
            ticks.push(current);
            current += 600;
        }
        return ticks;
    }, [xScale]);

    // Line Generator
    const lineGenerator = useMemo(() => {
        if (!xScale || !distanceToY) return null;
        return d3.line()
            .x(d => xScale(d.timestamp))
            .y(d => distanceToY(d.distance))
            .curve(d3.curveLinear); // Linear is best for stringlines to show speed changes accurately
    }, [xScale, distanceToY]);

    // Memoize Trip Paths to avoid re-calculation on scrubber interaction
    const tripPaths = useMemo(() => {
        if (!data || !lineGenerator) return null;
        return data.map(trip => (
            <path
                key={trip.trip_id}
                d={lineGenerator(trip.positions)}
                fill="none"
                stroke={trip.direction_id === 0 ? "#FCCC0A" : "#FCCC0A"}
                strokeWidth={2}
                opacity={0.8}
            // filter="url(#glow)" // Removed for performance
            />
        ));
    }, [data, lineGenerator]);

    // Headway Elements
    const headwayElements = useMemo(() => {
        if (!showHeadways || !data || !stations || !xScale || !distanceToY) return null;

        const elements = [];

        // For each station, find when trains passed it
        stations.forEach((station, stationIndex) => {
            const stationY = distanceToY(station.dist);
            const arrivals = [];

            data.forEach(trip => {
                // Find the segment that crosses this station distance
                // We assume positions are sorted by timestamp
                for (let i = 0; i < trip.positions.length - 1; i++) {
                    const p1 = trip.positions[i];
                    const p2 = trip.positions[i + 1];

                    // Check if station distance is between p1 and p2 (or very close)
                    // Note: Direction matters.
                    // If p1.dist <= station.dist <= p2.dist (or vice versa)
                    const minD = Math.min(p1.distance, p2.distance);
                    const maxD = Math.max(p1.distance, p2.distance);

                    if (station.dist >= minD && station.dist <= maxD) {
                        // Interpolate timestamp
                        const totalDist = p2.distance - p1.distance;
                        if (Math.abs(totalDist) < 0.001) continue; // Avoid div by zero

                        const ratio = (station.dist - p1.distance) / totalDist;
                        const time = p1.timestamp + ratio * (p2.timestamp - p1.timestamp);

                        arrivals.push(time);
                        break; // Only count one arrival per trip per station (simplification)
                    }
                }
            });

            // Sort arrivals by time
            arrivals.sort((a, b) => a - b);

            // Calculate differences
            for (let i = 0; i < arrivals.length - 1; i++) {
                const t1 = arrivals[i];
                const t2 = arrivals[i + 1];
                const diffSeconds = t2 - t1;
                const midTime = (t1 + t2) / 2;

                // Only show if within view
                const x = xScale(midTime);
                if (x < 0 || x > dimensions.width) continue;

                // Format: M:SSm
                const minutes = Math.floor(diffSeconds / 60);
                const seconds = Math.floor(diffSeconds % 60);
                const text = `${minutes}:${seconds.toString().padStart(2, '0')}m`;

                elements.push(
                    <text
                        key={`${station.id}-${i}`}
                        x={x}
                        y={stationY - 4} // Slightly above the station line
                        textAnchor="middle"
                        fill="#8E8E93"
                        fontSize="10"
                        opacity="0.7"
                        style={{ pointerEvents: 'none' }}
                    >
                        {text}
                    </text>
                );
            }
        });

        return elements;
    }, [showHeadways, data, stations, xScale, distanceToY, dimensions]);

    // Touch Handling
    const handleTouch = (e) => {
        if (!xScale) return;
        const rect = containerRef.current.getBoundingClientRect();
        let clientX;

        if (e.type.startsWith('touch')) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }

        const x = clientX - rect.left;
        setScrubberX(Math.max(0, Math.min(x, dimensions.width)));
    };

    const handleTouchEnd = () => {
        setScrubberX(null);
    };

    if (!data || !xScale || !yScale) return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: totalHeight, position: 'relative', touchAction: 'pan-y', overflow: 'visible' }}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={handleTouchEnd}
            onMouseMove={(e) => e.buttons === 1 && handleTouch(e)}
            onMouseDown={handleTouch}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
        >
            <div style={{
                position: 'fixed',
                bottom: '220px',
                left: 0,
                width: '100%',
                height: 0,
                overflow: 'visible',
                zIndex: 20,
                pointerEvents: 'none'
            }}>
                {timeTicks.map(tick => (
                    <div key={tick} style={{
                        position: 'absolute',
                        left: xScale(tick),
                        transform: 'translateX(-50%)',
                        bottom: 0,
                        color: '#8E8E93',
                        fontSize: '10px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)' // Add shadow for legibility over lines
                    }}>
                        {new Date(tick * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                ))}
            </div>

            <svg width={dimensions.width} height={totalHeight} style={{ display: 'block' }}>
                <defs>
                    <linearGradient id="fadeGradient" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="black" stopOpacity="1" />
                        <stop offset="10%" stopColor="black" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Time Grid (Vertical Lines) */}
                {timeTicks.map(tick => (
                    <g key={tick}>
                        <line
                            x1={xScale(tick)}
                            x2={xScale(tick)}
                            y1={PADDING_TOP}
                            y2={totalHeight - PADDING_BOTTOM}
                            stroke="#38383A"
                            strokeWidth={1}
                            opacity={0.3}
                        />
                    </g>
                ))}

                {/* Headways (Behind lines) */}
                {headwayElements}

                {/* Trips (Rendered FIRST so they are behind text) */}
                {tripPaths}

                {/* Grid Lines (Stations) */}
                {stations && stations.map((s, i) => (
                    <g key={s.id} transform={`translate(0, ${yScale(i)})`}>
                        <line x1={0} x2={dimensions.width} stroke="#38383A" strokeWidth={1} strokeDasharray="2 2" opacity="0.5" />
                        {/* Text Halo for legibility */}
                        <text
                            x={10}
                            y={-6}
                            stroke="#000000"
                            strokeWidth="4"
                            strokeLinejoin="round"
                            opacity="0.8"
                            fontSize="11"
                            fontWeight="500"
                            style={{ pointerEvents: 'none' }}
                        >
                            {s.name}
                        </text>
                        {/* Actual Text */}
                        <text
                            x={10}
                            y={-6}
                            fill="#8E8E93"
                            fontSize="11"
                            fontWeight="500"
                            style={{ pointerEvents: 'none' }}
                        >
                            {s.name}
                        </text>
                    </g>
                ))}

                {/* Scrubber */}
                {scrubberX !== null && (
                    <g>
                        <line
                            x1={scrubberX}
                            x2={scrubberX}
                            y1={0}
                            y2={totalHeight}
                            stroke="white"
                            strokeWidth={1}
                        />
                        {/* Time Label at bottom of graph */}
                        <rect
                            x={scrubberX - 30}
                            y={totalHeight - PADDING_BOTTOM + 30}
                            width={60}
                            height={20}
                            rx={4}
                            fill="#1C1C1E"
                        />
                        <text
                            x={scrubberX}
                            y={totalHeight - PADDING_BOTTOM + 44}
                            textAnchor="middle"
                            fill="white"
                            fontSize="11"
                            fontWeight="600"
                        >
                            {new Date(xScale.invert(scrubberX) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </text>
                    </g>
                )}
            </svg>
            {/* Scrubber Tooltip - Simplified for now */}
            {scrubberX !== null && (
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: scrubberX + 10,
                    background: 'rgba(0,0,0,0.8)',
                    padding: '5px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    fontSize: '12px'
                }}>
                    {new Date(xScale.invert(scrubberX) * 1000).toLocaleTimeString()}
                </div>
            )}
        </div>
    );
};

export default Stringline;
