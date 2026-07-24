export type Platform = "linux" | "windows" | "macos" | "android" | "ios" | "unknown";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Win/.test(navigator.platform)) return "windows";
  if (/Linux/.test(navigator.platform)) return "linux";
  if (/Mac/.test(navigator.platform)) return "macos";
  return "unknown";
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getDefaultFacingMode(): "environment" | "user" {
  return isMobile() ? "environment" : "user";
}

export async function checkCameraSupport(): Promise<{ supported: boolean; reason?: string }> {
  if (!navigator.mediaDevices) {
    return { supported: false, reason: "Camera API not available. Use HTTPS or localhost." };
  }
  if (!navigator.mediaDevices.getUserMedia) {
    return { supported: false, reason: "getUserMedia not supported in this browser." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return { supported: true };
  } catch (err: any) {
    if (err.name === "NotAllowedError") {
      return { supported: false, reason: "Camera permission denied. Allow camera access in your browser settings." };
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return { supported: false, reason: "No camera found on this device." };
    }
    return { supported: false, reason: `Camera error: ${err.message || err.name}` };
  }
}

export async function listCameras(): Promise<{ id: string; label: string; facing?: string }[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d) => ({
        id: d.deviceId,
        label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
        facing: (d as any).facingMode,
      }));
  } catch {
    return [];
  }
}

export function selectBestCamera(cameras: { id: string; label: string; facing?: string }[]): string | null {
  if (cameras.length === 0) return null;
  const platform = detectPlatform();
  if (platform === "android" || platform === "ios") {
    const back = cameras.find(
      (c) =>
        c.label.toLowerCase().includes("back") ||
        c.label.toLowerCase().includes("rear") ||
        c.label.toLowerCase().includes("environment") ||
        c.facing === "environment"
    );
    if (back) return back.id;
  }
  return cameras[0].id;
}
