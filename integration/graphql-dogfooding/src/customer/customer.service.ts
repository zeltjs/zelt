import { Injectable } from '@zeltjs/core';

import type { CustomerPublic } from './customer.types';

const defaultCustomer: CustomerPublic = {
  id: 'customer_1',
  name: 'Ada Lovelace',
  tier: 'vip',
};

@Injectable()
export class CustomerService {
  currentViewer(): CustomerPublic {
    return defaultCustomer;
  }
}
