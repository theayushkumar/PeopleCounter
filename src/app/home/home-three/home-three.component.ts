import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

@Component({
  selector: 'app-home-three',
  templateUrl: './home-three.component.html',
  styleUrls: ['./home-three.component.scss'],
  standalone:false
})
export class HomeThreeComponent implements OnInit {
  @ViewChild('video', { static: true }) video!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  personCount = 0;
  faceEmbeddings: number[][] = [];
  model: blazeface.BlazeFaceModel | null = null;
  stableFace: { embedding: number[]; seenCount: number } | null = null;

  statusMessage = '';

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.setupCamera().then(() => this.loadModel());
  }

  async setupCamera() {
    const video = this.video.nativeElement;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
    });
    video.srcObject = stream;
    await new Promise((res) => (video.onloadedmetadata = () => res(true)));
    video.play();

    const canvas = this.canvas.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  async loadModel() {
    this.model = await blazeface.load();
    this.detectFaces();
  }

  async detectFaces() {
    if (!this.model) return;

    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const detectLoop = async () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const predictions = await this.model!.estimateFaces(video, false);

      if (predictions.length > 0) {
        for (const pred of predictions) {
          if (!this.isFrontFace(pred)) continue;

          const [x, y] = pred.topLeft as [number, number];
          const [x2, y2] = pred.bottomRight as [number, number];
          ctx.strokeStyle = 'limegreen';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, x2 - x, y2 - y);

          const faceTensor = this.cropFace(pred, video);
          const embedding = this.createEmbedding(faceTensor);

          if (this.isDuplicate(embedding)) {
            this.statusMessage = '⚠️ Already Counted';
            this.stableFace = null;
          } else {
            this.checkStableFace(embedding);
          }

          this.cdr.detectChanges(); // Update UI
        }
      } else {
        this.stableFace = null;
        this.statusMessage = '';
        this.cdr.detectChanges();
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
    const eyeDistance = Math.sqrt(dx * dx + dy * dy);

    return eyeDistance >= 20 && eyeDistance <= 200 && dy < 15;
  }

  checkStableFace(embedding: number[]) {
    const matchThreshold = 0.25;

    if (
      this.stableFace &&
      this.cosineDistance(this.stableFace.embedding, embedding) < matchThreshold
    ) {
      this.stableFace.seenCount++;
      if (this.stableFace.seenCount >= 5) {
        this.personCount++;
        this.faceEmbeddings.push(embedding);
        this.statusMessage = '✅ Face Counted';
        this.stableFace = null;
      }
    } else {
      this.stableFace = { embedding, seenCount: 1 };
    }
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
      .resizeBilinear([96, 96])
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
      const distance = this.cosineDistance(existing, newEmbedding);
      if (distance < threshold) return true;
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
