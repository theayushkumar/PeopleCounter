import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

type FaceSignature = number[];

@Component({
  selector: 'app-home-two',
  templateUrl: './home-two.component.html',
  styleUrls: ['./home-two.component.scss'],
  standalone: false,
})
export class HomeTwoComponent implements OnInit {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;

  model: blazeface.BlazeFaceModel | null = null;
  storedSignatures: FaceSignature[] = [];
  uniqueCount = 0;

  ngOnInit() {
    this.loadModel();
  }

  async loadModel() {
    try {
      this.model = await blazeface.load();
      console.log('✅ BlazeFace model loaded');
    } catch (err) {
      console.error('❌ Error loading model:', err);
    }
  }

  async openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.videoRef.nativeElement.srcObject = stream;
    } catch (err) {
      console.error('❌ Camera access error:', err);
    }
  }

  async captureReference() {
    const faces = await this.detectFaces();
    if (!faces.length) {
      alert('No face detected!');
      return;
    }

    faces.forEach((face) => {
      const sig = this.computeSignature(face);
      this.storedSignatures.push(sig);
      this.uniqueCount++;
    });

    alert(`${faces.length} face(s) added.`);
  }

  async markAttendance() {
    const faces = await this.detectFaces();

    faces.forEach((face) => {
      const sig = this.computeSignature(face);
      const isDuplicate = this.storedSignatures.some((ref) => {
        return this.euclideanDistance(sig, ref) < 0.1; // Adjust threshold if needed
      });

      if (!isDuplicate) {
        this.storedSignatures.push(sig);
        this.uniqueCount++;
      }
    });

    alert(`✅ Attendance processed for ${faces.length} face(s).`);
  }

  async detectFaces() {
    if (!this.model) {
      console.error('❌ Model not loaded');
      return [];
    }

    return await this.model.estimateFaces(this.videoRef.nativeElement, true);
  }

  computeSignature(face: blazeface.NormalizedFace): FaceSignature {
    let x1 = 0,
      y1 = 0,
      x2 = 0,
      y2 = 0;

    // Handle topLeft
    if (Array.isArray(face.topLeft)) {
      [x1, y1] = face.topLeft as [number, number];
    } else {
      [x1, y1] = (face.topLeft as tf.Tensor).arraySync() as [number, number];
    }

    // Handle bottomRight
    if (Array.isArray(face.bottomRight)) {
      [x2, y2] = face.bottomRight as [number, number];
    } else {
      [x2, y2] = (face.bottomRight as tf.Tensor).arraySync() as [
        number,
        number
      ];
    }

    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    // Handle landmarks safely
    let leftEye = [0, 0];
    let rightEye = [0, 0];

    if (face.landmarks) {
      if (Array.isArray(face.landmarks)) {
        [leftEye, rightEye] = face.landmarks as [number, number][];
      } else if ('arraySync' in face.landmarks) {
        const landmarksArray = (face.landmarks as tf.Tensor).arraySync() as [
          number,
          number
        ][];
        [leftEye, rightEye] = landmarksArray;
      }
    } else {
      console.warn('⚠️ face.landmarks is undefined, using default [0, 0]');
    }

    return [centerX, centerY, leftEye[0], leftEye[1], rightEye[0], rightEye[1]];
  }

  euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0));
  }
}
