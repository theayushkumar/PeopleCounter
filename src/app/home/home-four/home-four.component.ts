import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  NgZone,
} from '@angular/core';
import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

@Component({
  selector: 'app-home-four',
  templateUrl: './home-four.component.html',
  styleUrls: ['./home-four.component.scss'],
  standalone: false,
})
export class HomeFourComponent implements OnInit {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  model!: blazeface.BlazeFaceModel;
  modelsReady = false;
  embeddings: number[][] = [];
  uniqueCount = 0;
  statusMessage = 'Initializing...';

  constructor(private zone: NgZone) {}

  async ngOnInit() {
    await tf.setBackend('webgl');
    await tf.ready();
    this.model = await blazeface.load();
    this.modelsReady = true;
    this.statusMessage = 'Models loaded. Starting camera...';

    await this.setupCamera();
    this.detectLoop();
  }

  async setupCamera() {
    const video = this.videoRef.nativeElement;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = stream;
    return new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
  }

  detectLoop() {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detect = async () => {
      if (!this.modelsReady) {
        requestAnimationFrame(detect);
        return;
      }

      const predictions = await this.model.estimateFaces(video, false);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const face of predictions) {
        if (!face.landmarks) continue;

        let landmarks: number[][];

        if (Array.isArray(face.landmarks)) {
          landmarks = face.landmarks;
        } else {
          landmarks = await face.landmarks.array(); // convert Tensor2D to array
        }

        if (landmarks.length < 3) continue;

        const leftEye = landmarks[0];
        const rightEye = landmarks[1];
        const nose = landmarks[2];

        const eyeDistance = Math.abs(leftEye[0] - rightEye[0]);
        const verticalNoseDiff = Math.abs(
          nose[1] - (leftEye[1] + rightEye[1]) / 2
        );
        if (eyeDistance < 20 || verticalNoseDiff > 40) continue; // skip non-front-facing

        const topLeft = await this.extractPoint(face.topLeft);
        const bottomRight = await this.extractPoint(face.bottomRight);

        const [x, y] = topLeft;
        const [brX, brY] = bottomRight;
        const w = brX - x;
        const h = brY - y;

        const x1 = Math.max(Math.floor(x), 0);
        const y1 = Math.max(Math.floor(y), 0);
        const w1 = Math.min(Math.floor(w), canvas.width - x1);
        const h1 = Math.min(Math.floor(h), canvas.height - y1);

        const faceTensor = tf.browser
          .fromPixels(video)
          .slice([y1, x1, 0], [h1, w1, 3]);
        const resized = tf.image
          .resizeBilinear(faceTensor, [128, 128])
          .div(255)
          .expandDims(0);
        const embedding = await this.getEmbedding(resized);

        const matched = this.checkDuplicate(embedding);

        this.zone.run(() => {
          if (!matched) {
            this.embeddings.push(embedding);
            this.uniqueCount++;
            this.statusMessage = 'Mark Success';
          } else {
            this.statusMessage = 'Already Marked';
          }
        });

        ctx.strokeStyle = matched ? 'red' : 'green';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.font = '14px Arial';
        ctx.fillStyle = matched ? 'red' : 'green';
        ctx.fillText(matched ? 'Already Marked' : 'Marked', x, y - 8);
      }

      requestAnimationFrame(detect);
    };

    detect();
  }

  async extractPoint(
    tensor: tf.Tensor | [number, number]
  ): Promise<[number, number]> {
    if (Array.isArray(tensor)) return [tensor[0], tensor[1]];
    const data = (await tensor.array()) as number[]; // <-- type assertion here
    return [data[0], data[1]];
  }

  async getEmbedding(tensor: tf.Tensor): Promise<number[]> {
    const data = (await tensor.mean([1, 2]).array()) as number[][];
    return data[0];
  }

  checkDuplicate(embedding: number[], threshold = 0.5): boolean {
    for (const saved of this.embeddings) {
      const distance = this.euclideanDistance(embedding, saved);
      if (distance < threshold) return true;
    }
    return false;
  }

  euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
  }
}
