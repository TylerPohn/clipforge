/**
 * Recording Types
 * Defines enums and interfaces for video recording configuration
 */

export enum VideoResolution {
  '720P' = '720p',
  '1080P' = '1080p',
  'SOURCE' = 'source'
}

export interface ResolutionOption {
  id: VideoResolution;
  label: string;
  description: string;
  maxBitrate: number; // For quality indication
  estimatedFileSize: string; // Per minute of recording
  recommendedUses: string[];
}

export const RESOLUTION_OPTIONS: Record<VideoResolution, ResolutionOption> = {
  [VideoResolution['720P']]: {
    id: VideoResolution['720P'],
    label: '720p',
    description: 'Balanced quality and file size',
    maxBitrate: 2500,
    estimatedFileSize: '180-220 MB/min',
    recommendedUses: ['Quick clips', 'Social media', 'Webcam recording']
  },
  [VideoResolution['1080P']]: {
    id: VideoResolution['1080P'],
    label: '1080p',
    description: 'High quality, larger files',
    maxBitrate: 5000,
    estimatedFileSize: '350-450 MB/min',
    recommendedUses: ['Professional use', 'Tutorials', 'Screen recording']
  },
  [VideoResolution['SOURCE']]: {
    id: VideoResolution['SOURCE'],
    label: 'Source Resolution',
    description: 'Original resolution (camera native, screen native)',
    maxBitrate: 8000,
    estimatedFileSize: 'Varies (typically 400-800 MB/min)',
    recommendedUses: ['Maximum quality', 'Professional archival']
  }
};

export interface RecordingOptions {
  resolution: VideoResolution;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface ScreenResolution {
  width: number;
  height: number;
}

export interface CameraCapabilities {
  nativeWidth: number;
  nativeHeight: number;
  supportedResolutions: VideoResolution[];
}

export interface ExportOptions {
  resolution: VideoResolution;
  sourceWidth?: number;
  sourceHeight?: number;
}
