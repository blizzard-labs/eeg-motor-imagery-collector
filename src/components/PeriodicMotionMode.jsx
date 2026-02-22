import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, Download, Settings, Volume2, VolumeX, Camera } from 'lucide-react';
import ShadowHand3D from './ShadowHand3D';
import CameraRecorder from './CameraRecorder';
import { HAND_POSES, getPose, poseToLabeledObject, POSE_NAMES } from '../utils/handPoses';
import { interpolatePoses } from '../utils/interpolation';

/**
 * PeriodicMotionMode Component
 * 
 * Data collection mode for periodic hand motion at a fixed frequency.
 * Hand alternates between neutral and a random target pose.
 * 
 * Trial structure:
 * - Prep Phase: 2000ms (shows upcoming pose, hand stays neutral)
 * - Active Phase: 10000ms (hand alternates between neutral and target at frequency)
 * 
 * During active phase, at each beat (determined by frequency):
 * - Transition to either neutral or target pose
 * - Metronome tick plays
 */

const PeriodicMotionMode = () => {
  // Session state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  
  // Trial state
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [trialSequence, setTrialSequence] = useState([]);
  
  // Pose state
  const [currentJointAngles, setCurrentJointAngles] = useState(getPose('neutral'));
  const [targetJointAngles, setTargetJointAngles] = useState(getPose('neutral'));
  
  // Phase state: 'prep' (2s showing upcoming pose) or 'active' (10s alternating)
  const [phase, setPhase] = useState('prep');
  const [timeInPhase, setTimeInPhase] = useState(0);
  
  // During active phase: track which pose we're moving toward
  const [isMovingToTarget, setIsMovingToTarget] = useState(false);
  const [beatCount, setBeatCount] = useState(0);
  const [transitionProgress, setTransitionProgress] = useState(0);
  
  // Audio
  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioContextRef = useRef(null);
  
  // Data logging
  const [dataLog, setDataLog] = useState([]);
  const sessionStartTimeRef = useRef(null);
  
  // Animation refs
  const animationFrameRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const previousPoseRef = useRef(getPose('neutral'));
  const phaseRef = useRef('prep');
  const timeInPhaseRef = useRef(0);
  const currentTrialIndexRef = useRef(0);
  const targetJointAnglesRef = useRef(getPose('neutral'));
  const currentJointAnglesRef = useRef(getPose('neutral'));
  const trialSequenceRef = useRef([]);
  const isMovingToTargetRef = useRef(false);
  const beatCountRef = useRef(0);
  const lastBeatTimeRef = useRef(0);
  const transitionStartTimeRef = useRef(0);
  const transitionStartPoseRef = useRef(getPose('neutral'));
  
  // Keep refs in sync with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentTrialIndexRef.current = currentTrialIndex; }, [currentTrialIndex]);
  useEffect(() => { targetJointAnglesRef.current = targetJointAngles; }, [targetJointAngles]);
  useEffect(() => { currentJointAnglesRef.current = currentJointAngles; }, [currentJointAngles]);
  useEffect(() => { trialSequenceRef.current = trialSequence; }, [trialSequence]);
  useEffect(() => { isMovingToTargetRef.current = isMovingToTarget; }, [isMovingToTarget]);
  useEffect(() => { beatCountRef.current = beatCount; }, [beatCount]);
  
  // Settings
  const [settings, setSettings] = useState({
    prepDuration: 2000, // ms - prep phase showing upcoming pose
    activeDuration: 10000, // ms - active alternating phase
    frequency: 0.8, // Hz - alternation frequency
    transitionDuration: 300, // ms - smooth transition between poses
    numTrials: 20, // number of different target poses
    interpolationType: 'minimumJerk',
    showTargetHand: true,
    logFrameRate: 30,
    colorMiddleRing: false
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
  
  // Get list of enabled pose names (excluding neutral for sequence generation)
  const getEnabledPoseNames = useCallback(() => {
    return POSE_NAMES.filter(name => name !== 'neutral' && enabledPoses[name]);
  }, [enabledPoses]);
  
  // Calculate beat interval from frequency
  const beatInterval = useMemo(() => 1000 / settings.frequency, [settings.frequency]);
  
  // Initialize audio context
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Play metronome tick
  const playTick = useCallback(() => {
    if (!audioEnabled) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }, [audioEnabled]);
  
  // Generate trial sequence (list of random pose names from enabled poses)
  const generateTrialSequence = useCallback((numTrials, enabledPosesList) => {
    const availablePoses = enabledPosesList.length > 0 
      ? enabledPosesList 
      : POSE_NAMES.filter(p => p !== 'neutral');
    const sequence = [];
    
    for (let i = 0; i < numTrials; i++) {
      const randomIndex = Math.floor(Math.random() * availablePoses.length);
      sequence.push(availablePoses[randomIndex]);
    }
    
    return sequence;
  }, []);
  
  // Initialize trial sequence
  useEffect(() => {
    if (!sessionStarted) {
      const enabledPosesList = getEnabledPoseNames();
      const sequence = generateTrialSequence(settings.numTrials, enabledPosesList);
      setTrialSequence(sequence);
      
      const initialPose = getPose('neutral');
      setCurrentJointAngles(initialPose);
      setTargetJointAngles(initialPose);
      previousPoseRef.current = initialPose;
    }
  }, [sessionStarted, settings.numTrials, generateTrialSequence, getEnabledPoseNames]);

  // Log data point
  const logDataPoint = useCallback((timestamp, currentPose, targetPose, phaseName, trialIndex, targetPoseName, beatNum, movingToTarget) => {
    const dataPoint = {
      timestamp: timestamp,
      sessionTime: timestamp - sessionStartTimeRef.current,
      phase: phaseName,
      trialIndex: trialIndex,
      targetPoseName: targetPoseName,
      beatNumber: beatNum,
      movingToTarget: movingToTarget,
      current: poseToLabeledObject(currentPose),
      target: poseToLabeledObject(targetPose)
    };
    
    setDataLog(prev => [...prev, dataPoint]);
  }, []);

  // Main animation loop
  const animate = useCallback((timestamp) => {
    if (!lastTimestampRef.current) {
      lastTimestampRef.current = timestamp;
      sessionStartTimeRef.current = timestamp;
      lastBeatTimeRef.current = timestamp;
      transitionStartTimeRef.current = timestamp;
    }
    
    const deltaTime = timestamp - lastTimestampRef.current;
    lastTimestampRef.current = timestamp;
    
    const currentPhase = phaseRef.current;
    const currentPhaseDuration = currentPhase === 'prep' ? settings.prepDuration : settings.activeDuration;
    
    // Update time in phase
    timeInPhaseRef.current += deltaTime;
    const newTime = timeInPhaseRef.current;
    setTimeInPhase(newTime);
    
    const currentTrialPoseName = trialSequenceRef.current[currentTrialIndexRef.current] || 'neutral';
    const targetPose = getPose(currentTrialPoseName);
    const neutralPose = getPose('neutral');
    
    if (currentPhase === 'prep') {
      // During prep, hand stays at neutral, show target info
      // Log at specified frame rate
      const logInterval = 1000 / settings.logFrameRate;
      if (newTime % logInterval < deltaTime) {
        logDataPoint(
          timestamp,
          currentJointAnglesRef.current,
          neutralPose,
          'prep',
          currentTrialIndexRef.current,
          currentTrialPoseName,
          0,
          false
        );
      }
    } else if (currentPhase === 'active') {
      // Check if it's time for a new beat
      const timeSinceLastBeat = timestamp - lastBeatTimeRef.current;
      
      if (timeSinceLastBeat >= beatInterval) {
        // New beat!
        playTick();
        lastBeatTimeRef.current = timestamp;
        
        // Toggle direction
        const newMovingToTarget = !isMovingToTargetRef.current;
        setIsMovingToTarget(newMovingToTarget);
        isMovingToTargetRef.current = newMovingToTarget;
        
        // Record transition start
        transitionStartTimeRef.current = timestamp;
        transitionStartPoseRef.current = { ...currentJointAnglesRef.current };
        
        setBeatCount(prev => prev + 1);
        beatCountRef.current += 1;
      }
      
      // Calculate transition progress
      const timeSinceTransitionStart = timestamp - transitionStartTimeRef.current;
      const tProgress = Math.min(timeSinceTransitionStart / settings.transitionDuration, 1);
      setTransitionProgress(tProgress);
      
      // Interpolate pose
      const goalPose = isMovingToTargetRef.current ? targetPose : neutralPose;
      const interpolatedPose = interpolatePoses(
        transitionStartPoseRef.current,
        goalPose,
        tProgress,
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
          goalPose,
          'active',
          currentTrialIndexRef.current,
          currentTrialPoseName,
          beatCountRef.current,
          isMovingToTargetRef.current
        );
      }
    }
    
    // Check for phase transition
    if (newTime >= currentPhaseDuration) {
      if (currentPhase === 'prep') {
        // Move to active phase
        setPhase('active');
        phaseRef.current = 'active';
        timeInPhaseRef.current = 0;
        setTimeInPhase(0);
        setBeatCount(0);
        beatCountRef.current = 0;
        setIsMovingToTarget(false);
        isMovingToTargetRef.current = false;
        lastBeatTimeRef.current = timestamp;
        transitionStartTimeRef.current = timestamp;
        transitionStartPoseRef.current = { ...currentJointAnglesRef.current };
        
        // Play first tick when active phase starts
        playTick();
      } else {
        // Active phase complete, move to next trial
        const nextTrialIndex = currentTrialIndexRef.current + 1;
        
        if (nextTrialIndex >= trialSequenceRef.current.length) {
          // Session complete
          completeSession();
          return;
        }
        
        // Reset for next trial
        setCurrentTrialIndex(nextTrialIndex);
        currentTrialIndexRef.current = nextTrialIndex;
        setPhase('prep');
        phaseRef.current = 'prep';
        timeInPhaseRef.current = 0;
        setTimeInPhase(0);
        setBeatCount(0);
        beatCountRef.current = 0;
        
        // Return to neutral
        const neutralPose = getPose('neutral');
        setCurrentJointAngles(neutralPose);
        currentJointAnglesRef.current = neutralPose;
        previousPoseRef.current = neutralPose;
        setIsMovingToTarget(false);
        isMovingToTargetRef.current = false;
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [settings, beatInterval, logDataPoint, playTick]);

  // Start/stop animation loop
  useEffect(() => {
    if (isRunning && !isPaused) {
      lastTimestampRef.current = null;
      timeInPhaseRef.current = 0;
      lastBeatTimeRef.current = 0;
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
      
      // Initialize audio context on user interaction
      if (!audioContextRef.current && audioEnabled) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
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
    setCurrentTrialIndex(0);
    setPhase('prep');
    setTimeInPhase(0);
    setBeatCount(0);
    setIsMovingToTarget(false);
    setTransitionProgress(0);
    setSessionStarted(false);
    setDataLog([]);
    
    const initialPose = getPose('neutral');
    setCurrentJointAngles(initialPose);
    setTargetJointAngles(initialPose);
    previousPoseRef.current = initialPose;
    lastTimestampRef.current = null;
    sessionStartTimeRef.current = null;
    lastBeatTimeRef.current = 0;
    
    // Reset camera recorder data
    if (cameraRecorderRef.current) {
      cameraRecorderRef.current.reset();
    }
  };

  const downloadData = () => {
    const headers = [
      'timestamp', 'session_time_ms', 'phase', 'trial_index', 'target_pose_name',
      'beat_number', 'moving_to_target',
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
      d.trialIndex,
      d.targetPoseName,
      d.beatNumber,
      d.movingToTarget,
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
    a.download = `periodic_motion_data_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSequence = () => {
    const content = trialSequence.map((pose, i) => `${i},${pose}`).join('\n');
    const blob = new Blob([`index,pose_name\n${content}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `periodic_trial_sequence_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentTrialPoseName = trialSequence[currentTrialIndex] || 'neutral';
  const totalTrialDuration = settings.prepDuration + settings.activeDuration;
  const totalDuration = totalTrialDuration * settings.numTrials;
  const elapsedTime = currentTrialIndex * totalTrialDuration + timeInPhase + (phase === 'active' ? settings.prepDuration : 0);
  const progressPercent = (elapsedTime / totalDuration) * 100;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Periodic Motion Data Collection
              </h1>
              <p className="text-gray-600">
                Alternating hand poses at {settings.frequency}Hz | {settings.numTrials} trials | 
                {(settings.prepDuration / 1000).toFixed(1)}s prep → {(settings.activeDuration / 1000).toFixed(0)}s active
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`p-2 rounded-lg transition ${audioEnabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                title={audioEnabled ? 'Metronome On' : 'Metronome Off'}
              >
                {audioEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
              >
                <Settings size={24} />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-700 mb-3">Session Settings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Frequency (Hz)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="2"
                    value={settings.frequency}
                    onChange={(e) => setSettings(s => ({ ...s, frequency: parseFloat(e.target.value) || 0.8 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                  <span className="text-xs text-gray-500">Beat every {(1000 / settings.frequency).toFixed(0)}ms</span>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Prep Duration (ms)</label>
                  <input
                    type="number"
                    value={settings.prepDuration}
                    onChange={(e) => setSettings(s => ({ ...s, prepDuration: parseInt(e.target.value) || 2000 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Active Duration (ms)</label>
                  <input
                    type="number"
                    value={settings.activeDuration}
                    onChange={(e) => setSettings(s => ({ ...s, activeDuration: parseInt(e.target.value) || 10000 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Transition Duration (ms)</label>
                  <input
                    type="number"
                    value={settings.transitionDuration}
                    onChange={(e) => setSettings(s => ({ ...s, transitionDuration: parseInt(e.target.value) || 300 }))}
                    disabled={sessionStarted}
                    className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Number of Trials</label>
                  <input
                    type="number"
                    value={settings.numTrials}
                    onChange={(e) => setSettings(s => ({ ...s, numTrials: parseInt(e.target.value) || 20 }))}
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
          <div className="flex gap-4 mb-6">
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
            
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              disabled={sessionStarted}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition ${
                cameraEnabled 
                  ? 'bg-orange-600 text-white hover:bg-orange-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } ${sessionStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Camera size={20} />
              {cameraEnabled ? 'Toggle Camera' : 'Toggle Camera'}
            </button>
          </div>

          {/* Progress indicators */}
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Trial</div>
              <div className="text-2xl font-bold text-gray-800">
                {currentTrialIndex + 1} / {trialSequence.length}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Target Pose</div>
              <div className="text-xl font-bold text-gray-800 capitalize">
                {HAND_POSES[currentTrialPoseName]?.name || currentTrialPoseName}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Phase</div>
              <div className={`text-2xl font-bold capitalize ${phase === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>
                {phase}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Beat Count</div>
              <div className="text-2xl font-bold text-gray-800">
                {beatCount}
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

        {/* Main visualization area */}
        <div className={`flex gap-4 ${cameraEnabled ? 'flex-row' : ''}`} style={{ height: '550px' }}>
          {/* Camera view - shown on left when enabled */}
          {cameraEnabled && (
            <div className="w-1/2 bg-gray-900 rounded-lg shadow-lg overflow-hidden">
              <CameraRecorder
                ref={cameraRecorderRef}
                isSessionRunning={isRunning}
                isSessionPaused={isPaused}
                sessionStartTime={sessionStartTimeRef.current}
              />
            </div>
          )}
          
          {/* Hand visualization */}
          <div className={`relative bg-gradient-to-b ${phase === 'prep' ? 'from-yellow-50 to-yellow-100' : 'from-green-50 to-green-100'} rounded-lg shadow-lg transition-colors duration-500 ${cameraEnabled ? 'w-1/2' : 'w-full'}`}
               style={{ height: '100%' }}>
            
            {/* Phase indicator */}
            <div className="absolute top-4 left-4 z-10">
              <div className={`px-4 py-2 rounded-full text-white font-semibold ${phase === 'prep' ? 'bg-yellow-500' : 'bg-green-500'}`}>
                {phase === 'prep' ? 'Get Ready...' : isMovingToTarget ? 'To Target' : 'To Neutral'}
              </div>
            </div>

            {/* Beat visualization - moved to top center */}
            {phase === 'active' && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                <div className="flex items-center gap-4 bg-white/90 px-4 py-2 rounded-full shadow">
                  <div className={`w-8 h-8 rounded-full transition-all duration-100 ${!isMovingToTarget ? 'bg-blue-500 scale-125' : 'bg-gray-300'}`}>
                    <span className="flex items-center justify-center h-full text-white text-xs font-bold">N</span>
                  </div>
                  <div className="h-2 w-20 bg-gray-300 rounded">
                    <div 
                      className="h-full bg-green-500 rounded transition-all"
                      style={{ width: `${transitionProgress * 100}%` }}
                    />
                  </div>
                  <div className={`w-8 h-8 rounded-full transition-all duration-100 ${isMovingToTarget ? 'bg-orange-500 scale-125' : 'bg-gray-300'}`}>
                    <span className="flex items-center justify-center h-full text-white text-xs font-bold">T</span>
                  </div>
                </div>
              </div>
            )}

            {/* Time display */}
            <div className="absolute top-4 right-4 text-right z-10">
              <div className="text-sm text-gray-600 mb-1">
                {phase === 'prep' ? 'Prep Time' : 'Active Time'}
              </div>
              <div className="text-4xl font-bold text-gray-800">
                {phase === 'prep' 
                  ? `${((settings.prepDuration - timeInPhase) / 1000).toFixed(1)}s`
                  : `${((settings.activeDuration - timeInPhase) / 1000).toFixed(1)}s`
                }
              </div>
            </div>

            {/* Hand visualization */}
            <div className="absolute inset-0 flex items-center justify-center pt-8">
              <div className="relative" style={{ width: cameraEnabled ? '90%' : '500px', height: '90%', maxWidth: '500px', maxHeight: '450px' }}>
                <ShadowHand3D 
                  jointAngles={currentJointAngles}
                  targetJointAngles={settings.showTargetHand && phase === 'active' ? (isMovingToTarget ? getPose(currentTrialPoseName) : getPose('neutral')) : null}
                  isGhost={false}
                  showLabels={true}
                  scale={1}
                  colorMiddleRing={settings.colorMiddleRing}
                />
              </div>
            </div>

            {/* Target pose info */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">
                  {phase === 'prep' ? 'Next Target Pose' : 'Alternating Between'}
                </div>
                <div className="text-2xl font-bold text-gray-800 capitalize">
                  {phase === 'prep' ? (
                    HAND_POSES[currentTrialPoseName]?.name || currentTrialPoseName
                  ) : (
                    `Neutral ↔ ${HAND_POSES[currentTrialPoseName]?.name || currentTrialPoseName}`
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {HAND_POSES[currentTrialPoseName]?.description}
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
          <p className="text-sm text-gray-500 mb-3">Click poses to enable/disable them for random selection. Neutral is always the base pose to alternate from.</p>
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
                  poseName === currentTrialPoseName 
                    ? 'border-orange-500 bg-orange-50' 
                    : poseName === 'neutral'
                    ? 'border-blue-500 bg-blue-50 cursor-default'
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

export default PeriodicMotionMode;
