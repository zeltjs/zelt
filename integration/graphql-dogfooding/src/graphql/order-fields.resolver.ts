import { ResolveField, Resolver } from '@zeltjs/graphql';

import type { OrderPublicItems } from '../order/order.types';

@Resolver()
export class OrderFieldsResolver {
  @ResolveField()
  lineTotalCents(parent: OrderPublicItems): number {
    return parent.unitPriceCents * parent.quantity;
  }
}
