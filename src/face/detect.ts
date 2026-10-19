import type { FaceInfo } from './cover';

type FaceApi = typeof import('@vladmandic/face-api');

let loading: Promise<FaceApi> | null = null;

/** Loads the detector on first use; the models ship with the app, nothing is fetched elsewhere. */
function loadFaceApi(): Promise<FaceApi> {
  loading ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    const url = `${import.meta.env.BASE_URL}models`;
    await faceapi.nets.tinyFaceDetector.loadFromUri(url);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(url);
    return faceapi;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Finds faces in the image, entirely on the device. */
export async function detectFaces(image: HTMLCanvasElement): Promise<FaceInfo[]> {
  const faceapi = await loadFaceApi();
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.35 });
  const results = await faceapi.detectAllFaces(image, options).withFaceLandmarks(true);
  return results.map((r) => ({
    box: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
    landmarks: r.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
  }));
}
