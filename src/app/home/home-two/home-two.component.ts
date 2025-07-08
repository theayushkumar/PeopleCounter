import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

@Component({
  selector: 'app-home-two',
  templateUrl: './home-two.component.html',
  styleUrls: ['./home-two.component.scss'],
  standalone: false,
})
export class HomeTwoComponent implements OnInit {
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  personCount = 0;
  faceEmbeddings: number[][] = [];
  model: blazeface.BlazeFaceModel | null = null;

  ngOnInit() {
    this.setupCamera().then(() => this.loadModel());
  }

  async setupCamera() {
    const videoEl = this.video.nativeElement;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
    });
    videoEl.srcObject = stream;
    await new Promise((resolve) => (videoEl.onloadedmetadata = resolve));
    videoEl.play();

    const canvasEl = this.canvas.nativeElement;
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  }

  async loadModel() {
    this.model = await blazeface.load();
    this.detectFaces();
  }

  async detectFaces() {
    if (!this.model) return;

    const videoEl = this.video.nativeElement;
    const canvasEl = this.canvas.nativeElement;
    const ctx = canvasEl.getContext('2d')!;

    const detectLoop = async () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      const predictions = await this.model!.estimateFaces(videoEl, false);

      if (predictions.length > 0) {
        for (const pred of predictions) {
          if (this.isFrontFace(pred)) {
            const faceTensor = this.cropFace(pred, videoEl);
            const embedding = this.createEmbedding(faceTensor);

            if (!this.isDuplicate(embedding)) {
              this.faceEmbeddings.push(embedding);
              this.personCount++;
              console.log('✅ New face detected');
            } else {
              console.log('⛔ Duplicate skipped');
            }

            // Draw green box
            const [x, y] = pred.topLeft as [number, number];
            const [x2, y2] = pred.bottomRight as [number, number];
            ctx.strokeStyle = 'limegreen';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, x2 - x, y2 - y);
          }
        }
      }

      requestAnimationFrame(detectLoop);
    };

    detectLoop();
  }

  isFrontFace(pred: any): boolean {
    const landmarks = pred.landmarks;
    if (!landmarks || landmarks.length < 2) return false;

    const [rightEye, leftEye] = landmarks;
    const dx = Math.abs(leftEye[0] - rightEye[0]);
    const dy = Math.abs(leftEye[1] - rightEye[1]);
    const eyeDist = Math.sqrt(dx * dx + dy * dy);

    return eyeDist >= 15 && eyeDist <= 200 && dy < 20;
  }

  cropFace(pred: any, video: HTMLVideoElement): tf.Tensor3D {
    const [x, y] = pred.topLeft as [number, number];
    const [x2, y2] = pred.bottomRight as [number, number];
    const width = x2 - x;
    const height = y2 - y;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return tf.browser
      .fromPixels(imageData)
      .resizeBilinear([128, 128])
      .toFloat()
      .div(tf.scalar(255));
  }

  createEmbedding(tensor: tf.Tensor3D): number[] {
    const flat = tensor.flatten();
    const mean = flat.mean();
    const embedding = flat.sub(mean).arraySync() as number[];
    tensor.dispose();
    return embedding.slice(0, 100);
  }

  isDuplicate(newEmbedding: number[]): boolean {
    const threshold = 0.5;
    for (const existing of this.faceEmbeddings) {
      const dist = this.cosineDistance(existing, newEmbedding);
      if (dist < threshold) return true;
    }
    return false;
  }

  cosineDistance(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return 1 - dot / (normA * normB);
  }
}
