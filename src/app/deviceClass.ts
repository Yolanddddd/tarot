export interface DeviceSignals {
  userAgent: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  screenWidth: number;
  screenHeight: number;
}

export function isPhoneDevice(signals: DeviceSignals) {
  if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(signals.userAgent)) return true;
  if (/iPad|Macintosh|Windows NT|X11|Linux x86_64/i.test(signals.userAgent)) return false;

  return (signals.maxTouchPoints > 0 || signals.coarsePointer) &&
    Math.min(signals.screenWidth, signals.screenHeight) <= 600;
}

export function isPortableTouchDevice(signals: DeviceSignals) {
  return isPhoneDevice(signals) ||
    /iPad|Android/i.test(signals.userAgent) ||
    (/Macintosh/i.test(signals.userAgent) && signals.maxTouchPoints > 1);
}

export function readDeviceSignals(): DeviceSignals {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height
  };
}
