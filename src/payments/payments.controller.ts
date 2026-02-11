import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DummyPaymentService } from './dummy-payment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly dummyPaymentService: DummyPaymentService,
    ) { }

    @Post('create-order')
    async createOrder(@Request() req) {
        return this.paymentsService.createOrder(req.user.id);
    }

    @Get('history')
    async getHistory(@Request() req) {
        return this.paymentsService.getMyPayments(req.user.id);
    }

    // Dummy payment endpoints for registration fees
    @Post('registration/create-dummy')
    async createDummyRegistrationPayment(
        @Request() req,
        @Body() body: { hackathonId: string; amount: number; currency?: string }
    ) {
        return this.dummyPaymentService.createRegistrationPayment(
            req.user.id,
            body.hackathonId,
            body.amount,
            body.currency || 'INR'
        );
    }

    @Post('registration/verify-dummy')
    async verifyDummyRegistrationPayment(@Body() body: { paymentId: string }) {
        const isValid = await this.dummyPaymentService.verifyRegistrationPayment(body.paymentId);
        return { success: isValid, message: isValid ? 'Payment verified' : 'Payment not found' };
    }
}
