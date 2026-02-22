//Go to src/tools/eeg-collector and run "npm run dev" to start the app

import React, { useState } from 'react';
import { Hand, Brain, ArrowLeftRight, Timer } from 'lucide-react';
import ClassificationMode from './components/ClassificationMode';
import ContinuousMotionMode from './components/ContinuousMotionMode';
import PeriodicMotionMode from './components/PeriodicMotionMode';

/**
 * THALis EEG Data Collection App
 * 
 * Three modes:
 * 1. Classification Mode - Discrete finger classification (rest, thumb, index, pinky)
 *    Structure: 5s Rest → 1s Cue → 3s Motor Imagery
 * 
 * 2. Continuous Motion Mode - Continuous hand pose tracking
 *    Structure: 2s Rest/Hold → 1.2s Transition to new target
 *    Virtual hand with kinematic parameters for thumb, index, pinky
 * 
 * 3. Periodic Motion Mode - Periodic alternation between neutral and target poses
 *    Structure: 2s Prep → 10s Active (alternating at adjustable frequency)
 *    Metronome-guided movement with configurable frequency (default 0.8Hz)
 */

const App = () => {
  const [mode, setMode] = useState('classification'); // 'classification', 'continuous', or 'periodic'

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Mode Selector Header */}
      <div className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="text-purple-400" size={32} />
              <div>
                <h1 className="text-xl font-bold text-white">THALis EEG Data Collection</h1>
                <p className="text-sm text-gray-400">Motor Imagery & Continuous Motion</p>
              </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setMode('classification')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  mode === 'classification'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <Brain size={18} />
                <span className="font-medium">Classification</span>
              </button>
              
              <div className="text-gray-500 px-1">
                <ArrowLeftRight size={16} />
              </div>
              
              <button
                onClick={() => setMode('continuous')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  mode === 'continuous'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <Hand size={18} />
                <span className="font-medium">Continuous</span>
              </button>
              
              <div className="text-gray-500 px-1">
                <ArrowLeftRight size={16} />
              </div>
              
              <button
                onClick={() => setMode('periodic')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  mode === 'periodic'
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <Timer size={18} />
                <span className="font-medium">Periodic</span>
              </button>
            </div>
          </div>
          
          {/* Mode Description */}
          <div className="mt-3 text-sm">
            {mode === 'classification' ? (
              <div className="flex items-center gap-4 text-gray-400">
              </div>
            ) : mode === 'continuous' ? (
              <div className="flex items-center gap-4 text-gray-400">
              </div>
            ) : (
              <div className="flex items-center gap-4 text-gray-400">
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Mode Content */}
      <div className="relative">
        {mode === 'classification' ? (
          <ClassificationMode />
        ) : mode === 'continuous' ? (
          <ContinuousMotionMode />
        ) : (
          <PeriodicMotionMode />
        )}
      </div>
    </div>
  );
};

export default App;