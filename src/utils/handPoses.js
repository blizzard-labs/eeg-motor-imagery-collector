/**
 * Hand Poses Library
 * 
 * Each pose is defined as a vector of joint angles for thumb, index, and pinky.
 * Joint angles are normalized [0, 1] where:
 * - 0 = fully extended
 * - 1 = fully flexed
 * 
 * Thumb joints: CMC (opposition), MCP (flexion), IP (flexion)
 * Index/Pinky joints: MCP (flexion), PIP (flexion), DIP (flexion)
 */

export const HAND_POSES = {
  // Neutral/Relaxed pose - slight natural curl
  neutral: {
    name: 'Neutral',
    description: 'Relaxed neutral position',
    thumb: { cmc: 0.1, mcp: 0.15, ip: 0.1 },
    index: { mcp: 0.15, pip: 0.15, dip: 0.1 },
    pinky: { mcp: 0.2, pip: 0.2, dip: 0.15 }
  },
  
  // Open hand - all fingers extended
  open: {
    name: 'Open Hand',
    description: 'All fingers fully extended',
    thumb: { cmc: 0.3, mcp: 0, ip: 0 },
    index: { mcp: 0, pip: 0, dip: 0 },
    pinky: { mcp: 0, pip: 0, dip: 0 }
  },
  
  // Closed grasp - all fingers flexed
  closedGrasp: {
    name: 'Closed Grasp',
    description: 'All fingers in grasp position',
    thumb: { cmc: 0.7, mcp: 0.8, ip: 0.7 },
    index: { mcp: 0.85, pip: 0.9, dip: 0.8 },
    pinky: { mcp: 0.9, pip: 0.95, dip: 0.85 }
  },
  
  // Thumb-Index pinch
  thumbIndexPinch: {
    name: 'Thumb-Index Pinch',
    description: 'Thumb and index finger pinch, pinky relaxed',
    thumb: { cmc: 0.85, mcp: 0.7, ip: 0.5 },
    index: { mcp: 0.65, pip: 0.7, dip: 0.55 },
    pinky: { mcp: 0.3, pip: 0.35, dip: 0.25 }
  },
  
  // Index only extension
  indexExtension: {
    name: 'Index Extension',
    description: 'Index finger extended, others flexed',
    thumb: { cmc: 0.4, mcp: 0.6, ip: 0.5 },
    index: { mcp: 0, pip: 0, dip: 0 },
    pinky: { mcp: 0.8, pip: 0.85, dip: 0.75 }
  },
  
  // Pinky only extension
  pinkyExtension: {
    name: 'Pinky Extension',
    description: 'Pinky finger extended, others flexed',
    thumb: { cmc: 0.4, mcp: 0.6, ip: 0.5 },
    index: { mcp: 0.8, pip: 0.85, dip: 0.75 },
    pinky: { mcp: 0, pip: 0, dip: 0 }
  },
  
  // Maximal index-pinky span (spread)
  indexPinkySpan: {
    name: 'Index-Pinky Span',
    description: 'Index and pinky extended and spread',
    thumb: { cmc: 0.5, mcp: 0.4, ip: 0.3 },
    index: { mcp: 0, pip: 0, dip: 0 },
    pinky: { mcp: 0, pip: 0, dip: 0 }
  },
  
  // Thumb opposition (thumb crosses palm)
  thumbOpposition: {
    name: 'Thumb Opposition',
    description: 'Thumb opposed across palm',
    thumb: { cmc: 0.9, mcp: 0.3, ip: 0.2 },
    index: { mcp: 0.2, pip: 0.25, dip: 0.15 },
    pinky: { mcp: 0.25, pip: 0.3, dip: 0.2 }
  },
  
  // Thumb-Pinky pinch
  thumbPinkyPinch: {
    name: 'Thumb-Pinky Pinch',
    description: 'Thumb and pinky pinch, index relaxed',
    thumb: { cmc: 1.0, mcp: 0.75, ip: 0.6 },
    index: { mcp: 0.25, pip: 0.3, dip: 0.2 },
    pinky: { mcp: 0.7, pip: 0.75, dip: 0.6 }
  },
  
  // Three finger pinch (all three touch)
  threeFingerPinch: {
    name: 'Three Finger Pinch',
    description: 'Thumb, index, and pinky meet',
    thumb: { cmc: 0.9, mcp: 0.7, ip: 0.55 },
    index: { mcp: 0.6, pip: 0.65, dip: 0.5 },
    pinky: { mcp: 0.65, pip: 0.7, dip: 0.55 }
  },
  
  // Index hook
  indexHook: {
    name: 'Index Hook',
    description: 'Index finger hooked, others relaxed',
    thumb: { cmc: 0.2, mcp: 0.2, ip: 0.15 },
    index: { mcp: 0.1, pip: 0.9, dip: 0.85 },
    pinky: { mcp: 0.25, pip: 0.3, dip: 0.2 }
  },
  
  // Pinky hook
  pinkyHook: {
    name: 'Pinky Hook',
    description: 'Pinky finger hooked, others relaxed',
    thumb: { cmc: 0.2, mcp: 0.2, ip: 0.15 },
    index: { mcp: 0.2, pip: 0.25, dip: 0.15 },
    pinky: { mcp: 0.1, pip: 0.9, dip: 0.85 }
  }
};

// Get pose names as array
export const POSE_NAMES = Object.keys(HAND_POSES);

// Get a pose by name
export const getPose = (poseName) => {
  return HAND_POSES[poseName] || HAND_POSES.neutral;
};

// Calculate Euclidean distance between two poses in synergy space
export const poseSynergyDistance = (pose1, pose2) => {
  let sumSquares = 0;
  
  ['thumb', 'index', 'pinky'].forEach(finger => {
    const joints1 = pose1[finger];
    const joints2 = pose2[finger];
    
    Object.keys(joints1).forEach(joint => {
      if (joints2[joint] !== undefined) {
        const diff = joints1[joint] - joints2[joint];
        sumSquares += diff * diff;
      }
    });
  });
  
  return Math.sqrt(sumSquares);
};

// Generate a sequence of poses that minimizes large jumps
export const generatePoseSequence = (numPoses, options = {}) => {
  const {
    startPose = 'neutral',
    allowRepeats = false,
    maxConsecutiveSimilar = 2,
    occasionalLargeJump = true,
    largeJumpProbability = 0.15,
    allowedPoses = null // If provided, only use these poses (excluding startPose)
  } = options;
  
  const sequence = [startPose];
  const poseNames = allowedPoses 
    ? allowedPoses.filter(p => p !== startPose)
    : POSE_NAMES.filter(p => p !== startPose);
  
  // If no poses available, just return the start pose repeated
  if (poseNames.length === 0) {
    return Array(numPoses).fill(startPose);
  }
  
  // Build distance matrix
  const distances = {};
  POSE_NAMES.forEach(p1 => {
    distances[p1] = {};
    POSE_NAMES.forEach(p2 => {
      distances[p1][p2] = poseSynergyDistance(HAND_POSES[p1], HAND_POSES[p2]);
    });
  });
  
  for (let i = 1; i < numPoses; i++) {
    const currentPose = sequence[sequence.length - 1];
    
    // Get candidates sorted by distance
    let candidates = [...poseNames];
    if (!allowRepeats) {
      // Avoid immediate repeats
      candidates = candidates.filter(p => p !== currentPose);
    }
    
    // Sort by distance from current pose
    candidates.sort((a, b) => distances[currentPose][a] - distances[currentPose][b]);
    
    // Decide whether to make a large jump
    const makeLargeJump = occasionalLargeJump && Math.random() < largeJumpProbability;
    
    let selectedPose;
    if (makeLargeJump && candidates.length > 3) {
      // Pick from distant poses
      const farPoses = candidates.slice(Math.floor(candidates.length * 0.6));
      selectedPose = farPoses[Math.floor(Math.random() * farPoses.length)];
    } else {
      // Pick from nearby poses (top 40%)
      const nearPoses = candidates.slice(0, Math.max(3, Math.floor(candidates.length * 0.4)));
      selectedPose = nearPoses[Math.floor(Math.random() * nearPoses.length)];
    }
    
    sequence.push(selectedPose);
  }
  
  return sequence;
};

// Convert pose to flat vector for logging
export const poseToVector = (pose) => {
  return [
    pose.thumb.cmc, pose.thumb.mcp, pose.thumb.ip,
    pose.index.mcp, pose.index.pip, pose.index.dip,
    pose.pinky.mcp, pose.pinky.pip, pose.pinky.dip
  ];
};

// Convert pose to labeled object for logging
export const poseToLabeledObject = (pose) => {
  return {
    thumb_cmc: pose.thumb.cmc,
    thumb_mcp: pose.thumb.mcp,
    thumb_ip: pose.thumb.ip,
    index_mcp: pose.index.mcp,
    index_pip: pose.index.pip,
    index_dip: pose.index.dip,
    pinky_mcp: pose.pinky.mcp,
    pinky_pip: pose.pinky.pip,
    pinky_dip: pose.pinky.dip
  };
};

export default HAND_POSES;
