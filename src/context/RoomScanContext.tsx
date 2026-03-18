import React, {createContext, useContext, useState, useCallback} from 'react';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';

export interface CapturedImage {
  id: number;
  imagePath: string;
  pitch: number;
  yaw: number;
  roll: number;
}

export type WallId = 'wall1' | 'wall2' | 'wall3' | 'wall4';

interface RoomScanState {
  wall1: CapturedImage[];
  wall2: CapturedImage[];
  wall3: CapturedImage[];
  wall4: CapturedImage[];
}

/** Per-wall stitched panorama: data URL (base64) or file URI for card preview */
export type WallStitchedResults = Partial<Record<WallId, string>>;

/** Per-wall stitching in progress */
export type WallStitchingInProgress = Partial<Record<WallId, boolean>>;

interface RoomScanContextValue {
  wallImages: RoomScanState;
  wallStitchedResults: WallStitchedResults;
  wallStitchingInProgress: WallStitchingInProgress;
  addImages: (wallId: WallId, images: CapturedImage[]) => void;
  setWallImages: (wallId: WallId, images: CapturedImage[]) => void;
  setWallStitchedResult: (wallId: WallId, imageData: string) => void;
  clearWallStitchedResult: (wallId: WallId) => void;
  startWallStitch: (wallId: WallId, images: CapturedImage[]) => void;
  clearAll: () => void;
  totalCount: number;
}

const initialState: RoomScanState = {
  wall1: [],
  wall2: [],
  wall3: [],
  wall4: [],
};

const RoomScanContext = createContext<RoomScanContextValue | null>(null);

export function RoomScanProvider({children}: {children: React.ReactNode}) {
  const [wallImages, setWallImagesState] = useState<RoomScanState>(initialState);
  const [wallStitchedResults, setWallStitchedResultsState] =
    useState<WallStitchedResults>({});
  const [wallStitchingInProgress, setWallStitchingInProgress] =
    useState<WallStitchingInProgress>({});

  const addImages = useCallback((wallId: WallId, images: CapturedImage[]) => {
    setWallImagesState(prev => ({
      ...prev,
      [wallId]: [...prev[wallId], ...images],
    }));
  }, []);

  const setWallImages = useCallback((wallId: WallId, images: CapturedImage[]) => {
    setWallImagesState(prev => ({
      ...prev,
      [wallId]: images,
    }));
  }, []);

  const setWallStitchedResult = useCallback((wallId: WallId, imageData: string) => {
    setWallStitchedResultsState(prev => ({
      ...prev,
      [wallId]: imageData,
    }));
  }, []);

  const clearWallStitchedResult = useCallback((wallId: WallId) => {
    setWallStitchedResultsState(prev => {
      const next = {...prev};
      delete next[wallId];
      return next;
    });
  }, []);

  const startWallStitch = useCallback((wallId: WallId, images: CapturedImage[]) => {
    if (!images || images.length === 0) return;

    setWallStitchingInProgress(prev => ({...prev, [wallId]: true}));

    const payload = images.map(img => ({
        path: img.imagePath,
        pitch: img.pitch,
        yaw: img.yaw,
        roll: img.roll,
      }));

      stitchPanoramaViaApi(payload, {
        outputWidth: 2048,
        forceFull360: false,
        mode: 'wall',
      })
        .then(result => {
          if (result.success && result.imageData) {
            setWallStitchedResultsState(prev => ({
              ...prev,
              [wallId]: result.imageData!,
            }));
          }
        })
        .catch(e => {
          console.error('[RoomScan] Wall stitch failed:', e);
        })
        .finally(() => {
          setWallStitchingInProgress(prev => {
            const next = {...prev};
            delete next[wallId];
            return next;
          });
        });
  }, []);

  const clearAll = useCallback(() => {
    setWallImagesState(initialState);
    setWallStitchedResultsState({});
    setWallStitchingInProgress({});
  }, []);

  const totalCount =
    wallImages.wall1.length +
    wallImages.wall2.length +
    wallImages.wall3.length +
    wallImages.wall4.length;

  return (
    <RoomScanContext.Provider
      value={{
        wallImages,
        wallStitchedResults,
        wallStitchingInProgress,
        addImages,
        setWallImages,
        setWallStitchedResult,
        clearWallStitchedResult,
        startWallStitch,
        clearAll,
        totalCount,
      }}>
      {children}
    </RoomScanContext.Provider>
  );
}

export function useRoomScan() {
  const ctx = useContext(RoomScanContext);
  if (!ctx) {
    throw new Error('useRoomScan must be used within RoomScanProvider');
  }
  return ctx;
}
