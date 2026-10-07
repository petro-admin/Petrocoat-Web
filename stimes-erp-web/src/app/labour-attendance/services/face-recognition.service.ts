import { Injectable } from '@angular/core';
// Type-only import - erased at compile time, so it does NOT pull face-api.js's actual code
// (and its heavy TensorFlow.js dependency) into this file's module-evaluation. The real
// library is loaded lazily via `await import('face-api.js')` inside loadModels() below - a
// top-level `import * as faceapi from 'face-api.js'` here previously ran that library's
// module-init code the instant this page's JS chunk loaded, before Angular could even render
// the component, which blanked the whole page (same root cause as the earlier VSR print bug).
import type * as FaceApi from 'face-api.js';

// Wraps face-api.js (free, runs entirely in the browser - no per-scan cost, no cloud API key).
// Models are self-hosted in src/assets/face-models (downloaded from the face-api.js project)
// so recognition works without any external network call at runtime.
const MODEL_URL = 'assets/face-models';

@Injectable({ providedIn: 'root' })
export class FaceRecognitionService {
  private faceapi: typeof FaceApi | null = null;
  private modelsLoaded = false;
  private loadPromise: Promise<void> | null = null;

  loadModels(): Promise<void> {
    if (this.modelsLoaded) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const faceapi = await import('face-api.js');
      this.faceapi = faceapi;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      this.modelsLoaded = true;
    })();

    return this.loadPromise;
  }

  // Quick lighting check run before accepting an enrollment capture - a too-dark or blown-out
  // frame still produces SOME descriptor (face-api.js doesn't reject it), but it's a poor-quality
  // reference that then matches unreliably later, especially against a well-lit live scan. This
  // is a fast downscaled-canvas brightness sample, not full image analysis, so it costs nothing
  // noticeable per capture attempt.
  checkLighting(input: HTMLVideoElement | HTMLCanvasElement): { ok: boolean; reason?: 'dark' | 'bright' } {
    const width = 64, height = 48;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: true };
    ctx.drawImage(input, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avgLuma = total / (width * height);

    if (avgLuma < 60) return { ok: false, reason: 'dark' };
    if (avgLuma > 210) return { ok: false, reason: 'bright' };
    return { ok: true };
  }

  // Detects the single largest face in the video/image, returns its 128-value descriptor
  // (a numeric "fingerprint" of the face) - or null if no face is currently visible.
  async getDescriptor(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<Float32Array | null> {
    if (!this.faceapi) throw new Error('Face recognition models are not loaded yet.');
    const detection = await this.faceapi
      .detectSingleFace(input, new this.faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? detection.descriptor : null;
  }

  // Compares one descriptor against every enrolled employee's descriptor(s) and returns the
  // closest match - a lower distance means a closer match. face-api.js's own docs suggest 0.6 as
  // a generic "same person" cutoff, but that's loose enough in practice to accept a different
  // enrolled employee as a false match - 0.45 (an earlier tightening) still wasn't strict enough:
  // real attendance confidence scores were landing at 55-76%, barely above that threshold's own
  // floor (any match at exactly 0.45 distance reports as 55% confidence), and real misidentifications
  // kept happening (one person scanning in as a different enrolled employee). 0.35 requires a much
  // closer resemblance before accepting a match at all - findBestMatch() still returns 'unknown'
  // beyond this, same as before, just at a stricter distance.
  //
  // Tightening the threshold alone traded false-accepts for false-rejects: employees whose single
  // enrollment photo happened to be an off-angle/poorly-lit shot then failed recognition entirely
  // on any other day's lighting/angle. The real fix is enrolling from SEVERAL angles (each row here
  // is one employee's Center/Left/Right/Up/Down capture) - grouping them all under one label lets
  // FaceMatcher compare against the employee's whole reference set rather than one fragile shot,
  // so normal day-to-day variation is far more likely to still land inside the 0.35 cutoff.
  buildMatcher(labeled: { employeeCode: number; empFullName: string; descriptor: number[] }[]): FaceApi.FaceMatcher {
    if (!this.faceapi) throw new Error('Face recognition models are not loaded yet.');
    const byEmployee = new Map<number, Float32Array[]>();
    for (const l of labeled) {
      const arr = byEmployee.get(l.employeeCode) ?? [];
      arr.push(new Float32Array(l.descriptor));
      byEmployee.set(l.employeeCode, arr);
    }
    const labeledDescriptors = Array.from(byEmployee.entries()).map(([employeeCode, descriptors]) =>
      new this.faceapi!.LabeledFaceDescriptors(String(employeeCode), descriptors)
    );
    return new this.faceapi.FaceMatcher(labeledDescriptors, 0.35);
  }

  match(matcher: FaceApi.FaceMatcher, descriptor: Float32Array): { employeeCode: number | null; confidencePercent: number } {
    const best = matcher.findBestMatch(descriptor);
    if (best.label === 'unknown') return { employeeCode: null, confidencePercent: 0 };
    const confidencePercent = Math.round((1 - best.distance) * 100);
    return { employeeCode: Number(best.label), confidencePercent };
  }
}
