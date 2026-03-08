import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SalesService, Sale } from '../../../core/services/sales.service';

@Component({
  selector: 'app-sale-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sale-detail.component.html',
  styleUrl: './sale-detail.component.css'
})
export class SaleDetailComponent implements OnInit {
  sale: Sale | null = null;

  constructor(
    private salesService: SalesService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.salesService.getSaleById(id).subscribe(sale => {
        this.sale = sale || null;
      });
    }
  }

  printReceipt() {
    window.print();
  }
}
