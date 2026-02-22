import React, { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

/**
 * Shadow Robot Hand 3D Component
 * 
 * A Three.js-based 3D rendering of the Shadow Robot Hand E model.
 * Maps joint angles from the handPoses format to the Shadow Hand's kinematic structure.
 * 
 * Based on sr_hand_e_model.xml kinematics from the MuJoCo model.
 */

// Shadow Hand joint limits (in radians) from MuJoCo model
const JOINT_LIMITS = {
  // First finger (Index)
  FFJ4: { min: -0.349066, max: 0.349066 },
  FFJ3: { min: 0, max: 1.5708 },
  FFJ2: { min: 0, max: 1.5708 },
  FFJ1: { min: 0, max: 1.5708 },
  // Middle finger
  MFJ4: { min: -0.349066, max: 0.349066 },
  MFJ3: { min: 0, max: 1.5708 },
  MFJ2: { min: 0, max: 1.5708 },
  MFJ1: { min: 0, max: 1.5708 },
  // Ring finger
  RFJ4: { min: -0.349066, max: 0.349066 },
  RFJ3: { min: 0, max: 1.5708 },
  RFJ2: { min: 0, max: 1.5708 },
  RFJ1: { min: 0, max: 1.5708 },
  // Little finger (Pinky)
  LFJ5: { min: 0, max: 0.785398 },
  LFJ4: { min: -0.349066, max: 0.349066 },
  LFJ3: { min: 0, max: 1.5708 },
  LFJ2: { min: 0, max: 1.5708 },
  LFJ1: { min: 0, max: 1.5708 },
  // Thumb
  THJ5: { min: -1.0472, max: 1.0472 },
  THJ4: { min: 0, max: 1.22173 },
  THJ3: { min: -0.20944, max: 0.20944 },
  THJ2: { min: -0.698132, max: 0.698132 },
  THJ1: { min: 0, max: 1.5708 },
};

// Scale factor for visibility (MuJoCo uses meters, we scale up)
const SCALE = 10;

// Segment dimensions from MuJoCo model
const SEGMENTS = {
  // Finger phalanges (from sr_hand_e_model.xml body positions)
  proximal: { length: 0.045 * SCALE, radius: 0.009 * SCALE },
  middle: { length: 0.025 * SCALE, radius: 0.008 * SCALE },
  distal: { length: 0.026 * SCALE, radius: 0.007 * SCALE },
  // Thumb (different sizes)
  thumbProximal: { length: 0.038 * SCALE, radius: 0.011 * SCALE },
  thumbMiddle: { length: 0.032 * SCALE, radius: 0.009 * SCALE },
  thumbDistal: { length: 0.0275 * SCALE, radius: 0.008 * SCALE },
  // Little finger metacarpal
  lfMetacarpal: { length: 0.06579 * SCALE, radius: 0.007 * SCALE },
};

// Convert normalized [0,1] joint angles to Shadow Hand radians
const normalizedToRadians = (normalized, jointName) => {
  const limits = JOINT_LIMITS[jointName];
  if (!limits) return 0;
  return limits.min + normalized * (limits.max - limits.min);
};

// Color palette for finger states
const FINGER_STATE_COLORS = {
  relaxed: '#a8d5a2',    // Soft green - neutral/resting
  extended: '#7eb8da',   // Light blue - straight/open
  flexed: '#e88a5c',     // Orange - curled/closed
  hooked: '#c9a0dc',     // Purple - hook grip
  pinch: '#f5d76e',      // Yellow - precision grip
};

// Ghost versions (semi-transparent, slightly desaturated)
const FINGER_STATE_COLORS_GHOST = {
  relaxed: 'rgba(168, 213, 162, 0.5)',
  extended: 'rgba(126, 184, 218, 0.5)',
  flexed: 'rgba(232, 138, 92, 0.5)',
  hooked: 'rgba(201, 160, 220, 0.5)',
  pinch: 'rgba(245, 215, 110, 0.5)',
};

/**
 * Classify finger state based on joint angles
 * @param {Object} angles - Joint angles {mcp, pip, dip} or {cmc, mcp, ip} for thumb
 * @param {boolean} isThumb - Whether this is the thumb
 * @param {Object} otherFingers - Other finger angles for pinch detection
 * @returns {string} State: 'relaxed', 'extended', 'flexed', 'hooked', or 'pinch'
 */
const classifyFingerState = (angles, isThumb = false, thumbAngles = null) => {
  if (!angles) return 'relaxed';
  
  if (isThumb) {
    const { cmc = 0, mcp = 0, ip = 0 } = angles;
    const totalFlexion = cmc + mcp + ip;
    
    // Thumb in opposition position (high CMC) = pinch
    if (cmc > 0.6 && mcp > 0.4) return 'pinch';
    // Extended thumb
    if (totalFlexion < 0.4) return 'extended';
    // Flexed thumb
    if (totalFlexion > 1.5) return 'flexed';
    // Relaxed
    return 'relaxed';
  }
  
  const { mcp = 0, pip = 0, dip = 0 } = angles;
  const totalFlexion = mcp + pip + dip;
  
  // Check for pinch: moderate MCP flexion with thumb opposition
  if (thumbAngles && thumbAngles.cmc > 0.6) {
    if (mcp > 0.4 && mcp < 0.8 && pip > 0.4 && pip < 0.85) {
      return 'pinch';
    }
  }
  
  // Hooked: low MCP, high PIP/DIP (finger curled at middle joints)
  if (mcp < 0.3 && pip > 0.6 && dip > 0.5) return 'hooked';
  
  // Extended: all joints low
  if (totalFlexion < 0.35) return 'extended';
  
  // Flexed: high flexion across all joints
  if (totalFlexion > 1.8) return 'flexed';
  
  // Relaxed: moderate flexion
  return 'relaxed';
};

/**
 * Get colors for all fingers based on current pose
 * @param {Object} jointAngles - Current joint angles
 * @param {boolean} isGhost - Whether this is a ghost hand
 * @param {boolean} colorMiddleRing - Whether to color middle and ring fingers
 */
const getFingerColors = (jointAngles, isGhost = false, colorMiddleRing = true) => {
  const { thumb, index, pinky } = jointAngles;
  const colorPalette = isGhost ? FINGER_STATE_COLORS_GHOST : FINGER_STATE_COLORS;
  const neutralColor = isGhost ? 'rgba(180, 160, 140, 0.4)' : '#c4a484';
  
  const thumbState = classifyFingerState(thumb, true);
  const indexState = classifyFingerState(index, false, thumb);
  const pinkyState = classifyFingerState(pinky, false, thumb);
  
  // Middle and ring interpolate between index and pinky states
  // Use the more "active" state between the two
  const getInterpolatedState = (indexState, pinkyState, indexWeight = 0.5) => {
    const statePriority = { pinch: 4, hooked: 3, flexed: 2, extended: 1, relaxed: 0 };
    const indexPriority = statePriority[indexState];
    const pinkyPriority = statePriority[pinkyState];
    
    // Use weighted priority
    const weightedPriority = indexPriority * indexWeight + pinkyPriority * (1 - indexWeight);
    
    if (weightedPriority >= 3.5) return 'pinch';
    if (weightedPriority >= 2.5) return 'hooked';
    if (weightedPriority >= 1.5) return 'flexed';
    if (weightedPriority >= 0.5) return 'extended';
    return 'relaxed';
  };
  
  const middleState = getInterpolatedState(indexState, pinkyState, 0.5);
  const ringState = getInterpolatedState(indexState, pinkyState, 0.3);
  
  return {
    thumb: colorPalette[thumbState],
    index: colorPalette[indexState],
    middle: colorMiddleRing ? colorPalette[middleState] : neutralColor,
    ring: colorMiddleRing ? colorPalette[ringState] : neutralColor,
    pinky: colorPalette[pinkyState],
    palm: isGhost ? 'rgba(180, 160, 140, 0.4)' : '#c4a484',
  };
};

// Map handPoses format to Shadow Hand joint angles
const mapPoseToShadowHand = (jointAngles) => {
  const { thumb, index, pinky } = jointAngles;
  
  // For pinch movements, we need the index to adduct (move towards thumb)
  // Calculate an abduction adjustment based on whether it looks like a pinch
  const thumbCmc = thumb?.cmc || 0;
  const indexFlexion = (index?.mcp || 0) + (index?.pip || 0);
  const isPinchLike = thumbCmc > 0.5 && indexFlexion > 0.8;
  const indexAbduction = isPinchLike ? -0.15 : 0; // Negative = adduct toward thumb
  
  // Similar adjustment for pinky in thumb-pinky pinch
  const pinkyFlexion = (pinky?.mcp || 0) + (pinky?.pip || 0);
  const isPinkyPinch = thumbCmc > 0.7 && pinkyFlexion > 1.0;
  const pinkyAbduction = isPinkyPinch ? 0.1 : 0; // Positive = adduct toward thumb
  
  return {
    // Index finger (FF)
    FFJ4: normalizedToRadians(indexAbduction, 'FFJ4'),
    FFJ3: normalizedToRadians(index?.mcp || 0, 'FFJ3'),
    FFJ2: normalizedToRadians(index?.pip || 0, 'FFJ2'),
    FFJ1: normalizedToRadians(index?.dip || 0, 'FFJ1'),
    
    // Middle finger (MF) - interpolate between index and pinky
    MFJ4: 0,
    MFJ3: normalizedToRadians(((index?.mcp || 0) + (pinky?.mcp || 0)) / 2, 'MFJ3'),
    MFJ2: normalizedToRadians(((index?.pip || 0) + (pinky?.pip || 0)) / 2, 'MFJ2'),
    MFJ1: normalizedToRadians(((index?.dip || 0) + (pinky?.dip || 0)) / 2, 'MFJ1'),
    
    // Ring finger (RF) - closer to pinky
    RFJ4: 0,
    RFJ3: normalizedToRadians(((index?.mcp || 0) * 0.3 + (pinky?.mcp || 0) * 0.7), 'RFJ3'),
    RFJ2: normalizedToRadians(((index?.pip || 0) * 0.3 + (pinky?.pip || 0) * 0.7), 'RFJ2'),
    RFJ1: normalizedToRadians(((index?.dip || 0) * 0.3 + (pinky?.dip || 0) * 0.7), 'RFJ1'),
    
    // Little finger (LF - Pinky)
    LFJ5: normalizedToRadians((pinky?.mcp || 0) * 0.3, 'LFJ5'),
    LFJ4: normalizedToRadians(pinkyAbduction, 'LFJ4'),
    LFJ3: normalizedToRadians(pinky?.mcp || 0, 'LFJ3'),
    LFJ2: normalizedToRadians(pinky?.pip || 0, 'LFJ2'),
    LFJ1: normalizedToRadians(pinky?.dip || 0, 'LFJ1'),
    
    // Thumb - enhanced opposition mapping for pinch
    // THJ5 controls opposition rotation (bringing thumb across palm)
    // THJ4 controls flexion of the base joint
    THJ5: normalizedToRadians(thumb?.cmc || 0, 'THJ5'),
    THJ4: normalizedToRadians((thumb?.cmc || 0) * 0.9 + (thumb?.mcp || 0) * 0.3, 'THJ4'),
    THJ3: 0,
    THJ2: normalizedToRadians(thumb?.mcp || 0, 'THJ2'),
    THJ1: normalizedToRadians(thumb?.ip || 0, 'THJ1'),
  };
};

// Capsule geometry for finger segments
const Segment = ({ length, radius, color, opacity = 1 }) => {
  return (
    <mesh position={[0, length / 2, 0]}>
      <capsuleGeometry args={[radius, length, 4, 8]} />
      <meshStandardMaterial 
        color={color} 
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};

// Standard finger (FF, MF, RF) - 3 phalanges
const StandardFinger = ({ 
  basePosition, 
  j4Angle = 0,
  j3Angle = 0,
  j2Angle = 0,
  j1Angle = 0,
  color,
  opacity = 1
}) => {
  return (
    <group position={basePosition}>
      {/* J4 - Abduction/Adduction (spread) */}
      <group rotation={[0, j4Angle, 0]}>
        {/* J3 - MCP flexion (proximal phalanx) */}
        <group rotation={[j3Angle, 0, 0]}>
          <Segment 
            length={SEGMENTS.proximal.length} 
            radius={SEGMENTS.proximal.radius} 
            color={color}
            opacity={opacity}
          />
          {/* J2 - PIP flexion (middle phalanx) */}
          <group position={[0, SEGMENTS.proximal.length, 0]} rotation={[j2Angle, 0, 0]}>
            <Segment 
              length={SEGMENTS.middle.length} 
              radius={SEGMENTS.middle.radius} 
              color={color}
              opacity={opacity}
            />
            {/* J1 - DIP flexion (distal phalanx) */}
            <group position={[0, SEGMENTS.middle.length, 0]} rotation={[j1Angle, 0, 0]}>
              <Segment 
                length={SEGMENTS.distal.length} 
                radius={SEGMENTS.distal.radius} 
                color={color}
                opacity={opacity}
              />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

// Little finger with metacarpal
const LittleFinger = ({ 
  basePosition, 
  j5Angle = 0,
  j4Angle = 0,
  j3Angle = 0,
  j2Angle = 0,
  j1Angle = 0,
  color,
  opacity = 1
}) => {
  return (
    <group position={basePosition}>
      {/* J5 - Metacarpal rotation */}
      <group rotation={[j5Angle * 0.5, 0, j5Angle]}>
        <Segment 
          length={SEGMENTS.lfMetacarpal.length} 
          radius={SEGMENTS.lfMetacarpal.radius} 
          color={color}
          opacity={opacity}
        />
        {/* Knuckle position */}
        <group position={[0, SEGMENTS.lfMetacarpal.length, 0]}>
          {/* J4 - Abduction */}
          <group rotation={[0, j4Angle, 0]}>
            {/* J3 - MCP flexion */}
            <group rotation={[j3Angle, 0, 0]}>
              <Segment 
                length={SEGMENTS.proximal.length} 
                radius={SEGMENTS.proximal.radius} 
                color={color}
                opacity={opacity}
              />
              {/* J2 - PIP flexion */}
              <group position={[0, SEGMENTS.proximal.length, 0]} rotation={[j2Angle, 0, 0]}>
                <Segment 
                  length={SEGMENTS.middle.length} 
                  radius={SEGMENTS.middle.radius} 
                  color={color}
                  opacity={opacity}
                />
                {/* J1 - DIP flexion */}
                <group position={[0, SEGMENTS.middle.length, 0]} rotation={[j1Angle, 0, 0]}>
                  <Segment 
                    length={SEGMENTS.distal.length} 
                    radius={SEGMENTS.distal.radius} 
                    color={color}
                    opacity={opacity}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

// Thumb with unique kinematic structure
const Thumb = ({ 
  basePosition,
  baseRotation,
  j5Angle = 0,
  j4Angle = 0,
  j3Angle = 0,
  j2Angle = 0,
  j1Angle = 0,
  color,
  opacity = 1
}) => {
  // THJ5 opposition brings thumb across palm (rotation in the Z-Y plane)
  // THJ4 is the base flexion bringing thumb forward
  return (
    <group position={basePosition} rotation={baseRotation}>
      {/* THJ5 - Base rotation (opposition) - rotates thumb towards palm center */}
      <group rotation={[j5Angle * 0.4, -j5Angle * 0.5, -j5Angle * 0.8]}>
        {/* THJ4 - Proximal flexion - brings thumb forward and inward */}
        <group rotation={[j4Angle, -j4Angle * 0.3, 0]}>
          <Segment 
            length={SEGMENTS.thumbProximal.length} 
            radius={SEGMENTS.thumbProximal.radius} 
            color={color}
            opacity={opacity}
          />
          {/* THJ3 - Hub joint */}
          <group position={[0, SEGMENTS.thumbProximal.length, 0]} rotation={[j3Angle, 0, 0]}>
            {/* THJ2 - Middle flexion */}
            <group rotation={[j2Angle, 0, 0]}>
              <Segment 
                length={SEGMENTS.thumbMiddle.length} 
                radius={SEGMENTS.thumbMiddle.radius} 
                color={color}
                opacity={opacity}
              />
              {/* THJ1 - Distal flexion */}
              <group position={[0, SEGMENTS.thumbMiddle.length, 0]} rotation={[j1Angle, 0, 0]}>
                <Segment 
                  length={SEGMENTS.thumbDistal.length} 
                  radius={SEGMENTS.thumbDistal.radius} 
                  color={color}
                  opacity={opacity}
                />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};

// Palm - simplified shape based on MuJoCo palm
const Palm = ({ color, opacity = 1 }) => {
  const palmWidth = 0.084 * SCALE;
  const palmHeight = 0.095 * SCALE;
  const palmDepth = 0.034 * SCALE;
  
  return (
    <group>
      <mesh position={[0, palmHeight / 2, 0]}>
        <boxGeometry args={[palmWidth, palmHeight, palmDepth]} />
        <meshStandardMaterial 
          color={color} 
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
    </group>
  );
};

// Complete Shadow Hand assembly
const ShadowHandModel = ({ jointAngles, isGhost = false, colorMiddleRing = true }) => {
  const shadowJoints = useMemo(() => mapPoseToShadowHand(jointAngles), [jointAngles]);
  
  // Get per-finger colors based on state
  const fingerColors = useMemo(() => getFingerColors(jointAngles, isGhost, colorMiddleRing), [jointAngles, isGhost, colorMiddleRing]);
  const opacity = isGhost ? 0.5 : 1;
  
  // Finger base positions from MuJoCo model (relative to palm origin)
  // Palm body is at pos="0 0 0.034" relative to wrist
  // Fingers attach at top of palm (z = 0.095)
  const palmTop = 0.095 * SCALE;
  
  const fingerPositions = {
    FF: [0.033 * SCALE, palmTop, 0],      // Index - rightmost
    MF: [0.011 * SCALE, palmTop + 0.004 * SCALE, 0],  // Middle - slightly higher
    RF: [-0.011 * SCALE, palmTop, 0],     // Ring
    LF: [-0.033 * SCALE, 0.02071 * SCALE, 0], // Pinky metacarpal starts lower
  };
  
  // Thumb base position and orientation from MuJoCo
  // pos="0.034 -0.0085 0.029" quat="0.92388 0 0.382683 0" (22.5 degrees about Y)
  const thumbPos = [0.034 * SCALE, 0.029 * SCALE, -0.0085 * SCALE];
  const thumbRot = [0, Math.PI * 0.125, 0]; // ~22.5 degrees

  return (
    <group rotation={[0, 0, 0]}>
      {/* Palm */}
      <Palm color={fingerColors.palm} opacity={opacity} />
      
      {/* Index Finger (FF) */}
      <StandardFinger
        basePosition={fingerPositions.FF}
        j4Angle={shadowJoints.FFJ4}
        j3Angle={shadowJoints.FFJ3}
        j2Angle={shadowJoints.FFJ2}
        j1Angle={shadowJoints.FFJ1}
        color={fingerColors.index}
        opacity={opacity}
      />
      
      {/* Middle Finger (MF) */}
      <StandardFinger
        basePosition={fingerPositions.MF}
        j4Angle={shadowJoints.MFJ4}
        j3Angle={shadowJoints.MFJ3}
        j2Angle={shadowJoints.MFJ2}
        j1Angle={shadowJoints.MFJ1}
        color={fingerColors.middle}
        opacity={opacity}
      />
      
      {/* Ring Finger (RF) */}
      <StandardFinger
        basePosition={fingerPositions.RF}
        j4Angle={shadowJoints.RFJ4}
        j3Angle={shadowJoints.RFJ3}
        j2Angle={shadowJoints.RFJ2}
        j1Angle={shadowJoints.RFJ1}
        color={fingerColors.ring}
        opacity={opacity}
      />
      
      {/* Little Finger (LF) - has metacarpal */}
      <LittleFinger
        basePosition={fingerPositions.LF}
        j5Angle={shadowJoints.LFJ5}
        j4Angle={shadowJoints.LFJ4}
        j3Angle={shadowJoints.LFJ3}
        j2Angle={shadowJoints.LFJ2}
        j1Angle={shadowJoints.LFJ1}
        color={fingerColors.pinky}
        opacity={opacity}
      />
      
      {/* Thumb */}
      <Thumb
        basePosition={thumbPos}
        baseRotation={thumbRot}
        j5Angle={shadowJoints.THJ5}
        j4Angle={shadowJoints.THJ4}
        j3Angle={shadowJoints.THJ3}
        j2Angle={shadowJoints.THJ2}
        j1Angle={shadowJoints.THJ1}
        color={fingerColors.thumb}
        opacity={opacity}
      />
    </group>
  );
};

// Main component wrapper
const ShadowHand3D = ({ 
  jointAngles, 
  targetJointAngles = null,
  isGhost = false, 
  showLabels = true,
  scale = 1,
  colorMiddleRing = true
}) => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <Canvas
        camera={{ position: [0, 1.5, 3], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, 3, -3]} intensity={0.4} />
        
        {/* Target/Ghost hand (rendered first, behind) */}
        {targetJointAngles && (
          <ShadowHandModel 
            jointAngles={targetJointAngles} 
            isGhost={true}
            colorMiddleRing={colorMiddleRing}
          />
        )}
        
        {/* Current hand */}
        <ShadowHandModel 
          jointAngles={jointAngles} 
          isGhost={isGhost}
          colorMiddleRing={colorMiddleRing}
        />
        
        <OrbitControls 
          enablePan={false}
          minDistance={1.5}
          maxDistance={6}
          target={[0, 0.7, 0]}
        />
      </Canvas>
    </div>
  );
};

export default ShadowHand3D;
