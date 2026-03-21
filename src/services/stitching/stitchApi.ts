/**
 * Call the backend POST /stitch: wall mode (OpenCV) or nanobanana (4 walls → 360°).
 * Uses react-native-blob-util so we get response as base64 for saving locally.
 */
import {getStitchApiUrl} from '../../config';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {dataUrlToBase64} from '../panoramaStorage';

const LOG_TAG = '[StitchAPI]';

export interface StitchApiResult {
  success: boolean;
  panoramaId?: string;
  serverPath?: string;
  imageData?: string; // base64 data URL for preview/save
  error?: string;
  durationMs?: number;
}

export interface StitchApiImage {
  path: string; // file://... or absolute path
  pitch: number;
  yaw: number;
  roll: number;
}

/**
 * Upload images + poses to backend; returns stitched panorama result.
 */
export interface StitchApiComposeImage {
  /** file path or data URL (data:image/jpeg;base64,...) */
  pathOrDataUrl: string;
  yaw: number; // 0, 90, 180, 270 for wall1–4
}

export async function stitchPanoramaViaApi(
  images: StitchApiImage[],
  options: {
    outputWidth?: number;
    mode?: 'wall' | 'nanobanana';
    composeImages?: StitchApiComposeImage[];
  } = {},
): Promise<StitchApiResult> {
  const start = Date.now();
  const outputWidth = options.outputWidth ?? 4096;
  const mode = options.mode ?? 'wall';
  const composeImages = options.composeImages;
  const url = getStitchApiUrl('/stitch');
  const isNanobanana = mode === 'nanobanana' && composeImages && composeImages.length === 4;
  const imageCount = isNanobanana ? 4 : images.length;

  console.log(
    `${LOG_TAG} Calling POST ${url} with ${imageCount} image(s), outputWidth=${outputWidth}, mode=${mode}`,
  );

  if (!isNanobanana && images.length < 1) {
    console.log(`${LOG_TAG} Abort: no images`);
    return {
      success: false,
      error: 'Capture at least one image to create a panorama',
      durationMs: Date.now() - start,
    };
  }

  if (isNanobanana && composeImages!.length !== 4) {
    return {
      success: false,
      error: 'NanoBanana mode requires exactly 4 wall panoramas',
      durationMs: Date.now() - start,
    };
  }

  // For nanobanana: resolve data URLs to temp file paths
  const resolvedPaths: string[] = [];
  if (isNanobanana) {
    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    for (let i = 0; i < 4; i++) {
      const item = composeImages![i];
      const pathOrDataUrl = item.pathOrDataUrl;
      if (pathOrDataUrl.startsWith('data:')) {
        const base64 = dataUrlToBase64(pathOrDataUrl);
        if (!base64) {
          return {
            success: false,
            error: `Invalid data URL for wall ${i + 1}`,
            durationMs: Date.now() - start,
          };
        }
        const tmpPath = `${cacheDir}/compose_wall_${i}_${Date.now()}.jpg`;
        await ReactNativeBlobUtil.fs.writeFile(tmpPath, base64, 'base64');
        resolvedPaths.push(tmpPath);
      } else {
        resolvedPaths.push(pathOrDataUrl.replace(/^file:\/\//, ''));
      }
    }
  }

  const posesJson = isNanobanana
    ? JSON.stringify(
        composeImages!.map(img => ({pitch: 90, yaw: img.yaw, roll: 0})),
      )
    : JSON.stringify(
        images.map(img => ({pitch: img.pitch, yaw: img.yaw, roll: img.roll})),
      );

  const body = [
    {name: 'poses_json', data: posesJson},
    {name: 'output_width', data: String(outputWidth)},
    {name: 'mode', data: mode},
    ...(isNanobanana
      ? resolvedPaths.map((path, i) => ({
          name: 'images',
          filename: `wall_${i}.jpg`,
          type: 'image/jpeg',
          data: ReactNativeBlobUtil.wrap(path),
        }))
      : images.map((img, i) => ({
          name: 'images',
          filename: `img_${i}.jpg`,
          type: 'image/jpeg',
          data: ReactNativeBlobUtil.wrap(img.path.replace(/^file:\/\//, '')),
        }))),
  ];

  try {
    const response = await ReactNativeBlobUtil.fetch(
      'POST',
      url,
      {
        'Content-Type': 'multipart/form-data',
      },
      body,
    );

    const status = response.respInfo?.status ?? 0;
    const headers = response.respInfo?.headers || {};
    const panoramaId = headers['X-Panorama-Id'] ?? headers['x-panorama-id'];
    const serverPath = headers['X-Panorama-Path'] ?? headers['x-panorama-path'];

    console.log(
      `${LOG_TAG} Response status=${status}, panoramaId=${
        panoramaId ?? 'n/a'
      }, serverPath=${serverPath ?? 'n/a'}`,
    );

    if (status < 200 || status >= 300) {
      let errBody = '';
      try {
        if (typeof response.text === 'function') {
          const result = response.text();
          errBody =
            result != null &&
            typeof (result as Promise<string>).then === 'function'
              ? await (result as Promise<string>)
              : String(result ?? '');
        }
      } catch (_) {}
      console.log(`${LOG_TAG} Error body: ${String(errBody).slice(0, 300)}`);
      return {
        success: false,
        panoramaId,
        serverPath,
        error: String(errBody || `HTTP ${status}`),
        durationMs: Date.now() - start,
      };
    }

    let imageData: string | undefined;
    try {
      let base64Str: string | null = null;
      const b64 = response.base64?.();
      if (typeof b64 === 'string') {
        base64Str = b64;
      } else if (
        b64 != null &&
        typeof (b64 as Promise<string>).then === 'function'
      ) {
        base64Str = await (b64 as Promise<string>);
      }
      if (base64Str) {
        imageData = `data:image/jpeg;base64,${base64Str}`;
        console.log(
          `${LOG_TAG} Got response base64, length=${base64Str.length}`,
        );
      } else {
        const path = response.path?.();
        if (path) {
          base64Str = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
          if (base64Str != null) {
            imageData = `data:image/jpeg;base64,${base64Str}`;
            console.log(
              `${LOG_TAG} Read response from path, base64 length=${base64Str.length}`,
            );
          }
        }
      }
    } catch (e) {
      console.warn(`${LOG_TAG} Failed to get image data from response:`, e);
    }

    if (!imageData) {
      console.log(
        `${LOG_TAG} imageData is missing - panorama will NOT be saved to Recent Projects`,
      );
    }

    const durationMs = Date.now() - start;
    console.log(
      `${LOG_TAG} Success in ${durationMs}ms, hasImageData=${!!imageData}`,
    );

    return {
      success: true,
      panoramaId,
      serverPath,
      imageData,
      durationMs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_TAG} Request failed:`, message);
    return {
      success: false,
      error: message,
      durationMs: Date.now() - start,
    };
  }
}
