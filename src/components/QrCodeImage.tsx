import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface QrCodeImageProps {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
}

export function QrCodeImage({
  value,
  size = 200,
  alt = 'QR code',
  className = ''
}: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }

    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f382a',
        light: '#ffffff'
      }
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`qr-placeholder ${className}`}
        style={{ width: size, height: size }}
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className={className}
    />
  );
}
