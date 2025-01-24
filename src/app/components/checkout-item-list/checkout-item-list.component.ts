import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonInput, IonRow, IonIcon, IonContent,IonHeader,IonTitle,IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-checkout-item-list',
  templateUrl: './checkout-item-list.component.html',
  styleUrls: ['./checkout-item-list.component.scss'],
  imports: [IonCol, IonGrid, IonInput, IonRow, IonIcon, FormsModule, CommonModule, IonContent, IonHeader, IonTitle, IonToolbar]
})
export class CheckoutItemListComponent  implements OnInit {
  itemz = new Array(20).fill(1)

  constructor() { }

  ngOnInit() {}

}
