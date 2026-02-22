import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Download, Settings, Camera } from 'lucide-react';
import ShadowHand3D from './ShadowHand3D';
import CameraRecorder from './CameraRecorder';
import { HAND_POSES, getPose, generatePoseSequence, poseToLabeledObject, POSE_NAMES } from '../utils/handPoses';
import { interpolatePoses } from '../utils/interpolation';

/**
 * ContinuousMotionMode Component
 * 
 * Data collection mode for continuous hand motion tracking.
 * Displays a virtual hand that transitions between target poses.
 * 
 * Timeline per target:
 * - Rest/Dwell: 2000ms (current pose held)
 * - Transition to new target: 1200ms (smooth interpolation)
 */

const ContinuousMotionMode = () => {
  // Session state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  
  // Pose state
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [poseSequence, setPoseSequence] = useState([]);
  const [currentJointAngles, setCurrentJointAngles] = useState(getPose('neutral'));
  const [targetJointAngles, setTargetJointAngles] = useState(getPose('neutral'));
  
  // Phase state: 'rest' (holding pose) or 'transition' (moving to new pose)
  const [phase, setPhase] = useState('rest');
  const [phaseProgress, setPhaseProgress] = useState(0); // 0-1 progress within phase
  const [timeInPhase, setTimeInPhase] = useState(0);
  
  // Data logging
  const [dataLog, setDataLog] = useState([]);
  const sessionStartTimeRef = useRef(null);
  
  // Animation refs - use refs for values that need to be read in animation loop
  const animationFrameRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const previousPoseRef = useRef(getPose('neutral'));
  const phaseRef = useRef('rest');
  const timeInPhaseRef = useRef(0);
  const currentPoseIndexRef = useRef(0);
  const targetJointAnglesRef = useRef(getPose('neutral'));
  const currentJointAnglesRef = useRef(getPose('neutral'));
  const poseSequenceRef = useRef([]);
  
  // Keep refs in sync with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentPoseIndexRef.current = currentPoseIndex; }, [currentPoseIndex]);
  useEffect(() => { targetJointAnglesRef.current = targetJointAngles; }, [targetJointAngles]);
  useEffect(() => { currentJointAnglesRef.current = currentJointAngles; }, [currentJointAngles]);
  useEffect(() => { poseSequenceRef.current = poseSequence; }, [poseSequence]);
  
  // Settings
  const [settings, setSettings] = useState({
    restDuration: 2000, // ms
    transitionDuration: 1200, // ms
    numTargets: 50,
    interpolationType: 'minimumJerk',
    showTargetHand: true,
    logFrameRate: 30, // Hz for logging
    colorMiddleRing: false // Color middle and ring fingers
  });
  const [showSettings, setShowSettings] = useState(false);
  
  // Camera recording state
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const cameraRecorderRef = useRef(null);
  
  // Enabled poses for random selection (all enabled by default)
  const [enabledPoses, setEnabledPoses] = useState(() => {
    const initial = {};
    POSE_NAMES.forEach(name => {
      initial[name] = true; // All poses enabled by default
    });
    return initial;
  });
  
  // Calculate total time per target cycle
  const cycleDuration = settings.restDuration + settings.transitionDuration;
  
  // Get list of enabled pose names (excluding neutral for sequence generation)
  const getEnabledPoseNames = useCallback(() => {
    return POSE_NAMES.filter(name => name !== 'neutral' && enabledPoses[name]);
  }, [enabledPoses]);
  
  // Initialize pose sequence
  useEffect(() => {
    if (!sessionStarted) {
      const availablePoses = getEnabledPoseNames();
      const sequence = generatePoseSequence(settings.numTargets, {
        startPose: 'neutral',
        occasionalLargeJump: true,
        largeJumpProbability: 0.12,
        allowedPoses: availablePoses.length > 0 ? availablePoses : POSE_NAMES.filter(p => p !== 'neutral')
      });
      setPoseSequence(sequence);
      
      const initialPose = getPose(sequence[0]);
      setCurrentJointAngles(initialPose);
      setTargetJointAngles(initialPose);
      previousPoseRef.current = initialPose;
    }
  }, [sessionStarted, settings.numTargets, getEnabledPoseNames]);

  // Log data point
  const logDataPoint = useCallback((timestamp, currentPose, targetPose, phaseName, poseIndex, targetPoseName) => {
    const dataPoint = {
      timestamp: timestamp,
      sessionTime: timestamp - sessionStartTimeRef.current,
      phase: phaseName,
      poseIndex: poseIndex,
      targetPoseName: targetPoseName,
      current: poseToLabeledObject(currentPose),
      target: poseToLabeledObject(targetPose)
    };
    
    setDataLog(prev => [...prev, dataPoint]);
  }, []);

  // Main animation loop - uses refs to avoid stale closures
  const animate = useCallback((timestamp) => {
    if (!lastTimestampRef.current) {
      lastTimestampRef.current = timestamp;
      sessionStartTimeRef.current = timestamp;
    }
    
    const deltaTime = timestamp - lastTimestampRef.current;
    lastTimestampRef.current = timestamp;
    
    // Use refs for current values to avoid stale closures
    const currentPhase = phaseRef.current;
    const currentPhaseDuration = currentPhase === 'rest' ? settings.restDuration : settings.transitionDuration;
    
    // Update time in phase
    timeInPhaseRef.current += deltaTime;
    const newTime = timeInPhaseRef.current;
    setTimeInPhase(newTime);
    
    // Update progress
    const progress = Math.min(newTime / currentPhaseDuration, 1);
    setPhaseProgress(progress);
    
    // During transition, interpolate pose
    if (currentPhase === 'transition') {
      const interpolatedPose = interpolatePoses(
        previousPoseRef.current,
        targetJointAnglesRef.current,
        progress,
        settings.interpolationType
      );
      setCurrentJointAngles(interpolatedPose);
      currentJointAnglesRef.current = interpolatedPose;
      
      // Log at specified frame rate
      const logInterval = 1000 / settings.logFrameRate;
      if (newTime % logInterval < deltaTime) {
        logDataPoint(
          timestamp,
          interpolatedPose,
          targetJointAnglesRef.current,
          'transition',
          currentPoseIndexRef.current,
          poseSequenceRef.current[currentPoseIndexRef.current]
        );
      }
    } else if (currentPhase === 'rest') {
      // Log at specified frame rate during rest
      const logInterval = 1000 / settings.logFrameRate;
      if (newTime % logInterval < deltaTime) {
        logDataPoint(
          timestamp,
          currentJointAnglesRef.current,
          targetJointAnglesRef.current,
          'rest',
          currentPoseIndexRef.current,
          poseSequenceRef.current[currentPoseIndexRef.current]
        );
      }
    }
    
    // Check for phase transition
    if (newTime >= currentPhaseDuration) {
      if (currentPhase === 'rest') {
        // Move to transition phase with next target
        const nextIndex = currentPoseIndexRef.current + 1;
        
        if (nextIndex >= poseSequenceRef.current.length) {
          // Session complete
          completeSession();
          return;
        }
        
        previousPoseRef.current = { ...currentJointAnglesRef.current };
        const nextTarget = getPose(poseSequenceRef.current[nextIndex]);
        setTargetJointAngles(nextTarget);
        targetJointAnglesRef.current = nextTarget;
        setCurrentPoseIndex(nextIndex);
        currentPoseIndexRef.current = nextIndex;
        setPhase('transition');
        phaseRef.current = 'transition';
        timeInPhaseRef.current = 0;
        setTimeInPhase(0);
      } else {
        // Transition complete, enter rest phase
        const finalPose = { ...targetJointAnglesRef.current };
        setCurrentJointAngles(finalPose);
        currentJointAnglesRef.current = finalPose;
        previousPoseRef.current = finalPose;
        setPhase('rest');
        phaseRef.current = 'rest';
        timeInPhaseRef.current = 0;
        setTimeInPhase(0);
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [settings, logDataPoint]);

  // Start/stop animation loop
  useEffect(() => {
    if (isRunning && !isPaused) {
      lastTimestampRef.current = null;
      timeInPhaseRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, isPaused, animate]);

  const completeSession = () => {
    setIsRunning(false);
    setIsPaused(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    alert('Session complete! Download the kinematic data.');
  };

  const startSession = () => {
    if (!sessionStarted) {
      setSessionStarted(true);
      setDataLog([]);
    }
    setIsRunning(true);
    setIsPaused(false);
  };

  const pauseSession = () => {
    setIsPaused(!isPaused);
  };

  const resetSession = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    setIsRunning(false);
    setIsPaused(false);
    setCurrentPoseIndex(0);
    setPhase('rest');
    setPhaseProgress(0);
    setTimeInPhase(0);
    setSessionStarted(false);
    setDataLog([]);
    
    const initialPose = getPose('neutral');
    setCurrentJointAngles(initialPose);
    setTargetJointAngles(initialPose);
    previousPoseRef.current = initialPose;
    lastTimestampRef.current = null;
    sessionStartTimeRef.current = null;
    
    // Reset camera recorder data
    if (cameraRecorderRef.current) {
      cameraRecorderRef.current.reset();
    }
  };

  const downloadData = () => {
    // Create CSV content
    const headers = [
      'timestamp', 'session_time_ms', 'phase', 'pose_index', 'target_pose_name',
      'current_thumb_cmc', 'current_thumb_mcp', 'current_thumb_ip',
      'current_index_mcp', 'current_index_pip', 'current_index_dip',
      'current_pinky_mcp', 'current_pinky_pip', 'current_pinky_dip',
      'target_thumb_cmc', 'target_thumb_mcp', 'target_thumb_ip',
      'target_index_mcp', 'target_index_pip', 'target_index_dip',
      'target_pinky_mcp', 'target_pinky_pip', 'target_pinky_dip'
    ];
    
    const rows = dataLog.map(d => [
      d.timestamp,
      d.sessionTime,
      d.phase,
      d.poseIndex,
      d.targetPoseName,
      d.current.thumb_cmc, d.current.thumb_mcp, d.current.thumb_ip,
      d.current.index_mcp, d.current.index_pip, d.current.index_dip,
      d.current.pinky_mcp, d.current.pinky_pip, d.current.pinky_dip,
      d.target.thumb_cmc, d.target.thumb_mcp, d.target.thumb_ip,
      d.target.index_mcp, d.target.index_pip, d.target.index_dip,
      d.target.pinky_mcp, d.target.pinky_pip, d.target.pinky_dip
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `continuous_motion_data_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSequence = () => {
    const content = poseSequence.map((pose, i) => `${i},${pose}`).join('\n');
    const blob = new Blob([`index,pose_name\n${content}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pose_sequence_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentPoseName = poseSequence[currentPoseIndex] || 'neutral';
  const totalDuration = (settings.restDuration + settings.transitionDuration) * settings.numTargets;
  const elapsedTime = currentPoseIndex * cycleDuration + timeInPhase + (phase === 'transition' ? settings.restDuration : 0);
  const progressPercent = (elapsedTime / totalDuration) * 100;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Continuous Motion Data Collection
              </h1>
              <p className="text-gray-600">
                Track continuous finger movements: {settings.numTargets} target poses | 
                Rest: {settings.restDuration}ms → Transition: {settings.transitionDuration}ms
              </p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              <Settings size={24} />
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-700 mb-3">Session Settings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Rest Duration (ms)</label>
                  <input
                    type="number"
                    value={settings.restDuration}
                    onChange={(e) => setSettings(s => ({ ...s, restDuration: parseInt(e.target.value) || 2000 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Transition Duration (ms)</label>
                  <input
                    type="number"
                    value={settings.transitionDuration}
                    onChange={(e) => setSettings(s => ({ ...s, transitionDuration: parseInt(e.target.value) || 1200 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Number of Targets</label>
                  <input
                    type="number"
                    value={settings.numTargets}
                    onChange={(e) => setSettings(s => ({ ...s, numTargets: parseInt(e.target.value) || 50 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Log Frame Rate (Hz)</label>
                  <input
                    type="number"
                    value={settings.logFrameRate}
                    onChange={(e) => setSettings(s => ({ ...s, logFrameRate: parseInt(e.target.value) || 30 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showTargetHand}
                    onChange={(e) => setSettings(s => ({ ...s, showTargetHand: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600">Show ghost target hand</span>
                </label>
              </div>
            </div>
          )}
          
          {/* Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            <button
              onClick={startSession}
              disabled={isRunning && !isPaused}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              <Play size={20} />
              {sessionStarted ? 'Resume' : 'Start Session'}
            </button>
            
            <button
              onClick={pauseSession}
              disabled={!isRunning}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              <Pause size={20} />
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            
            <button
              onClick={resetSession}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              <RotateCcw size={20} />
              Reset
            </button>
            
            <button
              onClick={downloadData}
              disabled={dataLog.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              <Download size={20} />
              Download Data
            </button>
            
            <button
              onClick={downloadSequence}
              disabled={!sessionStarted}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              <Download size={20} />
              Sequence
            </button>
            
            {/* Camera Recording Toggle */}
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              disabled={isRunning}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition ${
                cameraEnabled 
                  ? 'bg-pink-600 text-white hover:bg-pink-700' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Camera size={20} />
              {cameraEnabled ? 'Toggle Camera' : 'Toggle Camera'}
            </button>
          </div>

          {/* Progress indicators */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Target</div>
              <div className="text-2xl font-bold text-gray-800">
                {currentPoseIndex + 1} / {poseSequence.length}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Current Pose</div>
              <div className="text-xl font-bold text-gray-800 capitalize">
                {HAND_POSES[currentPoseName]?.name || currentPoseName}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Phase</div>
              <div className={`text-2xl font-bold capitalize ${phase === 'transition' ? 'text-blue-600' : 'text-green-600'}`}>
                {phase}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Data Points</div>
              <div className="text-2xl font-bold text-gray-800">
                {dataLog.length}
              </div>
            </div>
          </div>

        </div>

        {/* Main visualization area - Split screen when camera enabled */}
        <div className={`flex gap-4 ${cameraEnabled ? 'flex-row' : 'flex-col'}`}>
          {/* Virtual Hand View */}
          <div className={`relative bg-gradient-to-b ${phase === 'transition' ? 'from-blue-50 to-blue-100' : 'from-green-50 to-green-100'} rounded-lg shadow-lg transition-colors duration-500 ${cameraEnabled ? 'flex-1' : 'w-full'}`}
               style={{ height: '550px' }}>
            
            {/* Phase indicator */}
            <div className="absolute top-4 left-4 z-10">
              <div className={`px-4 py-2 rounded-full text-white font-semibold ${phase === 'transition' ? 'bg-blue-500' : 'bg-green-500'}`}>
                {phase === 'transition' ? '🎯 Moving to target...' : '✋ Hold pose'}
              </div>
            </div>

            {/* Time display */}
            <div className="absolute top-4 right-4 text-right z-10">
              <div className="text-sm text-gray-600 mb-1">
                {phase === 'rest' ? 'Hold Time' : 'Transition Time'}
              </div>
              <div className="text-4xl font-bold text-gray-800">
                {phase === 'rest' 
                  ? `${((settings.restDuration - timeInPhase) / 1000).toFixed(1)}s`
                  : `${((settings.transitionDuration - timeInPhase) / 1000).toFixed(1)}s`
                }
              </div>
            </div>

            {/* Hand visualization */}
            <div className="absolute inset-0 flex items-center justify-center pt-8">
              <div className="relative" style={{ width: cameraEnabled ? '400px' : '500px', height: cameraEnabled ? '380px' : '450px' }}>
                {/* 3D Shadow Robot Hand */}
                <ShadowHand3D 
                  jointAngles={currentJointAngles}
                  targetJointAngles={settings.showTargetHand && phase === 'transition' ? targetJointAngles : null}
                  isGhost={false}
                  showLabels={true}
                  scale={cameraEnabled ? 0.85 : 1}
                  colorMiddleRing={settings.colorMiddleRing}
                />
              </div>
            </div>

            {/* Target pose name */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Target Pose</div>
                <div className="text-2xl font-bold text-gray-800 capitalize">
                  {HAND_POSES[currentPoseName]?.name || currentPoseName}
                </div>
                <div className="text-sm text-gray-500">
                  {HAND_POSES[currentPoseName]?.description}
                </div>
              </div>
            </div>

            {/* Status overlays */}
            {!isRunning && !sessionStarted && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                <div className="text-2xl text-gray-700 bg-white/90 px-6 py-4 rounded-lg shadow">
                  Press "Start Session" to begin
                </div>
              </div>
            )}

            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                <div className="text-3xl text-yellow-600 bg-white/95 px-8 py-4 rounded-lg shadow font-bold">
                  PAUSED
                </div>
              </div>
            )}
          </div>
          
          {/* Camera Recording View - Only shown when enabled */}
          {cameraEnabled && (
            <div className="flex-1 bg-gray-900 rounded-lg shadow-lg p-4" style={{ height: '550px' }}>
              <div className="text-white text-lg font-semibold mb-3 flex items-center gap-2">
                <Camera size={20} />
                Camera & Hand Tracking
              </div>
              <CameraRecorder
                ref={cameraRecorderRef}
                isSessionRunning={isRunning}
                isSessionPaused={isPaused}
                sessionStartTime={sessionStartTimeRef.current}
                onHandData={(landmarks, timestamp) => {
                  // Optional: process hand data here
                }}
              />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          {/* Color Legend */}
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">Finger State Colors</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.colorMiddleRing}
                  onChange={(e) => setSettings(prev => ({ ...prev, colorMiddleRing: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Show colors on middle & ring fingers</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#a8d5a2' }}></div>
                <span className="text-sm text-gray-700"><strong>Relaxed</strong> - Neutral/resting</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#7eb8da' }}></div>
                <span className="text-sm text-gray-700"><strong>Extended</strong> - Fully open</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#e88a5c' }}></div>
                <span className="text-sm text-gray-700"><strong>Flexed</strong> - Curled/closed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#c9a0dc' }}></div>
                <span className="text-sm text-gray-700"><strong>Hooked</strong> - Hook grip</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#f5d76e' }}></div>
                <span className="text-sm text-gray-700"><strong>Pinch</strong> - Precision grip</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pose Library Reference */}
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-800">Pose Library</h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {getEnabledPoseNames().length} poses enabled
              </span>
              <button
                onClick={() => {
                  const allEnabled = {};
                  POSE_NAMES.forEach(name => { allEnabled[name] = true; });
                  setEnabledPoses(allEnabled);
                }}
                disabled={sessionStarted}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Enable All
              </button>
              <button
                onClick={() => {
                  const noneEnabled = {};
                  POSE_NAMES.forEach(name => { noneEnabled[name] = name === 'neutral'; });
                  setEnabledPoses(noneEnabled);
                }}
                disabled={sessionStarted}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Disable All
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-3">Click poses to enable/disable them for random selection. Neutral is always available as the starting pose.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POSE_NAMES.map(poseName => (
              <div 
                key={poseName}
                onClick={() => {
                  if (!sessionStarted && poseName !== 'neutral') {
                    setEnabledPoses(prev => ({ ...prev, [poseName]: !prev[poseName] }));
                  }
                }}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  poseName === currentPoseName 
                    ? 'border-blue-500 bg-blue-50' 
                    : poseName === 'neutral'
                    ? 'border-gray-300 bg-gray-50 cursor-default'
                    : enabledPoses[poseName]
                    ? 'border-green-500 bg-green-50 hover:bg-green-100'
                    : 'border-gray-200 bg-gray-100 opacity-50 hover:opacity-75'
                } ${sessionStarted ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm capitalize">{HAND_POSES[poseName].name}</div>
                  {poseName !== 'neutral' && (
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      enabledPoses[poseName] ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}>
                      {enabledPoses[poseName] && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500">{HAND_POSES[poseName].description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContinuousMotionMode;
