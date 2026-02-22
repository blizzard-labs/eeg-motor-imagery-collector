import React, { useMemo } from 'react';

/**
 * Virtual Hand Component
 * Renders a simplified kinematically consistent hand model
 * showing only thumb, index, and pinky fingers.
 * 
 * Joint angles are normalized [0, 1] where:
 * - 0 = fully extended
 * - 1 = fully flexed
 * 
 * Props:
 * - jointAngles: Object with current joint angles for each finger
 * - isGhost: Boolean, if true renders as semi-transparent "target" hand
 * - showLabels: Boolean, show finger labels
 */

const VirtualHand = ({ jointAngles, isGhost = false, showLabels = true, scale = 1 }) => {
  // Palm dimensions
  const palmWidth = 120 * scale;
  const palmHeight = 140 * scale;
  const palmX = 200 * scale;
  const palmY = 180 * scale;
  
  // Finger segment lengths
  const fingerSegments = {
    index: { 
      metacarpal: 30 * scale, 
      proximal: 35 * scale, 
      middle: 25 * scale, 
      distal: 20 * scale 
    },
    pinky: { 
      metacarpal: 25 * scale, 
      proximal: 25 * scale, 
      middle: 18 * scale, 
      distal: 15 * scale 
    },
    thumb: { 
      metacarpal: 25 * scale, 
      proximal: 30 * scale, 
      distal: 25 * scale 
    }
  };
  
  // Finger widths
  const fingerWidths = {
    index: 16 * scale,
    pinky: 12 * scale,
    thumb: 18 * scale
  };

  // Calculate finger path based on joint angles
  const calculateFingerPath = (fingerType, angles) => {
    const segments = fingerSegments[fingerType];
    const width = fingerWidths[fingerType];
    
    let points = [];
    let currentAngle = -Math.PI / 2; // Start pointing up
    let x, y;
    
    if (fingerType === 'thumb') {
      // Thumb has different kinematics - starts from side of palm
      x = palmX - palmWidth / 2 + 10 * scale;
      y = palmY + palmHeight / 2 - 30 * scale;
      
      // CMC opposition (rotation around palm)
      const cmcAngle = angles.cmc * (Math.PI / 3); // 0 to 60 degrees opposition
      const baseAngle = -Math.PI / 2 - Math.PI / 4 - cmcAngle; // Start angled outward
      
      currentAngle = baseAngle;
      points.push({ x, y });
      
      // MCP joint
      const mcpFlex = angles.mcp * (Math.PI / 2.5); // 0 to ~72 degrees
      x += Math.cos(currentAngle) * segments.metacarpal;
      y += Math.sin(currentAngle) * segments.metacarpal;
      points.push({ x, y });
      
      currentAngle += mcpFlex;
      
      // Proximal phalanx
      x += Math.cos(currentAngle) * segments.proximal;
      y += Math.sin(currentAngle) * segments.proximal;
      points.push({ x, y });
      
      // IP joint
      const ipFlex = angles.ip * (Math.PI / 2); // 0 to 90 degrees
      currentAngle += ipFlex;
      
      // Distal phalanx
      x += Math.cos(currentAngle) * segments.distal;
      y += Math.sin(currentAngle) * segments.distal;
      points.push({ x, y });
      
    } else {
      // Index and Pinky have similar kinematics
      const fingerOffset = fingerType === 'index' 
        ? -palmWidth / 2 + 25 * scale 
        : palmWidth / 2 - 15 * scale;
      
      x = palmX + fingerOffset;
      y = palmY - palmHeight / 2;
      points.push({ x, y });
      
      // MCP joint
      const mcpFlex = angles.mcp * (Math.PI / 2.2); // 0 to ~82 degrees
      currentAngle += mcpFlex;
      
      // Proximal phalanx
      x += Math.cos(currentAngle) * segments.proximal;
      y += Math.sin(currentAngle) * segments.proximal;
      points.push({ x, y });
      
      // PIP joint
      const pipFlex = angles.pip * (Math.PI / 1.8); // 0 to 100 degrees
      currentAngle += pipFlex;
      
      // Middle phalanx
      x += Math.cos(currentAngle) * segments.middle;
      y += Math.sin(currentAngle) * segments.middle;
      points.push({ x, y });
      
      // DIP joint
      const dipFlex = angles.dip * (Math.PI / 2.5); // 0 to ~72 degrees
      currentAngle += dipFlex;
      
      // Distal phalanx
      x += Math.cos(currentAngle) * segments.distal;
      y += Math.sin(currentAngle) * segments.distal;
      points.push({ x, y });
    }
    
    return { points, width };
  };

  // Generate SVG path for a finger with thickness
  const generateFingerSVG = (points, width) => {
    if (points.length < 2) return '';
    
    // Create outline by offsetting perpendicular to each segment
    const leftSide = [];
    const rightSide = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Calculate perpendicular direction
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      // Taper width towards fingertip
      const taperFactor = 1 - (i / points.length) * 0.3;
      const w = (width / 2) * taperFactor;
      
      if (i === 0) {
        leftSide.push({ x: p1.x + nx * w, y: p1.y + ny * w });
        rightSide.push({ x: p1.x - nx * w, y: p1.y - ny * w });
      }
      
      leftSide.push({ x: p2.x + nx * w * (1 - 0.1), y: p2.y + ny * w * (1 - 0.1) });
      rightSide.push({ x: p2.x - nx * w * (1 - 0.1), y: p2.y - ny * w * (1 - 0.1) });
    }
    
    // Create smooth path
    let path = `M ${leftSide[0].x} ${leftSide[0].y}`;
    for (let i = 1; i < leftSide.length; i++) {
      path += ` L ${leftSide[i].x} ${leftSide[i].y}`;
    }
    
    // Round tip
    const tipL = leftSide[leftSide.length - 1];
    const tipR = rightSide[rightSide.length - 1];
    path += ` Q ${(tipL.x + tipR.x) / 2 + (tipL.x - tipR.x) * 0.3} ${(tipL.y + tipR.y) / 2 + (tipL.y - tipR.y) * 0.3}, ${tipR.x} ${tipR.y}`;
    
    for (let i = rightSide.length - 2; i >= 0; i--) {
      path += ` L ${rightSide[i].x} ${rightSide[i].y}`;
    }
    path += ' Z';
    
    return path;
  };

  // Calculate all finger paths
  const fingers = useMemo(() => {
    const result = {};
    
    ['thumb', 'index', 'pinky'].forEach(finger => {
      const angles = jointAngles[finger] || { mcp: 0, pip: 0, dip: 0, cmc: 0, ip: 0 };
      const { points, width } = calculateFingerPath(finger, angles);
      result[finger] = {
        path: generateFingerSVG(points, width),
        points,
        tipPosition: points[points.length - 1]
      };
    });
    
    return result;
  }, [jointAngles, scale]);

  // Colors
  const skinColor = isGhost ? 'rgba(255, 200, 150, 0.4)' : '#ffcc99';
  const outlineColor = isGhost ? 'rgba(200, 150, 100, 0.5)' : '#cc9966';
  const jointColor = isGhost ? 'rgba(200, 100, 100, 0.4)' : '#cc8888';

  return (
    <svg 
      viewBox={`0 0 ${400 * scale} ${400 * scale}`} 
      className="w-full h-full"
      style={{ maxWidth: 400 * scale, maxHeight: 400 * scale }}
    >
      {/* Palm */}
      <ellipse
        cx={palmX}
        cy={palmY}
        rx={palmWidth / 2}
        ry={palmHeight / 2}
        fill={skinColor}
        stroke={outlineColor}
        strokeWidth={2}
      />
      
      {/* Hidden/fixed fingers (middle and ring) - shown as small stubs */}
      {[-15, 15].map((offset, i) => (
        <ellipse
          key={i}
          cx={palmX + offset * scale}
          cy={palmY - palmHeight / 2 - 15 * scale}
          rx={7 * scale}
          ry={20 * scale}
          fill={isGhost ? 'rgba(200, 180, 160, 0.3)' : '#e6d5c3'}
          stroke={outlineColor}
          strokeWidth={1}
          opacity={0.5}
        />
      ))}
      
      {/* Thumb */}
      <path
        d={fingers.thumb.path}
        fill={skinColor}
        stroke={outlineColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      
      {/* Index Finger */}
      <path
        d={fingers.index.path}
        fill={skinColor}
        stroke={outlineColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      
      {/* Pinky Finger */}
      <path
        d={fingers.pinky.path}
        fill={skinColor}
        stroke={outlineColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      
      {/* Joint markers */}
      {['thumb', 'index', 'pinky'].map(finger => (
        fingers[finger].points.slice(1, -1).map((point, i) => (
          <circle
            key={`${finger}-joint-${i}`}
            cx={point.x}
            cy={point.y}
            r={3 * scale}
            fill={jointColor}
          />
        ))
      ))}
      
      {/* Labels */}
      {showLabels && (
        <>
          <text
            x={fingers.thumb.tipPosition.x - 25 * scale}
            y={fingers.thumb.tipPosition.y + 15 * scale}
            fontSize={12 * scale}
            fill={isGhost ? 'rgba(100,100,100,0.5)' : '#666'}
            textAnchor="middle"
          >
            Thumb
          </text>
          <text
            x={fingers.index.tipPosition.x}
            y={fingers.index.tipPosition.y - 10 * scale}
            fontSize={12 * scale}
            fill={isGhost ? 'rgba(100,100,100,0.5)' : '#666'}
            textAnchor="middle"
          >
            Index
          </text>
          <text
            x={fingers.pinky.tipPosition.x + 5 * scale}
            y={fingers.pinky.tipPosition.y - 10 * scale}
            fontSize={12 * scale}
            fill={isGhost ? 'rgba(100,100,100,0.5)' : '#666'}
            textAnchor="middle"
          >
            Pinky
          </text>
        </>
      )}
    </svg>
  );
};

export default VirtualHand;
