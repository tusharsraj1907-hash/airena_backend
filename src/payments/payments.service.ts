import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HACKATHON_CREATION_FEE, PAYMENT_CURRENCY } from '../common/constants/payments';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
    constructor(private prisma: PrismaService) { }

    async createOrder(hostId: string) {
        const invoiceId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const payment = await this.prisma.payment.create({
            data: {
                hostId,
                amount: HACKATHON_CREATION_FEE,
                currency: PAYMENT_CURRENCY,
                status: 'PENDING',
                invoiceId,
            },
        });

        return {
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            invoiceId: payment.invoiceId,
            // Mock order ID for frontend to simulate Razorpay flow
            mockOrderId: `order_${uuidv4().replace(/-/g, '')}`,
        };
    }

    async verifyPayment(paymentId: string, providerPaymentId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            throw new BadRequestException('Payment record not found');
        }

        if (payment.status === 'SUCCESS') {
            return payment;
        }

        // Cryptographic verification (mocked for now)
        // Success if providerPaymentId starts with 'pay_' (simulating Razorpay)
        const isVerified = providerPaymentId.startsWith('pay_');

        if (!isVerified) {
            await this.prisma.payment.update({
                where: { id: paymentId },
                data: { status: 'FAILED' },
            });
            throw new BadRequestException('Payment verification failed');
        }

        return await this.prisma.payment.update({
            where: { id: paymentId },
            data: {
                status: 'SUCCESS',
                providerPaymentId,
            },
        });
    }

    async getMyPayments(hostId: string) {
        return this.prisma.payment.findMany({
            where: { hostId },
            include: {
                hackathon: {
                    select: {
                        title: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
}
