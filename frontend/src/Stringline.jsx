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
        // We map station index to height
        const yScale = (stationIndex) => {
            if (!stations || stations.length === 0) return 0;
            return (stationIndex / (stations.length - 1)) * dimensions.height;
        };

        // Map physical distance to uniform Y
        // We create a polylinear scale mapping [s1.dist, s2.dist...] -> [y1, y2...]
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
            .curve(d3.curveLinear);
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
            style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
            onTouchEnd={handleTouchEnd}
            onMouseMove={(e) => e.buttons === 1 && handleTouch(e)}
            onMouseDown={handleTouch}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
        >
            <svg width={dimensions.width} height={dimensions.height} style={{ display: 'block' }}>
                {/* Grid Lines (Stations) */}
                {stations && stations.map((s, i) => (
                    <g key={s.id} transform={`translate(0, ${yScale(i)})`}>
                        <line x1={0} x2={dimensions.width} stroke="#333" strokeWidth={1} />
                        <text x={5} y={-5} fill="#666" fontSize="10">{s.name}</text>
                    </g>
                ))}

                {/* Trips */}
                {data.map(trip => (
                    <path
                        key={trip.trip_id}
                        d={lineGenerator(trip.positions)}
                        fill="none"
                        stroke={trip.direction_id === 0 ? "#00ff00" : "#ff00ff"} // Green for one way, Magenta for other
                        strokeWidth={2}
                        opacity={0.8}
                    />
                ))}

                {/* Scrubber */}
                {scrubberX !== null && (
                    <line
                        x1={scrubberX}
                        x2={scrubberX}
                        y1={0}
                        y2={dimensions.height}
                        stroke="white"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                    />
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
