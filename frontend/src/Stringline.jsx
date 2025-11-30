import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

const Stringline = ({ data, stations }) => {
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

    // Scales
    const { xScale, yScale, distanceToY } = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) return { xScale: null, yScale: null, distanceToY: null };

        const now = Date.now() / 1000; // seconds
        const oneHourAgo = now - 3600;

        const xScale = d3.scaleLinear()
            .domain([oneHourAgo, now])
            .range([0, dimensions.width]);

        // Uniform Y-Scale for Stations
        // We map station index to height, adding some padding top/bottom
        // Top padding: Header (~60px) + extra
        // Bottom padding: Controls Sheet (~180px) + extra
        const paddingTop = 80;
        const paddingBottom = 200;
        const effectiveHeight = dimensions.height - paddingTop - paddingBottom;

        const yScale = (stationIndex) => {
            if (!stations || stations.length === 0) return 0;
            return paddingTop + (stationIndex / (stations.length - 1)) * effectiveHeight;
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
    }, [dimensions, stations]);

    // Line Generator
    const lineGenerator = useMemo(() => {
        if (!xScale || !distanceToY) return null;
        return d3.line()
            .x(d => xScale(d.timestamp))
            .y(d => distanceToY(d.distance))
            .curve(d3.curveLinear); // Linear is best for stringlines to show speed changes accurately
    }, [xScale, distanceToY]);

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
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="fadeGradient" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="black" stopOpacity="1" />
                        <stop offset="10%" stopColor="black" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Trips (Rendered FIRST so they are behind text) */}
                {data.map(trip => (
                    <path
                        key={trip.trip_id}
                        d={lineGenerator(trip.positions)}
                        fill="none"
                        stroke={trip.direction_id === 0 ? "#FCCC0A" : "#FCCC0A"} // Use line color for both, maybe opacity diff?
                        strokeWidth={2}
                        opacity={0.8}
                        filter="url(#glow)"
                    />
                ))}

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
