import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

@Component({
  selector: 'app-home-three',
  templateUrl: './home-three.component.html',
  styleUrls: ['./home-three.component.scss'],
  standalone: false,
})
export class HomeThreeComponent implements OnInit, AfterViewInit {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  personCount = 0;
  duplicateCount = 0;
  faceEmbeddings: number[][] = [];
  model: any = null;
  stableFace: { embedding: number[]; seenCount: number } | null = null;

  isLoading = true;
  statusMessage = 'Loading camera and model...';

  ngOnInit() {
    this.setupCamera()
      .then(() => this.loadModel())
      .catch((err) => {
        console.error('Camera setup error:', err);
        this.statusMessage = 'Camera error. Please allow access.';
      });
  }

  ngAfterViewInit() {
    this.setCanvasSize();
  }

  async setupCamera(): Promise<void> {
    const video = this.videoRef.nativeElement;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });

      video.srcObject = stream;
      await new Promise<void>((res) => (video.onloadedmetadata = () => res()));
      video.play();
    } catch (error) {
      console.error('Error accessing camera:', error);
      throw error;
    }
  }

  setCanvasSize() {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
  }

  async loadModel() {
    await tf.ready();
    this.model = await blazeface.load();
    this.statusMessage = 'Detecting faces...';
    this.isLoading = false;
    this.detectFaces();
  }

  async detectFaces() {
    if (!this.model) return;

    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const detectLoop = async () => {
      if (!video || video.readyState < 2) {
        requestAnimationFrame(detectLoop);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const predictions = await this.model!.estimateFaces(video, false);

      if (predictions.length > 0) {
        predictions.forEach((pred: any) => {
          if (!this.isFrontFace(pred)) return;

          const [x, y] = pred.topLeft as [number, number];
          const [x2, y2] = pred.bottomRight as [number, number];
          const width = x2 - x;
          const height = y2 - y;

          ctx.strokeStyle = 'limegreen';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);

          const faceTensor = this.cropFace(pred, video);
          const embedding = this.createEmbedding(faceTensor);

          if (this.isDuplicate(embedding)) {
            this.duplicateCount++;
            this.statusMessage = '⚠️ Already counted';
            return;
          }

          this.checkStableFace(embedding);
        });
      } else {
        this.stableFace = null;
      }

      requestAnimationFrame(detectLoop);
    };

    detectLoop();
  }

  cropFace(pred: any, video: HTMLVideoElement): any {
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
      .div(255);
  }

  createEmbedding(tensor: any): number[] {
    const flat = tensor.flatten();
    const mean = flat.mean();
    const embedding = flat.sub(mean).arraySync() as number[];
    tensor.dispose();
    return embedding.slice(0, 100);
  }

  isFrontFace(pred: any): boolean {
    const landmarks = pred.landmarks;
    if (!landmarks || landmarks.length < 2) return false;

    const [rightEye, leftEye] = landmarks;
    const dx = Math.abs(leftEye[0] - rightEye[0]);
    const dy = Math.abs(leftEye[1] - rightEye[1]);
    const eyeDistance = Math.sqrt(dx * dx + dy * dy);

    return eyeDistance >= 20 && eyeDistance <= 200 && dy < 20;
  }

  checkStableFace(embedding: number[]) {
    const threshold = 0.25;

    if (
      this.stableFace &&
      this.cosineDistance(this.stableFace.embedding, embedding) < threshold
    ) {
      this.stableFace.seenCount++;
      if (this.stableFace.seenCount >= 5) {
        this.personCount++;
        this.faceEmbeddings.push(embedding);
        this.stableFace = null;
        this.statusMessage = '✅ Face counted';
      }
    } else {
      this.stableFace = { embedding, seenCount: 1 };
    }
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
