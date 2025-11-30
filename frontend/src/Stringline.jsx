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
    const { xScale, yScale, distanceToY, timeTicks } = useMemo(() => {
        if (dimensions.width === 0 || dimensions.height === 0) {
            return { xScale: null, yScale: null, distanceToY: null, timeTicks: [] };
        }

        const now = Date.now() / 1000; // seconds
        const oneHourAgo = now - 3600;

        const xScale = d3.scaleLinear()
            .domain([oneHourAgo, now])
            .range([0, dimensions.width]);

        const yScale = (stationIndex) => {
            if (!stations || stations.length === 0) return 0;
            return (stationIndex / (stations.length - 1)) * dimensions.height;
        };

        let distanceToY = d3.scaleLinear();
        if (stations && stations.length > 1) {
            const domain = stations.map(s => s.dist);
            const range = stations.map((_, i) => yScale(i));
            distanceToY.domain(domain).range(range);
        } else {
            distanceToY.domain([0, 200]).range([0, dimensions.height]);
        }

        const tickStep = 15 * 60; // 15 minutes
        const ticks = [];
        const [start, end] = xScale.domain();
        const firstTick = Math.ceil(start / tickStep) * tickStep;
        for (let t = firstTick; t <= end; t += tickStep) {
            ticks.push(t);
        }

        return { xScale, yScale, distanceToY, timeTicks: ticks };
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
                <defs>
                    <linearGradient id="gridFade" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                    </linearGradient>
                </defs>

                {/* Time grid */}
                {timeTicks.map(t => {
                    const x = xScale(t);
                    return (
                        <g key={`time-${t}`} transform={`translate(${x},0)`}>
                            <line y1={0} y2={dimensions.height} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                            <text
                                y={12}
                                x={4}
                                fill="#9fb2c8"
                                fontSize="11"
                                style={{ paintOrder: 'stroke fill', stroke: '#0b1222', strokeWidth: 3 }}
                            >
                                {new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </text>
                        </g>
                    );
                })}

                {/* Grid Lines (Stations) */}
                {stations && stations.map((s, i) => (
                    <g key={s.id || s.name} transform={`translate(0, ${yScale(i)})`}>
                        <line x1={0} x2={dimensions.width} stroke="url(#gridFade)" strokeWidth={1} />
                        <text
                            x={8}
                            y={-6}
                            fill="#dce6f2"
                            fontSize="11"
                            style={{ paintOrder: 'stroke fill', stroke: '#0b1222', strokeWidth: 4 }}
                        >
                            {s.name}
                        </text>
                    </g>
                ))}

                {/* Trips */}
                {data.map(trip => {
                    if (!trip.positions || trip.positions.length < 2) return null;
                    return (
                        <path
                            key={trip.trip_id}
                            d={lineGenerator(trip.positions)}
                            fill="none"
                            stroke={trip.direction_id === 0 ? "var(--north-color)" : "var(--south-color)"}
                            strokeWidth={2.2}
                            opacity={0.9}
                        />
                    );
                })}

                {/* Scrubber */}
                {scrubberX !== null && (
                    <g>
                        <line
                            x1={scrubberX}
                            x2={scrubberX}
                            y1={0}
                            y2={dimensions.height}
                            stroke="#e8f0f6"
                            strokeWidth={1.2}
                            strokeDasharray="6 6"
                        />
                    </g>
                )}
            </svg>

            {/* Scrubber Tooltip */}
            {scrubberX !== null && (
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: Math.min(scrubberX + 12, dimensions.width - 140),
                    background: 'rgba(6,11,22,0.9)',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    pointerEvents: 'none',
                    fontSize: '12px',
                    color: '#e8f0f6',
                    boxShadow: '0 10px 24px rgba(0,0,0,0.35)'
                }}>
                    {new Date(xScale.invert(scrubberX) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </div>
            )}
        </div>
    );
};

export default Stringline;
