import React, {createContext, useContext, useState, useCallback} from 'react';

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

interface RoomScanContextValue {
  wallImages: RoomScanState;
  wallStitchedResults: WallStitchedResults;
  addImages: (wallId: WallId, images: CapturedImage[]) => void;
  setWallImages: (wallId: WallId, images: CapturedImage[]) => void;
  setWallStitchedResult: (wallId: WallId, imageData: string) => void;
  clearWallStitchedResult: (wallId: WallId) => void;
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

  const clearAll = useCallback(() => {
    setWallImagesState(initialState);
    setWallStitchedResultsState({});
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
        addImages,
        setWallImages,
        setWallStitchedResult,
        clearWallStitchedResult,
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
