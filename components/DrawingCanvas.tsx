import React, { useRef, useState, useEffect, useCallback } from 'react';

interface DrawingCanvasProps {
  /** Base64 data URL of the photo to draw on */
  imageSrc: string;
  /** Called when the user saves the mask */
  onSaveMask: (maskDataUrl: string, compositeDataUrl: string) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

const BRUSH_SIZES = [20, 35, 50, 70];
const MASK_COLOR = 'rgba(0, 200, 120, 0.4)';
const MASK_SOLID = 'rgba(0, 200, 120, 1)';

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ imageSrc, onSaveMask, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(35);
  const [isEraser, setIsEraser] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Paths stored as arrays of points for undo
  const pathsRef = useRef<Array<{ points: { x: number; y: number }[]; size: number; eraser: boolean }>>([]);
  const currentPathRef = useRef<{ points: { x: number; y: number }[]; size: number; eraser: boolean } | null>(null);

  // Load image and set canvas dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageDimensions({ width: img.width, height: img.height });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Resize canvas to fit container while preserving aspect ratio
  useEffect(() => {
    if (!imageDimensions.width || !containerRef.current) return;

    const container = containerRef.current;
    const maxW = container.clientWidth;
    const maxH = window.innerHeight * 0.65;

    const scale = Math.min(maxW / imageDimensions.width, maxH / imageDimensions.height, 1);
    setCanvasScale(scale);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Canvas internal resolution = original image size (for quality)
    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;

    // CSS size = scaled
    canvas.style.width = `${Math.round(imageDimensions.width * scale)}px`;
    canvas.style.height = `${Math.round(imageDimensions.height * scale)}px`;

    redrawCanvas();
  }, [imageDimensions]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw base image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Replay all paths
    for (const path of pathsRef.current) {
      drawPath(ctx, path);
    }
  }, []);

  const drawPath = (ctx: CanvasRenderingContext2D, path: { points: { x: number; y: number }[]; size: number; eraser: boolean }) => {
    if (path.points.length === 0) return;

    ctx.save();
    if (path.eraser) {
      // Eraser: redraw the original image through the erased area
      // We achieve this by first clearing the path area, then redrawing image there
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = MASK_COLOR;
    }
    ctx.lineWidth = path.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // If eraser, redraw image underneath (complex approach)
    // Simpler: we'll just fully redraw for erasers
  };

  // Actually, for eraser support, it's cleaner to use a separate mask canvas approach
  // Let me use a dual-canvas strategy: one for image, one overlay for mask

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Create offscreen mask canvas when dimensions are known
  useEffect(() => {
    if (!imageDimensions.width) return;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = imageDimensions.width;
    maskCanvas.height = imageDimensions.height;
    maskCanvasRef.current = maskCanvas;
  }, [imageDimensions]);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !img || !maskCanvas) return;

    const ctx = canvas.getContext('2d')!;
    const maskCtx = maskCanvas.getContext('2d')!;

    // Clear mask
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Replay all paths on the mask canvas
    for (const path of pathsRef.current) {
      maskCtx.save();
      if (path.eraser) {
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.strokeStyle = MASK_COLOR;
      }
      maskCtx.lineWidth = path.size;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';

      if (path.points.length === 1) {
        // Single dot
        maskCtx.beginPath();
        maskCtx.arc(path.points[0].x, path.points[0].y, path.size / 2, 0, Math.PI * 2);
        maskCtx.fillStyle = path.eraser ? 'rgba(0,0,0,1)' : MASK_COLOR;
        maskCtx.fill();
      } else {
        maskCtx.beginPath();
        maskCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          maskCtx.lineTo(path.points[i].x, path.points[i].y);
        }
        maskCtx.stroke();
      }
      maskCtx.restore();
    }

    // Composite: image + mask overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(maskCanvas, 0, 0);
  }, []);

  // Re-export redrawCanvas to use new approach
  useEffect(() => {
    redrawAll();
  }, [imageDimensions, redrawAll]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Map CSS coordinates to canvas internal coordinates
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const point = getCanvasCoords(e);
    currentPathRef.current = { points: [point], size: brushSize, eraser: isEraser };
    setIsDrawing(true);

    // Draw initial dot
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.save();
      if (isEraser) {
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.fillStyle = MASK_COLOR;
      }
      maskCtx.beginPath();
      maskCtx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      maskCtx.fill();
      maskCtx.restore();
      redrawAll();
      // Redraw the dot we just drew (redrawAll cleared it since it's not in pathsRef yet)
      // Actually, let's just add it to paths immediately for live preview
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !currentPathRef.current) return;
    e.preventDefault();

    const point = getCanvasCoords(e);
    currentPathRef.current.points.push(point);

    // Draw incrementally on mask canvas
    const maskCanvas = maskCanvasRef.current;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!maskCanvas || !canvas || !img) return;

    const maskCtx = maskCanvas.getContext('2d')!;
    const pts = currentPathRef.current.points;
    const prev = pts[pts.length - 2];

    maskCtx.save();
    if (isEraser) {
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.strokeStyle = MASK_COLOR;
    }
    maskCtx.lineWidth = brushSize;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.beginPath();
    maskCtx.moveTo(prev.x, prev.y);
    maskCtx.lineTo(point.x, point.y);
    maskCtx.stroke();
    maskCtx.restore();

    // Composite visible canvas
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(maskCanvas, 0, 0);
  };

  const stopDrawing = () => {
    if (currentPathRef.current && currentPathRef.current.points.length > 0) {
      pathsRef.current.push(currentPathRef.current);
    }
    currentPathRef.current = null;
    setIsDrawing(false);
  };

  const handleUndo = () => {
    if (pathsRef.current.length === 0) return;
    pathsRef.current.pop();
    redrawAll();
  };

  const handleClearAll = () => {
    pathsRef.current = [];
    redrawAll();
  };

  const handleSave = () => {
    const maskCanvas = maskCanvasRef.current;
    const canvas = canvasRef.current;
    if (!maskCanvas || !canvas) return;

    // Generate a solid green mask (for sending to AI as guide)
    const solidMask = document.createElement('canvas');
    solidMask.width = maskCanvas.width;
    solidMask.height = maskCanvas.height;
    const solidCtx = solidMask.getContext('2d')!;

    // Replay paths with solid color for AI visibility
    for (const path of pathsRef.current) {
      if (path.eraser) continue; // skip eraser paths for solid mask
      solidCtx.save();
      solidCtx.globalCompositeOperation = 'source-over';
      solidCtx.strokeStyle = MASK_SOLID;
      solidCtx.fillStyle = MASK_SOLID;
      solidCtx.lineWidth = path.size;
      solidCtx.lineCap = 'round';
      solidCtx.lineJoin = 'round';

      if (path.points.length === 1) {
        solidCtx.beginPath();
        solidCtx.arc(path.points[0].x, path.points[0].y, path.size / 2, 0, Math.PI * 2);
        solidCtx.fill();
      } else {
        solidCtx.beginPath();
        solidCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          solidCtx.lineTo(path.points[i].x, path.points[i].y);
        }
        solidCtx.stroke();
      }
      solidCtx.restore();
    }

    // Apply eraser paths
    for (const path of pathsRef.current) {
      if (!path.eraser) continue;
      solidCtx.save();
      solidCtx.globalCompositeOperation = 'destination-out';
      solidCtx.strokeStyle = 'rgba(0,0,0,1)';
      solidCtx.fillStyle = 'rgba(0,0,0,1)';
      solidCtx.lineWidth = path.size;
      solidCtx.lineCap = 'round';
      solidCtx.lineJoin = 'round';

      if (path.points.length === 1) {
        solidCtx.beginPath();
        solidCtx.arc(path.points[0].x, path.points[0].y, path.size / 2, 0, Math.PI * 2);
        solidCtx.fill();
      } else {
        solidCtx.beginPath();
        solidCtx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          solidCtx.lineTo(path.points[i].x, path.points[i].y);
        }
        solidCtx.stroke();
      }
      solidCtx.restore();
    }

    // Composite: image + solid mask overlay (for AI to see context)
    const composite = document.createElement('canvas');
    composite.width = maskCanvas.width;
    composite.height = maskCanvas.height;
    const compCtx = composite.getContext('2d')!;
    compCtx.drawImage(imageRef.current!, 0, 0, composite.width, composite.height);
    // Draw solid mask with some transparency so AI can see both the face AND the marked area
    compCtx.globalAlpha = 0.5;
    compCtx.drawImage(solidMask, 0, 0);
    compCtx.globalAlpha = 1.0;

    const maskDataUrl = solidMask.toDataURL('image/png');
    const compositeDataUrl = composite.toDataURL('image/jpeg', 0.9);
    onSaveMask(maskDataUrl, compositeDataUrl);
  };

  const hasPaths = pathsRef.current.length > 0;

  return (
    <div className="flex flex-col items-center space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 shadow-sm flex-wrap justify-center">
        {/* Brush / Eraser toggle */}
        <div className="flex bg-white rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setIsEraser(false)}
            className={`px-3 py-2 text-xs font-bold transition-colors ${
              !isEraser ? 'bg-[#57BEB7] text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
            </svg>
            Pincel
          </button>
          <button
            onClick={() => setIsEraser(true)}
            className={`px-3 py-2 text-xs font-bold transition-colors ${
              isEraser ? 'bg-[#57BEB7] text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16l9-9 7 7-3 3" />
              <path d="m6 13 4 4" />
            </svg>
            Borracha
          </button>
        </div>

        {/* Brush sizes */}
        <div className="flex items-center gap-2">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setBrushSize(size)}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                brushSize === size
                  ? 'bg-[#1D4998] ring-2 ring-[#57BEB7]'
                  : 'bg-white hover:bg-gray-100 shadow-sm'
              }`}
              title={`${size}px`}
            >
              <div
                className="rounded-full"
                style={{
                  width: Math.max(6, size / 4),
                  height: Math.max(6, size / 4),
                  backgroundColor: brushSize === size ? 'white' : '#57BEB7',
                }}
              />
            </button>
          ))}
        </div>

        {/* Undo / Clear */}
        <div className="flex gap-1">
          <button
            onClick={handleUndo}
            className="px-3 py-2 text-xs font-bold text-gray-500 hover:bg-white rounded-xl transition-colors"
            title="Desfazer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
            </svg>
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-50 rounded-xl transition-colors"
            title="Limpar tudo"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Instruction */}
      <p className="text-xs text-gray-400 text-center max-w-md">
        Pinte com o pincel as areas onde deseja adicionar cabelo. A IA vai preencher exatamente essas regioes.
      </p>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden shadow-lg border-4 border-[#57BEB7]/20 cursor-crosshair w-full flex justify-center bg-gray-100"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block touch-none"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full max-w-md">
        <button
          onClick={onCancel}
          className="flex-1 py-3 text-[#1D4998] font-black uppercase tracking-widest text-xs border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
        >
          Voltar
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-3 bg-[#57BEB7] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-[#48a9a3] transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={pathsRef.current.length === 0}
        >
          Confirmar Area
        </button>
      </div>
    </div>
  );
};

export default DrawingCanvas;
