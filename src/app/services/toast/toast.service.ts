import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
@Injectable({
  providedIn: 'root'
})
export class ToastService {
  constructor(private toastCtrl: ToastController) {
  }
  async presentToast(message: string, duration: number, position: any, color: string) {
    this.toastCtrl.dismiss();
    const toast = await this.toastCtrl.create({ message, duration, position, color });
    toast.present();
  }
  success(message: string) {
    this.presentToast(message, 5000, 'bottom', 'success');
  }
  error(message: string) {
    this.presentToast(message, 5000, 'bottom', 'danger')
  }
}