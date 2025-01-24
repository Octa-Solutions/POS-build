import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-items-grid',
  templateUrl: './items-grid.component.html',
  styleUrls: ['./items-grid.component.scss'],
  standalone: false

})
export class ItemsGridComponent implements OnInit {
  itemz = new Array(20).fill(1)

  constructor(
  ) { }

 

  ngOnInit() {
  }

}
