import { CommonModule } from '@angular/common';
import { Component, input, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonInput, IonRow, IonIcon } from '@ionic/angular/standalone';
import { Material, MaterialUnit } from '../material-grid/material-grid.component';
export type CheckoutItem = Material & {checkout_unit_price?: number, material_unit_id?: number, material_quantity?: number, selected_unit?: MaterialUnit, material_total_price?: number };
export type qntUpdateEvent = { index: number, type: 'add' | 'remove' | 'edit', new_quantity?: number };
@Component({
  selector: 'app-checkout-item-list',
  templateUrl: './checkout-item-list.component.html',
  styleUrls: ['./checkout-item-list.component.scss'],
  imports: [IonCol, IonGrid, IonInput, IonRow, IonIcon, FormsModule, CommonModule]
})
export class CheckoutItemListComponent implements OnInit {
  checkout_item_list = input<CheckoutItem[]>();
  itemQuantityUpdated = output<qntUpdateEvent>();
  deleteItemEmitter = output<number>();
  itemUnitPriceUpdated = output<{ index: number, new_price: number }>();
  price_input_focused: boolean = false;
  constructor() { }
  ngOnInit() { }


  addMaterialQuantity(index: number) {
    this.itemQuantityUpdated.emit(
      {
        index,
        type: 'add'
      }
    );
  }

  removeMaterialQuantity(index: number) {
    this.itemQuantityUpdated.emit({
      index,
      type: 'remove',
    });
  }

  updateItemQuantity(new_quantity: number, index: number) {
    this.itemQuantityUpdated.emit({ index, type: 'edit', new_quantity });
  }
  deleteItemFromList(index: number) {
    this.deleteItemEmitter.emit(index);
  }

  setPriceInputFocus(is_price_input_focused: boolean) {
    this.price_input_focused = is_price_input_focused;
  }
  changeItemUnitPrice(new_price: number, index: number) {
    this.itemUnitPriceUpdated.emit({ new_price, index })
  }


}
