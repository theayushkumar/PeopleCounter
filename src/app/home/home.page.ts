
import { Component, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements AfterViewInit {
  @ViewChild('video', { static: false }) video!: ElementRef<HTMLVideoElement>;

  peopleCount: number = 0;
  model: cocoSsd.ObjectDetection | undefined;
  detectedBoxes: number[][] = []; // Store detected people bounding boxes

  constructor(private zone: NgZone) {}

  async ngAfterViewInit() {
    await this.setupCamera();
    this.model = await cocoSsd.load();
    this.detectFrame();
  }

  async setupCamera() {
    const video = this.video.nativeElement;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    return new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
  }

  detectFrame() {
    if (!this.model) return;

    const detect = async () => {
      const predictions = await this.model!.detect(this.video.nativeElement);

      predictions.forEach((prediction) => {
        if (prediction.class === 'person') {
          const [x, y, width, height] = prediction.bbox;
          const newBox = [x, y, width, height];

          // Check if this bounding box is close to any already stored box
          const isDuplicate = this.detectedBoxes.some((existingBox) =>
            this.isSamePerson(existingBox, newBox)
          );

          if (!isDuplicate) {
            this.detectedBoxes.push(newBox);
            this.zone.run(() => {
              this.peopleCount++;
            });
            console.log('✅ New person counted');
          } else {
            console.log('⚠️ Duplicate person skipped');
          }
        }
      });

      requestAnimationFrame(detect);
    };

    detect();
  }

  // Helper: checks if two boxes are close enough to consider same person
  isSamePerson(box1: number[], box2: number[]): boolean {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const iouThreshold = 0.5;

    const intersectionX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
    const intersectionY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
    const intersectionArea = intersectionX * intersectionY;

    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectionArea;

    const iou = intersectionArea / unionArea;

    return iou > iouThreshold;
  }
}
