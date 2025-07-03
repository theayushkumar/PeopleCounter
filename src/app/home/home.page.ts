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
      const count = predictions.filter((p) => p.class === 'person').length;

      // Update in Angular zone so the UI reflects the change
      this.zone.run(() => {
        this.peopleCount = count;
      });

      console.log('Detected People:', count);
      requestAnimationFrame(detect);
    };

    detect();
  }
}
