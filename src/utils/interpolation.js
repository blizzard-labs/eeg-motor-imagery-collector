/**
 * Interpolation utilities for smooth pose transitions
 */

/**
 * Linear interpolation between two values
 */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Minimum-jerk interpolation (smoother than linear)
 * Creates a smooth S-curve that starts and ends with zero velocity/acceleration
 * Formula: 10t³ - 15t⁴ + 6t⁵
 */
export const minimumJerk = (t) => {
  const t3 = t * t * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return 10 * t3 - 15 * t4 + 6 * t5;
};

/**
 * Ease-in-out interpolation (simpler smooth curve)
 */
export const easeInOut = (t) => {
  return t < 0.5 
    ? 2 * t * t 
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

/**
 * Cubic bezier interpolation
 */
export const cubicBezier = (t, p1 = 0.4, p2 = 0.6) => {
  // Simple cubic bezier approximation
  const t2 = t * t;
  const t3 = t2 * t;
  return 3 * t * (1 - t) * (1 - t) * p1 + 3 * t2 * (1 - t) * p2 + t3;
};

/**
 * Interpolate between two joint angle objects
 */
export const interpolateJoints = (joints1, joints2, t, interpolationType = 'minimumJerk') => {
  // Apply interpolation curve
  let smoothT;
  switch (interpolationType) {
    case 'linear':
      smoothT = t;
      break;
    case 'easeInOut':
      smoothT = easeInOut(t);
      break;
    case 'minimumJerk':
    default:
      smoothT = minimumJerk(t);
      break;
  }
  
  const result = {};
  
  for (const joint in joints1) {
    if (joints2[joint] !== undefined) {
      result[joint] = lerp(joints1[joint], joints2[joint], smoothT);
    }
  }
  
  return result;
};

/**
 * Interpolate between two complete hand poses
 */
export const interpolatePoses = (pose1, pose2, t, interpolationType = 'minimumJerk') => {
  return {
    thumb: interpolateJoints(pose1.thumb, pose2.thumb, t, interpolationType),
    index: interpolateJoints(pose1.index, pose2.index, t, interpolationType),
    pinky: interpolateJoints(pose1.pinky, pose2.pinky, t, interpolationType)
  };
};

/**
 * Generate keyframes for a transition
 */
export const generateTransitionKeyframes = (startPose, endPose, durationMs, frameRateHz = 60) => {
  const numFrames = Math.ceil((durationMs / 1000) * frameRateHz);
  const keyframes = [];
  
  for (let i = 0; i <= numFrames; i++) {
    const t = i / numFrames;
    const timeMs = (i / frameRateHz) * 1000;
    const pose = interpolatePoses(startPose, endPose, t);
    
    keyframes.push({
      time: timeMs,
      t,
      pose
    });
  }
  
  return keyframes;
};

export default {
  lerp,
  minimumJerk,
  easeInOut,
  interpolateJoints,
  interpolatePoses,
  generateTransitionKeyframes
};
