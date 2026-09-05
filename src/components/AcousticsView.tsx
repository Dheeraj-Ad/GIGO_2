import React, { useState, useEffect } from 'react';
import { ArrowLeft, Activity, Radio, Volume2, Waves, Sliders } from 'lucide-react';
import { BasinTarget } from '../types';

interface AcousticsViewProps {
  activeBasin: BasinTarget;
  onBackToGlobe: () => void;
}

export const AcousticsView: React.FC<AcousticsViewProps> = ({ activeBasin, onBackToGlobe }) => {
  const [frequencies, setFrequencies] = useState<number[]>([]);

  // Generate real-time acoustic spectrogram bars
  useEffect(() => {
    const generateBars = () => {
      const bars = Array.from({ length: 48 }, () => Math.floor(20 + Math.random() * 75));
      setFrequencies(bars);
    };
    generateBars();
    const interval = setInterval(generateBars, 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] p-4 lg:p-8 flex flex-col gap-6 bg-[#041329]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1c32] p-4 rounded border border-[#00f0ff]/20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToGlobe}
            className="p-2 rounded bg-[#112036] hover:bg-[#1c2a41] text-[#00f0ff] border border-[#00f0ff]/30 transition-all flex items-center gap-1.5 cursor-pointer font-mono text-xs"
          >
            <ArrowLeft size={16} />
            <span>RETURN TO 3D GLOBE</span>
          </button>
          <div>
            <h2 className="font-sans text-xl font-bold text-[#dbfcff]">
              Deep Ocean Acoustic Tomography &amp; Hydrophone Spectrogram
            </h2>
            <p className="font-mono text-xs text-[#b9cacb]">
              Receiver Array: Chagos-Laccadive Ridge Deep Hydrophone Array • SOFAR Duct Locked
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-[#00f0ff] bg-[#112036] px-3 py-1.5 rounded border border-[#00f0ff]/30">
          <Volume2 size={15} />
          <span>SAMPLING: 96 kHz • 24-BIT ADC</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Spectrogram Canvas */}
        <div className="lg:col-span-2 bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#3b494b]/30 pb-3">
            <span className="font-mono text-xs text-[#43ffbb] font-bold">
              REAL-TIME AMBIENT NOISE SPECTRAL DENSITY (dB re 1 µPa²/Hz)
            </span>
            <span className="font-mono text-[10px] text-[#b9cacb]">
              SPECTRUM: 1 Hz - 25,000 Hz
            </span>
          </div>

          {/* Spectrogram Bar Visualizer */}
          <div className="h-64 w-full flex items-end justify-between gap-1 py-6">
            {frequencies.map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div
                  style={{ height: `${val}%` }}
                  className="w-full bg-gradient-to-t from-[#00f0ff] via-[#43ffbb] to-[#ffb2b8] rounded-t-sm transition-all duration-100 opacity-90 hover:opacity-100"
                ></div>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-mono text-[10px] text-[#b9cacb] pt-2 border-t border-[#3b494b]/30">
            <span>Seismic Microbaroms (0.1 - 5 Hz)</span>
            <span>Commercial Shipping (50 - 300 Hz)</span>
            <span>Cetacean Whistles (1 - 12 kHz)</span>
            <span>Thermal Noise (&gt; 20 kHz)</span>
          </div>
        </div>

        {/* Acoustic Properties Sidebar */}
        <div className="bg-[#0d1c32] rounded-lg p-6 border border-[#00f0ff]/15 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#00f0ff]" />
            <h3 className="font-sans text-base font-bold text-[#dbfcff]">
              Tomographic Heat Content
            </h3>
          </div>

          <div className="bg-[#112036] p-3 rounded border border-[#3b494b]/30 flex flex-col gap-1">
            <span className="font-mono text-[10px] text-[#b9cacb]">
              ACOUSTIC TRAVEL TIME DELAY
            </span>
            <span className="font-mono text-xl text-[#00f0ff] font-bold">
              -14.2 ms / 1000 km
            </span>
            <span className="font-mono text-[10px] text-[#43ffbb]">
              Indicates +0.35°C Basin-Averaged Warming
            </span>
          </div>

          <div className="bg-[#112036] p-3 rounded border border-[#3b494b]/30 flex flex-col gap-1">
            <span className="font-mono text-[10px] text-[#b9cacb]">
              SOFAR CHANNEL SOUND SPEED AXIS
            </span>
            <span className="font-mono text-xl text-[#dbfcff] font-bold">
              1,488.2 m/s @ -850m
            </span>
          </div>

          <div className="bg-[#112036] p-3 rounded border border-[#3b494b]/30 flex flex-col gap-1">
            <span className="font-mono text-[10px] text-[#b9cacb]">
              HYDROPHONE SENSITIVITY
            </span>
            <span className="font-mono text-sm text-[#43ffbb] font-bold">
              -194 dBV / µPa (Calibrated)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
