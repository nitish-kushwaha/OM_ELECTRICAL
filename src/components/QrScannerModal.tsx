import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode / QR Code',
}) => {
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const qrCodeInstance = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-camera-scanner-view';

  useEffect(() => {
    if (!isOpen) return;

    // Reset error state
    setError(null);
    setCameraActive(false);

    // Short delay to let the modal animate and render DOM
    const timer = setTimeout(() => {
      try {
        const html5Qrcode = new Html5Qrcode(containerId);
        qrCodeInstance.current = html5Qrcode;

        html5Qrcode
          .start(
            { facingMode: 'environment' }, // use back camera
            {
              fps: 15,
              qrbox: (width, height) => {
                const size = Math.min(width, height) * 0.65;
                return { width: size, height: size };
              },
            },
            (decodedText) => {
              // On success
              onScan(decodedText);
              handleClose();
            },
            () => {
              // On error (ignoring noise/scanning frames)
            }
          )
          .then(() => {
            setCameraActive(true);
          })
          .catch((err) => {
            console.error('Failed to start camera scanner:', err);
            setError(
              'Could not access the device camera. Please check camera permissions and make sure no other app is using it.'
            );
          });
      } catch (err) {
        console.error('Html5Qrcode initialization error:', err);
        setError('Failed to initialize scanner. Please reload and try again.');
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = async () => {
    if (qrCodeInstance.current && qrCodeInstance.current.isScanning) {
      try {
        await qrCodeInstance.current.stop();
      } catch (e) {
        console.error('Error stopping QR scanner:', e);
      }
      qrCodeInstance.current = null;
    }
  };

  const handleClose = async () => {
    await stopScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal Container */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-sm w-full p-6 relative z-10 space-y-4 shadow-2xl overflow-hidden flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <div className="text-center w-full">
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <Camera className="h-4 w-4 text-amber-500" />
            {title}
          </h3>
        </div>

        {/* Camera stream view area */}
        <div className="relative w-full aspect-square bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden flex items-center justify-center">
          {/* Scanning frame and laser line animation */}
          {cameraActive && !error && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
              <div className="relative w-2/3 h-2/3 border-2 border-dashed border-amber-500/60 rounded-xl overflow-hidden">
                {/* Glowing Laser */}
                <div className="absolute left-0 right-0 h-0.5 bg-amber-500 shadow-md shadow-amber-500/50 animate-[scan_2s_linear_infinite]" />
              </div>
            </div>
          )}

          {/* Scanner DOM target */}
          <div id={containerId} className="w-full h-full object-cover" />

          {/* Initial Loading overlay */}
          {!cameraActive && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400">
              <div className="h-8 w-8 rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
              <p className="text-[10px] uppercase tracking-wider font-semibold">Opening camera stream...</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-2 bg-zinc-950 text-rose-500 border border-rose-500/20 rounded-2xl">
              <AlertCircle className="h-10 w-10 text-rose-500 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Help Tip */}
        <p className="text-[10px] text-zinc-500 text-center font-medium max-w-[220px]">
          Position the product barcode or QR code inside the viewfinder window to capture it.
        </p>
      </div>

      {/* Embedded CSS for the scanner laser animation */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
};
