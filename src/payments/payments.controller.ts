import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
    ) { }

    @Post('create-order')
    async createOrder(@Request() req) {
        return this.paymentsService.createOrder(req.user.id);
    }

    @Get('history')
    async getHistory(@Request() req) {
        return this.paymentsService.getMyPayments(req.user.id);
    }
}
