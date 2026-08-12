import { Pipe, PipeTransform } from '@angular/core';
import { formatNumber } from '../utils/format-number';

/** Displays a number with space-grouped thousands, e.g. 1000000 -> "1 000 000". */
@Pipe({
  name: 'sum',
  standalone: true
})
export class SumPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    return formatNumber(value, decimals);
  }
}
