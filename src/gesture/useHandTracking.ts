import { useEffect, useState } from 'react';
import { HandTrackingService } from './handTrackingService';
import type { HandTrackingFrame } from './types';

const initialFrame: HandTrackingFrame = {
  status: 'booting',
  pointer: null,
  message: '等待手势服务启动...'
};

export function useHandTracking() {
  const [frame, setFrame] = useState<HandTrackingFrame>(initialFrame);

  useEffect(() => {
    const service = new HandTrackingService((nextFrame) => {
      setFrame(nextFrame);
    });

    service.start();

    return () => {
      service.stop();
    };
  }, []);

  return frame;
}
