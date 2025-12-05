import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

const Stringline = ({ data, stations, showHeadways }) => {
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [scrubberX, setScrubberX] = useState(null);

    // Resize Observer
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const PADDING_TOP = 80;
    const PADDING_BOTTOM = 300;

    // Scales
    const { xScale, yScale, distanceToY } = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return { xScale: null, yScale: null, distanceToToY: null };

        // Update time window based on latest data or current time
        // We use the latest timestamp in data or current time if data is empty
        const now = Date.now() / 1000;
        const thirtyMinutesAgo = now - 1800;

        const xScale = d3.scaleLinear()
            .domain([thirtyMinutesAgo, now])
            .range([0, dimensions.width]);

        // Uniform Y-Scale for Stations
        // We map station index to height, adding some padding top/bottom
        // Top padding: Header (~60px) + extra
        // Bottom padding: Controls Sheet (~180px) + extra
        const effectiveHeight = dimensions.height - PADDING_TOP - PADDING_BOTTOM;

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
            distanceToY.domain([0, 200]).range([0, dimensions.height]);
        }

        return { xScale, yScale, distanceToY };
    }, [dimensions, stations, data]); // Added data dependency to refresh time window

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
            style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none', overflow: 'hidden' }}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={handleTouchEnd}
            onMouseMove={(e) => e.buttons === 1 && handleTouch(e)}
            onMouseDown={handleTouch}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
        >
            <svg width={dimensions.width} height={dimensions.height} style={{ display: 'block' }}>
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
                            y2={dimensions.height - PADDING_BOTTOM}
                            stroke="#38383A"
                            strokeWidth={1}
                            opacity={0.3}
                        />
                        <text
                            x={xScale(tick)}
                            y={dimensions.height - PADDING_BOTTOM + 15}
                            textAnchor="middle"
                            fill="#8E8E93"
                            fontSize="10"
                            fontWeight="500"
                        >
                            {new Date(tick * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </text>
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
                            y2={dimensions.height}
                            stroke="white"
                            strokeWidth={1}
                        />
                        {/* Time Label at bottom of scrubber */}
                        <rect
                            x={scrubberX - 30}
                            y={dimensions.height - 180}
                            width={60}
                            height={20}
                            rx={4}
                            fill="#1C1C1E"
                        />
                        <text
                            x={scrubberX}
                            y={dimensions.height - 166}
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
