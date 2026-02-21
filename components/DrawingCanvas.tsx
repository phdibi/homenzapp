import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { DrawingCanvasProps } from '../types';

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  photoDataUrl,
  onDrawingComplete,
  width: displayWidth = 500,
  brushColor = 'rgba(0, 255, 0, 0.45)',
  initialBrushSize = 25,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(initialBrushSize);
  const [isEraser, setIsEraser] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [canvasDims, setCanvasDims] = useState({ w: displayWidth, h: displayWidth });

  // Load photo and set canvas dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      photoRef.current = img;
      const aspect = img.naturalHeight / img.naturalWidth;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setCanvasDims({ w, h });
      setPhotoLoaded(true);

      // Configure canvas
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    };
    img.src = photoDataUrl;
  }, [photoDataUrl]);

  // Get canvas coordinates from pointer event (scale from CSS → canvas)
  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setIsDrawing(true);
      canvas.setPointerCapture(e.pointerId);

      const { x, y } = getCanvasCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);

      if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = brushSize * 2;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
      }

      // Draw a dot for single clicks
      ctx.lineTo(x + 0.1, y + 0.1);
      ctx.stroke();
    },
    [getCanvasCoords, isEraser, brushSize, brushColor]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { x, y } = getCanvasCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCanvasCoords]
  );

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
    }
  }, []);

  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const confirmDrawing = () => {
    const canvas = canvasRef.current;
    const photo = photoRef.current;
    if (!canvas || !photo) return;

    // Raw drawing layer
    const drawingDataUrl = canvas.toDataURL('image/png');

    // Composite: photo + drawing overlay
    const offscreen = document.createElement('canvas');
    offscreen.width = photo.naturalWidth;
    offscreen.height = photo.naturalHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(photo, 0, 0, photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(canvas, 0, 0, photo.naturalWidth, photo.naturalHeight);
    const compositeDataUrl = offscreen.toDataURL('image/jpeg', 0.90);

    onDrawingComplete(drawingDataUrl, compositeDataUrl);
  };

  // Calculate CSS display dimensions
  const containerWidth = containerRef.current?.offsetWidth || displayWidth;
  const actualDisplayWidth = Math.min(containerWidth, displayWidth);
  const displayAspect = canvasDims.h / canvasDims.w;
  const displayHeight = actualDisplayWidth * displayAspect;

  return (
    <div ref={containerRef} className="w-full space-y-3">
      {/* Canvas area */}
      <div
        className="relative rounded-xl overflow-hidden border-2 border-[#57BEB7]/30 shadow-md mx-auto"
        style={{ width: actualDisplayWidth, height: photoLoaded ? displayHeight : actualDisplayWidth }}
      >
        {/* Background photo */}
        {photoLoaded && (
          <img
            src={photoDataUrl}
            alt="Foto para desenho"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        )}

        {/* Drawing canvas overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        {!photoLoaded && (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-3 border-[#57BEB7]/20 border-t-[#57BEB7] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Controls */}
      {photoLoaded && (
        <div className="flex flex-col gap-3">
          {/* Brush size slider */}
          <div className="flex items-center gap-3 px-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
              Tamanho
            </span>
            <input
              type="range"
              min="5"
              max="60"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1 accent-[#57BEB7]"
            />
            <div
              className="rounded-full border border-gray-300 flex-shrink-0"
              style={{
                width: Math.max(12, brushSize * 0.6),
                height: Math.max(12, brushSize * 0.6),
                backgroundColor: isEraser ? 'transparent' : brushColor,
                borderStyle: isEraser ? 'dashed' : 'solid',
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsEraser(!isEraser)}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                isEraser
                  ? 'bg-[#1D4998] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isEraser ? 'Borracha Ativa' : 'Borracha'}
            </button>
            <button
              onClick={clearAll}
              className="flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500 transition-all"
            >
              Limpar Tudo
            </button>
            <button
              onClick={confirmDrawing}
              className="flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider bg-[#57BEB7] text-white hover:bg-[#48a9a3] shadow-md transition-all"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawingCanvas;
