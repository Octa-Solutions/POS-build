import { Component, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { CheckoutItem } from '../checkout-item-list/checkout-item-list.component';


export type MaterialUnit = {
  unit_name: string,
  unit_id: number,
  material_unit_is_default: boolean,
  material_unit_is_disabled: boolean,
  default_price: number,
  material_unit_barcode: string | null,
};

export type Material = {

  material_id: number,
  material_name: string,
  material_image?: string | null,
  material_code: string | null,
  material_description: string | null,
  material_print_name: string,
  material_category_id: number,
  material_category_name: string,
  material_currency_id: number,
  material_unit: MaterialUnit[],
};

@Component({
  selector: 'app-material-grid',
  templateUrl: './material-grid.component.html',
  styleUrls: ['./material-grid.component.scss'],
  standalone: false

})
export class MaterialGridComponent implements OnInit {
  main_material_list: Material[] = [];
  search_value = input<string>();
  materialEmitter = output<CheckoutItem>();
  rendered_material_list: WritableSignal<Material[]> = signal([]);
  currency_list: { currency_id: number; currency_code: string; currency_name: string; currency_is_basic: string; currency_part_name: string; currency_precision: string; currency_rate: string; currency_tva_rate: string; }[] = [];
  constructor(
    private modalController: ModalController,
  ) { }

  addMaterialByBarcode(barcode: string): boolean {
    let selected_unit: MaterialUnit | undefined;
    let item_added = this.main_material_list.find(async material => {
      selected_unit = material.material_unit.find(unit => unit.material_unit_barcode == barcode);
      if (selected_unit) {
        await this.addMaterial(material, selected_unit);
        return true; 
      }
      return false;
    });
    return !!item_added;
  }

  async addMaterial(material: Material, unit: MaterialUnit) {
    if (material && unit) {
      let item: CheckoutItem = material; 
      item.selected_unit = unit;      
      this.materialEmitter.emit(item);
    }
    else {

    }


  }
  getCurrencyCode(material_currency_id: number) {
    let currency = this.currency_list?.find((curr) => curr.currency_id == material_currency_id)
    return currency?.currency_code;
  }

  ngOnInit() {
   
  }

}
