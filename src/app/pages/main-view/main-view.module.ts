import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MainViewPageRoutingModule } from './main-view-routing.module';

import { MainViewPage } from './main-view.page';
import { ItemsGridComponent } from 'src/app/components/items-grid/items-grid.component';
import { CheckoutItemListComponent } from 'src/app/components/checkout-item-list/checkout-item-list.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MainViewPageRoutingModule,
    CheckoutItemListComponent
  ],
  declarations: [MainViewPage, ItemsGridComponent]
})
export class MainViewPageModule {}
