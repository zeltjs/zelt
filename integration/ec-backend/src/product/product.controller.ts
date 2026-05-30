import { JwtMiddleware } from '@zeltjs/auth-jwt';
import {
  Authorized,
  Controller,
  Delete,
  Get,
  inject,
  Post,
  Put,
  pathParam,
  queryParam,
  response,
  UseMiddleware,
} from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import { HTTPException } from 'hono/http-exception';
import { CreateProductSchema, UpdateProductSchema } from './product.schema';
import { ProductService } from './product.service';

@Controller('/api/products')
export class ProductController {
  constructor(private readonly productService = inject(ProductService)) {}

  @Get('/')
  async list(
    pageStr = queryParam('page'),
    limitStr = queryParam('limit'),
    category = queryParam('category'),
    minPriceStr = queryParam('minPrice'),
    maxPriceStr = queryParam('maxPrice'),
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    const minPrice = minPriceStr ? parseInt(minPriceStr, 10) : undefined;
    const maxPrice = maxPriceStr ? parseInt(maxPriceStr, 10) : undefined;

    const result = await this.productService.findAll({
      page,
      limit,
      category: category ?? undefined,
      minPrice: Number.isNaN(minPrice) ? undefined : minPrice,
      maxPrice: Number.isNaN(maxPrice) ? undefined : maxPrice,
    });

    return {
      items: result.items,
      total: result.total,
      page,
      limit,
    };
  }

  @Get('/:id')
  async detail(idStr = pathParam('id')) {
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid product ID' });
    }

    const product = await this.productService.findById(id);
    if (!product) {
      throw new HTTPException(404, { message: 'Product not found' });
    }
    return product;
  }

  @UseMiddleware(JwtMiddleware)
  @Authorized(['admin'])
  @Post('/')
  async create(data = validated(CreateProductSchema), res = response()) {
    const product = await this.productService.create(data);
    return res.json(product, 201);
  }

  @UseMiddleware(JwtMiddleware)
  @Authorized(['admin'])
  @Put('/:id')
  async update(idStr = pathParam('id'), data = validated(UpdateProductSchema)) {
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid product ID' });
    }

    const product = await this.productService.update(id, data);
    if (!product) {
      throw new HTTPException(404, { message: 'Product not found' });
    }
    return product;
  }

  @UseMiddleware(JwtMiddleware)
  @Authorized(['admin'])
  @Delete('/:id')
  async remove(idStr = pathParam('id')) {
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
      throw new HTTPException(400, { message: 'Invalid product ID' });
    }

    const removed = await this.productService.remove(id);
    if (!removed) {
      throw new HTTPException(404, { message: 'Product not found' });
    }
    return { deleted: true };
  }
}
