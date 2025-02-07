import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MainViewPageRoutingModule } from './main-view-routing.module';

import { MainViewPage } from './main-view.page';
import { MaterialGridComponent } from 'src/app/components/material-grid/material-grid.component';
import { CheckoutItemListComponent } from 'src/app/components/checkout-item-list/checkout-item-list.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MainViewPageRoutingModule,
    CheckoutItemListComponent
  ],
  declarations: [MainViewPage, MaterialGridComponent]
})
export class MainViewPageModule {}
