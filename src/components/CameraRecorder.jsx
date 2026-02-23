import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Camera, Video, VideoOff, Download, Circle, Square } from 'lucide-react';

/**
 * CameraRecorder Component
 * 
 * Records webcam video and uses MediaPipe Hands for hand tracking.
 * Provides hand landmark data at each frame for logging.
 * 
 * Props:
 * - isSessionRunning: boolean - whether the session is currently running
 * - isSessionPaused: boolean - whether the session is paused
 * - onHandData: callback(landmarks, timestamp) - called with hand data each frame
 * - sessionStartTime: number - timestamp when session started (for syncing)
 */

// MediaPipe hand landmark names for CSV headers
const LANDMARK_NAMES = [
  'WRIST',
  'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
  'INDEX_FINGER_MCP', 'INDEX_FINGER_PIP', 'INDEX_FINGER_DIP', 'INDEX_FINGER_TIP',
  'MIDDLE_FINGER_MCP', 'MIDDLE_FINGER_PIP', 'MIDDLE_FINGER_DIP', 'MIDDLE_FINGER_TIP',
  'RING_FINGER_MCP', 'RING_FINGER_PIP', 'RING_FINGER_DIP', 'RING_FINGER_TIP',
  'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP'
];

const CameraRecorder = forwardRef(({ 
  isSessionRunning, 
  isSessionPaused, 
  onHandData,
  sessionStartTime 
}, ref) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [handTrackingLog, setHandTrackingLog] = useState([]);
  const [error, setError] = useState(null);
  
  // Raw (no overlay) recording state
  const [recordRawFeed, setRecordRawFeed] = useState(false);
  const [rawRecordedChunks, setRawRecordedChunks] = useState([]);
  const rawMediaRecorderRef = useRef(null);
  const rawRecordedChunksRef = useRef([]);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const handsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastProcessTimeRef = useRef(0);
  const handTrackingLogRef = useRef([]);
  const isRecordingRef = useRef(false);
  const isSessionPausedRef = useRef(false);
  const sessionStartTimeRef = useRef(sessionStartTime);
  const onHandDataRef = useRef(onHandData);
  const cameraReadyRef = useRef(false);
  const recordedChunksRef = useRef([]);
  
  // Throttled frame count for UI display (avoid re-renders every frame)
  const [trackedFrameCount, setTrackedFrameCount] = useState(0);
  const frameCountIntervalRef = useRef(null);
  
  // Keep refs in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  useEffect(() => {
    isSessionPausedRef.current = isSessionPaused;
  }, [isSessionPaused]);
  useEffect(() => {
    sessionStartTimeRef.current = sessionStartTime;
  }, [sessionStartTime]);
  useEffect(() => {
    onHandDataRef.current = onHandData;
  }, [onHandData]);
  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);
  
  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    isEnabled: () => isEnabled,
    isRecording: () => isRecordingRef.current,
    getHandTrackingLog: () => handTrackingLogRef.current,
    downloadVideo: () => downloadVideo(),
    downloadHandData: () => downloadHandData(),
    hasData: () => recordedChunksRef.current.length > 0 || handTrackingLogRef.current.length > 0 || rawRecordedChunksRef.current.length > 0,
    reset: () => {
      setRecordedChunks([]);
      recordedChunksRef.current = [];
      setRawRecordedChunks([]);
      rawRecordedChunksRef.current = [];
      setHandTrackingLog([]);
      handTrackingLogRef.current = [];
      setTrackedFrameCount(0);
      if (frameCountIntervalRef.current) {
        clearInterval(frameCountIntervalRef.current);
        frameCountIntervalRef.current = null;
      }
    }
  }));
  
  // Initialize MediaPipe Hands
  const initializeMediaPipe = useCallback(async () => {
    try {
      // Dynamic import for MediaPipe
      const { Hands } = await import('@mediapipe/hands');
      
      const hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });
      
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      hands.onResults((results) => {
        if (!canvasRef.current) return;
        
        const ctx = canvasRef.current.getContext('2d');
        const { width, height } = canvasRef.current;
        
        // Clear and draw video frame
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        
        // Mirror the video
        ctx.scale(-1, 1);
        ctx.translate(-width, 0);
        
        if (videoRef.current) {
          ctx.drawImage(videoRef.current, 0, 0, width, height);
        }
        
        ctx.restore();
        
        // Draw hand landmarks
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          setHandDetected(true);
          const landmarks = results.multiHandLandmarks[0];
          
          // Draw connections
          drawConnections(ctx, landmarks, width, height);
          
          // Draw landmarks
          drawLandmarks(ctx, landmarks, width, height);
          
          // Log hand data if recording (use refs to avoid stale closures)
          if (isRecordingRef.current && !isSessionPausedRef.current) {
            const timestamp = Date.now();
            const startTime = sessionStartTimeRef.current;
            const sessionTime = startTime ? timestamp - startTime : timestamp;
            
            const logEntry = {
              timestamp,
              sessionTime,
              landmarks: landmarks.map((lm, i) => ({
                name: LANDMARK_NAMES[i],
                x: lm.x,
                y: lm.y,
                z: lm.z
              }))
            };
            
            handTrackingLogRef.current.push(logEntry);
            
            if (onHandDataRef.current) {
              onHandDataRef.current(landmarks, timestamp);
            }
          }
        } else {
          setHandDetected(false);
        }
      });
      
      handsRef.current = hands;
      return hands;
    } catch (err) {
      console.error('Failed to initialize MediaPipe:', err);
      setError('Failed to initialize hand tracking');
      return null;
    }
  }, []);
  
  // Draw hand connections
  const drawConnections = (ctx, landmarks, width, height) => {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm
    ];
    
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    
    connections.forEach(([i, j]) => {
      const start = landmarks[i];
      const end = landmarks[j];
      
      ctx.beginPath();
      ctx.moveTo((1 - start.x) * width, start.y * height);
      ctx.lineTo((1 - end.x) * width, end.y * height);
      ctx.stroke();
    });
  };
  
  // Draw hand landmarks
  const drawLandmarks = (ctx, landmarks, width, height) => {
    landmarks.forEach((lm, i) => {
      const x = (1 - lm.x) * width;
      const y = lm.y * height;
      
      // Different colors for different fingers
      let color = '#FF0000';
      if (i >= 1 && i <= 4) color = '#FF6B6B'; // Thumb
      else if (i >= 5 && i <= 8) color = '#4ECDC4'; // Index
      else if (i >= 9 && i <= 12) color = '#45B7D1'; // Middle
      else if (i >= 13 && i <= 16) color = '#96CEB4'; // Ring
      else if (i >= 17 && i <= 20) color = '#DDA0DD'; // Pinky
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 8 : 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // White border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };
  
  // Process video frames - defined as a ref-based loop to avoid circular deps
  const processFrameRef = useRef(null);
  
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !handsRef.current || !cameraReadyRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
      return;
    }
    
    const now = Date.now();
    // Process at ~30fps
    if (now - lastProcessTimeRef.current >= 33) {
      lastProcessTimeRef.current = now;
      
      try {
        await handsRef.current.send({ image: videoRef.current });
      } catch (err) {
        // Ignore processing errors
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
  }, []);
  
  // Keep processFrame ref in sync
  useEffect(() => {
    processFrameRef.current = processFrame;
  }, [processFrame]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // Initialize MediaPipe
      await initializeMediaPipe();
      
      setCameraReady(true);
      cameraReadyRef.current = true;
      
      // Start processing frames
      processFrameRef.current?.();
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please allow camera permissions.');
      setIsEnabled(false);
    }
  }, [initializeMediaPipe]);
  
  // Stop camera
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (frameCountIntervalRef.current) {
      clearInterval(frameCountIntervalRef.current);
      frameCountIntervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (rawMediaRecorderRef.current && rawMediaRecorderRef.current.state !== 'inactive') {
      rawMediaRecorderRef.current.stop();
    }
    
    setCameraReady(false);
    cameraReadyRef.current = false;
    setIsRecording(false);
    isRecordingRef.current = false;
    setHandDetected(false);
  }, []);
  
  // Start/stop camera based on enabled state
  useEffect(() => {
    if (isEnabled) {
      startCamera();
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isEnabled, startCamera, stopCamera]);
  
  // Start recording when session starts
  useEffect(() => {
    if (isSessionRunning && !isSessionPaused && isEnabled && cameraReady && !isRecording) {
      startRecording();
    }
  }, [isSessionRunning, isSessionPaused, isEnabled, cameraReady]);
  
  // Pause/resume recording based on session state
  useEffect(() => {
    if (mediaRecorderRef.current) {
      if (isSessionPaused && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      } else if (!isSessionPaused && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }
    }
    if (rawMediaRecorderRef.current) {
      if (isSessionPaused && rawMediaRecorderRef.current.state === 'recording') {
        rawMediaRecorderRef.current.pause();
      } else if (!isSessionPaused && rawMediaRecorderRef.current.state === 'paused') {
        rawMediaRecorderRef.current.resume();
      }
    }
  }, [isSessionPaused]);
  
  // Stop recording when session ends
  useEffect(() => {
    if (!isSessionRunning && isRecording) {
      stopRecording();
    }
  }, [isSessionRunning]);
  
  // Start video recording
  const startRecording = useCallback(() => {
    if (!canvasRef.current) return;
    
    try {
      // Record the canvas stream (with overlay)
      const stream = canvasRef.current.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        setRecordedChunks([...recordedChunksRef.current]);
      };
      
      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      
      // Also record raw webcam feed (no overlay) if option is enabled
      if (recordRawFeed && streamRef.current) {
        const rawRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'video/webm;codecs=vp9'
        });
        
        rawRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            rawRecordedChunksRef.current.push(e.data);
          }
        };
        
        rawRecorder.onstop = () => {
          setRawRecordedChunks([...rawRecordedChunksRef.current]);
        };
        
        rawRecorder.start(1000);
        rawMediaRecorderRef.current = rawRecorder;
      }
      
      setIsRecording(true);
      isRecordingRef.current = true;
      
      // Clear previous log
      setHandTrackingLog([]);
      handTrackingLogRef.current = [];
      recordedChunksRef.current = [];
      rawRecordedChunksRef.current = [];
      setTrackedFrameCount(0);
      
      // Update UI frame count every 2 seconds (not every frame)
      frameCountIntervalRef.current = setInterval(() => {
        setTrackedFrameCount(handTrackingLogRef.current.length);
      }, 2000);
    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to start recording');
    }
  }, [recordRawFeed]);
  
  // Stop video recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (rawMediaRecorderRef.current && rawMediaRecorderRef.current.state !== 'inactive') {
      rawMediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    isRecordingRef.current = false;
    
    // Stop the UI update interval and sync final counts
    if (frameCountIntervalRef.current) {
      clearInterval(frameCountIntervalRef.current);
      frameCountIntervalRef.current = null;
    }
    // Sync state from refs for download UI
    setRecordedChunks([...recordedChunksRef.current]);
    setRawRecordedChunks([...rawRecordedChunksRef.current]);
    setHandTrackingLog(handTrackingLogRef.current);
    setTrackedFrameCount(handTrackingLogRef.current.length);
  }, []);
  
  // Download video (with overlay)
  const downloadVideo = useCallback(() => {
    const chunks = recordedChunksRef.current.length > 0 ? recordedChunksRef.current : recordedChunks;
    if (chunks.length === 0) return;
    
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand_recording_overlay_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedChunks]);
  
  // Download raw video (without overlay)
  const downloadRawVideo = useCallback(() => {
    const chunks = rawRecordedChunksRef.current.length > 0 ? rawRecordedChunksRef.current : rawRecordedChunks;
    if (chunks.length === 0) return;
    
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand_recording_raw_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rawRecordedChunks]);
  
  // Download hand tracking data as CSV
  const downloadHandData = useCallback(() => {
    const log = handTrackingLogRef.current;
    if (log.length === 0) return;
    
    // Generate CSV headers
    const headers = ['timestamp', 'session_time_ms'];
    LANDMARK_NAMES.forEach(name => {
      headers.push(`${name}_x`, `${name}_y`, `${name}_z`);
    });
    
    // Generate rows
    const rows = log.map(entry => {
      const row = [entry.timestamp, entry.sessionTime];
      entry.landmarks.forEach(lm => {
        row.push(lm.x.toFixed(6), lm.y.toFixed(6), lm.z.toFixed(6));
      });
      return row.join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediapipe_hand_data_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);
  
  // Toggle enabled
  const toggleEnabled = () => {
    if (!isEnabled) {
      setIsEnabled(true);
    } else {
      stopCamera();
      setIsEnabled(false);
    }
  };
  
  return (
    <div className="flex flex-col">
      {/* Toggle Button */}
      <button
        onClick={toggleEnabled}
        disabled={isSessionRunning}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
          isEnabled
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gray-600 text-white hover:bg-gray-700'
        } ${isSessionRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isEnabled ? <VideoOff size={18} /> : <Camera size={18} />}
        <span className="font-medium">{isEnabled ? 'Disable Camera' : 'Enable Camera'}</span>
        {isRecording && (
          <span className="flex items-center gap-1 ml-2">
            <Circle size={12} className="fill-red-500 text-red-500 animate-pulse" />
            <span className="text-xs">REC</span>
          </span>
        )}
      </button>
      
      {/* Raw feed recording toggle - only shown when camera enabled and session not running */}
      {isEnabled && !isSessionRunning && (
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={recordRawFeed}
            onChange={(e) => setRecordRawFeed(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Also record raw feed (no overlay)</span>
        </label>
      )}
      
      {/* Camera View */}
      {isEnabled && (
        <div className="mt-4 relative bg-black rounded-lg overflow-hidden" style={{ width: '100%', maxWidth: '640px' }}>
          {/* Hidden video element */}
          <video
            ref={videoRef}
            className="hidden"
            playsInline
            muted
          />
          
          {/* Canvas for drawing */}
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-auto"
          />
          
          {/* Status overlay */}
          <div className="absolute top-2 left-2 flex items-center gap-2">
            {cameraReady ? (
              <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                Camera Ready
              </span>
            ) : (
              <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                Initializing...
              </span>
            )}
            
            {handDetected && (
              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                ✋ Hand Detected
              </span>
            )}
            
            {isRecording && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Circle size={8} className="fill-white animate-pulse" />
                Recording
              </span>
            )}
          </div>
          
          {/* Error message */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-red-400 text-center p-4">
                <p>{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    startCamera();
                  }}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          
          {/* Data counts */}
          <div className="absolute bottom-2 right-2 text-white text-xs bg-black/50 px-2 py-1 rounded">
            {trackedFrameCount} frames tracked
          </div>
        </div>
      )}
      
      {/* Download buttons (shown when recording has data) */}
      {(recordedChunks.length > 0 || recordedChunksRef.current.length > 0 || rawRecordedChunks.length > 0 || rawRecordedChunksRef.current.length > 0 || handTrackingLog.length > 0) && !isSessionRunning && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(recordedChunks.length > 0 || recordedChunksRef.current.length > 0) && (
            <button
              onClick={downloadVideo}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Download size={18} />
              Video (with overlay)
            </button>
          )}
          {(rawRecordedChunks.length > 0 || rawRecordedChunksRef.current.length > 0) && (
            <button
              onClick={downloadRawVideo}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Download size={18} />
              Video (raw)
            </button>
          )}
          {handTrackingLog.length > 0 && (
            <button
              onClick={downloadHandData}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              <Download size={18} />
              Hand Data CSV ({handTrackingLog.length} frames)
            </button>
          )}
        </div>
      )}
    </div>
  );
});

CameraRecorder.displayName = 'CameraRecorder';

export default CameraRecorder;
